import { useEffect, useRef, useState } from 'react'
import { LocateFixed, MapPinOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { categoryOf } from '@/lib/categories'
import type { SortMode, SortedStudio } from '@/lib/filter'
import { formatDistance } from '@/lib/geo'
import { cn } from '@/lib/utils'
import { CategorySwatch } from '../ProviderBadges'

const PAGE = 150

interface Props {
  items: SortedStudio[]
  selectedId: string | null
  onPick: (id: string) => void
  sort: SortMode
  onSortChange: (s: SortMode) => void
  hasUserLocation: boolean
  onLocate: () => void
  locating: boolean
  searching?: boolean
}

export function StudioList({ items, selectedId, onPick, sort, onSortChange, hasUserLocation, onLocate, locating, searching }: Props) {
  // Bei neuen Ergebnissen wieder mit der ersten Seite beginnen
  const [paging, setPaging] = useState({ items, limit: PAGE })
  const limit = paging.items === items ? paging.limit : PAGE
  const setLimit = (fn: (l: number) => number) => setPaging((p) => ({ items, limit: fn(p.items === items ? p.limit : PAGE) }))
  const sentinel = useRef<HTMLDivElement>(null)

  // Weitere Einträge nachladen, sobald das Listenende sichtbar wird
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const obs = new IntersectionObserver((e) => e[0].isIntersecting && setLimit((l) => l + PAGE), { rootMargin: '400px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [items, limit]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
        <span className="font-medium tabular-nums">{items.length.toLocaleString('de-DE')} Studios</span>
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Sortierung">
          <span className="text-muted-foreground">Sortieren:</span>
          <Button size="xs" className="h-8 md:h-6" variant={sort === 'name' ? 'secondary' : 'ghost'} onClick={() => onSortChange('name')} aria-pressed={sort === 'name'}>
            {searching ? 'Relevanz' : 'A–Z'}
          </Button>
          <Button size="xs" className="h-8 md:h-6" variant={sort === 'distance' ? 'secondary' : 'ghost'} onClick={() => onSortChange('distance')} aria-pressed={sort === 'distance'}>
            Entfernung
          </Button>
          <Button size="icon-xs" className="size-8 md:size-6" variant="ghost" onClick={onLocate} disabled={locating} title="Meinen Standort verwenden" aria-label="Meinen Standort verwenden">
            <LocateFixed className={cn(hasUserLocation && 'text-sky-600', locating && 'animate-pulse')} />
          </Button>
        </div>
      </div>
      {sort === 'distance' && (
        <p className="border-b px-3 py-1 text-[11px] text-muted-foreground">
          Entfernung {hasUserLocation ? 'von deinem Standort' : 'von der Kartenmitte'}
        </p>
      )}
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label="Studioliste">
        {items.slice(0, limit).map(({ studio: s, distance }) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onPick(s.id)}
              className={cn(
                'flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none',
                selectedId === s.id && 'bg-muted',
              )}
            >
              <span className="mt-1 flex w-4 justify-center">
                <CategorySwatch category={categoryOf(s)} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[s.address.street, s.address.district].filter(Boolean).join(' · ') || 'Adresse unbekannt'}
                </span>
              </span>
              <span className="shrink-0 pt-0.5 text-right text-xs text-muted-foreground tabular-nums">
                {!s.coordinates ? (
                  <MapPinOff className="size-3.5" aria-label="Keine Koordinaten" />
                ) : distance !== null && sort === 'distance' ? (
                  formatDistance(distance)
                ) : null}
              </span>
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Keine Studios für diese Filter/Suche.</li>}
        {limit < items.length && <div ref={sentinel} className="h-8" />}
      </ul>
    </div>
  )
}
