/**
 * Eigene Zusammenführungs-Entscheidungen – im Browser gespeichert (und per
 * Sync geteilt) und direkt auf den geladenen Datenbestand angewendet.
 *
 * Eine Entscheidung betrifft eine Gruppe von Einträgen (beliebig viele, auch
 * mehrere desselben Anbieters):
 *   { pair: "<key>~<key>~…", keys?: [...], decision: "confirm" | "reject", fields?, decidedAt }
 * Ein Eintragsschlüssel hat die Form provider:source:sourceId. Ältere
 * Entscheidungen bestehen nur aus `pair` (USC~Wellpass) und gelten weiter.
 */
import type { Coordinates, Dataset, FieldChoice, FieldChoices, Member, ProviderDetail, ProviderKey, Studio } from '@/types/studio'
import { loadSetting, saveSetting } from './storage'

export interface Decision {
  /** Kennung der Entscheidung = Schlüssel der Einträge, mit ~ verbunden */
  pair: string
  keys?: string[]
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

/** Neue Entscheidung ersetzt frühere zu denselben Einträgen. */
export function upsertDecision(list: Decision[], d: Decision): Decision[] {
  const keys = new Set(keysOf(d))
  return [...list.filter((x) => x.pair !== d.pair && !(d.decision === 'confirm' && keysOf(x).every((k) => keys.has(k)))), d]
}

export function keysOf(d: Decision): string[] {
  return d.keys?.length ? d.keys : d.pair.split('~')
}

export function detailKey(p: ProviderKey, d: ProviderDetail): string {
  return d.key ?? `${p}:${d.source}:${d.sourceId}`
}

export function memberKey(m: Member): string {
  return detailKey(m.provider, m.detail)
}

/** Alle Einträge eines Studios (erster je Anbieter + weitere). */
export function membersOf(s: Studio): Member[] {
  const primary = (Object.entries(s.providerDetails) as [ProviderKey, ProviderDetail][])
    .filter(([, d]) => !!d)
    .map(([provider, detail]) => ({ provider, detail }))
  // USC zuerst, dann Wellpass, dann weitere
  primary.sort((a, b) => (a.provider === 'urbanSportsClub' ? -1 : 1) - (b.provider === 'urbanSportsClub' ? -1 : 1))
  const order = (p: ProviderKey) => (p === 'urbanSportsClub' ? 0 : 1)
  return [...primary, ...(s.extraMembers ?? [])].map((m, i) => ({ m, i })).sort((a, b) => order(a.m.provider) - order(b.m.provider) || a.i - b.i).map((x) => x.m)
}

export function membersOfProvider(s: Studio, p: ProviderKey): ProviderDetail[] {
  return membersOf(s)
    .filter((m) => m.provider === p)
    .map((m) => m.detail)
}

export function decisionFor(keys: string[], decision: 'confirm' | 'reject', fields?: FieldChoices): Decision {
  return { pair: keys.join('~'), keys, decision, fields, decidedAt: new Date().toISOString() }
}

/** Studio aus einem einzelnen Eintrag. */
export function singleFromDetail(p: ProviderKey, d: ProviderDetail, id: string): Studio {
  return buildStudio([{ provider: p, detail: d }], id, undefined, 'single')
}

function resolve(choice: FieldChoice | undefined, members: Member[]): Member | undefined {
  if (!choice || typeof choice === 'object') return undefined
  return members.find((m) => memberKey(m) === choice) ?? members.find((m) => m.provider === choice)
}

/** Studio aus mehreren Einträgen; fields legt fest, welche Angaben gelten. */
export function buildStudio(
  members: Member[],
  id: string,
  fields: FieldChoices = {},
  confidence: Studio['matchConfidence'] = 'verified',
  decidedAt?: string,
): Studio {
  const ordered = [...members]
  const first = ordered[0]
  const providerDetails: Studio['providerDetails'] = {}
  const extra: Member[] = []
  for (const m of ordered) {
    if (!providerDetails[m.provider]) providerDetails[m.provider] = m.detail
    else extra.push(m)
  }
  const nameSrc = resolve(fields.name, ordered) ?? first
  const addrSrc = resolve(fields.address, ordered) ?? ordered.find((m) => /[a-zäöü]{3}/i.test(m.detail.address?.street ?? '')) ?? first
  const coordSrc = resolve(fields.coordinates, ordered) ?? ordered.find((m) => m.detail.coordinates) ?? first
  const webSrc = resolve(fields.website, ordered) ?? ordered.find((m) => m.detail.website)
  const name = typeof fields.name === 'object' ? fields.name.custom : nameSrc.detail.name
  const website = typeof fields.website === 'object' ? fields.website.custom : (webSrc?.detail.website ?? null)
  const address = addrSrc.detail.address ?? { street: null, postalCode: null, city: 'Berlin', district: null }
  const coord = coordSrc.detail.coordinates
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, 'de'))
  const fetched = ordered.map((m) => m.detail.fetchedAt).filter(Boolean).sort() as string[]
  const multi = ordered.length > 1
  return {
    id,
    name,
    address: { ...address, postalCode: address.postalCode ?? ordered.find((m) => m.detail.address?.postalCode)?.detail.address?.postalCode ?? null },
    coordinates: coord ? ({ ...coord, from: coordSrc.provider } as Coordinates) : null,
    providers: { urbanSportsClub: !!providerDetails.urbanSportsClub, wellpass: !!providerDetails.wellpass },
    providerDetails,
    extraMembers: extra.length ? extra : undefined,
    website,
    phone: ordered.find((m) => m.detail.phone)?.detail.phone ?? null,
    categories: uniq(ordered.flatMap((m) => m.detail.categories ?? [])),
    activities: uniq(ordered.flatMap((m) => (m.detail.activities ?? []).map((a) => a.name))),
    source: { urbanSportsClub: providerDetails.urbanSportsClub?.source ?? null, wellpass: providerDetails.wellpass?.source ?? null },
    lastVerified: fetched[0]?.slice(0, 10) ?? null,
    matchConfidence: multi ? confidence : 'single',
    match: multi ? { method: 'manual', score: 1, reasons: ['Manuell zusammengeführt'], distanceM: null, decidedAt, fields } : null,
    fieldChoices: multi ? fields : undefined,
  }
}

/** Ersetzt veraltete Eintragsschlüssel (z. B. Fair for Fitness → offizieller
 *  Gym-Finder), damit frühere Zusammenführungen weiter gelten. `pair` bleibt
 *  unverändert (Kennung für Sync). */
export function translateDecision(d: Decision, aliases: Record<string, string> | undefined): Decision {
  if (!aliases) return d
  const keys = keysOf(d)
  if (!keys.some((k) => k in aliases)) return d
  const map = (k: string) => aliases[k] ?? k
  const fields = d.fields
    ? (Object.fromEntries(Object.entries(d.fields).map(([f, v]) => [f, typeof v === 'string' ? map(v) : v])) as FieldChoices)
    : undefined
  return { ...d, keys: keys.map(map), fields }
}

/** Wendet die Entscheidungen auf den Datenbestand an (idempotent, in Reihenfolge). */
export function applyDecisions(ds: Dataset, rawDecisions: Decision[]): Dataset {
  if (!rawDecisions.length) return ds
  const decisions = rawDecisions.map((d) => translateDecision(d, ds.keyAliases))
  let studios = [...ds.studios]
  let counter = 0
  // Schlüssel → Studio (bei vielen Studios schneller als wiederholtes Durchsuchen)
  let byKey: Map<string, Studio> | null = null
  const containing = (key: string) => {
    if (!byKey) {
      byKey = new Map()
      for (const s of studios) for (const m of membersOf(s)) byKey.set(memberKey(m), s)
    }
    return byKey.get(key)
  }

  for (const d of decisions) {
    const keys = keysOf(d)
    const hit = [...new Set(keys.map(containing).filter(Boolean) as Studio[])]
    if (!hit.length) continue
    const ids = new Set(hit.map((s) => s.id))
    const all = hit.flatMap((s) => membersOf(s).map((m) => ({ m, from: s })))
    const added: Studio[] = []
    const single = (m: Member, from: Studio, i: number) =>
      buildStudio([m], i === 0 ? from.id : `${from.id}~${memberKey(m)}`, undefined, 'single')

    if (d.decision === 'reject') {
      // Gruppe auflösen: jeder Eintrag wird wieder ein eigenes Studio
      const touched = hit.filter((s) => membersOf(s).filter((m) => keys.includes(memberKey(m))).length >= 2)
      if (!touched.length) continue
      const tIds = new Set(touched.map((s) => s.id))
      for (const s of touched) membersOf(s).forEach((m, i) => added.push(single(m, s, i)))
      studios = [...studios.filter((s) => !tIds.has(s.id)), ...added]
      byKey = null
      continue
    }

    // confirm: gewählte Einträge (in Reihenfolge der Entscheidung) zu einem Studio
    const chosen = keys.map((k) => all.find((x) => memberKey(x.m) === k)).filter(Boolean) as { m: Member; from: Studio }[]
    if (chosen.length < 2) continue
    const rest = all.filter((x) => !keys.includes(memberKey(x.m)))
    const id = chosen[0].from.id
    added.push(buildStudio(chosen.map((x) => x.m), id, d.fields, 'verified', d.decidedAt))
    // Übrige Einträge betroffener Studios bleiben zusammen (falls ≥ 2) bzw. einzeln
    const byOrigin = new Map<Studio, Member[]>()
    for (const x of rest) byOrigin.set(x.from, [...(byOrigin.get(x.from) ?? []), x.m])
    for (const [from, ms] of byOrigin) {
      const rid = from.id === id ? `${from.id}~rest${++counter}` : from.id
      added.push(ms.length > 1 ? buildStudio(ms, rid, from.fieldChoices, from.matchConfidence) : single(ms[0], { ...from, id: rid }, 0))
    }
    studios = [...studios.filter((s) => !ids.has(s.id)), ...added]
    byKey = null
  }
  const decided = new Set(decisions.flatMap((d) => (keysOf(d).length === 2 ? [keysOf(d).join('~')] : [])))
  const present = new Set(studios.map((s) => s.id))
  return {
    ...ds,
    studios,
    matchCandidates: ds.matchCandidates.filter(
      (c) => !decided.has(c.id) && (!c.urbanSportsClub.studioId || present.has(c.urbanSportsClub.studioId)) && (!c.wellpass.studioId || present.has(c.wellpass.studioId)),
    ),
  }
}
