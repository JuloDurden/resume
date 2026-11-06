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
    const j = matchItem(item({ title: 'Product Owner junior' }), p, 'junior')
    const s = matchItem(item({ title: 'Senior Product Owner' }), p, 'junior')
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

describe('périmètre de recherche', () => {
  const home = { lat: 43.53, lon: 3.86, nom: 'Villeneuve-lès-Maguelone' }
  it('met 0 à une offre en présentiel trop loin, pas à une offre en télétravail', async () => {
    const { geocodeCacheForTests } = await import('../lib/match')
    geocodeCacheForTests('Paris', { lat: 48.85, lon: 2.35 })
    const pp = { ...p, home, maxKm: 50 }
    const far = matchItem(item({ title: 'Product Owner', location: 'Paris' }), pp)
    expect(far.score).toBe(0)
    expect(far.out).toBeTruthy()
    expect(matchItem(item({ title: 'Product Owner', location: 'Paris', fullText: 'Poste en hybride, 2 jours de télétravail par semaine. '.repeat(8) }), pp).score).toBeGreaterThan(0)
    expect(matchItem(item({ title: 'Product Owner', location: 'Paris', worktime: 'À distance' }), pp).score).toBeGreaterThan(40)
    expect(matchItem(item({ title: 'Product Owner', location: 'Paris', fullText: 'Télétravail : Non. '.repeat(20) }), pp).score).toBe(0)
  })
})

describe("expérience demandée", () => {
  it('lit les formulations courantes', async () => {
    const { experienceOf } = await import('../lib/match')
    const e = (t: string) => experienceOf('Product Owner', t)
    expect(e('Vous justifiez de 3 à 5 années d’expérience sur un poste similaire.')).toMatchObject({ min: 3, max: 5, kind: 'mid' })
    expect(e('Une première expérience en gestion de produit est appréciée.')).toMatchObject({ min: 0, kind: 'junior' })
    expect(e('Expérience de deux ans minimum en tant que PO.')).toMatchObject({ min: 2, kind: 'junior' })
    expect(e('5+ years of experience in product management.')).toMatchObject({ min: 5, kind: 'senior' })
    expect(e('Vous avez au moins 7 ans d’expérience.')).toMatchObject({ min: 7, kind: 'senior' })
    expect(e('Notre société existe depuis 20 ans et compte 300 collaborateurs.')).toMatchObject({ kind: 'neutral' })
    expect(e('Profil expérimenté, solide expérience du pilotage.')).toMatchObject({ kind: 'mid' })
  })
  it('note selon le niveau visé par l’alerte', async () => {
    const { experienceOf, levelScore } = await import('../lib/match')
    const jun = experienceOf('Business Analyst junior', '')
    const sen = experienceOf('Responsable de service', 'Vous avez 10 ans d’expérience en management.')
    expect(levelScore(jun, 'junior')).toBe(1)
    expect(levelScore(sen, 'junior')).toBeLessThan(0.2)
    expect(levelScore(sen, 'senior')).toBe(1)
    expect(levelScore(jun, 'senior')).toBeLessThan(0.2)
  })
  it('tolère bac+3 pour un bac+2, pas bac+5', () => {
    const t = (d: string) => matchItem(item({ title: 'Product Owner', fullText: `Formation ${d} exigée en informatique. `.repeat(10) }), { ...p, degree: 2 }).degree
    expect(t('Bac+3')).toBeUndefined()
    expect(t('Bac +5')?.required).toBe(5)
    expect(t('Bac+4')?.required).toBe(4)
  })
})
