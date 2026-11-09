import { useState } from 'react'
import { AlertTriangle, ArrowLeft, ExternalLink, Globe, Link2, MapPin, Phone, Star, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CATEGORY_META, SOURCE_LABEL, categoryOf } from '@/lib/categories'
import { distanceM, formatDistance, type LatLng } from '@/lib/geo'
import { USC_PLANS, formatLimit, minActivityPlan, minUscPlan, planLabel, planSize, type UscPlan, type ViewStudio } from '@/lib/plans'
import { cn } from '@/lib/utils'
import type { Activity, Address, MatchCandidate, ProviderDetail, ProviderKey, Studio } from '@/types/studio'
import { ProviderBadges } from '../ProviderBadges'

const PROVIDER_NAME: Record<ProviderKey, string> = { urbanSportsClub: 'Urban Sports Club', wellpass: 'Wellpass' }

function formatDate(iso: string | null | undefined) {
  if (!iso) return 'unbekannt'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE')
}

function addressLines(a?: Address | null) {
  if (!a) return ['Adresse unbekannt', '']
  return [a.street ?? 'Straße unbekannt', [[a.postalCode, a.city].filter(Boolean).join(' '), a.district].filter(Boolean).join(' · ')]
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
  onMerge: (partnerId?: string) => void
  onUnmerge: () => void
  onRejectCandidate: (pair: string) => void
  onShowStudio: (id: string) => void
  className?: string
}

export function StudioDetail(p: Props) {
  const { full: s, studio: view, plan, onClose, className } = p
  const both = !!(s.providerDetails.urbanSportsClub && s.providerDetails.wellpass)
  const [tab, setTab] = useState('overview')
  const category = categoryOf(view)

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
          </div>
        </div>
      </header>

      {both ? (
        <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
          <TabsList className="mx-3 mt-2 grid w-auto grid-cols-3">
            <TabsTrigger value="overview">Übersicht</TabsTrigger>
            <TabsTrigger value="urbanSportsClub">USC</TabsTrigger>
            <TabsTrigger value="wellpass">Wellpass</TabsTrigger>
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <TabsContent value="overview">
              <Overview {...p} />
            </TabsContent>
            <TabsContent value="urbanSportsClub">
              <ProviderSection provider="urbanSportsClub" detail={s.providerDetails.urbanSportsClub!} studioName={s.name} plan={plan} highlight={p.highlight} />
            </TabsContent>
            <TabsContent value="wellpass">
              <ProviderSection provider="wellpass" detail={s.providerDetails.wellpass!} studioName={s.name} plan={plan} highlight={p.highlight} />
            </TabsContent>
          </div>
        </Tabs>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Overview {...p} />
          {(Object.keys(PROVIDER_NAME) as ProviderKey[]).map((k) =>
            s.providerDetails[k] ? (
              <ProviderSection key={k} provider={k} detail={s.providerDetails[k]!} studioName={s.name} plan={plan} highlight={p.highlight} compact />
            ) : null,
          )}
        </div>
      )}
    </section>
  )
}

function Overview({ studio: view, full: s, plan, userLocation, candidates, onMerge, onUnmerge, onRejectCandidate, onShowStudio }: Props) {
  const [l1, l2] = addressLines(s.address)
  const dist = userLocation && s.coordinates ? distanceM(userLocation, { lat: s.coordinates.latitude, lng: s.coordinates.longitude }) : null
  const both = !!(s.providerDetails.urbanSportsClub && s.providerDetails.wellpass)
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

      {both && (
        <div className="rounded-md border p-2 text-xs">
          <p className="font-medium">
            {s.matchConfidence === 'verified' ? 'Von dir zusammengeführt' : 'Automatisch zusammengeführt'} – Details je Anbieter in den Tabs.
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
            <Button size="sm" variant="outline" onClick={() => onMerge()}>
              <Link2 /> Angaben ändern
            </Button>
            <Button size="sm" variant="outline" onClick={onUnmerge}>
              <Unlink /> Trennen
            </Button>
          </div>
        </div>
      )}

      {!both && (
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
                  <Button size="sm" onClick={() => onMerge(other.studioId ?? undefined)}>
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
          <Button size="sm" variant="outline" className="w-full" onClick={() => onMerge()}>
            <Link2 /> Mit {s.providerDetails.urbanSportsClub ? 'einem Wellpass' : 'einem USC'}-Studio zusammenführen…
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
