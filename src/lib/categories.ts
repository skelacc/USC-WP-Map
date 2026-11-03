import type { Category, Studio } from '@/types/studio'

export const CATEGORIES: Category[] = ['both', 'usc', 'wellpass']

export const CATEGORY_META: Record<Category, { label: string; short: string; color: string }> = {
  usc: { label: 'Nur Urban Sports Club', short: 'Nur USC', color: '#2563eb' },
  wellpass: { label: 'Nur Wellpass', short: 'Nur Wellpass', color: '#ea580c' },
  both: { label: 'Beide Anbieter', short: 'Beide', color: '#059669' },
}

export function categoryOf(s: Studio): Category {
  const u = s.providers.urbanSportsClub
  const w = s.providers.wellpass
  if (u && w) return 'both'
  return u ? 'usc' : 'wellpass'
}

export const SOURCE_LABEL: Record<string, string> = {
  official: 'Offizielle Anbieter-Website',
  'fair-for-fitness': 'Fair for Fitness (Drittquelle)',
  manual: 'Manueller Import',
}

/** Paar-ID einer Zusammenführung (wie in scripts/studiomap/merge.py: pair_id). */
export function pairIdOf(studio: Studio): string | null {
  const u = studio.providerDetails.urbanSportsClub
  const w = studio.providerDetails.wellpass
  if (!u || !w) return null
  return `urbanSportsClub:${u.source}:${u.sourceId}~wellpass:${w.source}:${w.sourceId}`
}
