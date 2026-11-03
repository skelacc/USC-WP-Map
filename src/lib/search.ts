import type { Studio } from '@/types/studio'

/**
 * Fehlertolerante Suche.
 *
 * Jeder Suchbegriff muss irgendwo in Name, Straße, PLZ oder Bezirk passen,
 * und zwar auf eine dieser Arten (absteigende Bewertung):
 *  1. als Teilstring (z. B. "fitn" in "fitness first")
 *  2. ohne Leerzeichen/Bindestriche/Punkte ("fitnessfirst", "ride bln" → "ride.bln")
 *  3. unscharf: Damerau-Levenshtein-Abstand zu einem Wort bzw. Wortanfang.
 *     Erlaubt sind 1 Fehler ab 4 Zeichen und 2 Fehler ab 8 Zeichen
 *     (≈ 80–90 % Übereinstimmung). Ein Fehler kann ein falscher, fehlender,
 *     überzähliger oder vertauschter Buchstabe sein.
 * Umlaute werden doppelt indiziert ("ö" findet "oe" und "o").
 * Das Ergebnis ist ein Wert zwischen 0 (kein Treffer) und 1 (exakt), mit dem
 * die Trefferliste sortiert wird.
 */

export function foldText(text: string, simple = false): string {
  let t = text.toLowerCase().replace(/ß/g, 'ss')
  if (!simple) t = t.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
  return t
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/str\.?(?=\s|\d|$)/g, 'strasse')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

interface Entry {
  text: string // gefalteter Text, Wörter durch Leerzeichen getrennt
  compact: string // ohne Leerzeichen
  words: string[]
}

const index = new WeakMap<Studio, Entry>()

function entryOf(s: Studio): Entry {
  let e = index.get(s)
  if (!e) {
    const names = [s.name, ...Object.values(s.providerDetails).map((d) => d?.name ?? '')]
    const a = s.address
    const raw = [...new Set(names), a.street, a.postalCode, a.district].filter(Boolean).join(' ')
    const text = `${foldText(raw)} ${foldText(raw, true)}`
    const words = [...new Set(text.split(' ').filter(Boolean))]
    e = { text, compact: text.replace(/ /g, ''), words }
    index.set(s, e)
  }
  return e
}

/** Optimal-String-Alignment-Abstand (Damerau-Levenshtein mit Vertauschung), mit Abbruch über max. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const n = b.length
  let prev2 = new Array<number>(n + 1).fill(0)
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(n + 1)
    cur[0] = i
    let rowMin = cur[0]
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1)
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return prev[n]
}

export function allowedErrors(len: number): number {
  return len < 4 ? 0 : len < 8 ? 1 : 2
}

function termScore(term: string, e: Entry): number {
  if (e.text.includes(term)) return 1
  if (e.compact.includes(term)) return 0.95
  if (/^\d+$/.test(term)) return 0 // Hausnummern/PLZ nur exakt
  const max = allowedErrors(term.length)
  if (!max) return 0
  let best = max + 1
  for (const w of e.words) {
    if (Math.abs(w.length - term.length) > max && w.length < term.length) continue
    // ganzes Wort oder Wortanfang (für noch nicht fertig getippte Begriffe)
    const d = Math.min(
      editDistance(term, w, max),
      w.length > term.length ? editDistance(term, w.slice(0, term.length), max) : max + 1,
      w.length > term.length ? editDistance(term, w.slice(0, term.length + 1), max) : max + 1,
    )
    if (d < best) best = d
    if (best === 1 && max === 1) break
  }
  return best <= max ? 0.9 - (0.2 * best) / term.length : 0
}

/** 0 = kein Treffer, sonst Relevanz bis 1. Leere Suche passt immer (1). */
export function searchScore(s: Studio, query: string): number {
  const folded = foldText(query)
  const terms = folded.split(' ').filter(Boolean)
  if (!terms.length) return 1
  const e = entryOf(s)
  // Ganze Anfrage zusammenhängend (auch ohne Leerzeichen) → Bonus
  const whole = folded.replace(/ /g, '')
  if (terms.length > 1 && e.compact.includes(whole)) return 1
  let sum = 0
  for (const t of terms) {
    const sc = termScore(t, e)
    if (!sc) return 0
    sum += sc
  }
  // Treffer im Namen leicht bevorzugen
  const nameBonus = foldText(s.name).includes(terms[0]) ? 0.05 : 0
  return Math.min(1, sum / terms.length + nameBonus)
}

export function matchesQuery(s: Studio, query: string): boolean {
  return searchScore(s, query) > 0
}
