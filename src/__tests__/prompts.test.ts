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

import { applyTemplate } from '../data/templates'
import { pdfImportPrompt, cleanItem } from '../lib/prompts'

describe('import PDF', () => {
  it('nettoie les entrées imparfaites', () => {
    const it = cleanItem({ title: ' Poste ', start: '03/2019' as never, end: { year: 2021, month: 14 }, level: 7, icon: 'inconnu', bullets: ['a', '', 3 as never] })
    expect(it.title).toBe('Poste')
    expect(it.start).toEqual({ year: 2019, month: 3 })
    expect(it.end).toEqual({ year: 2021, month: undefined })
    expect(it.level).toBe(5)
    expect(it.icon).toBeUndefined()
    expect(it.bullets).toEqual(['a'])
  })
  it('crée un CV deux colonnes à partir de la réponse', () => {
    const data = {
      header: { name: 'Julien Test', title: 'Service Delivery Manager', contacts: [{ kind: 'email', value: 'a@b.fr' }, { kind: 'fax', value: '01' }] },
      sections: [
        { type: 'summary', title: 'Profil', items: [{ description: 'Texte' }] },
        { type: 'experience', title: 'Expériences', items: [{ title: 'SDM', subtitle: 'ACME', start: { year: 2020 }, current: true, bullets: ['x'] }] },
        { type: 'skills', title: 'Compétences', items: [{ title: '', tags: ['ITIL', 'Jira'] }] },
        { type: 'inexistant', title: 'Divers', items: [{ title: 'Autre' }] },
      ],
    }
    const doc = applyTemplate(resumeFromClaude(newResume('epure', false), data, 'Import'), 'ardoise')
    expect(doc.header.name).toBe('Julien Test')
    expect(doc.header.contacts.map((c) => c.kind)).toEqual(['email', 'other'])
    expect(doc.sections.map((s) => s.type)).toEqual(['summary', 'experience', 'skills', 'custom'])
    expect(doc.layout.side.length).toBe(1)
    expect(doc.layout.main.length).toBe(3)
  })
  it('prompt sans tiret long', () => {
    expect(pdfImportPrompt()).not.toMatch(/[—–]/)
  })
})
