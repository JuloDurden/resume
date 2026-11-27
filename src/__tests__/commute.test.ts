import { describe, expect, it } from 'vitest'
import { commuteOf, inMetro } from '../lib/commute'
import { geocodeCacheForTests } from '../lib/match'
import type { MatchProfile, Offer } from '../types'

const profile = { targets: [], degree: 2, commuteFrom: { nom: 'Villeneuve-lès-Maguelone', lat: 43.532, lon: 3.862 }, fuel: 'gazole', conso: 6.5 } as unknown as MatchProfile
const prices = { gazole: 2.05, sp95: 2.03, e10: 1.91 }
const o = (p: Partial<Offer>) => ({ id: 'o', createdAt: 0, updatedAt: 0, location: 'Montpellier', ...p }) as Offer

describe('trajet domicile-travail', () => {
  geocodeCacheForTests('Montpellier', { lat: 43.611, lon: 3.877 })
  it('voiture 5 jours sur 5 par défaut : carburant seul', () => {
    const c = commuteOf(o({}), profile, prices)!
    expect(c.km).toBe(12)
    // 12 km × 2 × 5 × 47 × 6,5 L/100 × 2,05 €
    expect(Math.round(c.year)).toBe(Math.round((12 * 470 * 6.5 * 2.05) / 100))
    expect(c.note).toBe('voiture · 12 km · 5 j/sem.')
  })
  it('péage, télétravail, distance corrigée', () => {
    const c = commuteOf(o({ commute: { mode: 'car', days: 3, km: 20, toll: 30 } }), profile, prices)!
    expect(Math.round(c.year)).toBe(Math.round((20 * 3 * 47 * 2 * 6.5 * 2.05) / 100 + 360))
  })
  it('véhicule fourni, transports, vélo', () => {
    expect(commuteOf(o({ commute: { mode: 'company', days: 5 } }), profile, prices)?.year).toBe(0)
    expect(commuteOf(o({ commute: { mode: 'company', days: 5, fuelPaid: false } }), profile, prices)?.year).toBeGreaterThan(0)
    expect(commuteOf(o({ commute: { mode: 'tc', days: 5 } }), profile, prices)?.year).toBe(0)
    expect(commuteOf(o({ location: 'Mauguio', commute: { mode: 'tc', days: 5, km: 20, pass: 60 } }), profile, prices)?.year).toBe(360)
    expect(commuteOf(o({ commute: { mode: 'bike', days: 5 } }), profile, prices)?.year).toBe(0)
  })
  it('sans adresse de départ ni lieu connu : rien', () => {
    expect(commuteOf(o({}), { ...profile, commuteFrom: undefined }, prices)).toBeUndefined()
    expect(commuteOf(o({ location: 'Ville Inconnue' }), profile, prices)).toBeUndefined()
  })
  it('Métropole de Montpellier', () => {
    expect(inMetro('Montpellier (34)')).toBe(true)
    expect(inMetro('Villeneuve-lès-Maguelone')).toBe(true)
    expect(inMetro('Mauguio')).toBe(false)
  })
})
