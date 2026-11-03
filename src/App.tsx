import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Dumbbell, List, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DataDialog } from '@/components/data/DataDialog'
import { StudioDetail } from '@/components/detail/StudioDetail'
import { ProviderFilter } from '@/components/filters/ProviderFilter'
import { SearchBox } from '@/components/filters/SearchBox'
import { StudioList } from '@/components/list/StudioList'
import { StudioMap, type FitRequest, type FocusRequest } from '@/components/map/StudioMap'
import { useDataset } from '@/hooks/useDataset'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { usePersistentState } from '@/hooks/usePersistentState'
import { DEFAULT_FILTER, countByCategory, filterStudios, sortStudios, type CategoryFilter, type SortMode } from '@/lib/filter'
import { BERLIN_CENTER, type LatLng } from '@/lib/geo'
import { decideMatch, getStatus, type ApiStatus } from '@/lib/importApi'
import { matchesQuery } from '@/lib/search'

export default function App() {
  const { dataset, error, loading, reload } = useDataset()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [filter, setFilter] = usePersistentState<CategoryFilter>('filter', DEFAULT_FILTER)
  const [sort, setSort] = usePersistentState<SortMode>('sort', 'name')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focus, setFocus] = useState<FocusRequest | null>(null)
  const [fit, setFit] = useState<FitRequest | null>(null)
  const [mapCenter, setMapCenter] = useState<LatLng>(BERLIN_CENTER)
  const [userLocation, setUserLocation] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [api, setApi] = useState<ApiStatus>({ available: false, running: false, staging: null })

  useEffect(() => {
    void getStatus().then(setApi)
  }, [])

  const studios = useMemo(() => dataset?.studios ?? [], [dataset])
  const byId = useMemo(() => new Map(studios.map((s) => [s.id, s])), [studios])

  // Zähler in den Filtern berücksichtigen die Suche, nicht aber den Filter selbst
  const searchMatches = useMemo(() => studios.filter((s) => matchesQuery(s, deferredQuery)), [studios, deferredQuery])
  const counts = useMemo(() => countByCategory(searchMatches), [searchMatches])
  const visible = useMemo(() => filterStudios(searchMatches, filter, ''), [searchMatches, filter])
  const origin = userLocation ?? mapCenter
  const sorted = useMemo(() => sortStudios(visible, sort, sort === 'distance' ? origin : null), [visible, sort, origin])

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null
  const selectedCandidates = useMemo(
    () =>
      selected
        ? (dataset?.matchCandidates ?? []).filter((c) => c.urbanSportsClub.studioId === selected.id || c.wellpass.studioId === selected.id)
        : [],
    [dataset, selected],
  )

  // Bei Suche den Kartenausschnitt auf die Treffer anpassen
  useEffect(() => {
    if (deferredQuery.trim().length >= 2) setFit({ nonce: Date.now() })
  }, [deferredQuery])

  const showStudio = useCallback((id: string) => {
    setSelectedId(id)
    setFocus({ id, nonce: Date.now() })
    setListOpen(false)
  }, [])

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setMessage('Standortbestimmung wird von diesem Browser nicht unterstützt.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setSort('distance')
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        setMessage(
          err.code === err.PERMISSION_DENIED
            ? 'Standortzugriff verweigert (oder Seite nicht über HTTPS/localhost geöffnet). Entfernungen werden ab Kartenmitte berechnet.'
            : 'Standort konnte nicht ermittelt werden. Entfernungen werden ab Kartenmitte berechnet.',
        )
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
  }, [setSort])

  const decide = useCallback(
    async (pair: string, decision: 'confirm' | 'reject' | 'reset') => {
      try {
        const r = await decideMatch(pair, decision)
        setMessage(r.message)
        reload()
      } catch (e) {
        setMessage(`Entscheidung konnte nicht gespeichert werden: ${(e as Error).message}`)
      }
    },
    [reload],
  )

  const list = (
    <StudioList
      items={sorted}
      selectedId={selectedId}
      onPick={showStudio}
      sort={sort}
      onSortChange={setSort}
      hasUserLocation={!!userLocation}
      onLocate={locate}
      locating={locating}
    />
  )

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="z-10 flex flex-col gap-2 border-b px-3 py-2 md:flex-row md:items-center">
        <div className="flex items-center gap-2 md:contents">
          <h1 className="flex shrink-0 items-center gap-1.5 text-sm font-semibold md:w-77">
            <Dumbbell className="size-4" />
            <span className="hidden sm:inline">Studio Map Berlin</span>
          </h1>
          <div className="min-w-0 flex-1 md:max-w-md">
            <SearchBox value={query} onChange={setQuery} onSubmit={() => setFit({ nonce: Date.now() })} />
          </div>
          <div className="md:order-last md:ml-auto">
            <DataDialog dataset={dataset} api={api} onDataChanged={reload} onDecide={decide} onShowStudio={showStudio} />
          </div>
        </div>
        <ProviderFilter value={filter} counts={counts} onChange={setFilter} />
      </header>

      <main className="relative flex min-h-0 flex-1">
        {isDesktop && <aside className="w-80 shrink-0 border-r lg:w-96">{list}</aside>}

        <div className="relative isolate min-w-0 flex-1">
          <StudioMap
            studios={visible}
            selected={selected}
            onSelect={setSelectedId}
            focus={focus}
            fit={fit}
            userLocation={userLocation}
            onCenterChange={setMapCenter}
          />

          {loading && !dataset && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-background/60">
              <Loader2 className="size-6 animate-spin" aria-label="Lädt" />
            </div>
          )}

          {(error || message) && (
            <div role="alert" className="absolute top-2 left-1/2 z-[1100] flex w-[min(92%,32rem)] -translate-x-1/2 items-start gap-2 rounded-lg border bg-background p-2.5 text-sm shadow-lg">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <span className="flex-1">{error ?? message}</span>
              {message && !error && (
                <Button size="xs" variant="ghost" onClick={() => setMessage(null)}>
                  OK
                </Button>
              )}
            </div>
          )}

          {selected && (
            <StudioDetail
              key={selected.id}
              studio={selected}
              candidates={selectedCandidates}
              canEdit={api.available}
              onClose={() => setSelectedId(null)}
              onDecide={decide}
              onShowStudio={showStudio}
              className={
                isDesktop
                  ? 'absolute top-3 left-3 z-[1000] w-96 max-h-[calc(100%-1.5rem)]'
                  : 'absolute inset-x-2 bottom-2 z-[1000] max-h-[60%]'
              }
            />
          )}

          {!isDesktop && !selected && (
            <Button className="absolute bottom-4 left-1/2 z-[1000] -translate-x-1/2 shadow-lg" onClick={() => setListOpen(true)}>
              <List /> Liste ({visible.length.toLocaleString('de-DE')})
            </Button>
          )}
        </div>
      </main>

      {!isDesktop && (
        <Sheet open={listOpen} onOpenChange={setListOpen}>
          <SheetContent side="bottom" className="flex flex-col gap-0 p-0 data-[side=bottom]:h-[75dvh]">
            <SheetHeader className="border-b p-3">
              <SheetTitle>Studios</SheetTitle>
              <SheetDescription className="sr-only">Gefilterte Studioliste</SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col">{list}</div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
