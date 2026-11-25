// Compétences avec précisions : « Microsoft 365 (Teams, SharePoint, Intune) ».
// Stockées en texte simple (compatible exports, prompts, ATS) ; l'éditeur et le rendu savent les décomposer.

export interface SkillParts {
  /** vide pour une phrase de plusieurs compétences (« Recrutement, formation et montée en compétences ») */
  name: string
  details: string[]
  /** façon dont les précisions sont écrites ; « list » : plusieurs compétences dans une phrase */
  style: 'paren' | 'colon' | 'list'
  /** la dernière précision est introduite par « et » */
  and?: boolean
}

/** Profondeur de parenthèses ouvertes à la fin du texte (0 = aucune parenthèse ouverte). */
export function openDepth(s: string): number {
  let d = 0
  for (const c of s) {
    if (c === '(') d++
    else if (c === ')' && d > 0) d--
  }
  return d
}

/** Le texte contient-il un séparateur (virgule, point-virgule, saut de ligne) hors parenthèses ? */
export function hasTopSeparator(s: string, seps = ',;\n'): boolean {
  let d = 0
  for (const c of s) {
    if (c === '(') d++
    else if (c === ')' && d > 0) d--
    else if (d === 0 && seps.includes(c)) return true
  }
  return false
}

/** Découpe aux séparateurs situés hors parenthèses : « A, B (x, y); C » → A | B (x, y) | C. */
export function splitTop(s: string, seps = ',;\n'): string[] {
  const out: string[] = []
  let d = 0
  let cur = ''
  for (const c of s) {
    if (c === '(') d++
    else if (c === ')' && d > 0) d--
    if (d === 0 && seps.includes(c)) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((x) => x.trim()).filter(Boolean)
}

/** Position du dernier « et » hors parenthèses, ou -1. */
function lastTopAnd(s: string): number {
  let d = 0
  let found = -1
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(') d++
    else if (c === ')' && d > 0) d--
    else if (d === 0 && /\s/.test(c) && s.slice(i, i + 4).match(/^\set\s/i)) found = i
  }
  return found
}

/** « a, b et c » → [a, b, c] ; le « et » final ne sépare que s'il y a déjà une virgule (« hygiène et sécurité » reste entier). */
export function splitList(s: string): { items: string[]; and: boolean } {
  const items = splitTop(s, ',;\n')
  if (items.length >= 2) {
    const last = items[items.length - 1]
    const k = lastTopAnd(last)
    if (k > 0) {
      const a = last.slice(0, k).trim()
      const b = last.slice(k + 4).trim()
      if (a && b) return { items: [...items.slice(0, -1), a, b], and: true }
    }
  }
  return { items, and: false }
}

/** Position du premier « : » (suivi d'une espace) hors parenthèses, ou -1. */
function topColon(s: string): number {
  let d = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(') d++
    else if (c === ')' && d > 0) d--
    else if (d === 0 && c === ':' && /\s/.test(s[i + 1] ?? '') && i > 0) return i
  }
  return -1
}

/**
 * Sépare le nom et ses précisions, écrites de deux façons :
 * « Microsoft 365 (Teams, Intune) » ou « Support fonctionnel : qualification des anomalies, suivi (ticketing) ».
 * Une précision peut elle-même avoir les siennes entre parenthèses.
 */
export function parseSkill(raw: string): SkillParts {
  const s = raw.trim()
  const c = topColon(s)
  if (c > 0) {
    const name = s.slice(0, c).trim()
    const { items, and } = splitList(s.slice(c + 1))
    if (name && items.length) return { name, details: items, style: 'colon', ...(and ? { and } : {}) }
  }
  // plusieurs compétences dans une phrase : « Recrutement, formation et montée en compétences »
  if (hasTopSeparator(s, ',;')) {
    const { items, and } = splitList(s)
    if (items.length >= 2) return { name: '', details: items, style: 'list', ...(and ? { and } : {}) }
  }
  if (!s.endsWith(')')) return { name: s, details: [], style: 'paren' }
  // retrouve la parenthèse ouvrante qui ferme en fin de texte
  let d = 0
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === ')') d++
    else if (s[i] === '(') {
      d--
      if (d === 0) {
        const name = s.slice(0, i).trim()
        if (!name) return { name: s, details: [], style: 'paren' }
        const { items, and } = splitList(s.slice(i + 1, -1))
        return { name, details: items, style: 'paren', ...(and ? { and } : {}) }
      }
    }
  }
  return { name: s, details: [], style: 'paren' }
}

export type NestStyle = 'paren' | 'colon' | 'list'

/** « a, b, c » ou, avec and, « a, b et c ». */
export const joinList = (d: string[], and = false) => (and && d.length >= 2 ? `${d.slice(0, -1).join(', ')} et ${d[d.length - 1]}` : d.join(', '))

export const formatSkill = (name: string, details: string[], style: NestStyle = 'paren', and = false) => {
  const d = details.map((x) => x.trim()).filter(Boolean)
  if (style === 'list') return d.length ? joinList(d, and) : name.trim()
  if (!d.length) return name.trim()
  return style === 'colon' ? `${name.trim()} : ${joinList(d, and)}` : `${name.trim()} (${joinList(d, and)})`
}

/** Nombre de compétences d'une phrase (« a, b et c » : 3), 1 sinon. */
export const listCount = (raw: string): number => {
  const p = parseSkill(raw)
  return p.style === 'list' ? p.details.length : 1
}

/** Nombre total de compétences imbriquées (précisions des précisions comprises ; pour une phrase, ses compétences). */
export const nestedCount = (raw: string): number => parseSkill(raw).details.reduce((n, d) => n + 1 + nestedCount(d), 0)

export type SkillDetailsDisplay = 'paren' | 'colon' | 'sub'

/** Texte d'une compétence selon l'affichage choisi (pour les rendus en texte suivi). */
export function skillText(raw: string, mode: SkillDetailsDisplay = 'paren'): string {
  if (mode === 'paren') return raw.trim()
  const { name, details, style, and } = parseSkill(raw)
  if (style === 'list') return raw.trim()
  return details.length ? `${name} : ${joinList(details, and)}` : name
}

/** Liste en texte suivi : les virgules séparent les compétences, sauf si des précisions en contiennent déjà. */
export function skillsInline(tags: string[], mode: SkillDetailsDisplay = 'paren'): string {
  const parts = tags.map((t) => parseSkill(t))
  // des virgules à l'intérieur d'une compétence : les compétences sont séparées par un point médian
  const sep = parts.some((p) => p.style === 'list') || (parts.some((p) => p.details.length) && mode !== 'paren') ? ' · ' : ', '
  return tags.map((t) => skillText(t, mode)).join(sep)
}

/** Toutes les compétences d'une liste, précisions imbriquées comprises (pour l'analyse de mots-clés). */
export const skillTerms = (tags: string[]): string[] =>
  tags.flatMap((t) => {
    const p = parseSkill(t)
    return [...(p.name ? [p.name] : []), ...skillTerms(p.details)]
  })

/** « Reporting (Excel - Power BI) » ou « Reporting : Excel - Power BI » → précisions séparées par des virgules : anciennes façons d'éviter les virgules. */
export function dashesToDetails(raw: string): string {
  const p = parseSkill(raw)
  if (p.style === 'list' || p.details.length !== 1 || !/\s[-–]\s/.test(p.details[0])) return raw
  return formatSkill(p.name, p.details[0].split(/\s[-–]\s/), p.style)
}
