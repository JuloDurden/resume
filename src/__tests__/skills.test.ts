import { describe, expect, it } from 'vitest'
import { dashesToDetails, nestedCount, formatSkill, hasTopSeparator, parseSkill, skillsInline, splitTop } from '../lib/skills'

describe('compétences avec précisions', () => {
  it('découpe hors parenthèses', () => {
    expect(splitTop('ITIL, Microsoft 365 (Teams, SharePoint, Intune); Jira')).toEqual(['ITIL', 'Microsoft 365 (Teams, SharePoint, Intune)', 'Jira'])
    expect(hasTopSeparator('Microsoft 365 (Teams,')).toBe(false)
    expect(hasTopSeparator('Microsoft 365 (Teams), ')).toBe(true)
  })
  it('sépare nom et précisions', () => {
    expect(parseSkill('Microsoft 365 (Teams, SharePoint)')).toEqual({ name: 'Microsoft 365', details: ['Teams', 'SharePoint'], style: 'paren' })
    expect(parseSkill('ITIL')).toEqual({ name: 'ITIL', details: [], style: 'paren' })
    expect(parseSkill('Scripts (Python (bases), Bash)')).toEqual({ name: 'Scripts', details: ['Python (bases)', 'Bash'], style: 'paren' })
    expect(parseSkill('(Teams)')).toEqual({ name: '(Teams)', details: [], style: 'paren' })
    const sf = parseSkill('Support fonctionnel : qualification des anomalies, suivi de résolution (ticketing)')
    expect(sf).toEqual({ name: 'Support fonctionnel', details: ['qualification des anomalies', 'suivi de résolution (ticketing)'], style: 'colon' })
    expect(nestedCount('Support fonctionnel : qualification des anomalies, suivi de résolution (ticketing)')).toBe(3)
    expect(parseSkill('Site : https://exemple.fr').style).toBe('colon')
    expect(parseSkill('Lien https://exemple.fr').details).toEqual([])
  })
  it('convertit les anciens tirets', () => {
    expect(dashesToDetails('Reporting (Excel - Power BI)')).toBe('Reporting (Excel, Power BI)')
    expect(dashesToDetails('Gestion économique : commandes - stocks - marge')).toBe('Gestion économique : commandes, stocks, marge')
    expect(dashesToDetails('Sécurité - Hygiène & prévention (CHSCT)')).toBe('Sécurité - Hygiène & prévention (CHSCT)')
  })
  it('reformate', () => {
    expect(formatSkill('Microsoft 365', ['Teams', ' ', 'Intune'])).toBe('Microsoft 365 (Teams, Intune)')
    expect(formatSkill('Jira', [])).toBe('Jira')
    expect(formatSkill('Support', ['tickets', 'suivi (Jira)'], 'colon')).toBe('Support : tickets, suivi (Jira)')
    expect(skillsInline(['ITIL', 'Microsoft 365 (Teams, Intune)'], 'colon')).toBe('ITIL · Microsoft 365 : Teams, Intune')
    expect(skillsInline(['ITIL', 'Microsoft 365 (Teams, Intune)'], 'paren')).toBe('ITIL, Microsoft 365 (Teams, Intune)')
  })
  it('phrase de plusieurs compétences, « et » final', () => {
    const r = parseSkill('Recrutement, formation et montée en compétences')
    expect(r).toEqual({ name: '', details: ['Recrutement', 'formation', 'montée en compétences'], style: 'list', and: true })
    expect(nestedCount('Recrutement, formation et montée en compétences')).toBe(3)
    expect(formatSkill('', r.details, 'list', true)).toBe('Recrutement, formation et montée en compétences')
    // « et » sans virgule : une seule compétence
    expect(parseSkill('Hygiène et sécurité').details).toEqual([])
    // précisions avec « et » final
    expect(parseSkill('Reporting (Excel, Power BI et Looker)')).toEqual({ name: 'Reporting', details: ['Excel', 'Power BI', 'Looker'], style: 'paren', and: true })
    expect(formatSkill('Reporting', ['Excel', 'Power BI', 'Looker'], 'paren', true)).toBe('Reporting (Excel, Power BI et Looker)')
    expect(parseSkill('Management : recrutement, formation et animation').details).toEqual(['recrutement', 'formation', 'animation'])
    // « et » entre parenthèses ne sépare pas
    expect(parseSkill('Recrutement, gestion (paie et congés)').details).toEqual(['Recrutement', 'gestion (paie et congés)'])
    expect(skillsInline(['ITIL', 'Recrutement, formation et montée en compétences'], 'paren')).toBe('ITIL · Recrutement, formation et montée en compétences')
  })
})
