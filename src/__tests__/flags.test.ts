import { describe, expect, it } from 'vitest'
import type { FeedItem } from '../types'
import { parseSalary } from '../lib/salary'
import { redFlags } from '../lib/redflags'

describe('salaires', () => {
  it('lit les formats courants', () => {
    expect(parseSalary('40 k € - 48 k € (estimation)')).toEqual({ min: 40000, max: 48000 })
    expect(parseSalary('Salaire : Annuel de 40000.0 Euros à 45000.0 Euros')).toEqual({ min: 40000, max: 45000 })
    expect(parseSalary('Rémunération : 45K€ brut annuel')).toEqual({ min: 45000, max: 45000 })
    expect(parseSalary('3 200 € brut mensuel')).toEqual({ min: 38400, max: 38400 })
    expect(parseSalary('474 € (estimation)')).toBeUndefined()
    expect(parseSalary('Nous sommes 45 000 collaborateurs')).toBeUndefined()
  })
})

describe('red flags', () => {
  const it2 = (fullText: string): FeedItem => ({ id: 'x', alerts: [], title: 'Chef de projet', url: '', source: '', fullText })
  it('repère les formulations suspectes', () => {
    const f = redFlags(it2('Vous avez une forte résistance au stress et une disponibilité totale, même le week-end. Salaire attractif. Équipe jeune et dynamique. '.repeat(3)))
    const labels = f.map((x) => x.label)
    expect(labels).toEqual(expect.arrayContaining(['Forte pression annoncée', 'Disponibilité très étendue', 'Salaire flou', "Mention de l'âge"]))
    expect(f[0].quote).toContain('résistance au stress')
  })
  it('reste silencieux sur une annonce normale', () => {
    expect(redFlags(it2('Au sein de la DSI, vous pilotez le backlog produit, animez les cérémonies Scrum et travaillez avec les équipes métier. Salaire : 45 k€ brut annuel, télétravail 2 jours. '.repeat(6)))).toEqual([])
  })
})
