import type { Activity, PlanSize, ProviderDetail, Studio } from '@/types/studio'
import { membersOfProvider } from './merges'

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

function detailIncluded(d: ProviderDetail, size: PlanSize): boolean | null {
  if (d.planIncluded && size in d.planIncluded) return !!d.planIncluded[size]
  if (d.plans?.length) {
    const id = USC_PLANS.find((p) => p.size === size)!.id
    return d.plans.includes(id)
  }
  return null
}

/** Ist (mindestens ein USC-Eintrag des) Studios in Stufe size enthalten? null = unbekannt. */
export function uscIncluded(s: Studio, size: PlanSize): boolean | null {
  const ds = membersOfProvider(s, 'urbanSportsClub')
  if (!ds.length) return false
  const vals = ds.map((d) => detailIncluded(d, size))
  if (vals.some((v) => v === true)) return true
  if (vals.every((v) => v === false)) return false
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

/** USC-Einträge, die mit Stufe und Plus-Einstellung nutzbar sind. */
function usableUsc(s: Studio, size: PlanSize | null, showPlus: boolean): ProviderDetail[] {
  return membersOfProvider(s, 'urbanSportsClub').filter((d) => (!size || detailIncluded(d, size) !== false) && (showPlus || !d.plus))
}

function uscActivities(d: ProviderDetail): Activity[] {
  return d.activities ?? (d.categories ?? []).map((name) => ({ name, limits: null }))
}

function activityAvailable(a: Activity, size: PlanSize | null): boolean {
  return a.limits === null || (size ? a.limits[size] !== 0 : Object.values(a.limits).some((v) => v !== 0))
}

/** Warum USC (nicht) zählt – ohne Aktivitätsfilter. */
function uscExclusion(s: Studio, size: PlanSize | null, showPlus: boolean): UscExclusion | null {
  const all = membersOfProvider(s, 'urbanSportsClub')
  if (!all.length || usableUsc(s, size, showPlus).length) return null
  return size && all.every((d) => detailIncluded(d, size) === false) ? 'plan' : 'plus'
}

/** Aktivitäten eines Studios, die unter Stufe + Plus verfügbar sind (beide Anbieter). */
export function availableActivities(s: Studio, size: PlanSize | null, showPlus: boolean): Set<string> {
  const names = new Set<string>()
  for (const d of usableUsc(s, size, showPlus)) for (const a of uscActivities(d)) if (activityAvailable(a, size)) names.add(a.name)
  for (const d of membersOfProvider(s, 'wellpass')) for (const a of d.activities ?? []) names.add(a.name)
  return names
}

/**
 * Wendet USC-Stufe und Plus-Einstellung an: Zählt USC für ein Studio nicht,
 * erscheint es als „Nur Wellpass“ (falls vorhanden) oder wird ausgeblendet.
 * Der Aktivitätsfilter ändert die Anbieter nicht: Ein Studio passt, wenn
 * einer seiner (nutzbaren) Anbieter die Aktivität hat – grüne Studios bleiben grün.
 */
export function applyView(studios: Studio[], o: ViewOptions): ViewStudio[] {
  const size = planSize(o.plan)
  const out: ViewStudio[] = []
  for (const s of studios) {
    let usc = s.providers.urbanSportsClub
    const reason = usc ? uscExclusion(s, size, o.showPlus) : null
    if (reason) usc = false
    const wp = s.providers.wellpass
    if (!usc && !wp) continue
    if (o.activities.length) {
      const view = usc === s.providers.urbanSportsClub ? s : { ...s, providers: { urbanSportsClub: usc, wellpass: wp } }
      const acts = availableActivities(view, size, o.showPlus)
      if (!o.activities.some((a) => acts.has(a))) continue
    }
    if (usc === s.providers.urbanSportsClub) out.push(s)
    else out.push({ ...s, providers: { urbanSportsClub: usc, wellpass: wp }, uscExcluded: reason ?? undefined })
  }
  return out
}

/** Anzahl Studios je Aktivität unter Stufe + Plus-Einstellung (für die Auswahl). */
export function activityCounts(studios: Studio[], plan: UscPlan, showPlus: boolean): Map<string, number> {
  const size = planSize(plan)
  const counts = new Map<string, number>()
  for (const s of studios) for (const n of availableActivities(s, size, showPlus)) counts.set(n, (counts.get(n) ?? 0) + 1)
  return counts
}
