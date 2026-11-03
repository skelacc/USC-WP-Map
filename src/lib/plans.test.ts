import { describe, expect, it } from 'vitest'
import type { Studio } from '@/types/studio'
import { categoryOf } from './categories'
import { applyUscPlan, minUscPlan } from './plans'

const mk = (id: string, plans: string[] | null, wellpass: boolean): Studio =>
  ({
    id,
    name: id,
    address: { street: null, postalCode: null, city: 'Berlin', district: null },
    coordinates: null,
    providers: { urbanSportsClub: true, wellpass },
    providerDetails: { urbanSportsClub: { sourceId: id, source: 'official', name: id, url: null, plans, categories: null, fetchedAt: null } },
    website: null,
    phone: null,
    categories: [],
    source: { urbanSportsClub: 'official', wellpass: wellpass ? 'official' : null },
    lastVerified: null,
    matchConfidence: 'single',
    match: null,
  }) as Studio

const data = [
  mk('m', ['Classic', 'Premium', 'Max'], false),
  mk('xl', ['Max'], false),
  mk('xl-wp', ['Max'], true),
  mk('unknown', null, false),
]

describe('USC-Mitgliedschaft', () => {
  it('blendet Studios höherer Stufen aus bzw. stuft sie auf Wellpass zurück', () => {
    const r = applyUscPlan(data, 'Classic')
    expect(r.map((s) => s.id)).toEqual(['m', 'xl-wp', 'unknown'])
    const xlwp = r.find((s) => s.id === 'xl-wp')!
    expect(categoryOf(xlwp)).toBe('wellpass')
    expect(xlwp.uscNotInPlan).toBe(true)
  })
  it('zeigt mit „Alle Stufen“ bzw. Max alles', () => {
    expect(applyUscPlan(data, 'all')).toHaveLength(4)
    expect(applyUscPlan(data, 'Max')).toHaveLength(4)
  })
  it('ermittelt die kleinste Stufe', () => {
    expect(minUscPlan(data[0])?.size).toBe('M')
    expect(minUscPlan(data[3])).toBeNull()
  })
})
