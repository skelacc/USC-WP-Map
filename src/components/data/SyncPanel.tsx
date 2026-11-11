import { useRef, useState } from 'react'
import { CheckCircle2, Download, ExternalLink, Loader2, RefreshCw, Upload, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Decision } from '@/lib/merges'
import { issueBody, mergeDecisionLists, parseIssueBody, saveSyncConfig, type SyncConfig, type SyncPayload } from '@/lib/sync'
import { mergeUserData, type UserData } from '@/lib/userdata'

interface Props {
  profile: string
  onProfileChange: (p: string) => void
  config: SyncConfig
  onConfigChange: (c: SyncConfig) => void
  decisions: Decision[]
  userData: UserData
  onImport: (p: SyncPayload) => void
  onSync: () => Promise<void>
  status: { state: 'idle' | 'busy' | 'ok' | 'error'; message?: string; at?: string; url?: string }
}

export function SyncPanel({ profile, onProfileChange, config, onConfigChange, decisions, userData, onImport, onSync, status }: Props) {
  const [name, setName] = useState(profile)
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
    // gleiches Format wie im Sync-Issue (JSON-Block)
    const json = issueBody({ decisions, userdata: userData }).match(/```json\n([\s\S]*)\n```/)![1]
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `studio-map-zuordnungen-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importFile = async (f: File) => {
    try {
      const text = await f.text()
      JSON.parse(text) // Syntax prüfen
      const incoming = parseIssueBody('```json\n' + text + '\n```')
      if (!incoming.decisions.length && !Object.keys(incoming.userdata.notes).length && !Object.keys(incoming.userdata.ratings).length && !Object.keys(incoming.userdata.edits).length) {
        throw new Error('Keine Daten gefunden')
      }
      const merged: SyncPayload = {
        decisions: mergeDecisionLists(decisions, incoming.decisions),
        userdata: mergeUserData(userData, incoming.userdata),
      }
      onImport(merged)
      setNote(`Importiert und zusammengeführt: ${incoming.decisions.length} Zuordnungen sowie Bewertungen, Notizen und Korrekturen.`)
    } catch (e) {
      setNote(`Import fehlgeschlagen: ${(e as Error).message}`)
    }
  }

  const dirty = repo.trim() !== config.repo || (token.trim() || null) !== config.token

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-muted-foreground">
        Deine Zusammenführungen ({decisions.length}), Bewertungen, Notizen und Korrekturen sind im Browser dieses Geräts gespeichert. Damit sie auf allen Geräten gleich sind, synchronisiert die
        App sie über ein GitHub-Issue in deinem Repository oder per Datei.
      </p>

      <section className="space-y-2 rounded-md border p-3">
        <h3 className="font-semibold">Profil</h3>
        <p className="text-xs text-muted-foreground">
          Deine ♥/👎-Bewertungen werden unter diesem Namen gespeichert (getrennt je Profil); Notizen tragen ihn als Autor. Auf jedem deiner Geräte denselben
          Namen verwenden.
        </p>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Profilname" />
          {name.trim() !== profile && (
            <Button size="sm" className="h-8" onClick={() => onProfileChange(name)}>
              Speichern
            </Button>
          )}
        </div>
      </section>

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
          Entscheidung. Enthält Zuordnungen, Bewertungen, Notizen und Korrekturen – auch als Grundlage, um Notizen später (z. B. mit KI) auszuwerten.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportFile}>
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
