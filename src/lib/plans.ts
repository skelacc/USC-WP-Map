import type { Activity, PlanSize, Studio } from '@/types/studio'

/** USC-Mitgliedschaften (Kürzel S/M/L/XL wie in der USC-App). */
export const USC_PLANS = [
  { id: 'Essential', size: 'S' },
  { id: 'Classic', size: 'M' },
  { id: 'Premium', size: 'L' },
  { id: 'Max', size: 'XL' },
] as const satisfies readonly { id: string; size: PlanSize }[]

export type UscPlan = (typeof USC_PLANS)[number]['id'] | 'all'

export const DEFAULT_USC_PLAN: UscPlan = 'Classic'

export function planSize(p: UscPlan): PlanSize | null {
  return p === 'all' ? null : USC_PLANS.find((x) => x.id === p)!.size
}

export function planLabel(p: UscPlan): string {
  if (p === 'all') return 'alle Stufen'
  const meta = USC_PLANS.find((x) => x.id === p)!
  return `${meta.size} (${meta.id})`
}

/** Ist der Standort in Stufe size enthalten? null = unbekannt. */
export function uscIncluded(s: Studio, size: PlanSize): boolean | null {
  const d = s.providerDetails.urbanSportsClub
  if (!d) return false
  if (d.planIncluded && size in d.planIncluded) return !!d.planIncluded[size]
  if (d.plans?.length) {
    const id = USC_PLANS.find((p) => p.size === size)!.id
    return d.plans.includes(id)
  }
  return null
}

/** Kleinste Stufe, in der ein Studio laut USC nutzbar ist – oder null, wenn unbekannt. */
export function minUscPlan(s: Studio): (typeof USC_PLANS)[number] | null {
  for (const p of USC_PLANS) if (uscIncluded(s, p.size)) return p
  return null
}

/** Kleinste Stufe, in der eine USC-Aktivität verfügbar ist. */
export function minActivityPlan(a: Activity): (typeof USC_PLANS)[number] | null {
  if (!a.limits) return null
  return USC_PLANS.find((p) => a.limits![p.size] !== 0) ?? null
}

export function formatLimit(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'unbekannt'
  if (v < 0) return 'unbegrenzt'
  if (v === 0) return 'nicht enthalten'
  return `${v}× / Monat`
}

export interface ViewOptions {
  plan: UscPlan
  showPlus: boolean
  activities: string[]
}

/** Grund, warum USC für ein Studio unter den gewählten Filtern nicht zählt. */
export type UscExclusion = 'plan' | 'plus' | 'activity'

export type ViewStudio = Studio & { uscExcluded?: UscExclusion }

function uscActivityOk(s: Studio, size: PlanSize | null, wanted: string[]): boolean {
  const d = s.providerDetails.urbanSportsClub
  const acts = d?.activities ?? (d?.categories ?? []).map((name) => ({ name, limits: null }))
  return acts.some(
    (a) => wanted.includes(a.name) && (a.limits === null || (size ? a.limits[size] !== 0 : Object.values(a.limits).some((v) => v !== 0))),
  )
}

function wellpassActivityOk(s: Studio, wanted: string[]): boolean {
  const d = s.providerDetails.wellpass
  const acts = d?.activities?.map((a) => a.name) ?? []
  return acts.some((a) => wanted.includes(a))
}

/** Warum USC (nicht) zählt – ohne Aktivitätsfilter. */
function uscBaseExclusion(s: Studio, size: PlanSize | null, showPlus: boolean): UscExclusion | null {
  const d = s.providerDetails.urbanSportsClub
  if (size && uscIncluded(s, size) === false) return 'plan'
  if (!showPlus && d?.plus) return 'plus'
  return null
}

/**
 * Wendet USC-Stufe, Plus-Einstellung und Aktivitätsfilter an. Zählt USC für
 * ein Studio nicht, erscheint es als „Nur Wellpass“ (falls vorhanden) oder
 * wird ausgeblendet. Studios ohne Angaben (z. B. manuell) bleiben sichtbar.
 */
export function applyView(studios: Studio[], o: ViewOptions): ViewStudio[] {
  const size = planSize(o.plan)
  const filterActs = o.activities.length > 0
  const out: ViewStudio[] = []
  for (const s of studios) {
    let usc = s.providers.urbanSportsClub
    let reason: UscExclusion | undefined
    if (usc) {
      const base = uscBaseExclusion(s, size, o.showPlus)
      if (base) reason = base
      else if (filterActs && !uscActivityOk(s, size, o.activities)) reason = 'activity'
      if (reason) usc = false
    }
    const wp = s.providers.wellpass && (!filterActs || wellpassActivityOk(s, o.activities))
    if (!usc && !wp) continue
    if (usc === s.providers.urbanSportsClub && wp === s.providers.wellpass) out.push(s)
    else out.push({ ...s, providers: { urbanSportsClub: usc, wellpass: wp }, uscExcluded: reason })
  }
  return out
}

/** Anzahl Studios je Aktivität unter Stufe + Plus-Einstellung (für die Auswahl). */
export function activityCounts(studios: Studio[], plan: UscPlan, showPlus: boolean): Map<string, number> {
  const size = planSize(plan)
  const counts = new Map<string, number>()
  for (const s of studios) {
    const names = new Set<string>()
    const u = s.providerDetails.urbanSportsClub
    if (u && !uscBaseExclusion(s, size, showPlus)) {
      const acts = u.activities ?? (u.categories ?? []).map((name) => ({ name, limits: null }))
      for (const a of acts) if (a.limits === null || (size ? a.limits[size] !== 0 : true)) names.add(a.name)
    }
    for (const a of s.providerDetails.wellpass?.activities ?? []) names.add(a.name)
    for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  return counts
}
