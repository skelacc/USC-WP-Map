import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Dumbbell, List, Loader2, LocateFixed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DataDialog } from '@/components/data/DataDialog'
import { StudioDetail } from '@/components/detail/StudioDetail'
import { PlanSelect } from '@/components/filters/PlanSelect'
import { ProviderFilter } from '@/components/filters/ProviderFilter'
import { SearchBox } from '@/components/filters/SearchBox'
import { StudioList } from '@/components/list/StudioList'
import { StudioMap, type FitRequest, type FlyRequest, type FocusRequest } from '@/components/map/StudioMap'
import { useDataset } from '@/hooks/useDataset'
import { useElementHeight } from '@/hooks/useElementHeight'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { usePersistentState } from '@/hooks/usePersistentState'
import { DEFAULT_FILTER, countByCategory, filterStudios, searchStudios, sortStudios, type CategoryFilter, type SortMode } from '@/lib/filter'
import { BERLIN_CENTER, type LatLng } from '@/lib/geo'
import { decideMatch, getStatus, type ApiStatus } from '@/lib/importApi'
import { DEFAULT_USC_PLAN, applyUscPlan, type UscPlan, type ViewStudio } from '@/lib/plans'
import { cn } from '@/lib/utils'

export default function App() {
  const { dataset, error, loading, reload } = useDataset()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [filter, setFilter] = usePersistentState<CategoryFilter>('filter', DEFAULT_FILTER)
  const [plan, setPlan] = usePersistentState<UscPlan>('uscPlan', DEFAULT_USC_PLAN)
  const [sort, setSort] = usePersistentState<SortMode>('sort', 'name')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focus, setFocus] = useState<FocusRequest | null>(null)
  const [fit, setFit] = useState<FitRequest | null>(null)
  const [flyTo, setFlyTo] = useState<FlyRequest | null>(null)
  const [mapCenter, setMapCenter] = useState<LatLng>(BERLIN_CENTER)
  const [userLocation, setUserLocation] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [api, setApi] = useState<ApiStatus>({ available: false, running: false, staging: null })
  const [detailRef, detailHeight] = useElementHeight<HTMLDivElement>()

  useEffect(() => {
    void getStatus().then(setApi)
  }, [])

  const allStudios = useMemo(() => dataset?.studios ?? [], [dataset])
  // Gewählte USC-Mitgliedschaft anwenden (Studios höherer Stufen zählen nicht als USC)
  const studios = useMemo<ViewStudio[]>(() => applyUscPlan(allStudios, plan), [allStudios, plan])
  const byId = useMemo(() => new Map<string, ViewStudio>(studios.map((s) => [s.id, s])), [studios])
  const allById = useMemo(() => new Map(allStudios.map((s) => [s.id, s])), [allStudios])

  // Zähler in den Filtern berücksichtigen Suche und Tarif, nicht aber den Kategorienfilter selbst
  const search = useMemo(() => searchStudios(studios, deferredQuery), [studios, deferredQuery])
  const counts = useMemo(() => countByCategory(search.matches), [search])
  const visible = useMemo(() => filterStudios(search.matches, filter, ''), [search, filter])
  const origin = userLocation ?? mapCenter
  const sorted = useMemo(
    () => sortStudios(visible, sort, sort === 'distance' ? origin : null, search.scores),
    [visible, sort, origin, search],
  )

  const selected: ViewStudio | null = selectedId ? (byId.get(selectedId) ?? allById.get(selectedId) ?? null) : null
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

  const locate = useCallback(
    (fly: boolean) => {
      if (!('geolocation' in navigator)) {
        setMessage('Standortbestimmung wird von diesem Browser nicht unterstützt.')
        return
      }
      setLocating(true)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setUserLocation(loc)
          setLocating(false)
          if (fly) setFlyTo({ ...loc, zoom: 15, nonce: Date.now() })
          else setSort('distance')
        },
        (err) => {
          setLocating(false)
          setMessage(
            err.code === err.PERMISSION_DENIED
              ? 'Standortzugriff verweigert (oder Seite nicht über HTTPS geöffnet). Entfernungen werden ab Kartenmitte berechnet.'
              : 'Standort konnte nicht ermittelt werden. Entfernungen werden ab Kartenmitte berechnet.',
          )
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      )
    },
    [setSort],
  )

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
      onLocate={() => locate(false)}
      locating={locating}
      searching={!!deferredQuery.trim()}
    />
  )

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="z-10 flex flex-col gap-2 border-b px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:flex-row md:items-center md:px-3">
        <div className="flex items-center gap-2 md:contents">
          <h1 className="flex shrink-0 items-center gap-1.5 text-sm font-semibold md:w-77">
            <Dumbbell className="size-4" aria-hidden />
            <span className="hidden sm:inline">Studio Map Berlin</span>
          </h1>
          <div className="min-w-0 flex-1 md:max-w-md">
            <SearchBox value={query} onChange={setQuery} onSubmit={() => setFit({ nonce: Date.now() })} />
          </div>
          <div className="md:order-last md:ml-auto">
            <DataDialog dataset={dataset} api={api} onDataChanged={reload} onDecide={decide} onShowStudio={showStudio} />
          </div>
        </div>
        {/* mobil: eine Zeile, horizontal scrollbar */}
        <div className="-mx-2 flex gap-1.5 overflow-x-auto px-2 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
          <PlanSelect value={plan} onChange={setPlan} />
          <ProviderFilter value={filter} counts={counts} onChange={setFilter} />
        </div>
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
            flyTo={flyTo}
            userLocation={userLocation}
            onCenterChange={setMapCenter}
            bottomInset={!isDesktop && selected ? detailHeight + 8 : 0}
            showZoomControl={isDesktop}
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
            <div
              ref={detailRef}
              className={
                isDesktop
                  ? 'absolute top-3 left-3 z-[1000] flex max-h-[calc(100%-1.5rem)] w-96'
                  : 'absolute inset-x-0 bottom-0 z-[1000] flex max-h-[60%] px-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]'
              }
            >
              <StudioDetail
                key={selected.id}
                studio={selected}
                plan={plan}
                candidates={selectedCandidates}
                canEdit={api.available}
                onClose={() => setSelectedId(null)}
                onDecide={decide}
                onShowStudio={showStudio}
                className="w-full"
              />
            </div>
          )}

          {!selected && (
            <Button
              variant="outline"
              size="icon-lg"
              className={cn(
                'absolute right-3 z-[1000] size-11 rounded-full bg-background shadow-lg',
                isDesktop ? 'bottom-8' : 'bottom-[max(1.75rem,calc(env(safe-area-inset-bottom)+1rem))]',
              )}
              onClick={() => locate(true)}
              disabled={locating}
              aria-label="Zu meinem Standort"
              title="Zu meinem Standort"
            >
              <LocateFixed className={cn('size-5', userLocation && 'text-sky-600', locating && 'animate-pulse')} />
            </Button>
          )}

          {!isDesktop && !selected && (
            <Button
              size="lg"
              className="absolute bottom-[max(1.75rem,calc(env(safe-area-inset-bottom)+1rem))] left-1/2 z-[1000] h-11 -translate-x-1/2 rounded-full px-5 shadow-lg"
              onClick={() => setListOpen(true)}
            >
              <List /> {deferredQuery.trim() ? 'Treffer' : 'Liste'} ({visible.length.toLocaleString('de-DE')})
            </Button>
          )}
        </div>
      </main>

      {!isDesktop && (
        <Sheet open={listOpen} onOpenChange={setListOpen}>
          <SheetContent side="bottom" className="flex flex-col gap-0 rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)] data-[side=bottom]:h-[80dvh]">
            <SheetHeader className="border-b px-3 py-2.5">
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
