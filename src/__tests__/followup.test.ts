import { describe, expect, it } from 'vitest'
import type { FeedItem, Offer } from '../types'
import { followUpEmail, isDue, nextFollowUp } from '../lib/followup'
import { groupJobs } from '../lib/dedupe'

const DAY = 86400000
const offer = (o: Partial<Offer>): Offer => ({ id: 'o', createdAt: 0, updatedAt: 0, status: 'applied', title: 'Product Owner', company: 'ACME', ...o })

describe('relances', () => {
  it('propose une relance 7 jours après l\'envoi, puis 10 jours après', () => {
    const sent = Date.now() - 8 * DAY
    expect(isDue(offer({ statusAt: { applied: sent } }))).toBe(true)
    expect(isDue(offer({ statusAt: { applied: Date.now() - 2 * DAY } }))).toBe(false)
    const once = offer({ statusAt: { applied: sent }, followUps: [Date.now() - DAY] })
    expect(isDue(once)).toBe(false)
    expect(nextFollowUp(once)).toBeGreaterThan(Date.now() + 8 * DAY)
    expect(nextFollowUp(offer({ statusAt: { applied: sent }, followUps: [1, 2] }))).toBeUndefined()
    expect(nextFollowUp(offer({ status: 'interview', statusAt: { applied: sent } }))).toBeUndefined()
  })
  it('rédige le message sans tiret long', () => {
    const m = followUpEmail(offer({ statusAt: { applied: Date.now() - 8 * DAY }, contacts: [{ name: 'Mme Durand', email: 'rh@acme.fr' }] }))
    expect(m.subject).toContain('Product Owner')
    expect(m.body).toContain('Bonjour Mme Durand')
    expect(`${m.subject}${m.body}`).not.toMatch(/[—–]/)
  })
})

describe('doublons', () => {
  const it2 = (o: Partial<FeedItem>): FeedItem => ({ id: Math.random().toString(), alerts: ['email'], title: '', url: 'x', source: 's', ...o })
  it('regroupe une même offre venue de plusieurs sites', () => {
    const g = groupJobs([
      it2({ title: 'Chef de Projet Fonctionnel - Avant vente Industrie H/F', company: 'Linking Executive Associates', location: 'Montpellier', source: 'Glassdoor' }),
      it2({ title: 'Chef de Projet Fonctionnel - Avant Vente Industrie H/F', company: 'LEA', location: 'Montpellier', source: 'Jobijoba', fullText: 'texte' }),
      it2({ title: 'Chef De Projet IT (H/F)', company: 'Fortil', location: 'Mauguio' }),
      it2({ title: 'Chef de Projet IT H/F', company: 'fortil group', location: 'Mauguio' }),
      it2({ title: 'Product Owner H/F', company: 'SII', location: 'Montpellier' }),
      it2({ title: 'Product Owner (H/F)', company: 'Capgemini', location: 'Montpellier' }),
    ])
    expect(g.length).toBe(4)
    expect(g[0].members.length).toBe(2)
    expect(g[0].item.fullText).toBe('texte')
  })
})
