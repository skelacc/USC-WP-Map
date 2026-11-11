import { useEffect, useRef } from 'react'
import { ChevronRight, Heart, StickyNote, Star, ThumbsDown, X, ZoomIn } from 'lucide-react'
import { addressSummary } from '@/lib/address'
import type { Rating } from '@/lib/userdata'
import type { Studio } from '@/types/studio'
import { categoryOf, CATEGORY_META } from '@/lib/categories'
import { distanceM, formatDistance, type LatLng } from '@/lib/geo'
import type { ViewStudio } from '@/lib/plans'
import { cn } from '@/lib/utils'
import { ProviderBadges } from '../ProviderBadges'

interface Props {
  items: ViewStudio[]
  activeId: string
  onActiveChange: (id: string) => void
  onOpen: (id: string) => void
  onZoom: (id: string) => void
  onClose: () => void
  userLocation: LatLng | null
  highlight: string[]
  ratingOf: (s: Studio) => Rating | null
  hasNotes: (s: Studio) => boolean
}

/**
 * Vorschaukarten unten auf der Karte (wie in der USC-App): die aktive Karte
 * gehört zum markierten Pin, seitliches Wischen wechselt zum nächstgelegenen
 * Studio, Antippen öffnet die Details.
 */
export function PreviewCarousel({ items, activeId, onActiveChange, onOpen, onZoom, onClose, userLocation, highlight, ratingOf, hasNotes }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const programmatic = useRef(false)
  const timer = useRef<number | undefined>(undefined)

  // Aktive Karte in die Mitte holen, wenn der Pin von außen gewechselt wird
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(activeId)}"]`)
    if (!el || !scroller.current) return
    const target = el.offsetLeft - (scroller.current.clientWidth - el.clientWidth) / 2
    if (Math.abs(scroller.current.scrollLeft - target) < 4) return
    programmatic.current = true
    scroller.current.scrollTo({ left: target, behavior: 'instant' as ScrollBehavior })
    window.setTimeout(() => (programmatic.current = false), 80)
  }, [activeId, items])

  // Nach dem Wischen: Karte in der Mitte wird aktiv
  const onScroll = () => {
    if (programmatic.current) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const box = scroller.current
      if (!box) return
      const mid = box.scrollLeft + box.clientWidth / 2
      let best: HTMLElement | null = null
      let bestDist = Infinity
      for (const el of box.querySelectorAll<HTMLElement>('[data-id]')) {
        const d = Math.abs(el.offsetLeft + el.clientWidth / 2 - mid)
        if (d < bestDist) {
          bestDist = d
          best = el
        }
      }
      const id = best?.dataset.id
      if (id && id !== activeId) onActiveChange(id)
    }, 120)
  }

  return (
    <div className="pointer-events-none relative">
      <div className="pointer-events-none absolute -top-12 right-3 flex gap-2">
        <button
          type="button"
          onClick={() => onZoom(activeId)}
          aria-label="Zum Studio heranzoomen"
          title="Heranzoomen"
          className="pointer-events-auto flex h-9 items-center gap-1.5 rounded-full border bg-background px-3 text-xs font-medium shadow-md"
        >
          <ZoomIn className="size-4" /> Heranzoomen
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Vorschau schließen"
          className="pointer-events-auto flex size-9 items-center justify-center rounded-full border bg-background shadow-md"
        >
          <X className="size-4" />
        </button>
      </div>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="pointer-events-auto flex snap-x snap-mandatory gap-2 overflow-x-auto px-[7.5%] pb-1 [scrollbar-width:none] md:px-3 [&::-webkit-scrollbar]:hidden"
        aria-label="Studios in der Nähe"
      >
        {items.map((s) => {
          const cat = categoryOf(s)
          const usc = s.providerDetails.urbanSportsClub
          const rating = usc?.rating
          const dist = userLocation && s.coordinates ? distanceM(userLocation, { lat: s.coordinates.latitude, lng: s.coordinates.longitude }) : null
          const acts = (s.activities ?? s.categories) || []
          const shown = [...acts.filter((a) => highlight.includes(a)), ...acts.filter((a) => !highlight.includes(a))].slice(0, 3)
          return (
            <button
              key={s.id}
              data-id={s.id}
              type="button"
              onClick={() => (s.id === activeId ? onOpen(s.id) : onActiveChange(s.id))}
              className={cn(
                'flex w-[85%] max-w-sm shrink-0 snap-center flex-col gap-1 rounded-xl border bg-background p-3 text-left shadow-lg transition-opacity md:w-80',
                s.id !== activeId && 'opacity-80',
              )}
              style={{ borderTop: `4px solid ${CATEGORY_META[cat].color}` }}
            >
              <span className="flex items-start gap-2">
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[15px] leading-snug font-semibold">{s.name}</span>
                </span>
                {ratingOf(s) === 'like' && <Heart className="mt-0.5 size-4 shrink-0 fill-rose-500 text-rose-500" aria-label="Favorit" />}
                {ratingOf(s) === 'dislike' && <ThumbsDown className="mt-0.5 size-4 shrink-0 text-slate-500" aria-label="Abgelehnt" />}
                {(hasNotes(s) || s.userHint) && <StickyNote className="mt-0.5 size-4 shrink-0 text-amber-600" aria-label="Notiz vorhanden" />}
                <ChevronRight className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <ProviderBadges studio={s} />
                {usc?.plus && s.providers.urbanSportsClub && <span className="rounded border px-1 font-semibold text-foreground">Plus</span>}
                {rating ? (
                  <span className="inline-flex items-center gap-0.5">
                    <Star className="size-3 fill-amber-400 text-amber-400" />
                    {rating.toLocaleString('de-DE')}
                  </span>
                ) : null}
                {dist !== null && <span>{formatDistance(dist)}</span>}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {addressSummary(s.address)}
              </span>
              {shown.length > 0 && (
                <span className="truncate text-xs">
                  {shown.map((a, i) => (
                    <span key={a} className={cn(highlight.includes(a) && 'font-semibold')}>
                      {i > 0 && ' · '}
                      {a}
                    </span>
                  ))}
                  {acts.length > 3 && <span className="text-muted-foreground"> +{acts.length - 3}</span>}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
