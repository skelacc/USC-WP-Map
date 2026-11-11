import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Trash2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { Checkbox } from '@/components/ui/checkbox'
import { applyImport, discardImport, runImport, type ImportEvent, type ImportReport } from '@/lib/importApi'
import { cn } from '@/lib/utils'

const SOURCE_OPTIONS = [
  { id: 'usc', label: 'Urban Sports Club (offizielle Website, ca. 2–3 Min.)' },
  { id: 'wellpass', label: 'Wellpass (neuester Gym-Finder-Export in data/WP-network)' },
  { id: 'manual', label: 'Manuelle Dateien (data/manual/import)' },
]

type Phase = 'idle' | 'running' | 'review' | 'applying'

interface Props {
  apiAvailable: boolean
  initialReport: ImportReport | null
  onApplied: () => void
}

export function ImportPanel({ apiAvailable, initialReport, onApplied }: Props) {
  const [sources, setSources] = useState<string[]>(['usc', 'wellpass', 'manual'])
  const [phase, setPhase] = useState<Phase>(initialReport ? 'review' : 'idle')
  const [log, setLog] = useState<ImportEvent[]>([])
  const [report, setReport] = useState<ImportReport | null>(initialReport)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [log])
  useEffect(() => () => abortRef.current?.abort(), [])

  if (!apiAvailable) {
    return (
      <div className="space-y-2 text-sm">
        <p>
          Die Aktualisierung per Knopfdruck ist nur verfügbar, wenn die App mit <code className="rounded bg-muted px-1">npm run dev</code> läuft
          (dann startet der lokale Entwicklungsserver die Python-Importskripte).
        </p>
        <p>Alternativ im Projektordner:</p>
        <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{`npm run data:fetch    # Quellen abrufen → Staging + Bericht
npm run data:apply    # geprüften Stand übernehmen
npm run data:discard  # oder verwerfen`}</pre>
      </div>
    )
  }

  const start = async () => {
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setPhase('running')
    setLog([])
    setError(null)
    setNotice(null)
    setReport(null)
    let finalReport: ImportReport | null = null
    let cancelled = false
    try {
      await runImport(
        sources,
        (e) => {
          if (e.type === 'exit') return
          if (e.type === 'done' && e.report) finalReport = e.report
          if (e.type === 'cancelled') cancelled = true
          setLog((l) => [...l, e])
        },
        ctrl.signal,
      )
    } catch (e) {
      if ((e as Error).name === 'AbortError') cancelled = true
      else setError((e as Error).message)
    } finally {
      abortRef.current = null
    }
    if (cancelled) {
      setNotice('Import abgebrochen. Der bestehende Datenbestand ist unverändert.')
      setPhase('idle')
    } else if (finalReport) {
      setReport(finalReport)
      setPhase('review')
    } else {
      setPhase('idle')
      setError((prev) => prev ?? 'Der Import wurde ohne Ergebnis beendet. Details im Protokoll.')
    }
  }

  const cancel = () => abortRef.current?.abort()

  const apply = async (force = false) => {
    setPhase('applying')
    setError(null)
    try {
      const r = await applyImport(force)
      setNotice(r.message)
      setReport(null)
      setPhase('idle')
      onApplied()
    } catch (e) {
      setError((e as Error).message)
      setPhase('review')
    }
  }

  const discard = async () => {
    try {
      const r = await discardImport()
      setNotice(r.message)
      setReport(null)
      setPhase('idle')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="space-y-3 text-sm">
      {phase !== 'review' && (
        <fieldset className="space-y-1.5" disabled={phase === 'running'}>
          <legend className="mb-1 text-xs font-semibold text-muted-foreground uppercase">Quellen</legend>
          {SOURCE_OPTIONS.map((o) => (
            <label key={o.id} className="flex items-center gap-2">
              <Checkbox
                checked={sources.includes(o.id)}
                onCheckedChange={(v) => setSources((s) => (v ? [...s, o.id] : s.filter((x) => x !== o.id)))}
              />
              {o.label}
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex flex-wrap gap-2">
        {phase === 'idle' && (
          <Button onClick={start} disabled={!sources.length}>
            Daten aktualisieren
          </Button>
        )}
        {phase === 'running' && (
          <>
            <Button disabled>
              <Loader2 className="animate-spin" /> Import läuft …
            </Button>
            <Button variant="outline" onClick={cancel}>
              Abbrechen
            </Button>
          </>
        )}
      </div>

      {notice && <p className="flex items-center gap-2 rounded-md bg-emerald-50 p-2 text-emerald-900"><CheckCircle2 className="size-4" />{notice}</p>}
      {error && <p className="flex items-start gap-2 rounded-md bg-red-50 p-2 text-red-900"><XCircle className="mt-0.5 size-4 shrink-0" />{error}</p>}

      {log.length > 0 && (
        <ol ref={logRef} className="max-h-40 overflow-y-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed" aria-live="polite">
          {log.map((e, i) => (
            <li key={i} className={cn(e.type === 'error' && 'text-red-700', e.type === 'done' && 'text-emerald-700')}>
              {e.message}
              {e.detail && <pre className="whitespace-pre-wrap text-red-700">{e.detail}</pre>}
            </li>
          ))}
        </ol>
      )}

      {phase !== 'idle' && phase !== 'running' && report && <ReportView report={report} />}

      {(phase === 'review' || phase === 'applying') && report && (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {report.warnings?.length ? (
            <Button variant="destructive" onClick={() => apply(true)} disabled={phase === 'applying'}>
              Trotz Warnungen übernehmen
            </Button>
          ) : (
            <Button onClick={() => apply(false)} disabled={phase === 'applying'}>
              {phase === 'applying' && <Loader2 className="animate-spin" />} Übernehmen
            </Button>
          )}
          <ConfirmButton icon={<Trash2 />} label="Import verwerfen (bisherigen Stand behalten)" confirmText="Verwerfen" onConfirm={() => void discard()} disabled={phase === 'applying'}>
            Verwerfen (bisherigen Stand behalten)
          </ConfirmButton>
        </div>
      )}
    </div>
  )
}

function ReportView({ report }: { report: ImportReport }) {
  const d = report.diff
  return (
    <div className="space-y-2 rounded-md border p-3">
      <h3 className="font-semibold">Ergebnis – noch nicht übernommen</h3>
      {report.warnings?.map((w) => (
        <p key={w} className="flex gap-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
          <AlertTriangle className="size-4 shrink-0" /> {w}
        </p>
      ))}
      <ul className="space-y-0.5 text-xs">
        {Object.entries(report.sources).map(([k, s]) => (
          <li key={k} className={s.status === 'failed' ? 'text-red-700' : ''}>
            <b>{k}</b>:{' '}
            {s.status === 'failed'
              ? `fehlgeschlagen – ${s.error}. Bisheriger Stand (${s.keptPrevious} Datensätze) wird beibehalten.`
              : s.status === 'unchanged'
              ? `unverändert (${s.count} Datensätze) – ${s.note}`
              : `${s.count} Datensätze${s.skipped ? `, ${s.skipped} ungültig übersprungen` : ''}${s.errors?.length ? `, ${s.errors.length} Hinweise` : ''}`}
          </li>
        ))}
      </ul>
      {d && (
        <>
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="font-normal" />
                <th className="font-normal">vorher</th>
                <th className="font-normal">nachher</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Studios gesamt', 'total'],
                  ['Beide Anbieter', 'both'],
                  ['Nur USC', 'uscOnly'],
                  ['Nur Wellpass', 'wellpassOnly'],
                  ['Ohne Koordinaten', 'withoutCoordinates'],
                ] as const
              ).map(([label, k]) => (
                <tr key={k}>
                  <td>{label}</td>
                  <td>{d.before?.[k] ?? '–'}</td>
                  <td>{d.after[k]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <DiffList title="Neu hinzugekommen" items={d.added} total={d.totals?.added} />
          <DiffList title="Entfernt" items={d.removed} total={d.totals?.removed} />
          <DiffList title="Anbieter geändert" items={d.providersChanged} total={d.totals?.providersChanged} />
          {!!report.matchCandidates && <p className="text-xs">{report.matchCandidates} unsichere Zuordnungen warten auf Prüfung (Reiter „Zuordnungen“ nach dem Übernehmen).</p>}
        </>
      )}
      {Object.entries(report.sources).some(([, s]) => s.errors?.length) && (
        <details className="text-xs">
          <summary className="cursor-pointer">Fehlerprotokoll</summary>
          <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-4">
            {Object.entries(report.sources).flatMap(([k, s]) => (s.errors ?? []).map((e, i) => <li key={`${k}${i}`}>{k}: {e}</li>))}
          </ul>
        </details>
      )}
    </div>
  )
}

function DiffList({ title, items, total }: { title: string; items: { id: string; name: string; street: string | null }[]; total?: number }) {
  if (!items.length) return <p className="text-xs text-muted-foreground">{title}: keine</p>
  const n = total ?? items.length
  return (
    <details className="text-xs">
      <summary className="cursor-pointer">
        {title}: {n.toLocaleString('de-DE')}
        {n > items.length && <span className="text-muted-foreground"> (die ersten {items.length} gezeigt)</span>}
      </summary>
      <ul className="mt-1 max-h-40 overflow-y-auto pl-4">
        {items.map((s) => (
          <li key={s.id}>
            {s.name} <span className="text-muted-foreground">{s.street}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
