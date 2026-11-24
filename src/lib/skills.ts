// Compétences avec précisions : « Microsoft 365 (Teams, SharePoint, Intune) ».
// Stockées en texte simple (compatible exports, prompts, ATS) ; l'éditeur et le rendu savent les décomposer.

export interface SkillParts {
  name: string
  details: string[]
  /** façon dont les précisions sont écrites */
  style: 'paren' | 'colon'
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
    const details = splitTop(s.slice(c + 1))
    if (name && details.length) return { name, details, style: 'colon' }
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
        return { name, details: splitTop(s.slice(i + 1, -1)), style: 'paren' }
      }
    }
  }
  return { name: s, details: [], style: 'paren' }
}

export type NestStyle = 'paren' | 'colon'

export const formatSkill = (name: string, details: string[], style: NestStyle = 'paren') => {
  const d = details.map((x) => x.trim()).filter(Boolean)
  if (!d.length) return name.trim()
  return style === 'colon' ? `${name.trim()} : ${d.join(', ')}` : `${name.trim()} (${d.join(', ')})`
}

/** Nombre total de compétences imbriquées (précisions des précisions comprises). */
export const nestedCount = (raw: string): number => parseSkill(raw).details.reduce((n, d) => n + 1 + nestedCount(d), 0)

export type SkillDetailsDisplay = 'paren' | 'colon' | 'sub'

/** Texte d'une compétence selon l'affichage choisi (pour les rendus en texte suivi). */
export function skillText(raw: string, mode: SkillDetailsDisplay = 'paren'): string {
  if (mode === 'paren') return raw.trim()
  const { name, details } = parseSkill(raw)
  return details.length ? `${name} : ${details.join(', ')}` : name
}

/** Liste en texte suivi : les virgules séparent les compétences, sauf si des précisions en contiennent déjà. */
export function skillsInline(tags: string[], mode: SkillDetailsDisplay = 'paren'): string {
  const withDetails = tags.some((t) => parseSkill(t).details.length)
  return tags.map((t) => skillText(t, mode)).join(withDetails && mode !== 'paren' ? ' · ' : ', ')
}

/** Toutes les compétences d'une liste, précisions imbriquées comprises (pour l'analyse de mots-clés). */
export const skillTerms = (tags: string[]): string[] =>
  tags.flatMap((t) => {
    const p = parseSkill(t)
    return [p.name, ...skillTerms(p.details)]
  })

/** « Reporting (Excel - Power BI) » ou « Reporting : Excel - Power BI » → précisions séparées par des virgules : anciennes façons d'éviter les virgules. */
export function dashesToDetails(raw: string): string {
  const p = parseSkill(raw)
  if (p.details.length !== 1 || !/\s[-–]\s/.test(p.details[0])) return raw
  return formatSkill(p.name, p.details[0].split(/\s[-–]\s/), p.style)
}
