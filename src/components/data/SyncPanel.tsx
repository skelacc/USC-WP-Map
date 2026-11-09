import { useRef, useState } from 'react'
import { CheckCircle2, Download, ExternalLink, Loader2, RefreshCw, Upload, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Decision } from '@/lib/merges'
import { mergeDecisionLists, saveSyncConfig, type SyncConfig } from '@/lib/sync'

interface Props {
  config: SyncConfig
  onConfigChange: (c: SyncConfig) => void
  decisions: Decision[]
  onImport: (d: Decision[]) => void
  onSync: () => Promise<void>
  status: { state: 'idle' | 'busy' | 'ok' | 'error'; message?: string; at?: string; url?: string }
}

export function SyncPanel({ config, onConfigChange, decisions, onImport, onSync, status }: Props) {
  const [repo, setRepo] = useState(config.repo)
  const [token, setToken] = useState(config.token ?? '')
  const fileRef = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState<string | null>(null)

  const save = () => {
    const next = { repo: repo.trim(), token: token.trim() || null, issue: repo.trim() === config.repo ? config.issue : null }
    saveSyncConfig(next)
    onConfigChange(next)
  }

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(decisions, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `studio-map-zuordnungen-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importFile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text())
      if (!Array.isArray(data) || !data.every((d) => d && typeof d.pair === 'string' && ['confirm', 'reject'].includes(d.decision))) {
        throw new Error('Unerwartetes Format')
      }
      const merged = mergeDecisionLists(decisions, data as Decision[])
      onImport(merged)
      setNote(`Importiert: ${data.length} Einträge, zusammen jetzt ${merged.length}.`)
    } catch (e) {
      setNote(`Import fehlgeschlagen: ${(e as Error).message}`)
    }
  }

  const dirty = repo.trim() !== config.repo || (token.trim() || null) !== config.token

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-muted-foreground">
        Deine Zusammenführungen ({decisions.length}) sind im Browser dieses Geräts gespeichert. Damit sie auf allen Geräten gleich sind, synchronisiert die
        App sie über ein GitHub-Issue in deinem Repository oder per Datei.
      </p>

      <section className="space-y-2 rounded-md border p-3">
        <h3 className="font-semibold">Automatisch über GitHub</h3>
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          <li>
            <b>Lesen</b> klappt ohne Anmeldung, das Repository ist öffentlich. Jedes Gerät übernimmt beim Start die Zuordnungen aus dem Issue „Studio Map:
            Zuordnungen (Sync)“.
          </li>
          <li>
            <b>Schreiben</b> braucht auf diesem Gerät einen Token. Erstellen unter GitHub → Settings → Developer settings → Fine-grained tokens. Nur dieses
            Repository auswählen, Berechtigung <b>Issues: Read and write</b> genügt. Der Token bleibt nur in diesem Browser.
          </li>
          <li>Hinweis: Das Issue ist wie das Repository öffentlich sichtbar. Es enthält nur Studio-IDs und deine gewählten Namen.</li>
        </ul>
        <label className="block text-xs">
          Repository
          <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/name" className="mt-1" />
        </label>
        <label className="block text-xs">
          Token (optional, nur zum Schreiben)
          <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" autoComplete="off" className="mt-1" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && (
            <Button size="sm" onClick={save}>
              Speichern
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => void onSync()} disabled={status.state === 'busy' || dirty}>
            {status.state === 'busy' ? <Loader2 className="animate-spin" /> : <RefreshCw />} Jetzt synchronisieren
          </Button>
          {config.token && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setToken('')
                const next = { ...config, token: null }
                saveSyncConfig(next)
                onConfigChange(next)
              }}
            >
              Token entfernen
            </Button>
          )}
        </div>
        {status.message && (
          <p className={`flex items-start gap-1.5 text-xs ${status.state === 'error' ? 'text-red-700' : status.state === 'idle' ? 'text-muted-foreground' : 'text-emerald-700'}`}>
            {status.state === 'error' ? <XCircle className="mt-px size-3.5 shrink-0" /> : <CheckCircle2 className="mt-px size-3.5 shrink-0" />}
            <span>
              {status.message}
              {status.at && ` (${new Date(status.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })})`}
              {status.url && (
                <>
                  {' · '}
                  <a href={status.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
                    Issue <ExternalLink className="size-3" />
                  </a>
                </>
              )}
            </span>
          </p>
        )}
      </section>

      <section className="space-y-2 rounded-md border p-3">
        <h3 className="font-semibold">Per Datei</h3>
        <p className="text-xs text-muted-foreground">
          Auf Gerät A exportieren, auf Gerät B importieren. Beim Import wird zusammengeführt, nichts geht verloren; bei Widersprüchen gilt die neuere
          Entscheidung. Für das Projekt: Datei als <code>data/manual/match_decisions.json</code> committen.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportFile} disabled={!decisions.length}>
            <Download /> Exportieren
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload /> Importieren
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importFile(f)
              e.target.value = ''
            }}
          />
        </div>
        {note && <p className="text-xs">{note}</p>}
      </section>
    </div>
  )
}
