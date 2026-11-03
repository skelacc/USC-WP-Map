import { useEffect, useState } from 'react'
import { Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getStatus, type ApiStatus } from '@/lib/importApi'
import type { Dataset } from '@/types/studio'
import { FileImport } from './FileImport'
import { ImportPanel } from './ImportPanel'
import { MatchReview } from './MatchReview'

interface Props {
  dataset: Dataset | null
  api: ApiStatus
  onDataChanged: () => void
  onDecide: (pair: string, decision: 'confirm' | 'reject') => Promise<void>
  onShowStudio: (id: string) => void
}

function fmt(iso?: string) {
  if (!iso) return 'unbekannt'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}

export function DataDialog({ dataset, api, onDataChanged, onDecide, onShowStudio }: Props) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<ApiStatus>(api)
  const pending = dataset?.matchCandidates.length ?? 0

  useEffect(() => {
    if (open) void getStatus().then(setStatus)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Database /> <span className="hidden sm:inline">Daten</span>
          {(pending > 0 || status.staging) && <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-amber-500" aria-label="Offene Punkte" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Daten</DialogTitle>
          <DialogDescription>Datenbestand, Aktualisierung und Prüfung von Zuordnungen.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={status.staging ? 'update' : 'info'} className="min-h-0 flex-1">
          <TabsList className="w-full">
            <TabsTrigger value="info">Bestand</TabsTrigger>
            <TabsTrigger value="update">Aktualisieren</TabsTrigger>
            <TabsTrigger value="matches">Zuordnungen{pending ? ` (${pending})` : ''}</TabsTrigger>
            <TabsTrigger value="file">Datei</TabsTrigger>
          </TabsList>
          <div className="min-h-0 overflow-y-auto pt-2">
            <TabsContent value="info" className="space-y-3 text-sm">
              {dataset ? (
                <>
                  <p>
                    Stand: <b>{fmt(dataset.generatedAt)}</b> · {dataset.studios.length.toLocaleString('de-DE')} Studios
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
            </TabsContent>
            <TabsContent value="update">
              <ImportPanel
                apiAvailable={status.available}
                initialReport={status.staging}
                onApplied={() => {
                  onDataChanged()
                  void getStatus().then(setStatus)
                }}
              />
            </TabsContent>
            <TabsContent value="matches">
              <MatchReview
                candidates={dataset?.matchCandidates ?? []}
                canEdit={status.available}
                onDecide={onDecide}
                onShow={(id) => {
                  setOpen(false)
                  onShowStudio(id)
                }}
              />
            </TabsContent>
            <TabsContent value="file">
              <FileImport apiAvailable={status.available} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
