/**
 * Eigene Zusammenführungs-Entscheidungen – im Browser gespeichert und direkt
 * auf den geladenen Datenbestand angewendet. Dadurch funktionieren sie auch
 * auf der statischen Seite (GitHub Pages) ohne Server. Unter `npm run dev`
 * werden sie zusätzlich in data/manual/match_decisions.json übernommen.
 *
 * Format wie in Python (scripts/studiomap/merge.py):
 *   { pair: "<usc-key>~<wellpass-key>", decision: "confirm" | "reject", fields?, decidedAt }
 */
import type { Coordinates, Dataset, FieldChoices, ProviderDetail, ProviderKey, Studio } from '@/types/studio'
import { loadSetting, saveSetting } from './storage'

export interface Decision {
  pair: string
  decision: 'confirm' | 'reject'
  fields?: FieldChoices
  decidedAt: string
}

const KEY = 'decisions'

export function loadDecisions(): Decision[] {
  const d = loadSetting<Decision[]>(KEY, [])
  return Array.isArray(d) ? d.filter((x) => x && typeof x.pair === 'string') : []
}

export function saveDecisions(d: Decision[]) {
  saveSetting(KEY, d)
}

export function upsertDecision(list: Decision[], d: Decision): Decision[] {
  return [...list.filter((x) => x.pair !== d.pair), d]
}

export function detailKey(p: ProviderKey, d: ProviderDetail): string {
  return d.key ?? `${p}:${d.source}:${d.sourceId}`
}

export function pairOf(usc: Studio, wp: Studio): string {
  return `${detailKey('urbanSportsClub', usc.providerDetails.urbanSportsClub!)}~${detailKey('wellpass', wp.providerDetails.wellpass!)}`
}

/** Studio, das nur aus den Angaben eines Anbieters besteht. */
export function singleFromDetail(p: ProviderKey, d: ProviderDetail, id: string): Studio {
  return {
    id,
    name: d.name,
    address: d.address ?? { street: null, postalCode: null, city: 'Berlin', district: null },
    coordinates: d.coordinates ? ({ ...d.coordinates, from: p } as Coordinates) : null,
    providers: { urbanSportsClub: p === 'urbanSportsClub', wellpass: p === 'wellpass' },
    providerDetails: { [p]: d },
    website: d.website ?? null,
    phone: d.phone ?? null,
    categories: d.categories ?? [],
    activities: (d.activities ?? []).map((a) => a.name),
    source: { urbanSportsClub: p === 'urbanSportsClub' ? d.source : null, wellpass: p === 'wellpass' ? d.source : null },
    lastVerified: d.fetchedAt?.slice(0, 10) ?? null,
    matchConfidence: 'single',
    match: null,
  }
}

function pick<T>(choice: ProviderKey | undefined, u: T, w: T, fallback: T): T {
  if (choice === 'urbanSportsClub') return u
  if (choice === 'wellpass') return w
  return fallback
}

/** Neues zusammengeführtes Studio aus den Angaben beider Anbieter. */
export function mergedStudio(id: string, u: ProviderDetail, w: ProviderDetail, fields: FieldChoices = {}, decidedAt?: string): Studio {
  const name =
    typeof fields.name === 'object' ? fields.name.custom : pick(fields.name as ProviderKey | undefined, u.name, w.name, u.name)
  const address = pick(fields.address, u.address, w.address, u.address?.street ? u.address : (w.address ?? u.address)) ?? {
    street: null,
    postalCode: null,
    city: 'Berlin',
    district: null,
  }
  const coordSrc: ProviderKey = fields.coordinates ?? (u.coordinates ? 'urbanSportsClub' : 'wellpass')
  const coord = coordSrc === 'urbanSportsClub' ? u.coordinates : w.coordinates
  const website =
    typeof fields.website === 'object'
      ? fields.website.custom
      : pick(fields.website as ProviderKey | undefined, u.website ?? null, w.website ?? null, w.website ?? u.website ?? null)
  return {
    id,
    name,
    address: { ...address, postalCode: address.postalCode ?? u.address?.postalCode ?? w.address?.postalCode ?? null },
    coordinates: coord ? ({ ...coord, from: coordSrc } as Coordinates) : null,
    providers: { urbanSportsClub: true, wellpass: true },
    providerDetails: { urbanSportsClub: u, wellpass: w },
    website,
    phone: u.phone ?? w.phone ?? null,
    categories: [...new Set([...(u.categories ?? []), ...(w.categories ?? [])])].sort(),
    activities: [...new Set([...(u.activities ?? []), ...(w.activities ?? [])].map((a) => a.name))].sort(),
    source: { urbanSportsClub: u.source, wellpass: w.source },
    lastVerified: [u.fetchedAt, w.fetchedAt].filter(Boolean).sort()[0]?.slice(0, 10) ?? null,
    matchConfidence: 'verified',
    match: { method: 'manual', score: 1, reasons: ['Manuell zusammengeführt'], distanceM: null, decidedAt, fields },
    fieldChoices: fields,
  }
}

/** Wendet die Entscheidungen auf den Datenbestand an (idempotent). */
export function applyDecisions(ds: Dataset, decisions: Decision[]): Dataset {
  if (!decisions.length) return ds
  let studios = [...ds.studios]
  const findBy = (key: string) =>
    studios.find((s) =>
      (Object.entries(s.providerDetails) as [ProviderKey, ProviderDetail][]).some(([p, d]) => detailKey(p, d) === key),
    )
  const replace = (remove: Studio[], add: Studio[]) => {
    const ids = new Set(remove.map((s) => s.id))
    studios = [...studios.filter((s) => !ids.has(s.id)), ...add]
  }
  // Ein zusammengeführtes Studio in seine zwei Einzelstudios aufteilen
  const split = (s: Studio): Studio[] => {
    const u = s.providerDetails.urbanSportsClub!
    const w = s.providerDetails.wellpass!
    return [singleFromDetail('urbanSportsClub', u, s.id), singleFromDetail('wellpass', w, `${s.id}~wp`)]
  }

  for (const d of decisions) {
    const [uk, wk] = d.pair.split('~')
    const su = findBy(uk)
    const sw = findBy(wk)
    if (!su || !sw) continue // Datensatz nicht (mehr) im Bestand
    if (d.decision === 'reject') {
      if (su === sw) replace([su], split(su))
      continue
    }
    const u = su.providerDetails.urbanSportsClub!
    const w = sw.providerDetails.wellpass!
    const leftovers: Studio[] = []
    if (su !== sw) {
      if (su.providers.wellpass && su.providerDetails.wellpass) leftovers.push(split(su)[1])
      if (sw.providers.urbanSportsClub && sw.providerDetails.urbanSportsClub) leftovers.push(split(sw)[0])
    }
    replace(su === sw ? [su] : [su, sw], [mergedStudio(su.id, u, w, d.fields, d.decidedAt), ...leftovers])
  }
  const decided = new Set(decisions.map((d) => d.pair))
  return {
    ...ds,
    studios,
    matchCandidates: ds.matchCandidates.filter((c) => !decided.has(c.id)),
  }
}
