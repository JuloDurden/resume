// Salaire d'une annonce (annuel brut, en euros) et comparaison avec les annonces comparables déjà reçues.
import type { FeedItem } from '../types'

export interface Salary {
  min: number
  max: number
}

const num = (s: string, k?: string) => {
  const n = Number(s.replace(/[\s  ]/g, '').replace(',', '.'))
  return k ? n * 1000 : n
}

/** Lit un salaire dans un texte : « 40 k € - 48 k € », « 45K€ », « Annuel de 40000 à 45000 », « 3 200 € brut mensuel »... */
export function parseSalary(text?: string): Salary | undefined {
  if (!text) return undefined
  const t = text.replace(/ | /g, ' ')
  const re = /(\d+(?:[ .]\d{3})*(?:[.,]\d+)?)\s*(k)?\s*(?:€|euros?|eur)?\s*(?:-|à|a|et|–)\s*(\d+(?:[ .]\d{3})*(?:[.,]\d+)?)\s*(k)?\s*(?:€|euros?|eur)|(\d{1,3}(?:[ .]\d{3})*(?:[.,]\d+)?)\s*(k)\s*€?|(\d{1,3}(?:[ .]\d{3})+|\d{4,6})\s*(?:€|euros?)/gi
  const ctxOk = (i: number) => /salaire|r[ée]mun[ée]ration|brut|€|euro|k€|package|annuel|mensuel|estimation|fixe/i.test(t.slice(Math.max(0, i - 60), i + 80))
  for (const m of t.matchAll(re)) {
    if (!ctxOk(m.index ?? 0)) continue
    let a: number
    let b: number
    if (m[1] && m[3]) {
      b = num(m[3], m[4])
      a = num(m[1], m[2] ?? m[4])
    } else if (m[5]) a = b = num(m[5], m[6])
    else a = b = num(m[7].replace(/[ .]/g, ''))
    a = Math.round(a)
    b = Math.round(b)
    if (!a || !b || b < a) continue
    const monthly = /mensuel|par mois|\/\s*mois/i.test(t.slice(m.index ?? 0, (m.index ?? 0) + 80)) || b < 12000
    if (b < 1000) continue // gratification horaire ou de stage
    const f = monthly ? 12 : 1
    const r = { min: a * f, max: b * f }
    if (r.max < 12000 || r.min > 300000) continue
    return r
  }
  return undefined
}

export const salaryOf = (i: FeedItem) => parseSalary(i.salary) ?? parseSalary(i.fullText) ?? parseSalary(i.description)

export const fmtK = (n: number) => `${Math.round(n / 1000)} k€`
export const fmtSalary = (s: Salary) => (s.min === s.max ? fmtK(s.min) : `${fmtK(s.min)} à ${fmtK(s.max)}`)

export interface SalaryBench {
  median: number
  n: number
  family: string
  /** région de la médiane (absente : toutes régions confondues) */
  region?: string
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/** Médianes des salaires (milieu de fourchette) par métier visé, par région et toutes régions confondues. */
export function salaryBenchmarks(items: FeedItem[], familyOf: (i: FeedItem) => string | undefined, regionOf: (i: FeedItem) => string | undefined = () => undefined): Map<string, SalaryBench> {
  const by = new Map<string, number[]>()
  const push = (k: string, v: number) => by.set(k, [...(by.get(k) ?? []), v])
  for (const i of items) {
    const f = familyOf(i)
    const s = salaryOf(i)
    if (!f || !s) continue
    const mid = (s.min + s.max) / 2
    if (mid < 20000) continue // stages et alternances faussent la médiane
    push(`${f}|*`, mid)
    const r = regionOf(i)
    if (r) push(`${f}|${r}`, mid)
  }
  const out = new Map<string, SalaryBench>()
  for (const [k, v] of by) {
    if (v.length < 3) continue
    const [family, region] = k.split('|')
    out.set(k, { median: median(v), n: v.length, family, region: region === '*' ? undefined : region })
  }
  return out
}

/** Médiane la plus précise disponible : même métier et même région, sinon même métier. */
export const benchFor = (b: Map<string, SalaryBench>, family?: string, region?: string) => (family ? (region && b.get(`${family}|${region}`)) || b.get(`${family}|*`) : undefined)

export function compareSalary(s: Salary, b?: SalaryBench, regionName?: (code: string) => string): { tone: 'low' | 'ok' | 'high'; label: string } | undefined {
  if (!b) return undefined
  const mid = (s.min + s.max) / 2
  const r = mid / b.median
  const tone = r < 0.88 ? 'low' : r > 1.12 ? 'high' : 'ok'
  const where = b.region && regionName ? `, ${regionName(b.region)}` : ''
  return { tone, label: `${tone === 'low' ? 'Sous' : tone === 'high' ? 'Au-dessus de' : 'Dans'} la médiane « ${b.family} »${where} : ${fmtK(b.median)} (${b.n} annonces)` }
}
