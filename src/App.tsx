import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Dumbbell, List, Loader2, LocateFixed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DataDialog } from '@/components/data/DataDialog'
import { MergeDialog } from '@/components/detail/MergeDialog'
import { StudioDetail } from '@/components/detail/StudioDetail'
import { ActivityFilter, PlusToggle } from '@/components/filters/ActivityFilter'
import { PlanSelect } from '@/components/filters/PlanSelect'
import { ProviderFilter } from '@/components/filters/ProviderFilter'
import { SearchBox } from '@/components/filters/SearchBox'
import { StudioList } from '@/components/list/StudioList'
import { PreviewCarousel } from '@/components/map/PreviewCarousel'
import { StudioMap, type FitRequest, type FlyRequest, type FocusRequest } from '@/components/map/StudioMap'
import { useDataset } from '@/hooks/useDataset'
import { useElementHeight } from '@/hooks/useElementHeight'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { usePersistentState } from '@/hooks/usePersistentState'
import { DEFAULT_FILTER, countByCategory, filterStudios, searchStudios, sortStudios, type CategoryFilter, type SortMode } from '@/lib/filter'
import { BERLIN_CENTER, distanceM, type LatLng } from '@/lib/geo'
import { decideMatch, getStatus, type ApiStatus } from '@/lib/importApi'
import { applyDecisions, loadDecisions, pairOf, saveDecisions, upsertDecision, type Decision } from '@/lib/merges'
import { DEFAULT_USC_PLAN, activityCounts, applyView, planLabel, type UscPlan, type ViewStudio } from '@/lib/plans'
import { cn } from '@/lib/utils'
import type { FieldChoices, Studio } from '@/types/studio'

const NEARBY = 12

export default function App() {
  const { dataset: rawDataset, error, loading, reload } = useDataset()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [filter, setFilter] = usePersistentState<CategoryFilter>('filter', DEFAULT_FILTER)
  const [plan, setPlan] = usePersistentState<UscPlan>('uscPlan', DEFAULT_USC_PLAN)
  const [showPlus, setShowPlus] = usePersistentState<boolean>('showPlus', false)
  const [activities, setActivities] = usePersistentState<string[]>('activities', [])
  const [sort, setSort] = usePersistentState<SortMode>('sort', 'name')
  const [decisions, setDecisions] = useState<Decision[]>(loadDecisions)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  // Auswahl: aktiver Pin (Vorschaukarte) und geöffnete Details
  const [activeId, setActiveId] = useState<string | null>(null)
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [mergeFor, setMergeFor] = useState<{ baseId: string; partnerId?: string } | null>(null)

  const [focus, setFocus] = useState<FocusRequest | null>(null)
  const [fit, setFit] = useState<FitRequest | null>(null)
  const [flyTo, setFlyTo] = useState<FlyRequest | null>(null)
  const [mapCenter, setMapCenter] = useState<LatLng>(BERLIN_CENTER)
  const [userLocation, setUserLocation] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [api, setApi] = useState<ApiStatus>({ available: false, running: false, staging: null })
  const [bottomRef, bottomHeight] = useElementHeight<HTMLDivElement>()

  useEffect(() => {
    void getStatus().then(setApi)
  }, [])

  // Datenbestand inkl. eigener Zusammenführungen
  const dataset = useMemo(() => (rawDataset ? applyDecisions(rawDataset, decisions) : null), [rawDataset, decisions])
  const allStudios = useMemo(() => dataset?.studios ?? [], [dataset])
  const allById = useMemo(() => new Map(allStudios.map((s) => [s.id, s])), [allStudios])

  // Stufe, Plus und Aktivität anwenden
  const studios = useMemo(() => applyView(allStudios, { plan, showPlus, activities }), [allStudios, plan, showPlus, activities])
  const byId = useMemo(() => new Map<string, ViewStudio>(studios.map((s) => [s.id, s])), [studios])
  const actCounts = useMemo(() => activityCounts(allStudios, plan, showPlus), [allStudios, plan, showPlus])

  const search = useMemo(() => searchStudios(studios, deferredQuery), [studios, deferredQuery])
  const counts = useMemo(() => countByCategory(search.matches), [search])
  const visible = useMemo(() => filterStudios(search.matches, filter, ''), [search, filter])
  const origin = userLocation ?? mapCenter
  const sorted = useMemo(() => sortStudios(visible, sort, sort === 'distance' ? origin : null, search.scores), [visible, sort, origin, search])

  const active = activeId ? (byId.get(activeId) ?? null) : null
  const activeFull = activeId ? (allById.get(activeId) ?? null) : null

  // Vorschaukarten: aktiver Pin + nächstgelegene sichtbare Studios (um den angetippten Pin)
  const nearby = useMemo(() => {
    const anchor = (anchorId && byId.get(anchorId)) || active
    if (!anchor?.coordinates) return active ? [active] : []
    const a = { lat: anchor.coordinates.latitude, lng: anchor.coordinates.longitude }
    const list = visible
      .filter((s) => s.coordinates)
      .map((s) => ({ s, d: distanceM(a, { lat: s.coordinates!.latitude, lng: s.coordinates!.longitude }) }))
      .sort((x, y) => x.d - y.d)
      .slice(0, NEARBY)
      .map((x) => x.s)
    if (active && !list.some((s) => s.id === active.id)) list.unshift(active)
    return list
  }, [anchorId, active, byId, visible])

  // Auswahl schließen, wenn das Studio durch Filter verschwindet
  useEffect(() => {
    if (activeId && !byId.has(activeId) && !detailOpen) setActiveId(null)
  }, [activeId, byId, detailOpen])

  useEffect(() => {
    if (deferredQuery.trim().length >= 2) setFit({ nonce: Date.now() })
  }, [deferredQuery])

  // Neue Suche: zurück zur Karte
  const onQueryChange = useCallback((q: string) => {
    setQuery(q)
    setDetailOpen(false)
    setActiveId(null)
  }, [])

  const onMarkerClick = useCallback((id: string) => {
    setActiveId(id)
    setAnchorId(id)
    setDetailOpen(false)
  }, [])

  const closeAll = useCallback(() => {
    setActiveId(null)
    setDetailOpen(false)
  }, [])

  /** Aus Liste/Suche/Hinweis: zum Studio springen und Details öffnen. */
  const showStudio = useCallback((id: string) => {
    setActiveId(id)
    setAnchorId(id)
    setDetailOpen(true)
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
              : 'Standort konnte nicht ermittelt werden.',
          )
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      )
    },
    [setSort],
  )

  // Entscheidungen speichern (Browser) und – unter npm run dev – ins Projekt übernehmen
  const addDecision = useCallback(
    (d: Decision) => {
      setDecisions((prev) => {
        const next = upsertDecision(prev, d)
        saveDecisions(next)
        return next
      })
      if (api.available) {
        decideMatch(d.pair, d.decision, d.fields).catch((e: Error) => setMessage(`Nur im Browser gespeichert: ${e.message}`))
      }
    },
    [api.available],
  )

  const confirmMerge = useCallback(
    (usc: Studio, wp: Studio, fields: FieldChoices) => {
      addDecision({ pair: pairOf(usc, wp), decision: 'confirm', fields, decidedAt: new Date().toISOString() })
      setMergeFor(null)
      // Das neue Studio übernimmt die ID des USC-Studios
      setActiveId(usc.id)
      setAnchorId(usc.id)
      setMessage('Zusammengeführt. Gespeichert in diesem Browser' + (api.available ? ' und im Projekt.' : ' (Export unter „Daten“ → „Zuordnungen“).'))
    },
    [addDecision, api.available],
  )

  const unmerge = useCallback(
    (s: Studio) => {
      addDecision({ pair: pairOf(s, s), decision: 'reject', decidedAt: new Date().toISOString() })
      setDetailOpen(false)
      setMessage('Getrennt – beide erscheinen wieder einzeln.')
    },
    [addDecision],
  )

  const rejectPair = useCallback((pair: string) => addDecision({ pair, decision: 'reject', decidedAt: new Date().toISOString() }), [addDecision])

  const selectedCandidates = useMemo(
    () => (activeFull ? (dataset?.matchCandidates ?? []).filter((c) => c.urbanSportsClub.studioId === activeFull.id || c.wellpass.studioId === activeFull.id) : []),
    [dataset, activeFull],
  )

  const list = (
    <StudioList
      items={sorted}
      selectedId={activeId}
      onPick={showStudio}
      sort={sort}
      onSortChange={setSort}
      hasUserLocation={!!userLocation}
      onLocate={() => locate(false)}
      locating={locating}
      searching={!!deferredQuery.trim()}
    />
  )

  const detail = activeFull && detailOpen && (
    <StudioDetail
      key={activeFull.id}
      studio={active ?? activeFull}
      full={activeFull}
      plan={plan}
      highlight={activities}
      candidates={selectedCandidates}
      userLocation={userLocation}
      onClose={() => setDetailOpen(false)}
      onMerge={(partnerId) => setMergeFor({ baseId: activeFull.id, partnerId })}
      onUnmerge={() => unmerge(activeFull)}
      onRejectCandidate={rejectPair}
      onShowStudio={showStudio}
      className="h-full w-full"
    />
  )

  const showPreview = !!active && !detailOpen && nearby.length > 0

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="z-10 flex flex-col gap-2 border-b px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:flex-row md:items-center md:px-3">
        <div className="flex items-center gap-2 md:contents">
          <h1 className="flex shrink-0 items-center gap-1.5 text-sm font-semibold md:w-77">
            <Dumbbell className="size-4" aria-hidden />
            <span className="hidden sm:inline">Studio Map Berlin</span>
          </h1>
          <div className="min-w-0 flex-1 md:max-w-sm">
            <SearchBox value={query} onChange={onQueryChange} onSubmit={() => setFit({ nonce: Date.now() })} />
          </div>
          <div className="md:order-last md:ml-auto">
            <DataDialog
              dataset={dataset}
              api={api}
              onDataChanged={reload}
              decisions={decisions}
              onImportDecisions={(d) => {
                setDecisions(d)
                saveDecisions(d)
              }}
              onMergeCandidate={(c) => c.urbanSportsClub.studioId && setMergeFor({ baseId: c.urbanSportsClub.studioId, partnerId: c.wellpass.studioId ?? undefined })}
              onRejectCandidate={rejectPair}
              onShowStudio={showStudio}
            />
          </div>
        </div>
        <div className="-mx-2 flex gap-1.5 overflow-x-auto px-2 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
          <PlanSelect value={plan} onChange={setPlan} />
          <ActivityFilter value={activities} onChange={setActivities} counts={actCounts} planLabel={planLabel(plan)} />
          <PlusToggle value={showPlus} onChange={setShowPlus} />
          <span className="mx-0.5 w-px shrink-0 self-stretch bg-border" aria-hidden />
          <ProviderFilter value={filter} counts={counts} onChange={setFilter} />
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1">
        {isDesktop && <aside className="w-80 shrink-0 border-r lg:w-96">{list}</aside>}

        <div className="relative isolate min-w-0 flex-1">
          <StudioMap
            studios={visible}
            active={active}
            onMarkerClick={onMarkerClick}
            onMapClick={closeAll}
            focus={focus}
            fit={fit}
            flyTo={flyTo}
            userLocation={userLocation}
            onCenterChange={setMapCenter}
            bottomInset={showPreview ? bottomHeight : 0}
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

          {/* Desktop: Details links über der Karte */}
          {isDesktop && detail && <div className="absolute top-3 bottom-3 left-3 z-[1000] flex w-[26rem]">{detail}</div>}

          {/* Unten: Vorschaukarten bzw. Bedienknöpfe */}
          <div className={cn('pointer-events-none absolute inset-x-0 bottom-0 z-[1000] pb-[max(0.75rem,env(safe-area-inset-bottom))]', !isDesktop && detailOpen && 'hidden')}>
            <div className="pointer-events-none mb-3 flex items-end justify-end gap-2 px-3">
              {!isDesktop && !showPreview && (
                <Button size="lg" className="pointer-events-auto mx-auto h-11 translate-x-6 rounded-full px-5 shadow-lg" onClick={() => setListOpen(true)}>
                  <List /> {deferredQuery.trim() || activities.length ? 'Treffer' : 'Liste'} ({visible.length.toLocaleString('de-DE')})
                </Button>
              )}
              {!showPreview && (
                <Button
                  variant="outline"
                  className="pointer-events-auto size-11 rounded-full bg-background p-0 shadow-lg"
                  onClick={() => locate(true)}
                  disabled={locating}
                  aria-label="Zu meinem Standort"
                  title="Zu meinem Standort"
                >
                  <LocateFixed className={cn('size-5', userLocation && 'text-sky-600', locating && 'animate-pulse')} />
                </Button>
              )}
            </div>
            {showPreview && (
              <div ref={bottomRef}>
                <PreviewCarousel
                  items={nearby}
                  activeId={active!.id}
                  onActiveChange={(id) => {
                    setActiveId(id)
                    setFocus({ id, nonce: Date.now() })
                  }}
                  onOpen={() => setDetailOpen(true)}
                  onClose={closeAll}
                  userLocation={userLocation}
                  highlight={activities}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobil: Details als großes Bottom-Sheet */}
      {!isDesktop && detail && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex h-[88dvh] flex-col pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgb(0_0_0/0.15)]">
          {detail}
        </div>
      )}

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

      {mergeFor && allById.get(mergeFor.baseId) && (
        <MergeDialog
          base={allById.get(mergeFor.baseId)!}
          all={allStudios}
          initialPartnerId={mergeFor.partnerId}
          onConfirm={confirmMerge}
          onClose={() => setMergeFor(null)}
        />
      )}
    </div>
  )
}
