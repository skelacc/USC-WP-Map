import { useMemo, useState } from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { categoryOf } from '@/lib/categories'
import { distanceM, formatDistance } from '@/lib/geo'
import { memberKey, membersOf } from '@/lib/merges'
import { searchScore } from '@/lib/search'
import { cn } from '@/lib/utils'
import type { FieldChoice, FieldChoices, Member, Studio } from '@/types/studio'
import { CategorySwatch } from '../ProviderBadges'

interface Props {
  base: Studio
  all: Studio[]
  /** sofort zu diesen Studios springen (z. B. aus einem Vorschlag) */
  initialPartnerIds?: string[]
  /** nur Angaben ändern (keine weiteren Studios wählen) */
  editOnly?: boolean
  onConfirm: (keys: string[], fields: FieldChoices) => void
  onClose: () => void
}

const PROV = { urbanSportsClub: 'USC', wellpass: 'Wellpass' } as const

function dist(a: Studio, b: Studio) {
  if (!a.coordinates || !b.coordinates) return null
  return distanceM({ lat: a.coordinates.latitude, lng: a.coordinates.longitude }, { lat: b.coordinates.latitude, lng: b.coordinates.longitude })
}

function addrText(m: Member) {
  const a = m.detail.address
  return a ? [a.street, [a.postalCode, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '–' : '–'
}

/** Mehrere Einträge (beliebige Anbieter) zu einem Studio zusammenführen und Angaben festlegen. */
export function MergeDialog({ base, all, initialPartnerIds, editOnly, onConfirm, onClose }: Props) {
  const [selected, setSelected] = useState<string[]>(initialPartnerIds ?? [])
  const [step, setStep] = useState<'pick' | 'fields'>(editOnly || initialPartnerIds?.length ? 'fields' : 'pick')
  const [q, setQ] = useState('')

  const options = useMemo(
    () =>
      all
        .filter((s) => s.id !== base.id)
        .map((s) => ({ s, d: dist(base, s) }))
        .filter((x) => selected.includes(x.s.id) || (q.trim() ? searchScore(x.s, q) > 0 : x.d !== null && x.d < 1500))
        .sort((a, b) => Number(selected.includes(b.s.id)) - Number(selected.includes(a.s.id)) || (a.d ?? Infinity) - (b.d ?? Infinity))
        .slice(0, 60),
    [all, base, q, selected],
  )

  const members: Member[] = useMemo(() => {
    const list = [...membersOf(base)]
    for (const id of selected) {
      const s = all.find((x) => x.id === id)
      if (s) list.push(...membersOf(s))
    }
    const seen = new Set<string>()
    return list.filter((m) => !seen.has(memberKey(m)) && !!seen.add(memberKey(m)))
  }, [base, all, selected])

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 sm:max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{editOnly ? 'Angaben festlegen' : 'Zusammenführen'}</DialogTitle>
          <DialogDescription>
            {step === 'pick'
              ? `Welche Einträge gehören zur selben Einrichtung wie „${base.name}“? Mehrfachauswahl möglich, auch vom selben Anbieter.`
              : `${members.length} Einträge werden ein Studio. Welche Angaben sollen gelten? Alle Details bleiben in den Tabs erhalten.`}
          </DialogDescription>
        </DialogHeader>

        {step === 'pick' ? (
          <>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen (sonst: Einträge in der Nähe)" aria-label="Einträge suchen" />
            <ul className="min-h-0 flex-1 divide-y overflow-y-auto rounded-md border">
              {options.map(({ s, d }) => {
                const on = selected.includes(s.id)
                const n = membersOf(s).length
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => toggle(s.id)} className={cn('flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-muted', on && 'bg-muted')}>
                      <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border', on && 'border-foreground bg-foreground text-background')}>
                        {on && <Check className="size-3" />}
                      </span>
                      <CategorySwatch category={categoryOf(s)} className="mt-1" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[s.address.street, n > 1 ? `${n} Einträge` : null].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {d !== null && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatDistance(d)}</span>}
                    </button>
                  </li>
                )
              })}
              {options.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">Nichts in der Nähe – bitte suchen.</li>}
            </ul>
            <DialogFooter className="flex-row justify-between gap-2">
              <span className="self-center text-xs text-muted-foreground">{selected.length} ausgewählt</span>
              <Button disabled={!selected.length} onClick={() => setStep('fields')}>
                Weiter
              </Button>
            </DialogFooter>
          </>
        ) : (
          <FieldForm
            key={members.map(memberKey).join('|')}
            members={members}
            initial={base.fieldChoices}
            onBack={editOnly ? undefined : () => setStep('pick')}
            onConfirm={(fields) => onConfirm(members.map(memberKey), fields)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function FieldForm({ members, initial, onBack, onConfirm }: { members: Member[]; initial?: FieldChoices; onBack?: () => void; onConfirm: (f: FieldChoices) => void }) {
  const keys = members.map(memberKey)
  const norm = (c: FieldChoice | undefined): string | undefined => {
    if (!c || typeof c === 'object') return undefined
    if (keys.includes(c)) return c
    const m = members.find((x) => x.provider === c)
    return m ? memberKey(m) : undefined
  }
  const label = (m: Member) => `${PROV[m.provider]}${members.filter((x) => x.provider === m.provider).length > 1 ? ` ${members.filter((x) => x.provider === m.provider).indexOf(m) + 1}` : ''}`

  const initName = initial?.name
  const [nameChoice, setNameChoice] = useState<string>(typeof initName === 'object' ? 'custom' : (norm(initName) ?? keys[0]))
  const [customName, setCustomName] = useState(typeof initName === 'object' ? initName.custom : members[0].detail.name)
  // echte Straßennamen bevorzugen (Quelldaten enthalten teils nur „36“)
  const withStreet = members.filter((m) => /[a-zäöü]{3}/i.test(m.detail.address?.street ?? ''))
  const [address, setAddress] = useState<string>(norm(initial?.address) ?? memberKey(withStreet.find((m) => m.detail.address?.postalCode) ?? withStreet[0] ?? members[0]))
  const withCoords = members.filter((m) => m.detail.coordinates)
  const [coords, setCoords] = useState<string>(norm(initial?.coordinates) ?? (withCoords[0] ? memberKey(withCoords[0]) : keys[0]))
  const withWeb = members.filter((m) => m.detail.website)
  const [website, setWebsite] = useState<string>(norm(typeof initial?.website === 'string' ? initial.website : undefined) ?? (withWeb[0] ? memberKey(withWeb[0]) : ''))

  // gleiche Werte nur einmal anbieten
  const uniqueBy = (ms: Member[], f: (m: Member) => string) => ms.filter((m, i) => ms.findIndex((x) => f(x) === f(m)) === i)

  const submit = () => {
    onConfirm({
      name: nameChoice === 'custom' ? { custom: customName.trim() || members[0].detail.name } : nameChoice,
      address,
      coordinates: coords,
      ...(website ? { website } : {}),
    })
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-sm">
        <Choice
          label="Name"
          value={nameChoice}
          onChange={setNameChoice}
          options={[...uniqueBy(members, (m) => m.detail.name).map((m) => ({ value: memberKey(m), label: m.detail.name, hint: label(m) })), { value: 'custom', label: 'Eigener Name', hint: '' }]}
        />
        {nameChoice === 'custom' && <Input value={customName} onChange={(e) => setCustomName(e.target.value)} aria-label="Eigener Name" />}
        <Choice label="Adresse" value={address} onChange={setAddress} options={uniqueBy(members, addrText).map((m) => ({ value: memberKey(m), label: addrText(m), hint: label(m) }))} />
        {withCoords.length > 1 && (
          <Choice
            label="Position auf der Karte"
            value={coords}
            onChange={setCoords}
            options={uniqueBy(withCoords, (m) => `${m.detail.coordinates!.latitude.toFixed(5)},${m.detail.coordinates!.longitude.toFixed(5)}`).map((m) => {
              const ref = withCoords[0].detail.coordinates!
              const d = distanceM({ lat: ref.latitude, lng: ref.longitude }, { lat: m.detail.coordinates!.latitude, lng: m.detail.coordinates!.longitude })
              return { value: memberKey(m), label: `Pin von ${label(m)}${d > 5 ? ` (${formatDistance(d)} entfernt)` : ''}`, hint: '' }
            })}
          />
        )}
        {withWeb.length > 0 && (
          <Choice label="Website" value={website} onChange={setWebsite} options={uniqueBy(withWeb, (m) => m.detail.website!).map((m) => ({ value: memberKey(m), label: m.detail.website!, hint: label(m) }))} />
        )}
      </div>
      <DialogFooter className="flex-row gap-2 sm:justify-between">
        {onBack ? (
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft /> Auswahl ändern
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={submit}>Speichern</Button>
      </DialogFooter>
    </>
  )
}

function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string; hint: string }[] }) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-semibold text-muted-foreground uppercase">{label}</legend>
      <div className="space-y-1">
        {options.map((o) => (
          <label key={o.value} className={cn('flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2', value === o.value && 'border-foreground bg-muted')}>
            <input type="radio" className="mt-1" checked={value === o.value} onChange={() => onChange(o.value)} />
            <span className="min-w-0 flex-1 break-words">{o.label}</span>
            {o.hint && <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
