import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { genderForm, searchRome, type RomeIndex } from '../lib/rome'

const ix = JSON.parse(readFileSync('public/rome/index.json', 'utf8')) as RomeIndex

describe('ROME', () => {
  it('trouve des métiers à partir de titres courants', () => {
    for (const q of ['Responsable de secteur', 'Manager commercial', 'Product Owner', 'Chef de projet digital', 'Technicien assistance informatique', 'Administrateur informatique', 'Service Delivery Manager']) {
      const r = searchRome(ix, q, 4)
      console.log(q, '=>', r.map((h) => `${h.code} ${h.intitule} [${h.matches.slice(0, 2).join(' ; ')}]`).join(' | '))
      expect(r.length).toBeGreaterThan(0)
    }
  })
  it('gère le masculin et le féminin', () => {
    expect(genderForm('Chef / Cheffe de rayon alimentaire', 'm')).toBe('Chef de rayon alimentaire')
    expect(genderForm('Chef / Cheffe de rayon alimentaire', 'f')).toBe('Cheffe de rayon alimentaire')
    expect(genderForm('Animateur commercial / Animatrice commerciale', 'm')).toBe('Animateur commercial')
    expect(genderForm('Responsable Commercial / Commerciale', 'm')).toBe('Responsable Commercial')
    expect(genderForm('Responsable commercial(e) international(e)', 'm')).toBe('Responsable commercial international')
    expect(genderForm('Product Owner', 'f')).toBe('Product Owner')
  })
})

import { mainTitle, refineWords } from '../lib/rome'
it('affine avec le contexte du poste', () => {
  expect(mainTitle("Responsable de secteur - déploiement d'outils & accompagnement d'équipes")).toBe('Responsable de secteur')
  const ctx = "Géant Casino Près d'Arènes puis Casino#hyperfrais Odysseum. Accompagnement de mon secteur (environ 15 collaborateurs sur ~80 dans le magasin) lors des déploiements d'outils : Power BI, SharePoint, bascule de l'AS400 vers Gold. Mise en place d'un outil PDA avec lecteur d'EAN pour la gestion des DLC. Recueil des besoins terrain."
  const w = refineWords(ix, 'Responsable de secteur', ctx)
  console.log('affiner:', w)
  expect(w).toContain('magasin')
  const r = searchRome(ix, 'Responsable de secteur magasin', 3)
  console.log(r.map((h) => h.code + ' ' + h.intitule))
  expect(r[0].code).toBe('D1509')
})
