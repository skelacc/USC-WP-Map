/** Client für die lokale Import-API (nur unter `npm run dev` verfügbar). */

export interface ImportEvent {
  type: 'start' | 'progress' | 'source-done' | 'error' | 'cancelled' | 'done' | 'exit' | 'log'
  message?: string
  time?: string
  code?: number | null
  detail?: string
  report?: ImportReport
  [k: string]: unknown
}

export interface StudioSummary {
  id: string
  name: string
  street: string | null
  providers: { urbanSportsClub: boolean; wellpass: boolean }
}

export interface Counts {
  total: number
  urbanSportsClub: number
  wellpass: number
  both: number
  uscOnly: number
  wellpassOnly: number
  withoutCoordinates: number
}

export interface ImportReport {
  startedAt: string
  finishedAt?: string
  requested?: string[]
  sources: Record<string, { status: string; count?: number; error?: string; keptPrevious?: number; errors?: string[]; skipped?: number }>
  errors: string[]
  warnings?: string[]
  matchCandidates?: number
  diff?: {
    before: Counts | null
    after: Counts
    added: StudioSummary[]
    removed: StudioSummary[]
    providersChanged: (StudioSummary & { before: StudioSummary['providers'] })[]
  }
}

export interface ApiStatus {
  available: boolean
  running: boolean
  staging: ImportReport | null
}

export async function getStatus(): Promise<ApiStatus> {
  try {
    const res = await fetch('/api/status', { cache: 'no-store' })
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return { available: false, running: false, staging: null }
    return (await res.json()) as ApiStatus
  } catch {
    return { available: false, running: false, staging: null }
  }
}

/** Startet einen Import und liefert jede Statuszeile an onEvent. */
export async function runImport(sources: string[], onEvent: (e: ImportEvent) => void, signal: AbortSignal, geocode = false) {
  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources, geocode }),
    signal,
  })
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Import konnte nicht gestartet werden (HTTP ${res.status})`)
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        onEvent(JSON.parse(line) as ImportEvent)
      } catch {
        onEvent({ type: 'log', message: line })
      }
    }
  }
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = (await res.json().catch(() => ({}))) as { lines?: ImportEvent[]; message?: string; savedAs?: string }
  const lastError = data.lines?.filter((l) => l.type === 'error').pop()?.message
  const lastDone = data.lines?.filter((l) => l.type === 'done').pop()
  if (!res.ok) throw new Error(lastError ?? lastDone?.message ?? data.message ?? `Fehler (HTTP ${res.status})`)
  return { message: lastDone?.message ?? 'OK', event: lastDone, savedAs: data.savedAs }
}

export const applyImport = (force = false) => post('/api/import/apply', { force })
export const discardImport = () => post('/api/import/discard', {})
export const decideMatch = (pair: string, decision: 'confirm' | 'reject' | 'reset') => post('/api/decide', { pair, decision })
export const uploadImportFile = (filename: string, content: string) => post('/api/upload', { filename, content })
