import type { Address } from '@/types/studio'

/** Kurze Ortsangabe für Listen und Vorschaukarten: Straße · Bezirk bzw. Ort · Bundesland. */
export function addressSummary(a: Address | null | undefined): string {
  if (!a) return 'Adresse unbekannt'
  const place = a.city && a.city !== 'Berlin' ? a.city : null
  const parts = [a.street && a.approximate ? `ca. ${a.street}` : a.street, a.district, place, place ? null : a.region]
  const text = parts.filter(Boolean).join(' · ')
  if (text) return text
  return a.city === 'Berlin' ? 'Berlin' : 'Adresse unbekannt'
}
