import { describe, expect, it } from 'vitest'
import { dashesToDetails, formatSkill, hasTopSeparator, parseSkill, skillsInline, splitTop } from '../lib/skills'

describe('compétences avec précisions', () => {
  it('découpe hors parenthèses', () => {
    expect(splitTop('ITIL, Microsoft 365 (Teams, SharePoint, Intune); Jira')).toEqual(['ITIL', 'Microsoft 365 (Teams, SharePoint, Intune)', 'Jira'])
    expect(hasTopSeparator('Microsoft 365 (Teams,')).toBe(false)
    expect(hasTopSeparator('Microsoft 365 (Teams), ')).toBe(true)
  })
  it('sépare nom et précisions', () => {
    expect(parseSkill('Microsoft 365 (Teams, SharePoint)')).toEqual({ name: 'Microsoft 365', details: ['Teams', 'SharePoint'] })
    expect(parseSkill('ITIL')).toEqual({ name: 'ITIL', details: [] })
    expect(parseSkill('Scripts (Python (bases), Bash)')).toEqual({ name: 'Scripts', details: ['Python (bases)', 'Bash'] })
    expect(parseSkill('(Teams)')).toEqual({ name: '(Teams)', details: [] })
  })
  it('convertit les anciens tirets', () => {
    expect(dashesToDetails('Reporting (Excel - Power BI)')).toBe('Reporting (Excel, Power BI)')
    expect(dashesToDetails('Gestion économique : commandes - stocks - marge')).toBe('Gestion économique (commandes, stocks, marge)')
    expect(dashesToDetails('Sécurité - Hygiène & prévention (CHSCT)')).toBe('Sécurité - Hygiène & prévention (CHSCT)')
  })
  it('reformate', () => {
    expect(formatSkill('Microsoft 365', ['Teams', ' ', 'Intune'])).toBe('Microsoft 365 (Teams, Intune)')
    expect(formatSkill('Jira', [])).toBe('Jira')
    expect(skillsInline(['ITIL', 'Microsoft 365 (Teams, Intune)'], 'colon')).toBe('ITIL · Microsoft 365 : Teams, Intune')
    expect(skillsInline(['ITIL', 'Microsoft 365 (Teams, Intune)'], 'paren')).toBe('ITIL, Microsoft 365 (Teams, Intune)')
  })
})
