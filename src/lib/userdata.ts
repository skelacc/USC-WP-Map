/**
 * Eigene Angaben zu Studios – gespeichert im Browser, geteilt per Sync:
 *  – Bewertungen (♥ / 👎) je Profil (Vorbereitung für mehrere Nutzer)
 *  – Notizen (mehrere je Studio, mit Autor und Datum; z. B. „Massage kostet 20 € Zuzahlung“)
 *  – Korrekturen von Angaben (Name, Adresse, Website, Telefon, Hinweis)
 *
 * Schlüssel ist jeweils ein Eintragsschlüssel (provider:source:id) – damit
 * bleiben die Angaben auch erhalten, wenn Studios zusammengeführt werden.
 */
import type { Studio } from '@/types/studio'
import { memberKey, membersOf } from './merges'
import { loadSetting, saveSetting } from './storage'

export type Rating = 'like' | 'dislike'

export interface RatingEntry {
  value: Rating | null // null = zurückgesetzt
  at: string
}

export interface Note {
  id: string
  text: string
  author: string
  at: string
  deleted?: boolean
}

export const EDIT_FIELDS = ['name', 'street', 'postalCode', 'website', 'phone', 'hint'] as const
export type EditField = (typeof EDIT_FIELDS)[number]
export type Edit = Partial<Record<EditField, { value: string | null; at: string; author: string }>>

export interface UserData {
  /** Bewertungen je Profil */
  ratings: Record<string, Record<string, RatingEntry>>
  notes: Record<string, Note[]>
  edits: Record<string, Edit>
}

export const EMPTY_USERDATA: UserData = { ratings: {}, notes: {}, edits: {} }

export function loadUserData(): UserData {
  const d = loadSetting<Partial<UserData>>('userdata', {})
  return { ratings: d.ratings ?? {}, notes: d.notes ?? {}, edits: d.edits ?? {} }
}

export function saveUserData(d: UserData) {
  saveSetting('userdata', d)
}

export function loadProfile(): string {
  return loadSetting<string>('profile', 'Ich')
}

export function saveProfile(p: string) {
  saveSetting('profile', p)
}

const now = () => new Date().toISOString()

function keysOfStudio(s: Studio): string[] {
  return membersOf(s).map(memberKey)
}

/** Neuester Eintrag unter allen Schlüsseln eines Studios. */
function newest<T extends { at: string }>(map: Record<string, T> | undefined, keys: string[]): T | undefined {
  let best: T | undefined
  for (const k of keys) {
    const v = map?.[k]
    if (v && (!best || v.at > best.at)) best = v
  }
  return best
}

export function ratingOf(d: UserData, profile: string, s: Studio): Rating | null {
  return newest(d.ratings[profile], keysOfStudio(s))?.value ?? null
}

export function setRating(d: UserData, profile: string, s: Studio, value: Rating | null): UserData {
  const keys = keysOfStudio(s)
  const mine = { ...(d.ratings[profile] ?? {}) }
  // auf dem ersten Schlüssel speichern, andere Schlüssel desselben Studios überschreiben
  for (const k of keys) if (mine[k]) mine[k] = { value, at: now() }
  mine[keys[0]] = { value, at: now() }
  return { ...d, ratings: { ...d.ratings, [profile]: mine } }
}

export function notesOf(d: UserData, s: Studio): Note[] {
  return keysOfStudio(s)
    .flatMap((k) => d.notes[k] ?? [])
    .filter((n) => !n.deleted)
    .sort((a, b) => a.at.localeCompare(b.at))
}

export function addNote(d: UserData, s: Studio, text: string, author: string): UserData {
  const k = keysOfStudio(s)[0]
  const note: Note = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, text: text.trim(), author, at: now() }
  return { ...d, notes: { ...d.notes, [k]: [...(d.notes[k] ?? []), note] } }
}

export function deleteNote(d: UserData, id: string): UserData {
  const notes: UserData['notes'] = {}
  for (const [k, list] of Object.entries(d.notes)) notes[k] = list.map((n) => (n.id === id ? { ...n, deleted: true, at: now() } : n))
  return { ...d, notes }
}

/** Zusammengefasste Korrekturen eines Studios (je Feld der neueste Wert). */
export function editOf(d: UserData, s: Studio): Partial<Record<EditField, string | null>> {
  const out: Partial<Record<EditField, string | null>> = {}
  for (const f of EDIT_FIELDS) {
    let best: { value: string | null; at: string } | undefined
    for (const k of keysOfStudio(s)) {
      const e = d.edits[k]?.[f]
      if (e && (!best || e.at > best.at)) best = e
    }
    if (best && best.value !== null && best.value !== '') out[f] = best.value
  }
  return out
}

export function setEdit(d: UserData, s: Studio, values: Partial<Record<EditField, string | null>>, author: string): UserData {
  const k = keysOfStudio(s)[0]
  const cur: Edit = { ...(d.edits[k] ?? {}) }
  const at = now()
  for (const f of EDIT_FIELDS) if (f in values) cur[f] = { value: values[f] ?? null, at, author }
  // ältere Werte unter anderen Schlüsseln desselben Studios entwerten
  const edits = { ...d.edits, [k]: cur }
  for (const other of keysOfStudio(s).slice(1)) {
    if (!edits[other]) continue
    const o: Edit = { ...edits[other] }
    for (const f of EDIT_FIELDS) if (f in values && o[f]) o[f] = { value: values[f] ?? null, at, author }
    edits[other] = o
  }
  return { ...d, edits }
}

/** Korrekturen auf die Studios anwenden (für Anzeige, Suche, Karte). */
export function applyEdits<T extends Studio>(studios: T[], d: UserData): T[] {
  if (!Object.keys(d.edits).length) return studios
  return studios.map((s) => {
    const e = editOf(d, s)
    if (!Object.keys(e).length) return s
    return {
      ...s,
      name: e.name ?? s.name,
      address: { ...s.address, street: e.street ?? s.address.street, postalCode: e.postalCode ?? s.address.postalCode },
      website: e.website ?? s.website,
      phone: e.phone ?? s.phone,
      userHint: e.hint ?? undefined,
    }
  })
}

/** Zwei Stände zusammenführen: je Eintrag gewinnt der neuere. */
export function mergeUserData(a: UserData, b: UserData): UserData {
  const ratings: UserData['ratings'] = {}
  for (const p of new Set([...Object.keys(a.ratings), ...Object.keys(b.ratings)])) {
    const out: Record<string, RatingEntry> = { ...(a.ratings[p] ?? {}) }
    for (const [k, v] of Object.entries(b.ratings[p] ?? {})) if (!out[k] || v.at > out[k].at) out[k] = v
    ratings[p] = out
  }
  const notes: UserData['notes'] = {}
  for (const k of new Set([...Object.keys(a.notes), ...Object.keys(b.notes)])) {
    const byId = new Map<string, Note>()
    for (const n of [...(a.notes[k] ?? []), ...(b.notes[k] ?? [])]) {
      const prev = byId.get(n.id)
      if (!prev || n.at > prev.at) byId.set(n.id, n)
    }
    notes[k] = [...byId.values()].sort((x, y) => x.at.localeCompare(y.at))
  }
  const edits: UserData['edits'] = {}
  for (const k of new Set([...Object.keys(a.edits), ...Object.keys(b.edits)])) {
    const out: Edit = { ...(a.edits[k] ?? {}) }
    for (const f of EDIT_FIELDS) {
      const v = b.edits[k]?.[f]
      if (v && (!out[f] || v.at > out[f]!.at)) out[f] = v
    }
    edits[k] = out
  }
  return { ratings, notes, edits }
}
