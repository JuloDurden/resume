import { describe, expect, it } from 'vitest'
import { afterTax, netMonth, parseTyped, payOf, statusOf, vsMinimum } from '../lib/pay'
import type { Offer } from '../types'

const o = (p: Partial<Offer>) => ({ id: 'o', createdAt: 0, updatedAt: 0, ...p }) as Offer

describe('salaire tapé librement', () => {
  it('formats courants', () => {
    expect(parseTyped('30 k€ brut/an')).toMatchObject({ min: 30000, max: 30000, net: false })
    expect(parseTyped('28-32k')).toMatchObject({ min: 28000, max: 32000 })
    expect(parseTyped('25 à 30 k€')).toMatchObject({ min: 25000, max: 30000 })
    expect(parseTyped('32 k € - 34 k € (estimation)')).toMatchObject({ min: 32000, max: 34000 })
    expect(parseTyped('26400€ brut annuel')).toMatchObject({ min: 26400 })
    expect(parseTyped('2 400 € net/mois')).toMatchObject({ min: Math.round((2400 * 12) / 0.78), net: true })
    expect(parseTyped('3 200 € brut mensuel')).toMatchObject({ min: 38400 })
    expect(parseTyped('14 € de l’heure')).toMatchObject({ min: 14 * 35 * 52 })
    expect(parseTyped('selon profil')).toBeUndefined()
  })
  it('net estimé, impôt, cadre', () => {
    expect(Math.round(netMonth(32000, 'nc'))).toBe(2080)
    expect(Math.round(netMonth(32000, 'c'))).toBe(2000)
    expect(Math.round(afterTax(32000, 'nc', 0))).toBe(24960)
    expect(afterTax(32000, 'nc', 5)).toBeLessThan(24960 * 0.96)
    expect(statusOf(o({ title: 'Responsable des systèmes d’information', description: 'Poste cadre, forfait jours' }))).toBe('c')
    expect(statusOf(o({ description: 'Statut agent de maîtrise ou cadre selon profil' }))).toBe('nc')
    expect(statusOf(o({ description: 'cadre de travail agréable' }))).toBe('nc')
  })
  it('candidature : salaire noté, sinon annonce ; écart avec le minimum', () => {
    const p = payOf(o({ salary: '32 k € - 34 k € (estimation)' }))!
    expect([Math.round(p.netMin), Math.round(p.netMax)]).toEqual([2080, 2210])
    expect(vsMinimum(p, 30000)).toMatchObject({ tone: 'ok' })
    expect(vsMinimum(p, 33000)?.tone).toBe('mid')
    expect(vsMinimum(p, 40000)?.tone).toBe('ko')
    expect(payOf(o({ description: 'Salaire : 2 500 € brut mensuel' }))?.min).toBe(30000)
    expect(payOf(o({}))).toBeUndefined()
  })
})
