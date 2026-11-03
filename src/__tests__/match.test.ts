import { describe, expect, it } from 'vitest'
import type { FeedItem } from '../types'
import { matchItem, placeName } from '../lib/match'

const p = { targets: ['Product Owner', 'Chef de projet digital', 'Business Analyst'], skills: ['Jira', 'Agile', 'Scrum', 'Recueil des besoins', 'Power BI'], degree: 2 }
const item = (o: Partial<FeedItem>): FeedItem => ({ id: 'x', alerts: [], title: '', url: '', source: '', ...o })

describe('indice de correspondance', () => {
  it('reconnaît les intitulés équivalents', () => {
    expect(matchItem(item({ title: 'PO Junior H/F' }), p).title.v).toBe(1)
    expect(matchItem(item({ title: 'Proxy Product Owner Web' }), p).title.v).toBe(1)
    expect(matchItem(item({ title: 'Technicien SAV' }), p).title.v).toBe(0)
  })
  it('favorise le junior et freine le senior', () => {
    const j = matchItem(item({ title: 'Product Owner junior' }), p)
    const s = matchItem(item({ title: 'Senior Product Owner' }), p)
    expect(j.level.kind).toBe('junior')
    expect(s.level.kind).toBe('senior')
    expect(j.score).toBeGreaterThan(s.score + 15)
  })
  it("signale un bac+5 exigé et retrouve les compétences", () => {
    const text = "Vous animez les rituels Agile Scrum, rédigez les user stories dans Jira et assurez le recueil des besoins métiers auprès des utilisateurs. Diplôme Bac+5 exigé (école d'ingénieur ou master). ".repeat(2)
    const m = matchItem(item({ title: 'Product Owner', fullText: text }), p)
    expect(m.degree?.required).toBe(5)
    expect(m.degree?.strict).toBe(true)
    expect(m.skills?.matched).toEqual(expect.arrayContaining(['Jira', 'Agile', 'Scrum', 'Recueil des besoins']))
  })
  it('lit les lieux des annonces', () => {
    expect(placeName('Montpellier (34)')).toBe('Montpellier')
    expect(placeName('34 - MONTPELLIER')).toBe('MONTPELLIER')
    expect(placeName('Ville de Paris')).toBe('Paris')
    expect(placeName('France (À distance)')).toBeUndefined()
  })
})
