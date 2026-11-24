import { describe, expect, it } from 'vitest'
import { announcedBy, followUpEmail, nextFollowUp, startOfDay } from '../lib/followup'
import type { Offer } from '../types'

const D = 86400000
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime()

describe('réponses du recruteur', () => {
  const base = { id: 'o', createdAt: day(2026, 11, 1), updatedAt: 0, status: 'applied', statusAt: { applied: day(2026, 11, 18) }, title: 'Responsable Informatique', company: 'Adecco', followUpDays: 15 } as Offer
  it('sans réponse : relance au délai habituel', () => {
    expect(nextFollowUp(base)).toBe(startOfDay(day(2026, 12, 3)))
  })
  it('message spontané avec délai annoncé : relance le lendemain du délai', () => {
    const o = { ...base, updates: [{ id: 'u', at: day(2026, 11, 24), kind: 'news' as const, waitUntil: day(2026, 11, 24) + 21 * D }] }
    expect(nextFollowUp(o)).toBe(startOfDay(day(2026, 12, 16)))
    expect(announcedBy(o, day(2026, 11, 25))).toBeTruthy()
    expect(announcedBy(o, day(2026, 12, 20))).toBeUndefined()
  })
  it('réponse à une relance sans délai : le compteur repart de la réponse', () => {
    const o = { ...base, followUps: [day(2026, 11, 20), day(2026, 11, 22)], updates: [{ id: 'u', at: day(2026, 11, 23), kind: 'reply' as const }] }
    expect(nextFollowUp(o)).toBe(startOfDay(day(2026, 12, 8)))
    const mail = followUpEmail(o)
    expect(mail.body).toContain('votre message du 23 novembre')
  })
})
