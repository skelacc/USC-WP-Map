import { describe, expect, it } from 'vitest'
import type { Activity, Studio } from '@/types/studio'
import { categoryOf } from './categories'
import { activityCounts, applyView, minUscPlan } from './plans'

const L = (S: number, M: number, Lv: number, XL: number) => ({ S, M, L: Lv, XL })

function mk(id: string, o: { included?: Partial<Record<'S' | 'M' | 'L' | 'XL', boolean>>; plus?: boolean; acts?: Activity[]; wellpass?: string[] | null; plans?: string[] }): Studio {
  return {
    id,
    name: id,
    address: { street: null, postalCode: null, city: 'Berlin', district: null },
    coordinates: null,
    providers: { urbanSportsClub: !!o.included || !!o.plans, wellpass: !!o.wellpass },
    providerDetails: {
      ...(o.included || o.plans
        ? { urbanSportsClub: { sourceId: id, source: 'official', name: id, url: null, plans: o.plans ?? null, categories: null, fetchedAt: null, planIncluded: o.included, plus: o.plus ?? false, activities: o.acts ?? [] } }
        : {}),
      ...(o.wellpass ? { wellpass: { sourceId: id, source: 'official', name: id, url: null, plans: null, categories: null, fetchedAt: null, activities: o.wellpass.map((name) => ({ name, limits: null })) } } : {}),
    },
    website: null,
    phone: null,
    categories: [],
    source: { urbanSportsClub: 'official', wellpass: null },
    lastVerified: null,
    matchConfidence: 'single',
    match: null,
  } as Studio
}

const all = { S: true, M: true, L: true, XL: true }
const fromL = { S: false, M: false, L: true, XL: true }
const data = [
  // Yoga mit M, Massage erst ab L
  mk('yoga-m', { included: all, acts: [{ name: 'Yoga', limits: L(4, 8, -1, -1) }, { name: 'Massage', limits: L(0, 0, 1, 2) }] }),
  // Massage mit M möglich
  mk('massage-m', { included: all, acts: [{ name: 'Massage', limits: L(0, 2, 4, 8) }] }),
  // Plus-Studio ab L
  mk('plus-l', { included: fromL, plus: true, acts: [{ name: 'Massage', limits: L(0, 0, 1, 2) }] }),
  // Plus-Studio, mit Wellpass
  mk('plus-wp', { included: all, plus: true, acts: [{ name: 'Fitness', limits: L(8, -1, -1, -1) }], wellpass: ['Fitness'] }),
  // ältere Daten ohne Details
  mk('legacy', { plans: ['Premium', 'Max'] }),
]

describe('USC-Stufe, Plus und Aktivitäten', () => {
  it('Standard (M, ohne Plus): Plus- und L-Studios fallen weg, Plus+Wellpass wird „Nur Wellpass“', () => {
    const r = applyView(data, { plan: 'Classic', showPlus: false, activities: [] })
    expect(r.map((s) => s.id)).toEqual(['yoga-m', 'massage-m', 'plus-wp'])
    const pw = r.find((s) => s.id === 'plus-wp')!
    expect(categoryOf(pw)).toBe('wellpass')
    expect(pw.uscExcluded).toBe('plus')
  })
  it('Massage mit M: nur Studios, in denen Massage für M ein Limit > 0 hat', () => {
    const r = applyView(data, { plan: 'Classic', showPlus: false, activities: ['Massage'] })
    expect(r.map((s) => s.id)).toEqual(['massage-m'])
  })
  it('Massage mit L und Plus', () => {
    const r = applyView(data, { plan: 'Premium', showPlus: true, activities: ['Massage'] })
    expect(r.map((s) => s.id).sort()).toEqual(['massage-m', 'plus-l', 'yoga-m'])
  })
  it('Studios ohne Detaildaten nutzen die Stufenliste', () => {
    expect(applyView(data, { plan: 'Premium', showPlus: false, activities: [] }).some((s) => s.id === 'legacy')).toBe(true)
    expect(applyView(data, { plan: 'Classic', showPlus: false, activities: [] }).some((s) => s.id === 'legacy')).toBe(false)
  })
  it('zählt Aktivitäten unter Stufe und Plus', () => {
    const c = activityCounts(data, 'Classic', false)
    expect(c.get('Massage')).toBe(1)
    expect(c.get('Yoga')).toBe(1)
    expect(c.get('Fitness')).toBe(1) // nur über Wellpass
  })
  it('ermittelt die kleinste Stufe', () => {
    expect(minUscPlan(data[2])?.size).toBe('L')
    expect(minUscPlan(data[4])?.size).toBe('L')
  })
})
