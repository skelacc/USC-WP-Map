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

export interface ProviderDetail {
  sourceId: string
  source: SourceKind
  name: string
  url: string | null
  /** USC-Mitgliedschaftsstufen, in denen der Standort laut USC nutzbar ist */
  plans: string[] | null
  categories: string[] | null
  fetchedAt: string | null
}

export interface MatchInfo {
  method: 'automatic' | 'manual'
  score: number
  reasons: string[]
  distanceM: number | null
  decidedAt?: string
}

export interface Studio {
  id: string
  name: string
  address: Address
  coordinates: Coordinates | null
  providers: Record<ProviderKey, boolean>
  providerDetails: Partial<Record<ProviderKey, ProviderDetail>>
  website: string | null
  phone: string | null
  categories: string[]
  source: Record<ProviderKey, SourceKind | null>
  lastVerified: string | null
  matchConfidence: MatchConfidence
  match: MatchInfo | null
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
