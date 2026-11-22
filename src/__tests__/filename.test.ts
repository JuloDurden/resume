import { describe, expect, it } from 'vitest'
import { cleanPost, personName, shortDocName } from '../lib/filename'
import type { AnyDoc, Offer } from '../types'

const doc = (name: string, kind: 'resume' | 'letter' = 'resume') => ({ name, kind, recipient: { company: '' } }) as unknown as AnyDoc
const offer = (title: string, company: string, location = '') => ({ title, company, location }) as Offer

describe('noms de fichiers', () => {
  it('nettoie un intitulé', () => {
    expect(cleanPost('Responsable Informatique H/F')).toBe('Responsable Informatique')
    expect(cleanPost('Business Analyst (F/H)')).toBe('Business Analyst')
    expect(cleanPost('Chef de projet (H/F/X) - Montpellier', 'Montpellier (34)')).toBe('Chef de projet')
    expect(cleanPost('Candidature Spontanée Support Applicatif')).toBe('Support Applicatif')
    expect(cleanPost('Tech-Fun manager')).toBe('Tech-Fun manager')
  })
  it('met le nom en forme', () => {
    expect(personName('JULIEN CLAVEL')).toBe('Julien CLAVEL')
    expect(personName('jean-pierre de la tour')).toBe('Jean-Pierre De La TOUR')
  })
  it('raccourcit les noms de documents, garde les noms personnalisés', () => {
    expect(shortDocName(doc("Responsable des Systemes d'Information H/F - Montpellier Emplois"), offer("Responsable des Systemes d'Information H/F", 'IRFA Sud'))).toBe("Responsable des Systemes d'Information")
    expect(shortDocName(doc("Responsable d'exploitation - GSF"), offer("Responsable d'exploitation", 'GSF'))).toBe("Responsable d'exploitation")
    expect(shortDocName(doc('Candidature Spontanée - AB+ Software'), offer('Candidature Spontanée Support Applicatif & Accompagnement utilisateurs', 'AB+ Software'))).toBe('Support Applicatif & Accompagnement utilisateurs')
    expect(shortDocName(doc("Responsable d'équipe multi-expertises"), offer('Responsable Back-Office', 'Urbasolar'))).toBeUndefined()
    expect(shortDocName(doc('Responsable Informatique'), offer('Responsable Informatique H/F', 'Adecco'))).toBeUndefined()
    expect(shortDocName(doc('Chargé de mission Transformation Numérique'), offer('Chargé de mission Transformation Numérique Junior', 'CAF Hérault'))).toBeUndefined()
  })
})
