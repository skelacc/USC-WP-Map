import type { Category, Studio } from '@/types/studio'
import { categoryOf } from './categories'
import { distanceM, type LatLng } from './geo'
import { searchScore } from './search'

export type CategoryFilter = Record<Category, boolean>
export type SortMode = 'name' | 'distance'

/** Standard: nur Studios, die beide Anbieter akzeptieren */
export const DEFAULT_FILTER: CategoryFilter = { both: true, usc: false, wellpass: false }

export function filterStudios<T extends Studio>(studios: T[], filter: CategoryFilter, query: string): T[] {
  return studios.filter((s) => filter[categoryOf(s)] && searchScore(s, query) > 0)
}

/** Suchtreffer mit Relevanz (für die Sortierung der Liste). */
export function searchStudios<T extends Studio>(studios: T[], query: string): { matches: T[]; scores: Map<string, number> } {
  const scores = new Map<string, number>()
  if (!query.trim()) return { matches: studios, scores }
  const matches: T[] = []
  for (const s of studios) {
    const sc = searchScore(s, query)
    if (sc > 0) {
      matches.push(s)
      scores.set(s.id, sc)
    }
  }
  return { matches, scores }
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
export function sortStudios(studios: Studio[], mode: SortMode, origin: LatLng | null, relevance?: Map<string, number>): SortedStudio[] {
  const items = studios.map((studio) => ({
    studio,
    distance:
      origin && studio.coordinates ? distanceM(origin, { lat: studio.coordinates.latitude, lng: studio.coordinates.longitude }) : null,
  }))
  if (mode === 'distance' && origin) {
    items.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || collator.compare(a.studio.name, b.studio.name))
  } else if (relevance?.size) {
    // bei aktiver Suche: beste Treffer zuerst
    items.sort((a, b) => (relevance.get(b.studio.id) ?? 0) - (relevance.get(a.studio.id) ?? 0) || collator.compare(a.studio.name, b.studio.name))
  } else {
    items.sort((a, b) => collator.compare(a.studio.name, b.studio.name))
  }
  return items
}
