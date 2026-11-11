import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
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
import { StudioMap, type FitRequest, type FlyRequest, type FocusRequest, type MapView } from '@/components/map/StudioMap'
import { useDataset } from '@/hooks/useDataset'
import { useElementHeight } from '@/hooks/useElementHeight'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { usePersistentState } from '@/hooks/usePersistentState'
import { DEFAULT_FILTER, countByCategory, filterStudios, searchStudios, sortStudios, type CategoryFilter, type LoadMode, type Scope, type SortMode } from '@/lib/filter'
import { RatingFilterSelect, type RatingFilter } from '@/components/filters/RatingFilter'
import { BERLIN_CENTER, distanceM, type LatLng } from '@/lib/geo'
import { boundsIntersect, cellsInBounds, coreBounds, inBounds } from '@/lib/tiles'
import { decideMatch, getStatus, type ApiStatus } from '@/lib/importApi'
import { applyDecisions, decisionFor, loadDecisions, memberKey, membersOf, saveDecisions, upsertDecision, type Decision } from '@/lib/merges'
import { DEFAULT_USC_PLAN, activityCounts, applyView, planLabel, type UscPlan, type ViewStudio } from '@/lib/plans'
import { SyncNotSetUp, loadSyncConfig, saveSyncConfig, syncNow, type SyncConfig } from '@/lib/sync'
import { addNote, applyEdits, deleteNote, editOf, loadProfile, loadUserData, notesOf, ratingOf, saveProfile, saveUserData, setEdit, setRating, type UserData } from '@/lib/userdata'
import { SwipeDownSheet } from '@/components/detail/SwipeDownSheet'
import type { StudioTexts } from '@/components/detail/StudioDetail'
import { cn } from '@/lib/utils'
import type { FieldChoices, Studio } from '@/types/studio'

const NEARBY = 12

export default function App() {
  const { dataset: rawDataset, error, loading, reload, tiles, ensureCells, loadAll } = useDataset()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [filter, setFilter] = usePersistentState<CategoryFilter>('filter-v2', DEFAULT_FILTER)
  const [plan, setPlan] = usePersistentState<UscPlan>('uscPlan', DEFAULT_USC_PLAN)
  const [showPlus, setShowPlus] = usePersistentState<boolean>('showPlus', false)
  const [activities, setActivities] = usePersistentState<string[]>('activities', [])
  const [sort, setSort] = usePersistentState<SortMode>('sort', 'name')
  // Liste, Suche und Zähler: nur Kartenausschnitt oder alle Einrichtungen
  const [scope, setScope] = usePersistentState<Scope>('scope', 'viewport')
  // Wellpass außerhalb Berlins: nur Kacheln im Ausschnitt laden oder gleich alle
  const [loadMode, setLoadMode] = usePersistentState<LoadMode>('loadMode', 'viewport')
  const [decisions, setDecisions] = useState<Decision[]>(loadDecisions)
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(loadSyncConfig)
  const [syncStatus, setSyncStatus] = useState<{ state: 'idle' | 'busy' | 'ok' | 'error'; message?: string; at?: string; url?: string }>({ state: 'idle' })
  const decisionsRef = useRef(decisions)
  const localChange = useRef(false)
  const [userData, setUserDataState] = useState<UserData>(loadUserData)
  const userDataRef = useRef(userData)
  const [profile, setProfileState] = useState<string>(loadProfile)
  const [ratingFilter, setRatingFilter] = usePersistentState<RatingFilter>('ratingFilter', 'hideDisliked')
  /** Eigene Änderung an Bewertungen/Notizen/Korrekturen – wird gespeichert und synchronisiert */
  const updateUserData = useCallback((fn: (d: UserData) => UserData) => {
    localChange.current = true
    setUserDataState((prev) => {
      const next = fn(prev)
      saveUserData(next)
      return next
    })
  }, [])
  const setProfile = useCallback((p: string) => {
    const name = p.trim() || 'Ich'
    saveProfile(name)
    setProfileState(name)
  }, [])
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  // Auswahl: aktiver Pin (Vorschaukarte) und geöffnete Details
  const [activeId, setActiveId] = useState<string | null>(null)
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [mergeFor, setMergeFor] = useState<{ baseId: string; partnerIds?: string[]; editOnly?: boolean; fromSettings?: boolean } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [focus, setFocus] = useState<FocusRequest | null>(null)
  const [fit, setFit] = useState<FitRequest | null>(null)
  const [flyTo, setFlyTo] = useState<FlyRequest | null>(null)
  const [view, setView] = useState<MapView | null>(null)
  const mapCenter = view?.center ?? BERLIN_CENTER
  const [userLocation, setUserLocation] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [api, setApi] = useState<ApiStatus>({ available: false, running: false, staging: null })
  const [bottomRef, bottomHeight] = useElementHeight<HTMLDivElement>()
  const [texts, setTexts] = useState<StudioTexts | null>(null)

  // Lange Texte (Beschreibung, Wichtige Infos, Öffnungszeiten) erst beim ersten Öffnen von Details laden
  useEffect(() => {
    if (!detailOpen || texts) return
    fetch(`${import.meta.env.BASE_URL}data/texts.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((t: StudioTexts) => setTexts(t ?? {}))
      .catch(() => setTexts({}))
  }, [detailOpen, texts])

  useEffect(() => {
    void getStatus().then(setApi)
  }, [])

  // Datenbestand inkl. eigener Zusammenführungen
  const dataset = useMemo(() => {
    if (!rawDataset) return null
    const merged = applyDecisions(rawDataset, decisions)
    return { ...merged, studios: applyEdits(merged.studios, userData) }
  }, [rawDataset, decisions, userData])
  const allStudios = useMemo(() => dataset?.studios ?? [], [dataset])
  const allById = useMemo(() => new Map(allStudios.map((s) => [s.id, s])), [allStudios])

  // Stufe, Plus und Aktivität anwenden
  const studios = useMemo(() => {
    const view = applyView(allStudios, { plan, showPlus, activities })
    if (ratingFilter === 'all') return view
    return view.filter((s) => {
      const r = ratingOf(userData, profile, s)
      return ratingFilter === 'favorites' ? r === 'like' : r !== 'dislike'
    })
  }, [allStudios, plan, showPlus, activities, ratingFilter, userData, profile])
  const byId = useMemo(() => new Map<string, ViewStudio>(studios.map((s) => [s.id, s])), [studios])
  const actBase = useMemo(() => (scope === 'viewport' && view ? allStudios.filter((s) => inBounds(s, view.bounds)) : allStudios), [allStudios, scope, view])
  const actCounts = useMemo(() => activityCounts(actBase, plan, showPlus), [actBase, plan, showPlus])

  // Kacheln nachladen: alle (Einstellung bzw. Bereich „Alle“) oder die im Ausschnitt
  const wantAll = loadMode === 'all' || scope === 'all'
  useEffect(() => {
    if (!tiles.index) return
    if (wantAll) loadAll()
    else if (view) ensureCells(cellsInBounds(tiles.index, view.bounds))
  }, [tiles.index, wantAll, view, loadAll, ensureCells])

  // Suche über alles Geladene; die Karte zeigt alle Treffer, Liste und Zähler nur den gewählten Bereich
  const bounds = scope === 'viewport' ? (view?.bounds ?? null) : null
  const search = useMemo(() => searchStudios(studios, deferredQuery), [studios, deferredQuery])
  const scopedMatches = useMemo(() => (bounds ? search.matches.filter((s) => inBounds(s, bounds)) : search.matches), [search, bounds])
  const counts = useMemo(() => countByCategory(scopedMatches), [scopedMatches])
  const mapStudios = useMemo(() => filterStudios(search.matches, filter, ''), [search, filter])
  const visible = useMemo(() => (bounds ? mapStudios.filter((s) => inBounds(s, bounds)) : mapStudios), [mapStudios, bounds])
  const outsideCount = useMemo(() => (bounds ? mapStudios.reduce((n, s) => n + (s.coordinates && !inBounds(s, bounds) ? 1 : 0), 0) : 0), [mapStudios, bounds])
  const origin = userLocation ?? mapCenter
  const sorted = useMemo(() => sortStudios(visible, sort, sort === 'distance' ? origin : null, search.scores), [visible, sort, origin, search])
  const outsideBerlin = !!view && !boundsIntersect(view.bounds, coreBounds(tiles.index))

  const active = activeId ? (byId.get(activeId) ?? null) : null
  const activeFull = activeId ? (allById.get(activeId) ?? null) : null

  // Vorschaukarten: aktiver Pin + nächstgelegene sichtbare Studios (um den angetippten Pin)
  const nearby = useMemo(() => {
    const anchor = (anchorId && byId.get(anchorId)) || active
    if (!anchor?.coordinates) return active ? [active] : []
    const a = { lat: anchor.coordinates.latitude, lng: anchor.coordinates.longitude }
    const list = mapStudios
      .filter((s) => s.coordinates)
      .map((s) => ({ s, d: distanceM(a, { lat: s.coordinates!.latitude, lng: s.coordinates!.longitude }) }))
      .sort((x, y) => x.d - y.d)
      .slice(0, NEARBY)
      .map((x) => x.s)
    if (active && !list.some((s) => s.id === active.id)) list.unshift(active)
    return list
  }, [anchorId, active, byId, mapStudios])

  // Auswahl schließen, wenn das Studio durch Filter verschwindet
  useEffect(() => {
    if (activeId && !byId.has(activeId) && !detailOpen) setActiveId(null)
  }, [activeId, byId, detailOpen])

  // Bereich „Alle“: beim Tippen auf die Treffer zoomen. Im Ausschnitt nicht – sonst
  // würde der Ausschnitt (und damit die Trefferliste) mit jedem Tastendruck kleiner.
  useEffect(() => {
    if (scope === 'all' && deferredQuery.trim().length >= 2) setFit({ nonce: Date.now() })
  }, [deferredQuery, scope])

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
      localChange.current = true
      setDecisions((prev) => {
        const next = upsertDecision(prev, d)
        saveDecisions(next)
        return next
      })
      if (api.available) {
        decideMatch(d.pair, d.decision, d.fields, d.keys).catch((e: Error) => setMessage(`Nur im Browser gespeichert: ${e.message}`))
      }
    },
    [api.available],
  )

  // Synchronisation über GitHub-Issue: beim Start lesen, nach eigenen Änderungen schreiben
  useEffect(() => {
    decisionsRef.current = decisions
    userDataRef.current = userData
  }, [decisions, userData])

  const runSync = useCallback(async () => {
    setSyncStatus((s) => ({ ...s, state: 'busy' }))
    try {
      const r = await syncNow(syncConfig, { decisions: decisionsRef.current, userdata: userDataRef.current })
      if (r.issue !== syncConfig.issue) {
        const next = { ...syncConfig, issue: r.issue }
        saveSyncConfig(next)
        setSyncConfig(next)
      }
      setDecisions(r.merged.decisions)
      saveDecisions(r.merged.decisions)
      setUserDataState(r.merged.userdata)
      saveUserData(r.merged.userdata)
      setSyncStatus({
        state: 'ok',
        message: `Synchronisiert: ${r.merged.decisions.length} Zuordnungen, Bewertungen und Notizen${r.pushed ? ', hochgeladen' : ''}${syncConfig.token ? '' : ' (nur gelesen – ohne Token)'}`,
        at: new Date().toISOString(),
        url: r.url,
      })
    } catch (e) {
      if (e instanceof SyncNotSetUp) setSyncStatus({ state: 'idle', message: e.message })
      else setSyncStatus({ state: 'error', message: (e as Error).message, at: new Date().toISOString() })
    }
  }, [syncConfig])

  useEffect(() => {
    void runSync()
    // nur beim Start bzw. nach geänderter Sync-Einstellung
  }, [syncConfig.repo, syncConfig.token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!localChange.current || !syncConfig.token) return
    localChange.current = false
    const t = window.setTimeout(() => void runSync(), 1500)
    return () => window.clearTimeout(t)
  }, [decisions, userData, syncConfig.token, runSync])

  const closeMerge = useCallback(() => {
    if (mergeFor?.fromSettings) setSettingsOpen(true)
    setMergeFor(null)
  }, [mergeFor])

  const confirmMerge = useCallback(
    (keys: string[], fields: FieldChoices) => {
      const baseId = mergeFor?.baseId
      addDecision(decisionFor(keys, 'confirm', fields))
      closeMerge()
      // Das zusammengeführte Studio behält die ID des Ausgangsstudios
      if (baseId) {
        setActiveId(baseId)
        setAnchorId(baseId)
      }
      setMessage(
        `${keys.length} Einträge zusammengeführt.` +
          (syncConfig.token ? ' Wird mit GitHub synchronisiert.' : ' Nur auf diesem Gerät gespeichert – für andere Geräte: Einstellungen → Sync.'),
      )
    },
    [addDecision, closeMerge, mergeFor, syncConfig.token],
  )

  const unmerge = useCallback(
    (s: Studio) => {
      addDecision(decisionFor(membersOf(s).map(memberKey), 'reject'))
      setDetailOpen(false)
      setMessage('Getrennt – die Einträge erscheinen wieder einzeln.')
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
      scope={scope}
      onScopeChange={setScope}
      outsideCount={outsideCount}
      onShowOutside={() => {
        setListOpen(false)
        setFit({ nonce: Date.now(), all: true })
      }}
      loadingMore={tiles.loading}
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
      onMerge={(o) => setMergeFor({ baseId: activeFull.id, ...o })}
      onUnmerge={() => unmerge(activeFull)}
      onRejectCandidate={rejectPair}
      onShowStudio={showStudio}
      className="h-full w-full"
      rating={ratingOf(userData, profile, activeFull)}
      onRate={(r) => updateUserData((d) => setRating(d, profile, activeFull, r))}
      notes={notesOf(userData, activeFull)}
      profile={profile}
      onAddNote={(t) => updateUserData((d) => addNote(d, activeFull, t, profile))}
      onDeleteNote={(id) => updateUserData((d) => deleteNote(d, id))}
      canEditEntries={!!syncConfig.token || api.available}
      editValues={editOf(userData, activeFull)}
      onSaveEdit={(v) => updateUserData((d) => setEdit(d, activeFull, v, profile))}
      texts={texts}
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
          <div className="min-w-0 flex-1 md:max-w-sm md:min-w-52">
            <SearchBox value={query} onChange={onQueryChange} onSubmit={() => setFit({ nonce: Date.now() })} />
          </div>
          <div className="md:order-last md:ml-auto">
            <DataDialog
              dataset={dataset}
              api={api}
              onDataChanged={reload}
              decisions={decisions}
              userData={userData}
              onImportDecisions={(p) => {
                localChange.current = true
                setDecisions(p.decisions)
                saveDecisions(p.decisions)
                setUserDataState(p.userdata)
                saveUserData(p.userdata)
              }}
              profile={profile}
              onProfileChange={setProfile}
              syncConfig={syncConfig}
              onSyncConfigChange={setSyncConfig}
              onSync={runSync}
              syncStatus={syncStatus}
              loadMode={loadMode}
              onLoadModeChange={setLoadMode}
              tiles={tiles}
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              onMergeCandidate={(c) => {
                if (!c.urbanSportsClub.studioId) return
                setSettingsOpen(false)
                setMergeFor({ baseId: c.urbanSportsClub.studioId, partnerIds: c.wellpass.studioId ? [c.wellpass.studioId] : undefined, fromSettings: true })
              }}
              onRejectCandidate={rejectPair}
              onShowStudio={showStudio}
            />
          </div>
        </div>
        <div className="-mx-2 flex gap-1.5 overflow-x-auto px-2 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
          <PlanSelect value={plan} onChange={setPlan} />
          <ActivityFilter value={activities} onChange={setActivities} counts={actCounts} planLabel={planLabel(plan)} />
          <PlusToggle value={showPlus} onChange={setShowPlus} />
          <RatingFilterSelect value={ratingFilter} onChange={setRatingFilter} />
          <span className="mx-0.5 w-px shrink-0 self-stretch bg-border" aria-hidden />
          <ProviderFilter value={filter} counts={counts} onChange={setFilter} />
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1">
        {isDesktop && <aside className="w-80 shrink-0 border-r lg:w-96">{list}</aside>}

        <div className="relative isolate min-w-0 flex-1">
          <StudioMap
            studios={mapStudios}
            fitStudios={fit?.all ? mapStudios : visible}
            active={active}
            onMarkerClick={onMarkerClick}
            onMapClick={closeAll}
            focus={focus}
            fit={fit}
            flyTo={flyTo}
            userLocation={userLocation}
            onViewChange={setView}
            bottomInset={showPreview ? bottomHeight : 0}
            showZoomControl={isDesktop}
          />

          {loading && !dataset && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-background/60">
              <Loader2 className="size-6 animate-spin" aria-label="Lädt" />
            </div>
          )}

          {(tiles.loading || (outsideBerlin && !filter.wellpass)) && !error && !message && (
            <div className="pointer-events-none absolute top-2 left-1/2 z-[1050] flex w-[min(92%,30rem)] -translate-x-1/2 flex-col items-center gap-1.5">
              {tiles.loading && (
                <span className="flex items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1 text-xs shadow">
                  <Loader2 className="size-3.5 animate-spin" /> Lade Wellpass-Studios …
                </span>
              )}
              {outsideBerlin && !filter.wellpass && (
                <div className="pointer-events-auto flex items-start gap-2 rounded-lg border bg-background p-2.5 text-sm shadow-lg">
                  <span className="flex-1">
                    Außerhalb Berlins gibt es nur Wellpass-Daten (Urban Sports Club wird nur für Berlin geladen). Diese Studios sind „Nur Wellpass“ –
                    der Filter blendet sie gerade aus.
                  </span>
                  <Button size="xs" onClick={() => setFilter({ ...filter, wellpass: true })}>
                    Einblenden
                  </Button>
                </div>
              )}
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
                  onActiveChange={(id) => setActiveId(id)}
                  onZoom={(id) => setFocus({ id, nonce: Date.now() })}
                  onOpen={() => setDetailOpen(true)}
                  onClose={closeAll}
                  userLocation={userLocation}
                  highlight={activities}
                  ratingOf={(st) => ratingOf(userData, profile, st)}
                  hasNotes={(st) => notesOf(userData, st).length > 0}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobil: Details als großes Bottom-Sheet */}
      {!isDesktop && detail && (
        <SwipeDownSheet onClose={() => setDetailOpen(false)} className="fixed inset-x-0 bottom-0 z-40 flex h-[88dvh] flex-col pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgb(0_0_0/0.15)]">
          {detail}
        </SwipeDownSheet>
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
          initialPartnerIds={mergeFor.partnerIds}
          editOnly={mergeFor.editOnly}
          onConfirm={confirmMerge}
          onClose={closeMerge}
        />
      )}
    </div>
  )
}
