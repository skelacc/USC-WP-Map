import { describe, expect, it } from 'vitest'
import type { TileIndex } from '@/types/studio'
import { boundsIntersect, cellsInBounds, coreBounds, expandTile, inBounds } from './tiles'

const index: TileIndex = {
  schemaVersion: 1,
  generatedAt: '2026-11-09T20:00:00Z',
  fetchedAt: '2026-11-09T19:35:35Z',
  cellDeg: 1,
  coreBounds: [52.3, 52.72, 12.95, 13.85],
  urlBase: 'https://de.egym-wellpass.com/de-de/gym-finder/',
  activities: ['Yoga', 'Fitness'],
  types: ['Yogastudio'],
  regions: { BY: 'Bayern' },
  total: 2,
  cells: { '48_11': 1, '53_9': 1 },
}

describe('Kacheln', () => {
  it('baut vollständige Studios aus der Kurzform', () => {
    const [s] = expandTile([{ i: '42', n: 'Yoga Bad Tölz', c: [47.76, 11.56], s: 'badtoelz-yoga', o: 'Bad Tölz', r: 'BY', t: 0, a: [0, 1], p: 1 }], index)
    expect(s.id).toBe('wp-42')
    expect(s.providers).toEqual({ urbanSportsClub: false, wellpass: true })
    expect(s.address).toMatchObject({ city: 'Bad Tölz', region: 'Bayern', street: null })
    expect(s.activities).toEqual(['Yoga', 'Fitness'])
    expect(s.categories).toEqual(['Yogastudio'])
    const d = s.providerDetails.wellpass!
    expect(d.key).toBe('wellpass:official:42')
    expect(d.url).toBe('https://de.egym-wellpass.com/de-de/gym-finder/badtoelz-yoga')
    expect(d.plus1).toBe(true)
    expect(d.activities).toEqual([{ name: 'Yoga', limits: null }, { name: 'Fitness', limits: null }])
    expect(s.lastVerified).toBe('2026-11-09')
  })
  it('übernimmt ungefähre Adressen', () => {
    const [s] = expandTile([{ i: '7', n: 'X', c: [48.1, 11.5], s: 'x', st: 'Marienplatz 1', z: '80331', d: 'Altstadt', x: 1 }], index)
    expect(s.address).toMatchObject({ street: 'Marienplatz 1', postalCode: '80331', district: 'Altstadt', approximate: true })
  })
  it('findet nur Kacheln mit Daten im Ausschnitt', () => {
    expect(cellsInBounds(index, { south: 47.5, north: 48.5, west: 10.5, east: 11.9 })).toEqual(['48_11'])
    expect(cellsInBounds(index, { south: 47, north: 54, west: 5, east: 15 }).sort()).toEqual(['48_11', '53_9'])
    expect(cellsInBounds(index, { south: 52.4, north: 52.6, west: 13.2, east: 13.6 })).toEqual([])
  })
  it('Ausschnitt-Prüfungen', () => {
    const [s] = expandTile([{ i: '1', n: 'X', c: [48.1, 11.5], s: 'x' }], index)
    expect(inBounds(s, { south: 48, north: 48.2, west: 11.4, east: 11.6 })).toBe(true)
    expect(inBounds(s, { south: 52, north: 53, west: 13, east: 14 })).toBe(false)
    expect(boundsIntersect({ south: 52.5, north: 52.6, west: 13.3, east: 13.4 }, coreBounds(index))).toBe(true)
    expect(boundsIntersect({ south: 48, north: 48.2, west: 11.4, east: 11.6 }, coreBounds(index))).toBe(false)
  })
})
