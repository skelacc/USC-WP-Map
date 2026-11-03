import { describe, expect, it } from 'vitest'
import type { Studio } from '@/types/studio'
import { editDistance, searchScore } from './search'

const mk = (name: string, street = 'Musterstraße 1', district = 'Mitte'): Studio =>
  ({
    id: name,
    name,
    address: { street, postalCode: '10115', city: 'Berlin', district },
    coordinates: null,
    providers: { urbanSportsClub: true, wellpass: false },
    providerDetails: {},
    website: null,
    phone: null,
    categories: [],
    source: { urbanSportsClub: 'official', wellpass: null },
    lastVerified: null,
    matchConfidence: 'single',
    match: null,
  }) as Studio

const holmes = mk('Holmes Place Gendarmenmarkt', 'Friedrichstraße 68')
const speed = mk('SPEED.FIT Mitte – Bahnhof Friedrichstraße')
const ride = mk('ride.bln - studio prenzlauer berg', 'Kastanienallee 1', 'Pankow')
const schoene = mk('Yoga Schöneberg', 'Hauptstraße 5', 'Tempelhof-Schöneberg')

describe('editDistance', () => {
  it('zählt Ersetzen, Einfügen, Löschen und Vertauschen als je 1', () => {
    expect(editDistance('holmes', 'holmes')).toBe(0)
    expect(editDistance('holmes', 'hplmes')).toBe(1)
    expect(editDistance('holmes', 'holms')).toBe(1)
    expect(editDistance('holmes', 'hoolmes')).toBe(1)
    expect(editDistance('holmes', 'hloems')).toBe(2)
    expect(editDistance('holmes', 'hloems', 1)).toBe(2)
    expect(editDistance('ab', 'ba')).toBe(1)
  })
})

describe('fehlertolerante Suche', () => {
  it('findet exakte Teilstrings', () => {
    expect(searchScore(holmes, 'holmes')).toBeGreaterThan(0.9)
    expect(searchScore(holmes, 'gendarm')).toBeGreaterThan(0)
  })
  it('toleriert Tippfehler, fehlende und vertauschte Buchstaben', () => {
    expect(searchScore(holmes, 'holmse')).toBeGreaterThan(0)
    expect(searchScore(holmes, 'homes place')).toBeGreaterThan(0)
    expect(searchScore(holmes, 'gendarmenmrakt')).toBeGreaterThan(0)
    expect(searchScore(holmes, 'gendamenmarkt')).toBeGreaterThan(0)
    expect(searchScore(holmes, 'holmes plaec')).toBeGreaterThan(0)
  })
  it('ignoriert Leerzeichen, Bindestriche und Punkte', () => {
    expect(searchScore(speed, 'speedfit')).toBeGreaterThan(0)
    expect(searchScore(speed, 'speed fit')).toBeGreaterThan(0)
    expect(searchScore(ride, 'ridebln')).toBeGreaterThan(0)
    expect(searchScore(ride, 'ride-bln')).toBeGreaterThan(0)
    expect(searchScore(ride, 'prenzlauerberg')).toBeGreaterThan(0)
  })
  it('Umlaute in allen Schreibweisen', () => {
    for (const q of ['schöneberg', 'schoeneberg', 'schoneberg', 'schneberg']) expect(searchScore(schoene, q)).toBeGreaterThan(0)
  })
  it('bleibt bei kurzen Begriffen und Zahlen streng', () => {
    expect(searchScore(holmes, 'xyz')).toBe(0)
    expect(searchScore(holmes, 'holmes 69')).toBe(0)
    expect(searchScore(holmes, 'fitness')).toBe(0)
    expect(searchScore(speed, 'yoga')).toBe(0)
  })
  it('bewertet exakte Treffer höher als unscharfe', () => {
    expect(searchScore(holmes, 'holmes')).toBeGreaterThan(searchScore(holmes, 'holmse'))
  })
})
