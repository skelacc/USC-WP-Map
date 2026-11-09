import { useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { distanceM, formatDistance } from '@/lib/geo'
import { searchScore } from '@/lib/search'
import { cn } from '@/lib/utils'
import type { FieldChoice, FieldChoices, ProviderDetail, ProviderKey, Studio } from '@/types/studio'

interface Props {
  base: Studio
  all: Studio[]
  initialPartnerId?: string
  onConfirm: (usc: Studio, wp: Studio, fields: FieldChoices) => void
  onClose: () => void
}

const LABEL: Record<ProviderKey, string> = { urbanSportsClub: 'USC', wellpass: 'Wellpass' }

function dist(a: Studio, b: Studio) {
  if (!a.coordinates || !b.coordinates) return null
  return distanceM({ lat: a.coordinates.latitude, lng: a.coordinates.longitude }, { lat: b.coordinates.latitude, lng: b.coordinates.longitude })
}

function addr(d?: ProviderDetail) {
  const a = d?.address
  return a ? [a.street, [a.postalCode, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '–' : '–'
}

/** Zwei Studios (USC + Wellpass) zu einem zusammenführen und festlegen, welche Angaben gelten. */
export function MergeDialog({ base, all, initialPartnerId, onConfirm, onClose }: Props) {
  const merged = !!(base.providerDetails.urbanSportsClub && base.providerDetails.wellpass)
  const otherProvider: ProviderKey = base.providerDetails.urbanSportsClub ? 'wellpass' : 'urbanSportsClub'
  const [partnerId, setPartnerId] = useState<string | undefined>(merged ? base.id : initialPartnerId)
  const [q, setQ] = useState('')

  const options = useMemo(() => {
    if (merged) return []
    return all
      .filter((s) => s.id !== base.id && s.providerDetails[otherProvider] && !(s.providerDetails.urbanSportsClub && s.providerDetails.wellpass))
      .map((s) => ({ s, d: dist(base, s) }))
      .filter((x) => (q.trim() ? searchScore(x.s, q) > 0 : x.d !== null && x.d < 1500))
      .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity))
      .slice(0, 40)
  }, [all, base, merged, otherProvider, q])

  const partner = partnerId ? all.find((s) => s.id === partnerId) : undefined
  const uscStudio = merged ? base : base.providerDetails.urbanSportsClub ? base : partner
  const wpStudio = merged ? base : base.providerDetails.wellpass ? base : partner
  const u = uscStudio?.providerDetails.urbanSportsClub
  const w = wpStudio?.providerDetails.wellpass

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{merged ? 'Angaben festlegen' : 'Studios zusammenführen'}</DialogTitle>
          <DialogDescription>
            {merged
              ? 'Welche Angaben sollen für das zusammengeführte Studio gelten?'
              : !partner
                ? `Welches ${LABEL[otherProvider]}-Studio ist dasselbe wie „${base.name}“?`
                : 'Welche Angaben sollen gelten? Die Details beider Anbieter bleiben in den Tabs erhalten.'}
          </DialogDescription>
        </DialogHeader>

        {!partner || !u || !w ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${LABEL[otherProvider]}-Studio suchen (sonst: in der Nähe)`} />
            <ul className="min-h-0 flex-1 divide-y overflow-y-auto rounded-md border">
              {options.map(({ s, d }) => (
                <li key={s.id}>
                  <button type="button" onClick={() => setPartnerId(s.id)} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{[s.address.street, s.address.district].filter(Boolean).join(' · ')}</span>
                    </span>
                    {d !== null && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatDistance(d)}</span>}
                  </button>
                </li>
              ))}
              {options.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">Kein passendes Studio in der Nähe – bitte suchen.</li>}
            </ul>
          </div>
        ) : (
          <FieldForm
            key={partner.id}
            u={u}
            w={w}
            initial={base.fieldChoices}
            distance={uscStudio && wpStudio ? dist(uscStudio, wpStudio) : null}
            onBack={merged || initialPartnerId ? undefined : () => setPartnerId(undefined)}
            onConfirm={(fields) => onConfirm(uscStudio!, wpStudio!, fields)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function FieldForm({
  u,
  w,
  initial,
  distance,
  onBack,
  onConfirm,
}: {
  u: ProviderDetail
  w: ProviderDetail
  initial?: FieldChoices
  distance: number | null
  onBack?: () => void
  onConfirm: (f: FieldChoices) => void
}) {
  const initName = initial?.name
  const [nameChoice, setNameChoice] = useState<'urbanSportsClub' | 'wellpass' | 'custom'>(typeof initName === 'object' ? 'custom' : (initName ?? 'urbanSportsClub'))
  const [customName, setCustomName] = useState(typeof initName === 'object' ? initName.custom : u.name)
  const [address, setAddress] = useState<ProviderKey>(initial?.address ?? (u.address?.postalCode || !w.address?.street ? 'urbanSportsClub' : 'wellpass'))
  const [coords, setCoords] = useState<ProviderKey>(initial?.coordinates ?? (u.coordinates ? 'urbanSportsClub' : 'wellpass'))
  const [website, setWebsite] = useState<ProviderKey>((typeof initial?.website === 'string' ? initial.website : undefined) ?? (w.website ? 'wellpass' : 'urbanSportsClub'))

  const submit = () => {
    const name: FieldChoice = nameChoice === 'custom' ? { custom: customName.trim() || u.name } : nameChoice
    onConfirm({ name, address, coordinates: coords, website })
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-sm">
        <Choice
          label="Name"
          value={nameChoice}
          onChange={(v) => setNameChoice(v as typeof nameChoice)}
          options={[
            { value: 'urbanSportsClub', label: u.name, hint: 'USC' },
            { value: 'wellpass', label: w.name, hint: 'Wellpass' },
            { value: 'custom', label: 'Eigener Name', hint: '' },
          ]}
        />
        {nameChoice === 'custom' && <Input value={customName} onChange={(e) => setCustomName(e.target.value)} aria-label="Eigener Name" />}
        <Choice
          label="Adresse"
          value={address}
          onChange={(v) => setAddress(v as ProviderKey)}
          options={[
            { value: 'urbanSportsClub', label: addr(u), hint: 'USC' },
            { value: 'wellpass', label: addr(w), hint: 'Wellpass' },
          ]}
        />
        {u.coordinates && w.coordinates && (
          <Choice
            label={`Position auf der Karte${distance !== null ? ` (liegen ${formatDistance(distance)} auseinander)` : ''}`}
            value={coords}
            onChange={(v) => setCoords(v as ProviderKey)}
            options={[
              { value: 'urbanSportsClub', label: 'Pin von USC', hint: '' },
              { value: 'wellpass', label: 'Pin von Wellpass', hint: '' },
            ]}
          />
        )}
        {(u.website || w.website) && (
          <Choice
            label="Website"
            value={website}
            onChange={(v) => setWebsite(v as ProviderKey)}
            options={[
              { value: 'urbanSportsClub', label: u.website ?? '– keine –', hint: 'USC' },
              { value: 'wellpass', label: w.website ?? '– keine –', hint: 'Wellpass' },
            ]}
          />
        )}
      </div>
      <DialogFooter className="flex-row gap-2 sm:justify-between">
        {onBack ? (
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft /> Anderes Studio
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={submit}>Speichern</Button>
      </DialogFooter>
    </>
  )
}

function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; hint: string }[]
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-semibold text-muted-foreground uppercase">{label}</legend>
      <div className="space-y-1">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn('flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2', value === o.value && 'border-foreground bg-muted')}
          >
            <input type="radio" className="mt-1" checked={value === o.value} onChange={() => onChange(o.value)} />
            <span className="min-w-0 flex-1 break-words">{o.label}</span>
            {o.hint && <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
