import { describe, expect, it } from 'vitest'
import type { Dataset, ProviderDetail } from '@/types/studio'
import { applyDecisions, mergedStudio, singleFromDetail } from './merges'

const det = (p: 'urbanSportsClub' | 'wellpass', id: string, name: string, street: string, pc: string | null): ProviderDetail => ({
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
  activities: [{ name: p === 'wellpass' ? 'Fitness' : 'Yoga', limits: null }],
  fetchedAt: '2026-11-09T00:00:00Z',
})

const u1 = det('urbanSportsClub', '1', 'Studio Eins', 'Torstraße 1', null)
const w1 = det('wellpass', 'a', 'Studio 1 GmbH', 'Torstr. 1', '10119')
const w2 = det('wellpass', 'b', 'Anderes', 'Weg 2', '10115')

const ds = (studios = [singleFromDetail('urbanSportsClub', u1, 'usc-1'), singleFromDetail('wellpass', w1, 'wp-a'), singleFromDetail('wellpass', w2, 'wp-b')]): Dataset => ({
  schemaVersion: 1,
  generatedAt: '',
  studios,
  matchCandidates: [],
  rejectedPairs: [],
  sources: [],
})

describe('eigene Zusammenführungen', () => {
  it('führt zwei Einzelstudios mit gewählten Angaben zusammen', () => {
    const r = applyDecisions(ds(), [
      { pair: `${u1.key}~${w1.key}`, decision: 'confirm', fields: { name: { custom: 'Mein Studio' }, address: 'wellpass' }, decidedAt: '' },
    ])
    expect(r.studios).toHaveLength(2)
    const m = r.studios.find((s) => s.id === 'usc-1')!
    expect(m.name).toBe('Mein Studio')
    expect(m.address.postalCode).toBe('10119')
    expect(m.providers).toEqual({ urbanSportsClub: true, wellpass: true })
    expect(m.matchConfidence).toBe('verified')
    expect(m.activities).toEqual(['Fitness', 'Yoga'])
  })
  it('ist idempotent und lässt sich wieder trennen', () => {
    const conf = { pair: `${u1.key}~${w1.key}`, decision: 'confirm' as const, decidedAt: '' }
    const once = applyDecisions(ds(), [conf])
    expect(applyDecisions(once, [conf]).studios).toHaveLength(2)
    const split = applyDecisions(once, [{ ...conf, decision: 'reject' }])
    expect(split.studios).toHaveLength(3)
  })
  it('trennt eine automatische Zusammenführung bei Umentscheidung', () => {
    const auto = ds([mergedStudio('usc-1', u1, w1), singleFromDetail('wellpass', w2, 'wp-b')])
    const r = applyDecisions(auto, [{ pair: `${u1.key}~${w2.key}`, decision: 'confirm', decidedAt: '' }])
    expect(r.studios).toHaveLength(2)
    expect(r.studios.find((s) => s.id === 'usc-1')!.providerDetails.wellpass!.sourceId).toBe('b')
    expect(r.studios.some((s) => s.providerDetails.wellpass?.sourceId === 'a' && !s.providers.urbanSportsClub)).toBe(true)
  })
  it('ignoriert Entscheidungen zu nicht (mehr) vorhandenen Studios', () => {
    expect(applyDecisions(ds(), [{ pair: 'x~y', decision: 'confirm', decidedAt: '' }]).studios).toHaveLength(3)
  })
})
