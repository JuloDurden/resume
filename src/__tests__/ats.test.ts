import { describe, expect, it } from 'vitest'
import { extractKeywords, isThemed, matchKeywords, runChecks, startsWithAction } from '../lib/ats'
import { newResume } from '../data/factory'
import { resumeToText } from '../lib/export'

const JOB = `Nous recherchons un Chef de projet digital H/F pour rejoindre notre équipe.
Missions : piloter les projets digitaux en méthode Agile (Scrum), animer les comités de pilotage,
rédiger les spécifications fonctionnelles et les user stories dans Jira, suivre le budget.
Profil : 5 ans d'expérience en gestion de projet, maîtrise de Jira et Confluence, connaissance ITIL appréciée.
Une expérience en gestion de projet digital et en conduite du changement est un atout. Power BI apprécié.`

describe('ats', () => {
  it('extrait des mots-clés pertinents', () => {
    const k = extractKeywords(JOB).map((x) => x.label.toLowerCase())
    expect(k.some((x) => x.includes('jira'))).toBe(true)
    expect(k.some((x) => x.includes('gestion de projet'))).toBe(true)
    expect(k).not.toContain('nous')
  })
  it('calcule la correspondance avec un CV', () => {
    const cv = newResume('epure', true)
    const r = matchKeywords(resumeToText(cv), JOB)
    console.log(r.score, r.keywords.map((k) => `${k.label}:${k.inCv}`).join(', '))
    expect(r.score).toBeGreaterThan(20)
    expect(r.keywords.find((k) => k.label === 'Jira')?.inCv).toBeGreaterThan(0)
  })
  it('détecte les verbes d action', () => {
    expect(startsWithAction('Piloté la refonte')).toBe(true)
    expect(startsWithAction('Pilotage de la refonte')).toBe(true)
    expect(startsWithAction('Mise en place du suivi')).toBe(true)
    expect(startsWithAction('Déployée en 3 mois')).toBe(true)
    expect(startsWithAction('Très bonne équipe')).toBe(false)
    expect(startsWithAction('Le projet a été livré')).toBe(false)
  })
  it('produit des contrôles', () => {
    const c = runChecks(newResume('ardoise', true), 1)
    console.log(c.map((x) => `${x.status} ${x.label}: ${x.detail}`).join('\n'))
    expect(c.find((x) => x.id === 'contact')?.status).toBe('ok')
  })
})

describe('ats : bruit des annonces', () => {
  const OFFER = `Qui sommes-nous ?
Leader de la propreté implanté en Occitanie, l'Aventure GSF vous attend. GSF est engagé pour la diversité.
Vos missions
Vous encadrez une équipe d'agents et coordonnez les prestations. Vous encadrez les chefs d'équipe.
Vous assurez la coordination avec les clients et le suivi qualité. Pilotage des prestations, suivi qualité.
Profil
Bac+2 minimum, management d'équipe, suivi qualité.
Salaire : Annuel de 32000.0 Euros
Durée du travail : 35H/semaine
Avantages
Mutuelle, RTT, prime annuelle, 45K bruts/an primes incluses.`
  it('écarte salaire, horaires, entreprise, lieu et formules', () => {
    const k = extractKeywords(OFFER, 40, { company: 'GSF', location: 'Montpellier (34)' }).map((x) => x.label.toLowerCase())
    for (const bad of ['euros', '32000.0', '35h/semaine', 'bac+2', 'rtt', 'mutuelle', 'gsf', 'aventure', 'occitanie', 'diversité', 'encadrez', 'bruts/an']) expect(k.join('|')).not.toContain(bad)
    expect(k).toContain('encadrement')
    expect(k.some((x) => x.includes('suivi qualité'))).toBe(true)
  })
  it('rapproche verbes et noms d action, et les synonymes', () => {
    const r = matchKeywords('Coordination des prestataires. Management de 20 personnes.', 'Vous coordonnez les prestations. Vous coordonnez et encadrez. Vous encadrez.', [], [], {})
    expect(r.keywords.find((k) => k.key === 'coordin')?.match).toBe('full')
    expect(r.keywords.find((k) => k.key === 'encadr')?.match).toBe('near')
  })
  it('masque d office les mots déjà masqués ailleurs', () => {
    const r = matchKeywords('ITIL', 'ITIL ITIL et jardinerie jardinerie', [], [], { learned: ['jardineri'] })
    expect(r.keywords.map((k) => k.key)).not.toContain('jardineri')
    expect(r.auto.map((k) => k.key)).toContain('jardineri')
  })
  it('accepte les puces « Thème : détails »', () => {
    expect(isThemed('Organisation du travail : plannings, absences')).toBe(true)
    expect(isThemed('Piloté la refonte')).toBe(false)
  })
})
