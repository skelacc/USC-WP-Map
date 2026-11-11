import { useEffect, useRef, useState } from 'react'
import { usePersistentState } from '@/hooks/usePersistentState'
import { loadSetting, saveSetting } from '@/lib/storage'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getStatus, type ApiStatus } from '@/lib/importApi'
import type { Decision } from '@/lib/merges'
import type { LoadMode } from '@/lib/filter'
import type { TileState } from '@/hooks/useDataset'
import type { Dataset, MatchCandidate } from '@/types/studio'
import { FileImport } from './FileImport'
import { ImportPanel } from './ImportPanel'
import { InfoPanel } from './InfoPanel'
import { MatchReview } from './MatchReview'
import { SyncPanel } from './SyncPanel'
import type { SyncConfig, SyncPayload } from '@/lib/sync'
import type { UserData } from '@/lib/userdata'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  dataset: Dataset | null
  api: ApiStatus
  onDataChanged: () => void
  decisions: Decision[]
  onImportDecisions: (p: SyncPayload) => void
  userData: UserData
  onMergeCandidate: (c: MatchCandidate) => void
  onRejectCandidate: (pair: string) => void
  onShowStudio: (id: string) => void
  profile: string
  onProfileChange: (p: string) => void
  syncConfig: SyncConfig
  onSyncConfigChange: (c: SyncConfig) => void
  onSync: () => Promise<void>
  syncStatus: { state: 'idle' | 'busy' | 'ok' | 'error'; message?: string; at?: string; url?: string }
  loadMode: LoadMode
  onLoadModeChange: (m: LoadMode) => void
  tiles: TileState
}

function fmt(iso?: string) {
  if (!iso) return 'unbekannt'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}

export function DataDialog(props: Props) {
  const { dataset, api, onDataChanged, decisions, onImportDecisions, onMergeCandidate, onRejectCandidate, onShowStudio } = props
  const { open, onOpenChange: setOpen } = props
  const [status, setStatus] = useState<ApiStatus>(api)
  // Zuletzt geöffneten Tab und Scrollposition je Tab merken
  const [tab, setTab] = usePersistentState<string>('settingsTab', 'hints')
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const pos = loadSetting<Record<string, number>>('settingsScroll', {})[tab] ?? 0
    // nach dem Rendern der Inhalte wiederherstellen
    const id = requestAnimationFrame(() => requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: pos })))
    return () => cancelAnimationFrame(id)
  }, [open, tab])
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    saveSetting('settingsScroll', { ...loadSetting<Record<string, number>>('settingsScroll', {}), [tab]: Math.round(el.scrollTop) })
  }
  const pending = dataset?.matchCandidates.length ?? 0

  useEffect(() => {
    if (open) void getStatus().then(setStatus)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="relative" aria-label="Einstellungen und Info">
          <Settings /> <span className="hidden sm:inline">Einstellungen</span>
          {props.syncStatus.state === 'error' && props.syncConfig.token && <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-red-500" aria-label="Sync-Fehler" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 sm:max-w-xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Einstellungen & Info</DialogTitle>
          <DialogDescription className="sr-only">Hinweise, Synchronisation, Zuordnungen und Datenbestand.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1">
          <TabsList className="w-full">
            <TabsTrigger value="hints">Info</TabsTrigger>
            <TabsTrigger value="sync">Sync</TabsTrigger>
            <TabsTrigger value="matches">Zuordn.{pending ? ` (${pending})` : ''}</TabsTrigger>
            <TabsTrigger value="data">Daten</TabsTrigger>
          </TabsList>
          <div ref={scrollRef} onScroll={onScroll} className="min-h-0 overflow-y-auto pt-2">
            <TabsContent value="hints">
              <InfoPanel dataset={dataset} tiles={props.tiles} />
            </TabsContent>
            <TabsContent value="sync">
              <SyncPanel
                profile={props.profile}
                onProfileChange={props.onProfileChange}
                config={props.syncConfig}
                onConfigChange={props.onSyncConfigChange}
                decisions={decisions}
                userData={props.userData}
                onImport={onImportDecisions}
                onSync={props.onSync}
                status={props.syncStatus}
              />
            </TabsContent>
            <TabsContent value="data" className="space-y-4 text-sm">
              <LoadModeSetting value={props.loadMode} onChange={props.onLoadModeChange} tiles={props.tiles} />
              {dataset ? (
                <>
                  <p>
                    Stand: <b>{fmt(dataset.generatedAt)}</b> · {(dataset.studios.length - props.tiles.loadedStudios + (props.tiles.index?.total ?? 0)).toLocaleString('de-DE')} Studios
                  </p>
                  <ul className="space-y-2">
                    {dataset.sources.map((s) => (
                      <li key={s.id} className="rounded-md border p-2 text-xs">
                        <div className="font-medium">{s.label}</div>
                        <div className="text-muted-foreground">
                          {s.count ?? 0} Datensätze · abgerufen {fmt(s.fetchedAt)}
                        </div>
                        <div className="mt-1 text-muted-foreground">{s.note}</div>
                        {s.url && (
                          <a href={s.url} className="text-primary underline" target="_blank" rel="noreferrer">
                            {s.url}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Angaben ohne Gewähr. Nicht jedes Studio ist in jeder Quelle vollständig erfasst; siehe README → „Bekannte Einschränkungen“.
                  </p>
                </>
              ) : (
                <p>Kein Datenbestand geladen.</p>
              )}
              <h3 className="border-t pt-3 font-semibold">Daten aktualisieren</h3>
              <ImportPanel
                apiAvailable={status.available}
                initialReport={status.staging}
                onApplied={() => {
                  onDataChanged()
                  void getStatus().then(setStatus)
                }}
              />
              <h3 className="border-t pt-3 font-semibold">Eigene Datei importieren</h3>
              <FileImport apiAvailable={status.available} />
            </TabsContent>
            <TabsContent value="matches">
              <MatchReview
                candidates={dataset?.matchCandidates ?? []}
                decisions={decisions}
                onMerge={(c) => {
                  setOpen(false)
                  onMergeCandidate(c)
                }}
                onReject={onRejectCandidate}
                onShow={(id) => {
                  setOpen(false)
                  onShowStudio(id)
                }}
              />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function LoadModeSetting({ value, onChange, tiles }: { value: LoadMode; onChange: (m: LoadMode) => void; tiles: TileState }) {
  if (!tiles.index) return null
  const total = tiles.index.total
  const cells = Object.keys(tiles.index.cells).length
  const opt = (v: LoadMode, title: string, text: string) => (
    <label className="flex cursor-pointer gap-2 rounded-md border p-2 has-[:checked]:border-foreground has-[:checked]:bg-muted/60">
      <input type="radio" name="loadMode" className="mt-0.5" checked={value === v} onChange={() => onChange(v)} />
      <span>
        <span className="font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
    </label>
  )
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 font-semibold">Wellpass außerhalb Berlins laden</legend>
      {opt('viewport', 'Nur Kartenausschnitt (empfohlen)', 'Schneller Start: Berlin sofort, andere Regionen erst, wenn du dorthin schiebst.')}
      {opt('all', 'Alles beim Start', `Alle ${total.toLocaleString('de-DE')} Studios sofort (ca. 0,6 MB zusätzlich). Praktisch für die Suche in ganz Deutschland.`)}
      <p className="text-xs text-muted-foreground">
        Geladen: {tiles.loadedCells} von {cells} Kacheln ({tiles.loadedStudios.toLocaleString('de-DE')} Studios).
        {tiles.error && <span className="text-red-700"> {tiles.error}</span>} Der Bereich „Alle“ in der Liste lädt ebenfalls alles.
      </p>
    </fieldset>
  )
}
