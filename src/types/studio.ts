/** Datenmodell – entspricht der Ausgabe von scripts/studiomap/merge.py. */

export type ProviderKey = 'urbanSportsClub' | 'wellpass'
export type Category = 'both' | 'usc' | 'wellpass'

/** official = Anbieter-Website, fair-for-fitness = Drittquelle, manual = eigene Importdatei */
export type SourceKind = 'official' | 'fair-for-fitness' | 'manual'

/** verified = manuell bestätigt, high = automatisch sicher zugeordnet, single = nur ein Anbieter */
export type MatchConfidence = 'verified' | 'high' | 'single'

export interface Address {
  street: string | null
  postalCode: string | null
  city: string | null
  district: string | null
}

export interface Coordinates {
  latitude: number
  longitude: number
  /** source = aus der Datenquelle, geocoded = per Adresse ermittelt (ungefähr) */
  precision: 'source' | 'geocoded'
  from: ProviderKey
}

export type PlanSize = 'S' | 'M' | 'L' | 'XL'

/** Aktivität eines Anbieters. limits (nur USC): Check-ins pro Monat je Stufe,
 *  -1 = unbegrenzt, 0 = in dieser Stufe nicht verfügbar; null = unbekannt. */
export interface Activity {
  name: string
  limits: Record<PlanSize, number> | null
}

export interface ProviderDetail {
  sourceId: string
  source: SourceKind
  /** provider:source:sourceId – Schlüssel für Zusammenführungen */
  key?: string
  name: string
  url: string | null
  address?: Address
  coordinates?: Omit<Coordinates, 'from'> | null
  website?: string | null
  phone?: string | null
  /** USC-Mitgliedschaftsstufen, in denen der Standort laut USC nutzbar ist */
  plans: string[] | null
  categories: string[] | null
  activities?: Activity[]
  /** USC: Standort in Stufe enthalten */
  planIncluded?: Partial<Record<PlanSize, boolean>>
  /** USC: als „Plus“ gekennzeichnet (Plus-Check-in nötig) */
  plus?: boolean | null
  rating?: number | null
  ratingCount?: number | null
  /** USC: Besuche pro Monat je Stufe (-1 unbegrenzt, 0 nicht enthalten) */
  visitLimits?: Partial<Record<PlanSize, number | null>> | null
  fetchedAt: string | null
  detailsFetchedAt?: string | null
}

/** Ein Eintrag eines Anbieters, der zu einem Studio gehört. */
export interface Member {
  provider: ProviderKey
  detail: ProviderDetail
}

/** Gewählte Quelle je Feld: Schlüssel eines Eintrags (provider:source:id),
 *  ältere Form: Anbieter („urbanSportsClub“/„wellpass“) – oder eigener Text. */
export type FieldChoice = string | { custom: string }
export interface FieldChoices {
  name?: FieldChoice
  address?: string
  coordinates?: string
  website?: FieldChoice
}

export interface MatchInfo {
  method: 'automatic' | 'manual'
  score: number
  reasons: string[]
  distanceM: number | null
  decidedAt?: string
  fields?: FieldChoices
}

export interface Studio {
  id: string
  name: string
  address: Address
  coordinates: Coordinates | null
  providers: Record<ProviderKey, boolean>
  /** erster Eintrag je Anbieter */
  providerDetails: Partial<Record<ProviderKey, ProviderDetail>>
  /** weitere Einträge (z. B. mehrere USC-Angebote einer Einrichtung) */
  extraMembers?: Member[]
  website: string | null
  phone: string | null
  categories: string[]
  /** einheitliche Aktivitätsnamen beider Anbieter */
  activities?: string[]
  source: Record<ProviderKey, SourceKind | null>
  lastVerified: string | null
  matchConfidence: MatchConfidence
  match: MatchInfo | null
  /** bei manueller Zusammenführung: gewählte Quelle je Feld */
  fieldChoices?: FieldChoices
  // Erweiterungen (Phase 4) können hier optional ergänzt werden:
  // openingHours?, images?, amenities?, courses? …
}

export interface MatchCandidate {
  id: string
  status: 'pending'
  score: number
  distanceM: number | null
  nameSimilarity: number
  addressMatch: 'exact' | 'different' | 'unknown'
  reasons: string[]
  urbanSportsClub: { key: string; name: string; street: string | null; district: string | null; studioId: string | null }
  wellpass: { key: string; name: string; street: string | null; postalCode: string | null; studioId: string | null }
}

export interface SourceMeta {
  id: string
  provider: ProviderKey | null
  label: string
  url: string | null
  kind: SourceKind
  note: string
  fetchedAt?: string
  count?: number
  status?: string
}

export interface Dataset {
  schemaVersion: number
  generatedAt: string
  studios: Studio[]
  matchCandidates: MatchCandidate[]
  rejectedPairs: string[]
  sources: SourceMeta[]
}
