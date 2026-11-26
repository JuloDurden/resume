import { describe, expect, it } from 'vitest'
import { slotsOf } from '../components/dashboard/MetroTimeline'
import { placeInDay, startOfDay } from '../lib/followup'
import type { Offer } from '../types'

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime()
const labels = (o: Offer, now: number) => slotsOf(o, now).map((s) => (s.kind === 'main' ? s.st.label : 'Relance'))

// cas IRFA Sud : refus annoncé pendant l'entretien téléphonique, saisi avec la date du jour seule
const base = {
  id: 'irfa',
  title: 'Responsable des Systèmes d’Information',
  company: 'IRFA Sud',
  createdAt: at(10, 9),
  updatedAt: at(21, 18),
  status: 'rejected',
  statusAt: { applied: at(10, 10), rejected: at(20, 0) },
  interviews: [{ id: 'iv', at: at(20, 10), mode: 'phone', done: true }],
  updates: [{ id: 'u', at: at(20, 0), kind: 'news', text: 'Refus annoncé pendant l’entretien' }],
} as unknown as Offer

describe('chronologie d’une candidature', () => {
  it('le message et le refus saisis sans heure passent après l’entretien du même jour', () => {
    expect(labels(base, at(26, 12))).toEqual(['Ajoutée', 'Envoyée', 'Entretien', 'Message', 'Refusée'])
  })
  it('le refus reste à la fin même avec une date restée d’un ancien passage en refusée', () => {
    const o = { ...base, statusAt: { applied: at(10, 10), rejected: at(12, 9) } } as Offer
    expect(labels(o, at(26, 12)).at(-1)).toBe('Refusée')
  })
  it('une saisie datée d’un autre jour se place après le dernier événement connu ce jour-là', () => {
    expect(placeInDay(base, startOfDay(at(20, 0)), at(26, 12))).toBe(at(20, 10, 1))
    expect(placeInDay(base, startOfDay(at(22, 0)), at(26, 12))).toBe(startOfDay(at(22, 0)))
    expect(placeInDay(base, startOfDay(at(26, 0)), at(26, 12))).toBe(at(26, 12))
  })
})
