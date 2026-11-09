import type { Dataset } from '@/types/studio'

export class DataLoadError extends Error {}

/** Lädt den veröffentlichten Datenbestand (public/data/studios.json). */
export async function loadDataset(signal?: AbortSignal): Promise<Dataset> {
  const url = `${import.meta.env.BASE_URL}data/studios.json?t=${Date.now()}`
  let res: Response
  try {
    res = await fetch(url, { signal, cache: 'no-store' })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new DataLoadError('Die Studiodaten konnten nicht geladen werden (Netzwerkfehler).')
  }
  if (res.status === 404) {
    throw new DataLoadError('Noch keine Studiodaten vorhanden. Bitte zuerst einen Import ausführen (siehe README: npm run data:fetch).')
  }
  if (!res.ok) throw new DataLoadError(`Die Studiodaten konnten nicht geladen werden (HTTP ${res.status}).`)
  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new DataLoadError('Die Datei public/data/studios.json ist kein gültiges JSON.')
  }
  const d = data as Partial<Dataset>
  if (!d || !Array.isArray(d.studios)) {
    throw new DataLoadError('Die Datei public/data/studios.json hat ein unerwartetes Format (Liste "studios" fehlt).')
  }
  return {
    schemaVersion: d.schemaVersion ?? 0,
    generatedAt: d.generatedAt ?? '',
    studios: d.studios.filter((s) => s && typeof s.id === 'string' && s.providers),
    matchCandidates: d.matchCandidates ?? [],
    rejectedPairs: d.rejectedPairs ?? [],
    sources: d.sources ?? [],
    keyAliases: d.keyAliases ?? {},
    tiles: d.tiles,
  }
}
