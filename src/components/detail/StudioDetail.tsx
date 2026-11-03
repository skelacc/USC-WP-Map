import { useState } from 'react'
import { AlertTriangle, ChevronDown, ExternalLink, Globe, MapPin, Phone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CATEGORY_META, SOURCE_LABEL, categoryOf, pairIdOf } from '@/lib/categories'
import { cn } from '@/lib/utils'
import type { MatchCandidate, ProviderKey } from '@/types/studio'
import { minUscPlan, planLabel, type UscPlan, type ViewStudio } from '@/lib/plans'
import { ProviderBadges } from '../ProviderBadges'

const PROVIDER_NAME: Record<ProviderKey, string> = { urbanSportsClub: 'Urban Sports Club', wellpass: 'Wellpass' }

function formatDate(iso: string | null | undefined) {
  if (!iso) return 'unbekannt'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE')
}

interface Props {
  studio: ViewStudio
  plan: UscPlan
  candidates: MatchCandidate[]
  canEdit: boolean
  onClose: () => void
  onDecide: (pair: string, decision: 'confirm' | 'reject' | 'reset') => Promise<void>
  onShowStudio: (id: string) => void
  className?: string
}

export function StudioDetail({ studio: s, plan, candidates, canEdit, onClose, onDecide, onShowStudio, className }: Props) {
  const [showReasons, setShowReasons] = useState(false)
  const [busy, setBusy] = useState(false)
  const category = categoryOf(s)
  const a = s.address
  const pair = pairIdOf(s)
  const uscMin = minUscPlan(s)

  const decide = async (p: string, d: 'confirm' | 'reject' | 'reset') => {
    setBusy(true)
    try {
      await onDecide(p, d)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-label={`Details zu ${s.name}`}
      className={cn('flex max-h-full flex-col overflow-hidden rounded-xl border bg-background shadow-lg', className)}
    >
      <header className="flex items-start gap-2 border-b p-3" style={{ borderTop: `4px solid ${CATEGORY_META[category].color}` }}>
        <div className="min-w-0 flex-1">
          <h2 className="text-base leading-tight font-semibold">{s.name}</h2>
          <ProviderBadges studio={s} className="mt-1.5" />
          {s.uscNotInPlan && uscMin && (
            <p className="mt-1 text-xs text-muted-foreground">
              Auch bei Urban Sports Club – aber erst ab {uscMin.size} ({uscMin.id}), nicht mit deiner Stufe {planLabel(plan)}.
            </p>
          )}
          {!s.uscNotInPlan && s.providers.urbanSportsClub && uscMin && (
            <p className="mt-1 text-xs text-muted-foreground">USC ab Stufe {uscMin.size} ({uscMin.id})</p>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Details schließen">
          <X />
        </Button>
      </header>

      <div className="space-y-3 overflow-y-auto overscroll-contain p-3 text-sm">
        <div className="flex gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <div>{a.street ?? <span className="text-muted-foreground">Straße unbekannt</span>}</div>
            <div className="text-muted-foreground">{[a.postalCode, a.city].filter(Boolean).join(' ')}{a.district ? ` · ${a.district}` : ''}</div>
            {s.coordinates && (
              <a
                className="text-xs text-primary underline-offset-2 hover:underline"
                href={`https://www.openstreetmap.org/?mlat=${s.coordinates.latitude}&mlon=${s.coordinates.longitude}#map=18/${s.coordinates.latitude}/${s.coordinates.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                In OpenStreetMap öffnen
              </a>
            )}
          </div>
        </div>

        {!s.coordinates && (
          <p className="flex gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
            <AlertTriangle className="size-4 shrink-0" /> Keine Koordinaten vorhanden – das Studio erscheint nur in der Liste, nicht auf der Karte.
          </p>
        )}
        {s.coordinates?.precision === 'geocoded' && (
          <p className="flex gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
            <AlertTriangle className="size-4 shrink-0" /> Position ungefähr: per Adresssuche (OpenStreetMap Nominatim) ermittelt, nicht von der Quelle.
          </p>
        )}

        {(s.website || s.phone) && (
          <div className="space-y-1">
            {s.website && (
              <a href={s.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                <Globe className="size-4 shrink-0" />
                <span className="truncate">{s.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
              </a>
            )}
            {s.phone && (
              <a href={`tel:${s.phone.replace(/\s/g, '')}`} className="flex items-center gap-2 text-primary hover:underline">
                <Phone className="size-4 shrink-0" />
                {s.phone}
              </a>
            )}
          </div>
        )}

        {s.categories.length > 0 && <p className="text-xs text-muted-foreground">{s.categories.join(' · ')}</p>}

        <div className="space-y-2 rounded-md border p-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Anbieter & Datenquellen</h3>
          {(Object.keys(PROVIDER_NAME) as ProviderKey[]).map((p) => {
            const d = s.providerDetails[p]
            if (!d) return null
            return (
              <div key={p} className="text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{PROVIDER_NAME[p]}</span>
                  {d.url && (
                    <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                      Seite <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
                {d.name !== s.name && <div className="text-muted-foreground">Dort gelistet als „{d.name}“</div>}
                {d.plans && <div className="text-muted-foreground">USC-Stufen laut USC: {d.plans.join(', ')}</div>}
                <div className="text-muted-foreground">
                  Quelle: {SOURCE_LABEL[d.source] ?? d.source} · geprüft am {formatDate(d.fetchedAt)}
                </div>
              </div>
            )
          })}
        </div>

        {s.match && (
          <div className="rounded-md border p-2 text-xs">
            <button type="button" className="flex w-full items-center gap-1 text-left" onClick={() => setShowReasons((v) => !v)} aria-expanded={showReasons}>
              <span className="font-medium">
                Zusammengeführt: {s.matchConfidence === 'verified' ? 'manuell bestätigt' : 'automatisch (hohe Übereinstimmung)'}
              </span>
              <ChevronDown className={cn('ml-auto size-4 transition-transform', showReasons && 'rotate-180')} />
            </button>
            {showReasons && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                {s.match.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {canEdit && pair && (
              <Button size="xs" variant="outline" className="mt-2" disabled={busy} onClick={() => decide(pair, 'reject')}>
                Zuordnung lösen (verschiedene Studios)
              </Button>
            )}
          </div>
        )}

        {candidates.map((c) => {
          const otherIsWellpass = c.urbanSportsClub.studioId === s.id
          const other = otherIsWellpass ? c.wellpass : c.urbanSportsClub
          return (
            <div key={c.id} className="rounded-md border border-amber-300 bg-amber-50/60 p-2 text-xs">
              <p className="font-medium">
                Möglicherweise identisch mit „{other.name}“ ({otherIsWellpass ? 'Wellpass' : 'Urban Sports Club'})
              </p>
              <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                {c.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {other.studioId && (
                  <Button size="xs" variant="ghost" onClick={() => onShowStudio(other.studioId!)}>
                    Anzeigen
                  </Button>
                )}
                {canEdit ? (
                  <>
                    <Button size="xs" disabled={busy} onClick={() => decide(c.id, 'confirm')}>
                      Gleiches Studio
                    </Button>
                    <Button size="xs" variant="outline" disabled={busy} onClick={() => decide(c.id, 'reject')}>
                      Verschiedene Studios
                    </Button>
                  </>
                ) : (
                  <span className="self-center text-muted-foreground">Prüfen über „Daten“ (nur mit npm run dev)</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
