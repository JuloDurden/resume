// Profils de recherche et parcours : expériences des CV rattachées à des métiers ROME et à des profils.
import type { DateValue, MatchProfile, ResumeDoc } from '../types'
import { strip } from './ats'

export interface PoolExperience {
  key: string
  title: string
  company: string
  start?: DateValue
  end?: DateValue
  current?: boolean
  /** durée en mois */
  months: number
}

const companyPart = (c?: string) =>
  strip(c ?? '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 2)
    .join(' ')

/** Clé stable d'une expérience, commune à tous les CV : entreprise et année de début. */
export const expKey = (company?: string, start?: DateValue) => `${companyPart(company)}|${start?.year ?? ''}`

const monthIndex = (d: DateValue | undefined, fallback: number) => (d?.year ? d.year * 12 + ((d.month ?? 1) - 1) : fallback)
const nowIndex = () => {
  const n = new Date()
  return n.getFullYear() * 12 + n.getMonth()
}

function span(start?: DateValue, end?: DateValue, current?: boolean): [number, number] | undefined {
  if (!start?.year) return undefined
  const a = monthIndex(start, 0)
  // fin inconnue : l'année de début seulement (sauf poste en cours)
  const b = current || !end ? (current ? nowIndex() : a + (start.month ? 1 : 12)) : monthIndex(end, a) + (end.month ? 1 : 12)
  return b > a ? [a, b] : undefined
}

/** Expériences professionnelles de tous les CV, sans doublon (le CV le plus récent donne l'intitulé). */
export function experiencePool(docs: ResumeDoc[]): PoolExperience[] {
  const out = new Map<string, PoolExperience>()
  for (const d of [...docs].sort((a, b) => b.updatedAt - a.updatedAt))
    for (const s of d.sections) {
      if (s.type !== 'experience') continue
      for (const it of s.items) {
        if (!it.title || !it.start?.year) continue
        const key = expKey(it.subtitle, it.start)
        if (out.has(key)) continue
        const sp = span(it.start, it.end, it.current)
        out.set(key, { key, title: it.title, company: it.subtitle ?? '', start: it.start, end: it.end, current: it.current, months: sp ? sp[1] - sp[0] : 0 })
      }
    }
  return [...out.values()].sort((a, b) => monthIndex(b.start, 0) - monthIndex(a.start, 0))
}

/** Années d'expérience d'un profil : durées des expériences rattachées, sans compter deux fois les périodes communes. */
export function trackYears(trackId: string, pool: PoolExperience[], links: MatchProfile['experiences']): number {
  const spans = pool
    .filter((e) => links?.[e.key]?.tracks?.includes(trackId))
    .map((e) => span(e.start, e.end, e.current))
    .filter((x): x is [number, number] => !!x)
    .sort((a, b) => a[0] - b[0])
  let months = 0
  let cur: [number, number] | undefined
  for (const s of spans) {
    if (cur && s[0] <= cur[1]) cur[1] = Math.max(cur[1], s[1])
    else {
      if (cur) months += cur[1] - cur[0]
      cur = [...s]
    }
  }
  if (cur) months += cur[1] - cur[0]
  return Math.round((months / 12) * 10) / 10
}

/** Savoir-faire ROME des expériences rattachées à un profil. */
export const trackRomeSkills = (trackId: string, links: MatchProfile['experiences']) => [...new Set(Object.values(links ?? {}).flatMap((l) => (l.tracks?.includes(trackId) ? l.skills ?? [] : [])))]

export const fmtYears = (y: number) => (y < 1 ? `${Math.round(y * 12)} mois` : `${Math.round(y)} an${Math.round(y) > 1 ? 's' : ''}`)
