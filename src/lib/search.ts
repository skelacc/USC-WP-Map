import type { Studio } from '@/types/studio'

/** Kleinschreibung, Umlaute auflösen (ä→ae bzw. mit simple=true ä→a),
 *  Diakritika und Satzzeichen entfernen. */
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

const index = new WeakMap<Studio, string>()

function haystack(s: Studio): string {
  let h = index.get(s)
  if (h === undefined) {
    const names = [s.name, ...Object.values(s.providerDetails).map((d) => d?.name ?? '')]
    const a = s.address
    const raw = [...names, a.street, a.postalCode, a.district].filter(Boolean).join(' ')
    // beide Schreibweisen indizieren: "Schöneberg" findet "schoeneberg" und "schoneberg"
    h = `${foldText(raw)} | ${foldText(raw, true)}`
    index.set(s, h)
  }
  return h
}

/** Alle Suchbegriffe müssen in Name, Adresse, PLZ oder Bezirk vorkommen. */
export function matchesQuery(s: Studio, query: string): boolean {
  const terms = foldText(query).split(' ').filter(Boolean)
  if (!terms.length) return true
  const h = haystack(s)
  return terms.every((t) => h.includes(t))
}
