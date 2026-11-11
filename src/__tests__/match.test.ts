import { describe, expect, it } from 'vitest'
import type { FeedItem } from '../types'
import { levelScore, matchBest, matchItem, placeName } from '../lib/match'
import { trackYears } from '../lib/tracks'

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
    // hybride à 600 km : intenable pour les jours sur site
    expect(matchItem(item({ title: 'Product Owner', location: 'Paris', fullText: 'Poste en hybride, 2 jours de télétravail par semaine. '.repeat(8) }), pp).score).toBe(0)
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

describe('lieu lu dans le texte', () => {
  it('trouve « basé à » et « Localisation : »', async () => {
    const { textLocation, locationOf, deptOf } = await import('../lib/match')
    expect(textLocation(item({ fullText: 'Poste à pourvoir dès que possible - CDI basé à La Défense (92). Vous rejoignez...' }))).toBe('La Défense (92)')
    expect(textLocation(item({ fullText: 'Localisation : Le Haillan (33).' }))).toBe('Le Haillan (33)')
    expect(textLocation(item({ fullText: 'Lieu de travail : Toulouse, avec 2 jours de télétravail.' }))).toBe('Toulouse')
    expect(locationOf(item({ location: 'France', fullText: 'Poste basé à Lyon.' }))).toEqual({ loc: 'Lyon', fromText: true })
    expect(locationOf(item({ location: 'Montpellier', fullText: 'Poste basé à Lyon.' })).loc).toBe('Montpellier')
    expect(deptOf('La Défense (92)')).toBe('92')
  })
  it('écarte une offre parisienne affichée « France »', async () => {
    const { geocodeCacheForTests } = await import('../lib/match')
    geocodeCacheForTests('dep:92', { lat: 48.89, lon: 2.24 })
    const m = matchItem(item({ title: 'Product Owner', location: 'France', fullText: 'Poste à pourvoir dès que possible - CDI basé à La Défense (92). '.repeat(5) }), { ...p, home: { lat: 43.53, lon: 3.86, nom: 'X' }, maxKm: 50 })
    expect(m.score).toBe(0)
  })
})

describe('cas réels', () => {
  it('Business Analyst Synanto : 5 ans demandés malgré « Premier emploi » sur LinkedIn', async () => {
    const { experienceOf } = await import('../lib/match')
    const text = 'PROFIL RECHERCHÉ\n\nVous disposez de minimum 5 ans d\'expérience sur un poste similaire.\n\nVous Maitrisez\n\n• les outils de gestion de projet (Jira, Confluence) ;\n\nNiveau hiérarchique : Premier emploi'
    expect(experienceOf('Business Analyst', text, 'Premier emploi')).toMatchObject({ min: 5, kind: 'senior' })
    const m = matchItem(item({ title: 'Business Analyst', fullText: text.repeat(3), facts: { level: 'Premier emploi' } }), p, 'junior')
    expect(m.score).toBeLessThan(60)
    expect(experienceOf('Business Analyst', 'Rejoignez-nous.', 'Premier emploi').kind).toBe('junior')
  })
})

describe('annonce sans texte', () => {
  it('plafonne la note à 70', () => {
    const m = matchItem(item({ title: 'Product Owner junior', location: 'Montpellier' }), p, 'junior')
    expect(m.score).toBeLessThanOrEqual(70)
    expect(m.capped).toBe(70)
    const full = matchItem(item({ title: 'Product Owner junior', fullText: 'Vous gérez le backlog dans Jira, animez les rituels Scrum et le recueil des besoins. Première expérience acceptée. '.repeat(8) }), p, 'junior')
    expect(full.capped).toBeUndefined()
  })
})

describe('intitulé et compétences', () => {
  it("un autre métier dans l'intitulé divise la note d'intitulé", () => {
    const pp = { ...p, targets: ['Product Manager', 'Product Owner'] }
    const m = matchItem(item({ title: 'Product Marketing Manager W/M/NB' }), pp)
    expect(m.title.v).toBe(0.5)
    expect(m.title.other).toBe('marketing')
    expect(matchItem(item({ title: 'Product Manager H/F' }), pp).title.v).toBe(1)
  })
  it('une compétence en plusieurs mots doit apparaître en entier', () => {
    const pp = { ...p, skills: ['Google AI Professional', 'Jira', 'gestion de projet'] }
    const text = 'Professional services company using Google Workspace and AI tools. Jira daily. '.repeat(6)
    const m = matchItem(item({ title: 'Product Owner', fullText: text }), pp)
    expect(m.skills?.matched).toEqual(['Jira'])
    const m2 = matchItem(item({ title: 'Product Owner', fullText: 'Vous assurez la gestion de projet et la certification Google AI Professional est un plus. '.repeat(6) }), pp)
    expect(m2.skills?.matched).toEqual(['Google AI Professional', 'gestion de projet'])
  })
})

describe('profils de recherche', () => {
  const tracks = [
    { id: 'it', name: 'IT', targets: ['Product Owner'], skills: ['Jira'], romeSkills: [], level: 'junior' as const, years: 1 },
    { id: 'mg', name: 'Management', targets: ["Responsable d'exploitation"], skills: [], romeSkills: ['Encadrer et coordonner une équipe', 'Définir les plannings et congés de ses équipes'], level: 'senior' as const, years: 18 },
  ]
  const text = "Vous encadrez une équipe de 25 agents terrain et organisez les plannings des équipes. Expérience significative dans l'encadrement d'équipes opérationnelles. ".repeat(6)
  it("note l'annonce avec le profil qui lui correspond le mieux", () => {
    const m = matchBest(item({ title: "Responsable d'exploitation H/F", fullText: text }), { ...p, tracks })
    expect(m.track?.id).toBe('mg')
    expect(m.score).toBeGreaterThanOrEqual(70)
    expect(m.skills?.matched).toContain('Encadrer et coordonner une équipe')
    expect(m.skills?.matched).toContain('Définir les plannings et congés de ses équipes')
    const po = matchBest(item({ title: 'Product Owner junior', fullText: 'Gestion du backlog dans Jira, première expérience acceptée. '.repeat(15) }), { ...p, tracks })
    expect(po.track?.id).toBe('it')
  })
  it("baisse la note quand l'expérience demandée dépasse nettement la vôtre", () => {
    const e = { min: 5, kind: 'senior' as const, label: '' }
    expect(levelScore(e, 'any', 1)).toBeLessThan(0.4)
    expect(levelScore(e, 'senior', 18)).toBe(1)
  })
  it("compte les années d'un profil sans doubler les périodes communes", () => {
    const pool = [
      { key: 'a|2007', title: 'A', company: 'a', start: { year: 2007, month: 1 }, end: { year: 2025, month: 12 }, months: 0 },
      { key: 'b|2002', title: 'B', company: 'b', start: { year: 2002, month: 5 }, end: { year: 2007, month: 1 }, months: 0 },
      { key: 'c|2010', title: 'C', company: 'c', start: { year: 2010 }, end: { year: 2011 }, months: 0 },
    ]
    const links = { 'a|2007': { tracks: ['mg'] }, 'b|2002': { tracks: ['mg'] }, 'c|2010': { tracks: ['mg'] } }
    expect(trackYears('mg', pool, links)).toBeCloseTo(23.7, 0)
    expect(trackYears('it', pool, links)).toBe(0)
  })
})

describe('nature du poste', () => {
  const tracks = [
    { id: 'it', name: 'IT / Produit', targets: ['Product Owner', 'Product Manager'], skills: [], romeSkills: [], level: 'junior' as const, years: 1 },
    { id: 'mg', name: 'Management', targets: ["Responsable d'équipe", 'Responsable de secteur'], skills: [], romeSkills: [], level: 'senior' as const, years: 18 },
  ]
  it("un Product Manager reste un poste produit, même avec « manager » dans l'intitulé et 5 ans demandés", () => {
    const text = 'Vous définissez la roadmap et priorisez le backlog avec les développeurs. Rédaction des user stories, recette, animation des sprints. 5 ans d’expérience minimum. '.repeat(5)
    expect(matchBest(item({ title: 'Product Manager', fullText: text }), { ...p, tracks }).track?.id).toBe('it')
  })
  it('le profil choisi à la main est respecté', () => {
    const m = matchBest(item({ title: 'Product Manager' }), { ...p, tracks }, 'any', 'mg')
    expect(m.track?.id).toBe('mg')
    expect(m.track?.forced).toBe(true)
  })
})
