import type { Studio } from '@/types/studio'

/** USC-Mitgliedschaften (Kürzel S/M/L/XL wie in der USC-App). Höhere Stufen enthalten die niedrigeren. */
export const USC_PLANS = [
  { id: 'Essential', size: 'S' },
  { id: 'Classic', size: 'M' },
  { id: 'Premium', size: 'L' },
  { id: 'Max', size: 'XL' },
] as const

export type UscPlan = (typeof USC_PLANS)[number]['id'] | 'all'

export const DEFAULT_USC_PLAN: UscPlan = 'Classic'

export function planLabel(p: UscPlan): string {
  if (p === 'all') return 'alle Stufen'
  const meta = USC_PLANS.find((x) => x.id === p)!
  return `${meta.size} (${meta.id})`
}

/** Kleinste Stufe, in der ein Studio laut USC nutzbar ist – oder null, wenn unbekannt. */
export function minUscPlan(s: Studio): (typeof USC_PLANS)[number] | null {
  const plans = s.providerDetails.urbanSportsClub?.plans
  if (!plans?.length) return null
  return USC_PLANS.find((p) => plans.includes(p.id)) ?? null
}

export type ViewStudio = Studio & { uscNotInPlan?: boolean }

/**
 * Wendet die gewählte USC-Mitgliedschaft an: Ist ein Studio mit dieser Stufe
 * nicht nutzbar, zählt USC für dieses Studio nicht. Studios ohne weiteren
 * Anbieter fallen weg, Studios mit Wellpass erscheinen als „Nur Wellpass“.
 * Studios ohne Stufenangabe (z. B. manuell importiert) bleiben unverändert.
 */
export function applyUscPlan(studios: Studio[], plan: UscPlan): ViewStudio[] {
  if (plan === 'all') return studios
  const out: ViewStudio[] = []
  for (const s of studios) {
    const plans = s.providerDetails.urbanSportsClub?.plans
    if (!s.providers.urbanSportsClub || !plans?.length || plans.includes(plan)) {
      out.push(s)
    } else if (s.providers.wellpass) {
      out.push({ ...s, providers: { ...s.providers, urbanSportsClub: false }, uscNotInPlan: true })
    }
  }
  return out
}
