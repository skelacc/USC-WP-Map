/**
 * Geräteübergreifende Synchronisation der Zusammenführungen über ein
 * GitHub-Issue im (öffentlichen) Projekt-Repository.
 *
 *  – Lesen: ohne Anmeldung (öffentliches Repository).
 *  – Schreiben: mit einem Fine-grained Personal Access Token, der nur für
 *    dieses Repository und nur „Issues: Read and write“ berechtigt ist.
 *    Der Token wird ausschließlich im Browser des jeweiligen Geräts gespeichert.
 *
 * Das Issue enthält die Entscheidungen als JSON-Block; zusammengeführt wird je
 * Studio-Paar, bei Konflikten gewinnt die neuere Entscheidung.
 */
import type { Decision } from './merges'
import { loadSetting, saveSetting } from './storage'

export interface SyncConfig {
  repo: string // "owner/name"
  issue: number | null
  token: string | null
}

const KEY = 'sync'
const API = 'https://api.github.com'
export const SYNC_TITLE = 'Studio Map: Zuordnungen (Sync)'

export function defaultRepo(): string {
  const host = typeof location !== 'undefined' ? location.hostname : ''
  const m = host.match(/^([^.]+)\.github\.io$/)
  const name = typeof location !== 'undefined' ? location.pathname.split('/').filter(Boolean)[0] : undefined
  return m && name ? `${m[1]}/${name}` : 'skelacc/USC-WP-Map'
}

export function loadSyncConfig(): SyncConfig {
  const c = loadSetting<Partial<SyncConfig>>(KEY, {})
  return { repo: c.repo || defaultRepo(), issue: c.issue ?? null, token: c.token ?? null }
}

export function saveSyncConfig(c: SyncConfig) {
  saveSetting(KEY, c)
}

/** Vereinigt zwei Listen je Paar; neuere Entscheidung gewinnt. */
export function mergeDecisionLists(a: Decision[], b: Decision[]): Decision[] {
  const map = new Map<string, Decision>()
  for (const d of [...a, ...b]) {
    const prev = map.get(d.pair)
    if (!prev || (d.decidedAt ?? '') >= (prev.decidedAt ?? '')) map.set(d.pair, d)
  }
  return [...map.values()].sort((x, y) => (x.decidedAt ?? '').localeCompare(y.decidedAt ?? ''))
}

export function sameDecisions(a: Decision[], b: Decision[]): boolean {
  const key = (l: Decision[]) => JSON.stringify([...l].sort((x, y) => x.pair.localeCompare(y.pair)))
  return key(a) === key(b)
}

export class SyncError extends Error {}
/** Noch kein Sync-Issue vorhanden und kein Token zum Anlegen – kein Fehler. */
export class SyncNotSetUp extends SyncError {}

function headers(token: string | null, json = false): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function gh<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, init)
  } catch {
    throw new SyncError('GitHub nicht erreichbar (offline?).')
  }
  if (res.status === 401) throw new SyncError('Token ungültig oder abgelaufen.')
  if (res.status === 403) throw new SyncError('Keine Berechtigung (Token braucht „Issues: Read and write“ für dieses Repository) oder Abruflimit erreicht.')
  if (res.status === 404) throw new SyncError('Repository oder Issue nicht gefunden.')
  if (!res.ok) throw new SyncError(`GitHub-Fehler (HTTP ${res.status}).`)
  return (await res.json()) as T
}

const BLOCK = /```json\s*([\s\S]*?)```/

export function parseIssueBody(body: string | null | undefined): Decision[] {
  const m = (body ?? '').match(BLOCK)
  if (!m) return []
  try {
    const data = JSON.parse(m[1])
    return Array.isArray(data) ? data.filter((d) => d && typeof d.pair === 'string' && ['confirm', 'reject'].includes(d.decision)) : []
  } catch {
    throw new SyncError('Das Sync-Issue enthält kein gültiges JSON.')
  }
}

export function issueBody(decisions: Decision[]): string {
  return [
    'Dieses Issue speichert die Zusammenführungen der Studio Map, damit sie auf allen Geräten gleich sind.',
    'Es wird von der App automatisch aktualisiert – bitte den JSON-Block nicht von Hand ändern.',
    '',
    `Stand: ${new Date().toISOString()} · ${decisions.length} Entscheidungen`,
    '',
    '```json',
    JSON.stringify(decisions, null, 1),
    '```',
  ].join('\n')
}

interface Issue {
  number: number
  title: string
  body: string | null
  html_url: string
}

/** Sucht das Sync-Issue (oder legt es mit Token an). */
export async function findOrCreateIssue(cfg: SyncConfig): Promise<number> {
  if (cfg.issue) return cfg.issue
  const list = await gh<Issue[]>(`/repos/${cfg.repo}/issues?state=all&per_page=100`, { headers: headers(cfg.token) })
  const found = list.find((i) => i.title === SYNC_TITLE)
  if (found) return found.number
  if (!cfg.token) throw new SyncNotSetUp('Noch nicht eingerichtet: Zum Anlegen des Sync-Issues wird einmalig ein Token benötigt.')
  const created = await gh<Issue>(`/repos/${cfg.repo}/issues`, {
    method: 'POST',
    headers: headers(cfg.token, true),
    body: JSON.stringify({ title: SYNC_TITLE, body: issueBody([]) }),
  })
  return created.number
}

export async function pullDecisions(cfg: SyncConfig): Promise<{ issue: number; decisions: Decision[]; url: string }> {
  const issue = await findOrCreateIssue(cfg)
  const data = await gh<Issue>(`/repos/${cfg.repo}/issues/${issue}`, { headers: headers(cfg.token) })
  return { issue, decisions: parseIssueBody(data.body), url: data.html_url }
}

export async function pushDecisions(cfg: SyncConfig, decisions: Decision[]): Promise<void> {
  if (!cfg.token) throw new SyncError('Zum Hochladen wird ein Token benötigt.')
  const issue = await findOrCreateIssue(cfg)
  await gh<Issue>(`/repos/${cfg.repo}/issues/${issue}`, {
    method: 'PATCH',
    headers: headers(cfg.token, true),
    body: JSON.stringify({ body: issueBody(decisions) }),
  })
}

/** Holen, zusammenführen, ggf. zurückschreiben. Liefert die vereinigte Liste. */
export async function syncNow(cfg: SyncConfig, local: Decision[]): Promise<{ merged: Decision[]; issue: number; pushed: boolean; url: string }> {
  const remote = await pullDecisions(cfg)
  const merged = mergeDecisionLists(remote.decisions, local)
  let pushed = false
  if (cfg.token && !sameDecisions(merged, remote.decisions)) {
    await pushDecisions({ ...cfg, issue: remote.issue }, merged)
    pushed = true
  }
  return { merged, issue: remote.issue, pushed, url: remote.url }
}
