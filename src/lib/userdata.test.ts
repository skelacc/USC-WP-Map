import { describe, expect, it } from 'vitest'
import type { ProviderDetail } from '@/types/studio'
import { buildStudio, singleFromDetail } from './merges'
import { issueBody, parseIssueBody } from './sync'
import { EMPTY_USERDATA, addNote, applyEdits, deleteNote, editOf, mergeUserData, notesOf, ratingOf, setEdit, setRating } from './userdata'

const det = (p: 'urbanSportsClub' | 'wellpass', id: string, name: string): ProviderDetail => ({
  sourceId: id, source: 'official', key: `${p}:official:${id}`, name, url: null,
  address: { street: 'Weg 1', postalCode: '10115', city: 'Berlin', district: null }, plans: null, categories: null, fetchedAt: null,
})
const u = singleFromDetail('urbanSportsClub', det('urbanSportsClub', '1', 'Massage Studio'), 'usc-1')
const w = singleFromDetail('wellpass', det('wellpass', 'a', 'Massage WP'), 'wp-a')

describe('Bewertungen, Notizen, Korrekturen', () => {
  it('Bewertung je Profil und bleibt nach Zusammenführung erhalten', () => {
    let d = setRating(EMPTY_USERDATA, 'Martin', w, 'dislike')
    expect(ratingOf(d, 'Martin', w)).toBe('dislike')
    expect(ratingOf(d, 'Anna', w)).toBeNull()
    const merged = buildStudio([{ provider: 'urbanSportsClub', detail: u.providerDetails.urbanSportsClub! }, { provider: 'wellpass', detail: w.providerDetails.wellpass! }], 'usc-1')
    expect(ratingOf(d, 'Martin', merged)).toBe('dislike')
    d = setRating(d, 'Martin', merged, 'like')
    expect(ratingOf(d, 'Martin', merged)).toBe('like')
  })
  it('Notizen hinzufügen, löschen', () => {
    let d = addNote(EMPTY_USERDATA, u, 'Massage kostet 20 € Zuzahlung', 'Martin')
    expect(notesOf(d, u).map((n) => n.text)).toEqual(['Massage kostet 20 € Zuzahlung'])
    d = deleteNote(d, notesOf(d, u)[0].id)
    expect(notesOf(d, u)).toHaveLength(0)
  })
  it('Korrekturen werden angewendet und lassen sich zurücksetzen', () => {
    let d = setEdit(EMPTY_USERDATA, u, { name: 'Richtiger Name', hint: 'Nur mit Zuzahlung' }, 'Martin')
    const [e] = applyEdits([u], d)
    expect(e.name).toBe('Richtiger Name')
    expect(e.userHint).toBe('Nur mit Zuzahlung')
    d = setEdit(d, u, { name: null }, 'Martin')
    expect(editOf(d, u).name).toBeUndefined()
    expect(applyEdits([u], d)[0].name).toBe('Massage Studio')
  })
  it('Zusammenführen zweier Geräte: nichts geht verloren, Neueres gewinnt', async () => {
    const a = addNote(setRating(EMPTY_USERDATA, 'Martin', u, 'like'), u, 'Notiz Handy', 'Martin')
    await new Promise((r) => setTimeout(r, 5))
    const b = addNote(setRating(EMPTY_USERDATA, 'Martin', u, 'dislike'), u, 'Notiz PC', 'Martin')
    const m = mergeUserData(a, b)
    expect(notesOf(m, u).map((n) => n.text).sort()).toEqual(['Notiz Handy', 'Notiz PC'])
    expect(ratingOf(m, 'Martin', u)).toBe('dislike')
    // Hin- und Rückweg über das Issue-Format
    expect(parseIssueBody(issueBody({ decisions: [], userdata: m })).userdata).toEqual(m)
  })
})
