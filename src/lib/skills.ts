// Compétences avec précisions : « Microsoft 365 (Teams, SharePoint, Intune) ».
// Stockées en texte simple (compatible exports, prompts, ATS) ; l'éditeur et le rendu savent les décomposer.

export interface SkillParts {
  name: string
  details: string[]
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

/** Sépare le nom et les précisions finales entre parenthèses. */
export function parseSkill(raw: string): SkillParts {
  const s = raw.trim()
  if (!s.endsWith(')')) return { name: s, details: [] }
  // retrouve la parenthèse ouvrante qui ferme en fin de texte
  let d = 0
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === ')') d++
    else if (s[i] === '(') {
      d--
      if (d === 0) {
        const name = s.slice(0, i).trim()
        if (!name) return { name: s, details: [] }
        return { name, details: splitTop(s.slice(i + 1, -1)) }
      }
    }
  }
  return { name: s, details: [] }
}

export const formatSkill = (name: string, details: string[]) => {
  const d = details.map((x) => x.trim()).filter(Boolean)
  return d.length ? `${name.trim()} (${d.join(', ')})` : name.trim()
}

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

/** Toutes les compétences d'une liste, précisions comprises (pour l'analyse de mots-clés). */
export const skillTerms = (tags: string[]) => tags.flatMap((t) => {
  const p = parseSkill(t)
  return [p.name, ...p.details]
})

/** « Reporting (Excel - Power BI) » ou « Reporting : Excel - Power BI » → « Reporting (Excel, Power BI) » : anciennes façons d'éviter les virgules. */
export function dashesToDetails(raw: string): string {
  const p = parseSkill(raw)
  // « Gestion économique : commandes - stocks - marge »
  const colon = !p.details.length && raw.match(/^([^:()]+?)\s+:\s+([^:()]+\s[-–]\s[^:()]+)$/)
  if (colon) return formatSkill(colon[1], colon[2].split(/\s[-–]\s/))
  if (p.details.length !== 1 || !/\s[-–]\s/.test(p.details[0])) return raw
  return formatSkill(p.name, p.details[0].split(/\s[-–]\s/))
}
