import { describe, expect, it } from 'vitest'
import type { Studio } from '@/types/studio'
import { categoryOf } from './categories'
import { countByCategory, filterStudios, sortStudios } from './filter'
import { foldText, matchesQuery } from './search'

function studio(id: string, name: string, usc: boolean, wp: boolean, extra: Partial<Studio> = {}): Studio {
  return {
    id,
    name,
    address: { street: 'Musterstraße 1', postalCode: '10115', city: 'Berlin', district: 'Mitte' },
    coordinates: { latitude: 52.52, longitude: 13.4, precision: 'source', from: 'urbanSportsClub' },
    providers: { urbanSportsClub: usc, wellpass: wp },
    providerDetails: {},
    website: null,
    phone: null,
    categories: [],
    source: { urbanSportsClub: usc ? 'official' : null, wellpass: wp ? 'fair-for-fitness' : null },
    lastVerified: '2026-11-03',
    matchConfidence: usc && wp ? 'high' : 'single',
    match: null,
    ...extra,
  }
}

const data = [
  studio('1', 'Beide Gym', true, true),
  studio('2', 'Ürban Yoga', true, false, { address: { street: 'Schönhauser Allee 10', postalCode: '10435', city: 'Berlin', district: 'Pankow' } }),
  studio('3', 'Pass Fitness', false, true, { coordinates: null }),
  studio('4', 'Ahorn Box', true, false, { coordinates: { latitude: 52.4, longitude: 13.2, precision: 'geocoded', from: 'urbanSportsClub' } }),
]

describe('Kategorien und Filter', () => {
  it('ordnet Anbieterkombinationen zu', () => {
    expect(data.map(categoryOf)).toEqual(['both', 'usc', 'wellpass', 'usc'])
  })
  it('filtert einzeln und kombiniert', () => {
    expect(filterStudios(data, { both: true, usc: false, wellpass: false }, '').map((s) => s.id)).toEqual(['1'])
    expect(filterStudios(data, { both: false, usc: true, wellpass: true }, '').map((s) => s.id)).toEqual(['2', '3', '4'])
    expect(filterStudios(data, { both: false, usc: false, wellpass: false }, '')).toEqual([])
  })
  it('zählt je Kategorie', () => {
    expect(countByCategory(data)).toEqual({ both: 1, usc: 2, wellpass: 1 })
  })
})

describe('Suche', () => {
  it('ignoriert Umlaute, Groß-/Kleinschreibung und Straßen-Abkürzungen', () => {
    expect(foldText('Schönhauser Str. 10')).toBe('schoenhauser strasse 10')
    expect(matchesQuery(data[1], 'urban')).toBe(true)
    expect(matchesQuery(data[1], 'schönhauser allee')).toBe(true)
    expect(matchesQuery(data[1], 'pankow')).toBe(true)
    expect(matchesQuery(data[1], '10435')).toBe(true)
    expect(matchesQuery(data[1], 'mitte')).toBe(false)
  })
  it('wendet Suche zusammen mit Filter an', () => {
    expect(filterStudios(data, { both: true, usc: true, wellpass: true }, 'gym').map((s) => s.id)).toEqual(['1'])
  })
})

describe('Sortierung', () => {
  it('alphabetisch (deutsche Sortierung)', () => {
    expect(sortStudios(data, 'name', null).map((s) => s.studio.name)).toEqual(['Ahorn Box', 'Beide Gym', 'Pass Fitness', 'Ürban Yoga'])
  })
  it('nach Entfernung, Studios ohne Koordinaten am Ende', () => {
    const r = sortStudios(data, 'distance', { lat: 52.4, lng: 13.2 })
    expect(r[0].studio.id).toBe('4')
    expect(r[0].distance).toBe(0)
    expect(r.at(-1)!.studio.id).toBe('3')
    expect(r.at(-1)!.distance).toBeNull()
  })
})
