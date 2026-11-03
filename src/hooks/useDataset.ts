import { useCallback, useEffect, useState } from 'react'
import { DataLoadError, loadDataset } from '@/lib/data'
import type { Dataset } from '@/types/studio'

export function useDataset() {
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    loadDataset(ctrl.signal)
      .then((d) => {
        setDataset(d)
        setError(null)
      })
      .catch((e: Error) => {
        if (e.name === 'AbortError') return
        // Bei einem Fehler bleibt ein bereits geladener Datenbestand sichtbar
        setError(e instanceof DataLoadError ? e.message : `Unerwarteter Fehler: ${e.message}`)
      })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { dataset, error, loading, reload }
}
