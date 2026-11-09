import { describe, expect, it } from 'vitest'
import type { Dataset, ProviderDetail } from '@/types/studio'
import { applyDecisions, buildStudio, decisionFor, membersOf, singleFromDetail, upsertDecision } from './merges'

const det = (p: 'urbanSportsClub' | 'wellpass', id: string, name: string, street: string, pc: string | null, act = 'Yoga'): ProviderDetail => ({
  sourceId: id,
  source: 'official',
  key: `${p}:official:${id}`,
  name,
  url: null,
  address: { street, postalCode: pc, city: 'Berlin', district: null },
  coordinates: { latitude: 52.5, longitude: 13.4, precision: 'source' },
  website: p === 'wellpass' ? 'https://wp.example' : null,
  plans: null,
  categories: null,
  activities: [{ name: act, limits: null }],
  fetchedAt: '2026-11-09T00:00:00Z',
})

const u1 = det('urbanSportsClub', '1', 'Motions – Tanzen', 'Tempelhofer Ufer 36', null, 'Tanzen')
const u2 = det('urbanSportsClub', '2', 'Motions – Fitness', 'Tempelhofer Ufer 36', null, 'Fitness')
const u3 = det('urbanSportsClub', '3', 'Motions – Booty', 'Tempelhofer Ufer 36', null, 'Fitness')
const w1 = det('wellpass', 'a', 'Motions Gleisdreieck', 'Tempelhofer Ufer 36', '10963', 'Pilates')
const w2 = det('wellpass', 'b', 'Anderes', 'Weg 2', '10115')

const ds = (studios = [
  singleFromDetail('urbanSportsClub', u1, 'usc-1'),
  singleFromDetail('urbanSportsClub', u2, 'usc-2'),
  singleFromDetail('urbanSportsClub', u3, 'usc-3'),
  singleFromDetail('wellpass', w1, 'wp-a'),
  singleFromDetail('wellpass', w2, 'wp-b'),
]): Dataset => ({ schemaVersion: 1, generatedAt: '', studios, matchCandidates: [], rejectedPairs: [], sources: [] })

describe('Zusammenführen beliebig vieler Einträge', () => {
  it('drei USC-Einträge + ein Wellpass-Eintrag werden ein Studio', () => {
    const d = decisionFor([u1.key!, u2.key!, u3.key!, w1.key!], 'confirm', { name: { custom: 'Motions Gleisdreieck' }, address: w1.key })
    const r = applyDecisions(ds(), [d])
    expect(r.studios).toHaveLength(2)
    const m = r.studios.find((s) => s.id === 'usc-1')!
    expect(m.name).toBe('Motions Gleisdreieck')
    expect(m.address.postalCode).toBe('10963')
    expect(m.providers).toEqual({ urbanSportsClub: true, wellpass: true })
    expect(membersOf(m)).toHaveLength(4)
    expect(m.extraMembers).toHaveLength(2)
    expect(m.activities).toEqual(['Fitness', 'Pilates', 'Tanzen'])
  })
  it('funktioniert auch nur innerhalb eines Anbieters', () => {
    const r = applyDecisions(ds(), [decisionFor([u1.key!, u2.key!], 'confirm')])
    const m = r.studios.find((s) => s.id === 'usc-1')!
    expect(m.providers).toEqual({ urbanSportsClub: true, wellpass: false })
    expect(membersOf(m).map((x) => x.detail.sourceId)).toEqual(['1', '2'])
    expect(r.studios).toHaveLength(4)
  })
  it('weitere Einträge später hinzufügen, idempotent, wieder trennen', () => {
    const a = decisionFor([u1.key!, w1.key!], 'confirm')
    const b = decisionFor([u1.key!, w1.key!, u2.key!], 'confirm')
    const list = upsertDecision([a], b)
    expect(list).toHaveLength(1) // b umfasst a
    const once = applyDecisions(ds(), list)
    expect(applyDecisions(once, list).studios).toHaveLength(once.studios.length)
    expect(membersOf(once.studios.find((s) => s.id === 'usc-1')!)).toHaveLength(3)
    const split = applyDecisions(once, [decisionFor([u1.key!, w1.key!, u2.key!], 'reject')])
    expect(split.studios).toHaveLength(5)
  })
  it('alte Paar-Entscheidungen (USC~Wellpass) gelten weiter', () => {
    const r = applyDecisions(ds(), [{ pair: `${u1.key}~${w1.key}`, decision: 'confirm', fields: { name: 'wellpass', address: 'wellpass' }, decidedAt: '' }])
    const m = r.studios.find((s) => s.id === 'usc-1')!
    expect(m.name).toBe('Motions Gleisdreieck')
    expect(m.address.postalCode).toBe('10963')
  })
  it('trennt eine automatische Zusammenführung bei Umentscheidung', () => {
    const auto = ds([buildStudio([{ provider: 'urbanSportsClub', detail: u1 }, { provider: 'wellpass', detail: w1 }], 'usc-1', {}, 'high'), singleFromDetail('wellpass', w2, 'wp-b')])
    const r = applyDecisions(auto, [decisionFor([u1.key!, w2.key!], 'confirm')])
    expect(r.studios).toHaveLength(2)
    expect(r.studios.find((s) => s.id === 'usc-1')!.providerDetails.wellpass!.sourceId).toBe('b')
    expect(r.studios.some((s) => s.providerDetails.wellpass?.sourceId === 'a' && !s.providers.urbanSportsClub)).toBe(true)
  })
  it('ignoriert Entscheidungen zu nicht vorhandenen Einträgen', () => {
    expect(applyDecisions(ds(), [decisionFor(['x', 'y'], 'confirm')]).studios).toHaveLength(5)
  })
})
