import type { Category, Studio } from '@/types/studio'
import { categoryOf } from './categories'
import { distanceM, type LatLng } from './geo'
import { matchesQuery } from './search'

export type CategoryFilter = Record<Category, boolean>
export type SortMode = 'name' | 'distance'

export const DEFAULT_FILTER: CategoryFilter = { both: true, usc: true, wellpass: true }

export function filterStudios(studios: Studio[], filter: CategoryFilter, query: string): Studio[] {
  return studios.filter((s) => filter[categoryOf(s)] && matchesQuery(s, query))
}

export function countByCategory(studios: Studio[]): Record<Category, number> {
  const c: Record<Category, number> = { both: 0, usc: 0, wellpass: 0 }
  for (const s of studios) c[categoryOf(s)]++
  return c
}

export interface SortedStudio {
  studio: Studio
  distance: number | null
}

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true })

/** Sortiert nach Name oder Entfernung; Studios ohne Koordinaten stehen bei
 *  Entfernungssortierung am Ende. */
export function sortStudios(studios: Studio[], mode: SortMode, origin: LatLng | null): SortedStudio[] {
  const items = studios.map((studio) => ({
    studio,
    distance:
      origin && studio.coordinates ? distanceM(origin, { lat: studio.coordinates.latitude, lng: studio.coordinates.longitude }) : null,
  }))
  if (mode === 'distance' && origin) {
    items.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || collator.compare(a.studio.name, b.studio.name))
  } else {
    items.sort((a, b) => collator.compare(a.studio.name, b.studio.name))
  }
  return items
}
