import { useState } from 'react'
import { AlertTriangle, ArrowLeft, ExternalLink, Globe, Link2, MapPin, Pencil, Phone, Plus, Star, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CATEGORY_META, SOURCE_LABEL, categoryOf } from '@/lib/categories'
import { distanceM, formatDistance, type LatLng } from '@/lib/geo'
import { memberKey, membersOf } from '@/lib/merges'
import { USC_PLANS, formatLimit, minActivityPlan, minUscPlan, planLabel, planSize, type UscPlan, type ViewStudio } from '@/lib/plans'
import { cn } from '@/lib/utils'
import type { Activity, Address, MatchCandidate, Member, ProviderDetail, ProviderKey, Studio } from '@/types/studio'
import { ProviderBadges } from '../ProviderBadges'

const PROVIDER_NAME: Record<ProviderKey, string> = { urbanSportsClub: 'Urban Sports Club', wellpass: 'Wellpass' }

function formatDate(iso: string | null | undefined) {
  if (!iso) return 'unbekannt'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE')
}

function addressLines(a?: Address | null) {
  if (!a) return ['Adresse unbekannt', '']
  const place = [[a.postalCode, a.city].filter(Boolean).join(' '), a.district, a.region].filter(Boolean).join(' · ')
  // Der Wellpass-Gym-Finder liefert keine Straße – dann den Ort als Hauptzeile
  if (!a.street) return place ? [place, 'Straße unbekannt (siehe Gym-Finder bzw. Route)'] : ['Adresse unbekannt', '']
  return [a.approximate ? `ca. ${a.street}` : a.street, a.approximate ? [place, 'Adresse aus der Kartenposition ermittelt'].filter(Boolean).join(' · ') : place]
}

interface Props {
  studio: ViewStudio
  /** ungefiltertes Studio (alle Anbieter), für die Tabs */
  full: Studio
  plan: UscPlan
  highlight: string[]
  candidates: MatchCandidate[]
  userLocation: LatLng | null
  onClose: () => void
  onMerge: (opts: { partnerIds?: string[]; editOnly?: boolean }) => void
  onUnmerge: () => void
  onRejectCandidate: (pair: string) => void
  onShowStudio: (id: string) => void
  className?: string
}

export function StudioDetail(p: Props) {
  const { full: s, studio: view, plan, onClose, className } = p
  const members = membersOf(s)
  const [tab, setTab] = useState('overview')
  const category = categoryOf(view)
  const label = (m: Member) => {
    const same = members.filter((x) => x.provider === m.provider)
    const short = m.provider === 'urbanSportsClub' ? 'USC' : 'Wellpass'
    return same.length > 1 ? `${short} ${same.indexOf(m) + 1}` : short
  }

  return (
    <section aria-label={`Details zu ${s.name}`} className={cn('flex max-h-full min-h-0 flex-col overflow-hidden rounded-t-2xl border bg-background shadow-xl md:rounded-xl', className)}>
      <header className="flex items-start gap-2 border-b p-3" style={{ borderTop: `4px solid ${CATEGORY_META[category].color}` }}>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Zurück zur Karte" className="-ml-1">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="text-base leading-tight font-semibold">{s.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ProviderBadges studio={s} />
            {s.providerDetails.urbanSportsClub?.plus && <span className="rounded border px-1.5 py-0.5 text-[11px] font-semibold">Plus</span>}
            {members.length > 2 && <span className="text-xs text-muted-foreground">{members.length} Einträge</span>}
          </div>
        </div>
      </header>

      {members.length > 1 ? (
        <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
          <TabsList className="mx-3 mt-2 flex w-auto justify-start overflow-x-auto [scrollbar-width:none]">
            <TabsTrigger value="overview" className="flex-none px-3">Übersicht</TabsTrigger>
            {members.map((m) => (
              <TabsTrigger key={memberKey(m)} value={memberKey(m)} className="flex-none px-3">
                {label(m)}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <TabsContent value="overview">
              <Overview {...p} />
            </TabsContent>
            {members.map((m) => (
              <TabsContent key={memberKey(m)} value={memberKey(m)}>
                <ProviderSection provider={m.provider} detail={m.detail} studioName={s.name} plan={plan} highlight={p.highlight} />
              </TabsContent>
            ))}
          </div>
        </Tabs>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Overview {...p} />
          {members.map((m) => (
            <ProviderSection key={memberKey(m)} provider={m.provider} detail={m.detail} studioName={s.name} plan={plan} highlight={p.highlight} compact />
          ))}
        </div>
      )}
    </section>
  )
}

/** Alle Aktivitäten aller Einträge mit Verfügbarkeit in der gewählten Stufe. */
function CombinedActivities({ s, plan, highlight }: { s: Studio; plan: UscPlan; highlight: string[] }) {
  const size = planSize(plan)
  // Wert je Aktivität: -1 unbegrenzt, 0 nicht verfügbar, n pro Monat, null unbekannt
  const rank = (v: number | null) => (v === null ? 0.5 : v < 0 ? Infinity : v)
  const value = (a: Activity): number | null => {
    if (!a.limits) return null
    if (size) return a.limits[size]
    return Object.values(a.limits).reduce((best, v) => (rank(v) > rank(best) ? v : best), 0)
  }
  const rows = new Map<string, { usc?: number | null; wp: boolean }>()
  for (const m of membersOf(s)) {
    const acts: Activity[] = m.detail.activities ?? (m.detail.categories ?? []).map((name) => ({ name, limits: null }))
    for (const a of acts) {
      const r = rows.get(a.name) ?? { wp: false }
      if (m.provider === 'wellpass') r.wp = true
      else {
        const v = value(a)
        if (r.usc === undefined || rank(v) > rank(r.usc)) r.usc = v
      }
      rows.set(a.name, r)
    }
  }
  const list = [...rows.entries()].sort((a, b) => Number(highlight.includes(b[0])) - Number(highlight.includes(a[0])) || a[0].localeCompare(b[0], 'de'))
  if (!list.length) return null
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">Aktivitäten (alle Anbieter)</h4>
      <ul className="divide-y rounded-md border text-xs">
        {list.map(([name, r]) => (
          <li key={name} className={cn('flex items-center gap-2 px-2 py-1.5', highlight.includes(name) && 'bg-amber-50 font-medium')}>
            <span className="flex-1">{name}</span>
            {r.usc !== undefined && (
              <span className={cn('rounded px-1', r.usc === 0 ? 'text-muted-foreground line-through' : 'bg-blue-50 text-blue-800')}>
                USC{size && r.usc !== null && r.usc !== undefined ? ` ${size}: ${r.usc === 0 ? 'nein' : r.usc < 0 ? '∞' : `${r.usc}×`}` : ''}
              </span>
            )}
            {r.wp && <span className="rounded bg-orange-50 px-1 text-orange-800">WP</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Overview({ studio: view, full: s, plan, highlight, userLocation, candidates, onMerge, onUnmerge, onRejectCandidate, onShowStudio }: Props) {
  const [l1, l2] = addressLines(s.address)
  const dist = userLocation && s.coordinates ? distanceM(userLocation, { lat: s.coordinates.latitude, lng: s.coordinates.longitude }) : null
  const multi = membersOf(s).length > 1
  const uscMin = minUscPlan(s)
  return (
    <div className="space-y-3 p-3 text-sm">
      {view.uscExcluded && s.providerDetails.urbanSportsClub && (
        <p className="rounded-md bg-muted p-2 text-xs">
          {view.uscExcluded === 'plan' && `Bei Urban Sports Club erst ab ${uscMin ? `${uscMin.size} (${uscMin.id})` : 'höherer Stufe'} – nicht mit deiner Stufe ${planLabel(plan)}.`}
          {view.uscExcluded === 'plus' && 'Bei Urban Sports Club ein Plus-Angebot (ausgeblendet, siehe Filter „Plus“).'}
          {view.uscExcluded === 'activity' && `Die gewählte Aktivität ist bei Urban Sports Club hier nicht mit ${planLabel(plan)} buchbar.`}
        </p>
      )}
      <div className="flex gap-2">
        <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div>{l1}</div>
          <div className="text-muted-foreground">{l2}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
            {dist !== null && <span className="text-muted-foreground">{formatDistance(dist)} entfernt</span>}
            {s.coordinates && (
              <a className="text-primary hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${s.coordinates.latitude},${s.coordinates.longitude}`}>
                Route
              </a>
            )}
            {s.coordinates && (
              <a className="text-primary hover:underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${s.coordinates.latitude}&mlon=${s.coordinates.longitude}#map=18/${s.coordinates.latitude}/${s.coordinates.longitude}`}>
                OpenStreetMap
              </a>
            )}
          </div>
        </div>
      </div>
      {!s.coordinates && (
        <p className="flex gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          <AlertTriangle className="size-4 shrink-0" /> Keine Koordinaten – das Studio erscheint nur in der Liste.
        </p>
      )}
      {s.coordinates?.precision === 'geocoded' && (
        <p className="flex gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          <AlertTriangle className="size-4 shrink-0" /> Position ungefähr (per Adresssuche ermittelt).
        </p>
      )}
      <Contact website={s.website} phone={s.phone} />

      {multi && <CombinedActivities s={s} plan={plan} highlight={highlight} />}

      {multi && (
        <div className="rounded-md border p-2 text-xs">
          <p className="font-medium">
            {s.matchConfidence === 'verified' ? 'Von dir zusammengeführt' : 'Automatisch zusammengeführt'} ({membersOf(s).length} Einträge) – Details je Eintrag in den Tabs.
          </p>
          {s.match && s.matchConfidence !== 'verified' && (
            <details className="mt-1">
              <summary className="cursor-pointer text-muted-foreground">Warum?</summary>
              <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                {s.match.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => onMerge({ editOnly: true })}>
              <Pencil /> Angaben ändern
            </Button>
            <Button size="sm" variant="outline" onClick={() => onMerge({})}>
              <Plus /> Weitere hinzufügen
            </Button>
            <Button size="sm" variant="outline" onClick={onUnmerge}>
              <Unlink /> Trennen
            </Button>
          </div>
        </div>
      )}

      {!multi && (
        <div className="space-y-2">
          {candidates.map((c) => {
            const otherIsWp = c.urbanSportsClub.studioId === s.id
            const other = otherIsWp ? c.wellpass : c.urbanSportsClub
            return (
              <div key={c.id} className="rounded-md border border-amber-300 bg-amber-50/60 p-2 text-xs">
                <p className="font-medium">
                  Ähnlich wie „{other.name}“ ({otherIsWp ? 'Wellpass' : 'USC'}) – dasselbe Studio?
                </p>
                <p className="mt-0.5 text-muted-foreground">{c.reasons.slice(0, 3).join(' · ')}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" onClick={() => onMerge({ partnerIds: other.studioId ? [other.studioId] : undefined })}>
                    <Link2 /> Zusammenführen…
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onRejectCandidate(c.id)}>
                    Verschieden
                  </Button>
                  {other.studioId && (
                    <Button size="sm" variant="ghost" onClick={() => onShowStudio(other.studioId!)}>
                      Anzeigen
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
          <Button size="sm" variant="outline" className="w-full" onClick={() => onMerge({})}>
            <Link2 /> Mit anderen Einträgen zusammenführen…
          </Button>
        </div>
      )}
    </div>
  )
}

function Contact({ website, phone }: { website?: string | null; phone?: string | null }) {
  if (!website && !phone) return null
  return (
    <div className="space-y-1 text-sm">
      {website && (
        <a href={website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline">
          <Globe className="size-4 shrink-0" />
          <span className="truncate">{website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
        </a>
      )}
      {phone && (
        <a href={`tel:${phone.replace(/\s/g, '')}`} className="flex items-center gap-2 text-primary hover:underline">
          <Phone className="size-4 shrink-0" />
          {phone}
        </a>
      )}
    </div>
  )
}

function ProviderSection({
  provider,
  detail: d,
  studioName,
  plan,
  highlight,
  compact,
}: {
  provider: ProviderKey
  detail: ProviderDetail
  studioName: string
  plan: UscPlan
  highlight: string[]
  compact?: boolean
}) {
  const size = planSize(plan)
  const [l1, l2] = addressLines(d.address)
  const acts: Activity[] = d.activities ?? (d.categories ?? []).map((name) => ({ name, limits: null }))
  const sorted = [...acts].sort((a, b) => Number(highlight.includes(b.name)) - Number(highlight.includes(a.name)))
  return (
    <div className={cn('space-y-3 p-3 text-sm', compact && 'border-t')}>
      <div className="flex items-center gap-2">
        <span className="font-semibold" style={{ color: CATEGORY_META[provider === 'urbanSportsClub' ? 'usc' : 'wellpass'].color }}>
          {PROVIDER_NAME[provider]}
        </span>
        {d.plus && <span className="rounded border px-1.5 py-0.5 text-[11px] font-semibold">Plus</span>}
        {provider === 'wellpass' && d.plus1 !== undefined && (
          <span className="rounded border px-1.5 py-0.5 text-[11px]" title="Auch mit Plus1-Mitgliedschaft (Angehörige) nutzbar">
            Plus1: {d.plus1 ? 'ja' : 'nein'}
          </span>
        )}
        {d.rating ? (
          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
            <Star className="size-3 fill-amber-400 text-amber-400" />
            {d.rating.toLocaleString('de-DE')} ({d.ratingCount})
          </span>
        ) : null}
        {d.url && (
          <a href={d.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline">
            {provider === 'urbanSportsClub' ? 'Bei USC öffnen' : 'Gym-Finder'} <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      {!compact && (
        <>
          {d.name !== studioName && <p className="text-xs text-muted-foreground">Dort gelistet als „{d.name}“</p>}
          <div className="flex gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <div>{l1}</div>
              <div className="text-muted-foreground">{l2}</div>
            </div>
          </div>
          <Contact website={d.website} phone={d.phone} />
        </>
      )}
      {compact && d.name !== studioName && <p className="-mt-2 text-xs text-muted-foreground">Dort gelistet als „{d.name}“</p>}

      {provider === 'urbanSportsClub' && d.visitLimits && (
        <div>
          <h4 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">Besuche pro Monat je Stufe</h4>
          <div className="grid grid-cols-4 gap-1 text-center text-xs">
            {USC_PLANS.map((pl) => {
              const v = d.visitLimits?.[pl.size]
              return (
                <div key={pl.size} className={cn('rounded border p-1', size === pl.size && 'border-foreground bg-muted font-medium')}>
                  <div className="font-semibold">{pl.size}</div>
                  <div className="text-[11px]">{v === undefined || v === null ? '–' : v === 0 ? 'nein' : v < 0 ? '∞' : `${v}×`}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {sorted.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">Aktivitäten</h4>
          <ul className="divide-y rounded-md border text-xs">
            {sorted.map((a) => {
              const value = a.limits && size ? a.limits[size] : null
              const min = minActivityPlan(a)
              return (
                <li key={a.name} className={cn('flex items-center gap-2 px-2 py-1.5', highlight.includes(a.name) && 'bg-amber-50 font-medium')}>
                  <span className="flex-1">{a.name}</span>
                  {provider === 'urbanSportsClub' && a.limits && (
                    <span className={cn('text-right', value === 0 ? 'text-muted-foreground' : 'text-emerald-700')}>
                      {size ? (value === 0 ? (min ? `erst ab ${min.size}` : 'nicht buchbar') : `${size}: ${formatLimit(value)}`) : min ? `ab ${min.size}` : 'nicht buchbar'}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Quelle: {SOURCE_LABEL[d.source] ?? d.source} · geprüft am {formatDate(d.detailsFetchedAt ?? d.fetchedAt)}
      </p>
    </div>
  )
}
