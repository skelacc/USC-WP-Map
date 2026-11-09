/**
 * Wellpass-Studios außerhalb Berlins liegen kompakt in Kacheln (1° × 1°).
 * Geladen werden nur die Kacheln im Kartenausschnitt – oder auf Wunsch alle.
 * Format: scripts/studiomap/publish.py
 */
import type { Bounds, Studio, TileIndex, TileRecord } from '@/types/studio'

const base = () => `${import.meta.env.BASE_URL}data/tiles/`

export async function loadTileIndex(signal?: AbortSignal): Promise<TileIndex | null> {
  const res = await fetch(`${base()}index.json?t=${Date.now()}`, { signal, cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Kachelverzeichnis nicht ladbar (HTTP ${res.status})`)
  return (await res.json()) as TileIndex
}

export async function loadTile(index: TileIndex, id: string, signal?: AbortSignal): Promise<Studio[]> {
  // Stand im Dateinamen-Parameter: neue Daten umgehen den Browser-Cache, gleiche nutzen ihn
  const res = await fetch(`${base()}${id}.json?v=${encodeURIComponent(index.generatedAt)}`, { signal })
  if (!res.ok) throw new Error(`Kachel ${id} nicht ladbar (HTTP ${res.status})`)
  return expandTile((await res.json()) as TileRecord[], index)
}

/** Baut aus der Kurzform dieselben Studio-Objekte wie in studios.json. */
export function expandTile(records: TileRecord[], index: TileIndex): Studio[] {
  const fetchedAt = index.fetchedAt
  return records.map((r) => {
    const [latitude, longitude] = r.c
    const address = {
      street: r.st ?? null,
      postalCode: r.z ?? null,
      city: r.o ?? null,
      district: r.d ?? null,
      region: r.r ? (index.regions[r.r] ?? r.r) : null,
      ...(r.x ? { approximate: true } : {}),
    }
    const activities = (r.a ?? []).map((i) => index.activities[i]).filter(Boolean)
    const categories = r.t !== undefined && index.types[r.t] ? [index.types[r.t]] : []
    const key = `wellpass:official:${r.i}`
    return {
      id: `wp-${r.i}`,
      name: r.n,
      address,
      coordinates: { latitude, longitude, precision: 'source', from: 'wellpass' },
      providers: { urbanSportsClub: false, wellpass: true },
      providerDetails: {
        wellpass: {
          sourceId: r.i,
          source: 'official',
          key,
          name: r.n,
          url: index.urlBase + r.s,
          address,
          coordinates: { latitude, longitude, precision: 'source' },
          website: null,
          phone: null,
          plans: null,
          categories: categories.length ? categories : null,
          activities: activities.map((name) => ({ name, limits: null })),
          plus1: r.p === 1,
          fetchedAt,
        },
      },
      website: null,
      phone: null,
      categories,
      activities,
      source: { urbanSportsClub: null, wellpass: 'official' },
      lastVerified: fetchedAt?.slice(0, 10) ?? null,
      matchConfidence: 'single',
      match: null,
    } satisfies Studio
  })
}

/** Kacheln, die den Ausschnitt berühren (nur solche mit Daten). */
export function cellsInBounds(index: TileIndex, b: Bounds): string[] {
  const d = index.cellDeg
  const out: string[] = []
  for (let la = Math.floor(b.south / d); la <= Math.floor(b.north / d); la++) {
    for (let lo = Math.floor(b.west / d); lo <= Math.floor(b.east / d); lo++) {
      const id = `${la}_${lo}`
      if (index.cells[id]) out.push(id)
    }
  }
  return out
}

export function inBounds(s: Studio, b: Bounds): boolean {
  const c = s.coordinates
  return !!c && c.latitude >= b.south && c.latitude <= b.north && c.longitude >= b.west && c.longitude <= b.east
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.south <= b.north && a.north >= b.south && a.west <= b.east && a.east >= b.west
}

/** Großraum Berlin (hier gibt es auch USC-Daten). */
export function coreBounds(index: TileIndex | null): Bounds {
  const [south, north, west, east] = index?.coreBounds ?? [52.3, 52.72, 12.95, 13.85]
  return { south, north, west, east }
}
