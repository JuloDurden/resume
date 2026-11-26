// Salaire d'une candidature : lecture souple de ce qui est noté, conversion brut / net (estimation),
// position par rapport au minimum du profil de recherche.
import type { Offer } from '../types'
import { parseSalary } from './salary'

/** Cotisations salariales moyennes (estimation, comme les simulateurs en ligne). */
export const RATES = { nc: 0.22, c: 0.25, fp: 0.17 } as const
export type PayStatus = keyof typeof RATES
export const STATUS_LABEL: Record<PayStatus, string> = { nc: 'non-cadre', c: 'cadre', fp: 'fonction publique' }

const HOURS_YEAR = 35 * 52

/**
 * Lit un salaire tapé librement : « 30 k€ brut/an », « 28-32k », « 2 400 € net/mois », « 14 € de l'heure ».
 * Renvoie le brut annuel (fourchette) ; net : le montant tapé était un net.
 */
export function parseTyped(text: string | undefined, rate: number = RATES.nc): { min: number; max: number; net: boolean } | undefined {
  if (!text?.trim()) return undefined
  const t = text.toLowerCase().replace(/(\d)[\s  .](?=\d{3}\b)/g, '$1').replace(/,(\d)/g, '.$1')
  const nums = [...t.matchAll(/(\d+(?:\.\d+)?)\s*(k)?/g)].map((m) => ({ n: parseFloat(m[1]), k: !!m[2] }))
  if (!nums.length) return undefined
  const anyK = nums.some((x) => x.k) || /k\s*€/.test(t)
  let vals = nums.slice(0, 2).map((x) => (x.k || (anyK && x.n < 1000) ? x.n * 1000 : x.n))
  const hourly = /heure|horaire|\/\s*h\b|€\s*h\b/.test(t) || Math.max(...vals) < 100
  const monthly = !hourly && (/mois|mensuel/.test(t) || Math.max(...vals) < 12000)
  vals = vals.map((v) => (hourly ? v * HOURS_YEAR : monthly ? v * 12 : v))
  const net = /\bnet/.test(t) && !/brut/.test(t)
  if (net) vals = vals.map((v) => v / (1 - rate))
  const [a, b = a] = vals.map(Math.round)
  const min = Math.min(a, b)
  const max = Math.max(a, b)
  if (max < 8000 || min > 400000) return undefined
  return { min, max, net }
}

/** Poste cadre : choisi à la main, sinon « cadre » dans l'annonce (et pas « non cadre »). */
export function statusOf(o: Offer): PayStatus {
  if (o.payStatus) return o.payStatus
  const text = `${o.title ?? ''} ${o.contract ?? ''} ${o.description ?? ''}`.toLowerCase()
  return /\bstatut cadre|\bposte cadre|\bcadre\b(?! de\b)/.test(text) && !/non[- ]cadre|agent de ma[iî]trise/.test(text) ? 'c' : 'nc'
}

export interface Pay {
  /** brut annuel */
  min: number
  max: number
  status: PayStatus
  /** net mensuel avant impôt */
  netMin: number
  netMax: number
  /** ce qui est noté sur la candidature (ou lu dans l'annonce) */
  text: string
  /** salaire ajouté après coup (pas dans l'annonce) */
  later?: boolean
}

export const netMonth = (brutYear: number, status: PayStatus) => (brutYear * (1 - RATES[status])) / 12

/**
 * Net après impôt : taux de prélèvement à la source appliqué au net imposable
 * (net + CSG et CRDS non déductibles, 2,9 % de 98,25 % du brut).
 */
export const afterTax = (brutYear: number, status: PayStatus, taxRate = 0) => {
  const net = brutYear * (1 - RATES[status])
  return net - (net + brutYear * 0.9825 * 0.029) * (taxRate / 100)
}

/** Salaire d'une candidature : celui noté (tapé librement), sinon celui lu dans l'annonce. */
export function payOf(o: Offer): Pay | undefined {
  const status = statusOf(o)
  const typed = parseTyped(o.salary, RATES[status])
  const read = typed ?? parseSalary(o.salary) ?? parseSalary(o.description)
  if (!read) return undefined
  return {
    min: read.min,
    max: read.max,
    status,
    netMin: netMonth(read.min, status),
    netMax: netMonth(read.max, status),
    text: o.salary?.trim() || fmtRange(read.min, read.max, 'k'),
    later: !!o.salaryAt,
  }
}

export const fmtEur = (n: number) => Math.round(n).toLocaleString('fr-FR')
export function fmtRange(a: number, b: number, unit?: 'k') {
  if (unit === 'k') {
    const k = (n: number) => `${Math.round(n / 1000)}`
    return k(a) === k(b) ? `${k(a)} k€` : `${k(a)} – ${k(b)} k€`
  }
  return Math.round(a) === Math.round(b) ? `${fmtEur(a)} €` : `${fmtEur(a)} – ${fmtEur(b)} €`
}

/** Position par rapport au minimum du profil (brut annuel) : écart en net par mois. */
export function vsMinimum(p: Pay, minBrut?: number): { tone: 'ok' | 'mid' | 'ko'; low: number; high: number; minNet: number } | undefined {
  if (!minBrut) return undefined
  const minNet = netMonth(minBrut, p.status)
  const low = p.netMin - minNet
  const high = p.netMax - minNet
  return { tone: low >= 0 ? 'ok' : high < 0 ? 'ko' : 'mid', low, high, minNet }
}

export const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmtEur(Math.abs(n))} €`
