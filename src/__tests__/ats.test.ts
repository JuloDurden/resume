import { describe, expect, it } from 'vitest'
import { extractKeywords, matchKeywords, runChecks, startsWithAction } from '../lib/ats'
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
    console.log(k)
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
