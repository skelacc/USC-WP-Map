import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DataLoadError, loadDataset } from '@/lib/data'
import { loadTile, loadTileIndex } from '@/lib/tiles'
import type { Dataset, Studio, TileIndex } from '@/types/studio'

export interface TileState {
  index: TileIndex | null
  /** Anzahl geladener Kacheln / Studios daraus */
  loadedCells: number
  loadedStudios: number
  loading: boolean
  allLoaded: boolean
  error: string | null
}

/**
 * Kerndatei (Berlin, alle Anbieter) sofort; Wellpass außerhalb Berlins in
 * Kacheln bei Bedarf (ensureCells / loadAll). Geladene Kacheln bleiben im Speicher.
 */
export function useDataset() {
  const [core, setCore] = useState<Dataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)
  const [index, setIndex] = useState<TileIndex | null>(null)
  const [tiles, setTiles] = useState<ReadonlyMap<string, Studio[]>>(new Map())
  const [pendingCount, setPendingCount] = useState(0)
  const [tileError, setTileError] = useState<string | null>(null)
  const requested = useRef(new Set<string>())
  const ctrlRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    setLoading(true)
    loadDataset(ctrl.signal)
      .then((d) => {
        setCore(d)
        setError(null)
      })
      .catch((e: Error) => {
        if (e.name === 'AbortError') return
        // Bei einem Fehler bleibt ein bereits geladener Datenbestand sichtbar
        setError(e instanceof DataLoadError ? e.message : `Unerwarteter Fehler: ${e.message}`)
      })
      .finally(() => setLoading(false))
    loadTileIndex(ctrl.signal)
      .then(setIndex)
      .catch((e: Error) => e.name !== 'AbortError' && setTileError(e.message))
    return () => ctrl.abort()
  }, [version])

  const ensureCells = useCallback(
    (ids: string[]) => {
      if (!index) return
      const missing = ids.filter((id) => !requested.current.has(id))
      if (!missing.length) return
      for (const id of missing) requested.current.add(id)
      setPendingCount((n) => n + missing.length)
      const signal = ctrlRef.current?.signal
      // gesammelt übernehmen: weniger Neuberechnungen bei vielen Kacheln
      void Promise.allSettled(missing.map((id) => loadTile(index, id, signal).then((s) => [id, s] as const))).then((results) => {
        if (signal?.aborted) return
        const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
        const failed = missing.filter((id) => !ok.some(([okId]) => okId === id))
        for (const id of failed) requested.current.delete(id) // später erneut versuchen
        if (failed.length) setTileError(`${failed.length} Kachel(n) konnten nicht geladen werden.`)
        if (ok.length) {
          setTiles((prev) => {
            const next = new Map(prev)
            for (const [id, s] of ok) next.set(id, s)
            return next
          })
        }
        setPendingCount((n) => n - missing.length)
      })
    },
    [index],
  )

  const loadAll = useCallback(() => {
    if (index) ensureCells(Object.keys(index.cells))
  }, [index, ensureCells])

  const dataset = useMemo<Dataset | null>(() => {
    if (!core) return null
    if (!tiles.size) return core
    const extra: Studio[] = []
    for (const s of tiles.values()) extra.push(...s)
    return { ...core, studios: [...core.studios, ...extra] }
  }, [core, tiles])

  const tileState = useMemo<TileState>(() => {
    let loadedStudios = 0
    for (const s of tiles.values()) loadedStudios += s.length
    const cellCount = index ? Object.keys(index.cells).length : 0
    return {
      index,
      loadedCells: tiles.size,
      loadedStudios,
      loading: pendingCount > 0,
      allLoaded: !!index && tiles.size >= cellCount,
      error: tileError,
    }
  }, [index, tiles, pendingCount, tileError])

  const reload = useCallback(() => {
    // neuer Datenstand: Kacheln neu laden
    requested.current = new Set()
    setTiles(new Map())
    setPendingCount(0)
    setVersion((v) => v + 1)
  }, [])
  return { dataset, error, loading, reload, tiles: tileState, ensureCells, loadAll }
}
