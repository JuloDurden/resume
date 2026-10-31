import { describe, expect, it } from 'vitest'
import { extractJson, parseBullets, resumeFromClaude, buildPrompt } from '../lib/prompts'
import { newResume } from '../data/factory'
import { resumeToText, parseJson, toJson } from '../lib/export'
import { frenchSpaces } from '../lib/inline'

describe('prompts et exports', () => {
  it('lit le JSON dans une réponse', () => {
    expect(extractJson<{ a: number }>('Voici :\n```json\n{"a": 1}\n```\nFin').a).toBe(1)
    expect(extractJson<{ a: number }>('blabla {"a": 2} blabla').a).toBe(2)
  })
  it('lit les puces', () => {
    expect(parseBullets('Intro\n- Un\n• Deux\n1. Trois\nfin')).toEqual(['Un', 'Deux', 'Trois'])
  })
  it('recrée un CV depuis la réponse de Claude en gardant la disposition', () => {
    const src = newResume('ardoise', true)
    const out = resumeFromClaude(src, { sections: [{ type: 'experience', items: [{ title: 'X' }] }, { type: 'skills', items: [{ tags: ['Jira'] }] }] }, 'Copie')
    expect(out.id).not.toBe(src.id)
    expect(out.layout.side.length).toBe(1)
    expect(out.style).toEqual(src.style)
  })
  it('génère les prompts sans tiret cadratin', () => {
    const d = newResume('epure', true)
    d.job = { description: 'Offre test' }
    for (const a of ['summary', 'tailor', 'letter', 'ats', 'translate', 'interview'] as const) expect(buildPrompt(a, d)).not.toMatch(/[—–]/)
  })
  it('exporte et réimporte en JSON', () => {
    const d = newResume('epure', true)
    expect(parseJson(toJson([d]))[0].id).toBe(d.id)
    expect(resumeToText(d)).toContain('CAMILLE MARTIN')
  })
  it('applique les espaces insécables', () => {
    expect(frenchSpaces('20 % : ok')).toBe('20 % : ok')
  })
})
