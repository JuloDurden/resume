import type { ResumeDoc, SectionItem } from '../types'
import { ACTION_NOUNS, ACTION_VERBS, STOPWORDS } from './stopwords'
import { resumeToText, orderedSections } from './export'
import { SECTION_DEFS } from '../data/sectionDefs'
import { stripInline } from './inline'

export const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface Tok {
  raw: string
  norm: string
  stem: string
  sentenceStart: boolean
  afterBreak: boolean
}

// Suffixes français et anglais retirés pour rapprocher les formes d'un même mot
// (accompagnement / accompagner, formations / former, déploiement / déployer...)
const SUFFIXES = [
  'issements', 'issement', 'atrices', 'ateurs', 'ations', 'atrice', 'ateur', 'ation', 'ements', 'ement', 'ments', 'ment',
  'ances', 'ences', 'ance', 'ence', 'ités', 'ite', 'iques', 'ique', 'ables', 'able', 'istes', 'iste', 'euses', 'euse', 'eurs', 'eur',
  'ives', 'ive', 'ifs', 'if', 'ions', 'ion', 'ees', 'ee', 'es', 'er', 'ez', 'ant', 'ing', 'ed', 'e', 's', 'x',
]
export function stem(t: string): string {
  if (t.length <= 4 || /\d|[+#.]/.test(t)) return t
  for (const suf of SUFFIXES) {
    if (t.endsWith(suf) && t.length - suf.length >= 4) return t.slice(0, -suf.length).replace(/(y|i)$/, 'i')
  }
  return t
}

export function tokenize(text: string): Tok[] {
  const out: Tok[] = []
  const re = /[\p{L}\p{N}][\p{L}\p{N}+#./'’-]*|[.!?;:\n•]|[(),/|«»"]/gu
  let sentenceStart = true
  let afterBreak = true
  for (const m of text.matchAll(re)) {
    let raw = m[0]
    if (/^[.!?;:\n•]$/.test(raw)) {
      sentenceStart = true
      afterBreak = true
      continue
    }
    if (/^[(),/|«»"]$/.test(raw)) {
      afterBreak = true
      continue
    }
    raw = raw.replace(/[.'’-]+$/, '')
    // élisions françaises : l'équipe, d'outils
    const el = /^(?:[ldjmnstc]|qu|jusqu|lorsqu)['’](.+)$/i.exec(raw)
    if (el) raw = el[1]
    if (!raw) continue
    const norm = strip(raw)
    out.push({ raw, norm, stem: stem(norm), sentenceStart, afterBreak })
    sentenceStart = false
    afterBreak = false
  }
  return out
}

const isStop = (t: Tok) => STOPWORDS.has(t.norm) || /^\d+$/.test(t.norm)
const isTechnical = (t: Tok) =>
  /[+#]|\d/.test(t.raw) ||
  (!t.sentenceStart && /^[A-Z][A-Za-z]*[A-Z]/.test(t.raw)) || // PowerBI, ServiceNow
  (/^[A-Z]{2,6}$/.test(t.raw) && !STOPWORDS.has(t.norm)) // ITIL, SQL, KPI

const KNOWN = new Set(
  `agile scrum kanban safe itil itsm jira confluence zendesk servicenow glpi sql python excel vba powerbi tableau sap salesforce crm erp api rest devops docker kubernetes aws azure gcp cloud linux windows sharepoint office365 teams figma ux ui seo sem analytics prince2 pmp lean rgpd gdpr iso sla kpi okr moa amoa moe recette uat mco tma roadmap backlog budget reporting pilotage gouvernance cybersecurite securite reseau infrastructure helpdesk support incident probleme changement release deploiement migration integration specification specifications cahier user story stories product owner business analyst management encadrement leadership communication negociation formation conduite transformation digital digitalisation data bi dashboard automatisation qualite processus amelioration continue satisfaction client fournisseur prestataire contrat achat`
    .split(/\s+/)
    .map(stem),
)

export interface Keyword {
  key: string // tiges jointes par espace
  label: string
  stems: string[]
  freq: number
  weight: number
}

const CONNECTORS = new Set(['de', 'des', 'du', 'd', 'la', 'le', 'les', 'l', 'et', 'en', 'of', 'and', 'the', 'a', 'au', 'aux', 'pour', 'sur'])
const GRAM_LINKS = new Set(['de', 'des', 'du', 'd', 'la', 'le', 'l', 'of', 'the'])

/** Extrait les mots-clés pertinents d'une offre d'emploi. */
export function extractKeywords(jobText: string, max = 40): Keyword[] {
  const toks = tokenize(jobText)
  const uni = new Map<string, { freq: number; tech: boolean; forms: Map<string, number> }>()
  for (const t of toks) {
    if (isStop(t) || t.norm.length < 2) continue
    if (t.norm.length < 3 && !isTechnical(t)) continue
    const e = uni.get(t.stem) ?? { freq: 0, tech: false, forms: new Map() }
    e.freq++
    e.tech ||= isTechnical(t)
    e.forms.set(t.raw, (e.forms.get(t.raw) ?? 0) + 1)
    uni.set(t.stem, e)
  }

  // n-grammes : mots de contenu consécutifs, avec connecteurs autorisés au milieu
  const grams = new Map<string, { freq: number; label: string; stems: string[]; tech: boolean }>()
  for (let i = 0; i < toks.length; i++) {
    if (isStop(toks[i]) || toks[i].norm.length < 2) continue
    const stems = [toks[i].stem]
    const raws = [toks[i].raw]
    let tech = isTechnical(toks[i]) || (!toks[i].sentenceStart && /^[A-Z]/.test(toks[i].raw))
    for (let j = i + 1; j < Math.min(toks.length, i + 5) && stems.length < 3; j++) {
      const t = toks[j]
      if (t.sentenceStart || t.afterBreak) break
      if (GRAM_LINKS.has(t.norm)) {
        if (stems.length === 0) break
        raws.push(t.raw)
        continue
      }
      if (isStop(t) || t.norm.length < 2) break
      stems.push(t.stem)
      raws.push(t.raw)
      tech = tech && /^[A-Z0-9]/.test(t.raw)
      const key = stems.join(' ')
      const e = grams.get(key) ?? { freq: 0, label: raws.join(' '), stems: [...stems], tech }
      e.freq++
      grams.set(key, e)
    }
  }

  const out: Keyword[] = []
  for (const [s, e] of uni) {
    const known = KNOWN.has(s)
    if (e.freq < 2 && !e.tech && !known) continue
    const label = [...e.forms.entries()].sort((a, b) => b[1] - a[1])[0][0]
    out.push({ key: s, label, stems: [s], freq: e.freq, weight: e.freq * (e.tech ? 2 : 1) * (known ? 1.6 : 1) })
  }
  for (const [k, e] of grams) {
    const known = e.stems.every((s) => KNOWN.has(s))
    if (e.freq < 2 && !e.tech && !known) continue
    out.push({ key: k, label: e.label, stems: e.stems, freq: e.freq, weight: e.freq * 1.8 * (e.tech ? 1.5 : 1) * (known ? 1.3 : 1) })
  }
  // un mot isolé n'apparaissant que dans une expression retenue fait doublon
  const kept = out
    .sort((a, b) => b.weight - a.weight)
    .filter((k, _i, arr) => {
      if (k.stems.length > 1) return true
      const inGram = arr.filter((g) => g.stems.length > 1 && g.stems.includes(k.stems[0]))
      return !inGram.some((g) => g.freq >= k.freq)
    })
  return kept.slice(0, max)
}

export function cvStems(text: string): string[] {
  return tokenize(text)
    .filter((t) => !CONNECTORS.has(t.norm))
    .map((t) => t.stem)
}

export function countMatches(hay: string[], needle: string[]): number {
  let n = 0
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    n++
  }
  return n
}

export type MatchKind = 'full' | 'near' | 'partial' | 'none'
export interface KeywordResult extends Keyword {
  inCv: number
  match: MatchKind
  credit: number
}

export interface MatchResult {
  keywords: KeywordResult[]
  score: number
  matched: number
  total: number
}

const close = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a)))

function matchOne(hay: string[], set: Set<string>, k: Keyword): { inCv: number; match: MatchKind; credit: number } {
  const exact = countMatches(hay, k.stems)
  if (exact) return { inCv: exact, match: 'full', credit: 1 }
  const present = k.stems.filter((s) => set.has(s) || hay.some((h) => close(h, s)))
  if (present.length === k.stems.length) return { inCv: 1, match: 'near', credit: 0.8 }
  if (k.stems.length > 1 && present.length / k.stems.length >= 0.5) return { inCv: 0, match: 'partial', credit: 0.4 }
  return { inCv: 0, match: 'none', credit: 0 }
}

export function matchKeywords(cvText: string, jobText: string, ignored: string[] = [], extra: string[] = [], exclude: string[] = []): MatchResult {
  const excluded = new Set(exclude.flatMap((e) => cvStems(e)))
  const kws = extractKeywords(jobText).filter((k) => !k.stems.every((st) => excluded.has(st)))
  for (const e of extra) {
    const stems = cvStems(e)
    if (!stems.length) continue
    const key = stems.join(' ')
    if (!kws.find((k) => k.key === key)) kws.unshift({ key, label: e, stems, freq: 1, weight: 3 })
  }
  const hay = cvStems(cvText)
  const set = new Set(hay)
  const list: KeywordResult[] = kws.filter((k) => !ignored.includes(k.key)).map((k) => ({ ...k, ...matchOne(hay, set, k) }))
  const total = list.reduce((a, k) => a + k.weight, 0)
  const got = list.reduce((a, k) => a + k.weight * k.credit, 0)
  return {
    keywords: list,
    score: total ? Math.round((got / total) * 100) : 0,
    matched: list.filter((k) => k.match === 'full' || k.match === 'near').length,
    total: list.length,
  }
}

/* ---------- Contrôles structurels ---------- */

export type CheckStatus = 'ok' | 'warn' | 'error' | 'info'
export interface Check {
  id: string
  label: string
  status: CheckStatus
  detail: string
  /** 'ats' : affecte la lecture par un logiciel (compté dans le score). 'redaction' : conseil de rédaction (non compté). */
  kind: 'ats' | 'redaction'
}

// Contrôles qui influencent réellement la lecture par un ATS
const ATS_CHECKS = new Set(['contact', 'title', 'title-match', 'exp', 'exp-dates', 'exp-company', 'education', 'skills', 'headings', 'columns', 'format', 'photo'])

const bulletsOf = (items: SectionItem[]) => items.flatMap((i) => (i.bullets ?? []).filter((b) => b.trim()))

export function startsWithAction(b: string): boolean {
  const words = strip(stripInline(b).trim()).split(/\s+/)
  const first = (words[0] ?? '').replace(/[^a-z]/g, '')
  if (!first) return false
  if (ACTION_NOUNS.includes(first) || (first === 'mise' && words[1] === 'en')) return true
  return ACTION_VERBS.some((v) => first === v || (first.length > 4 && /(e|ee|es|ees|er|ant)$/.test(first) && v.startsWith(first.replace(/(ee|es|ees|er|ant)$/, 'e').slice(0, -1))))
}

export function runChecks(doc: ResumeDoc, pages: number): Check[] {
  const checks: Check[] = []
  const secs = orderedSections(doc)
  const of = (t: string) => secs.filter((s) => s.type === t)
  const add = (id: string, label: string, status: CheckStatus, detail: string) => checks.push({ id, label, status, detail, kind: ATS_CHECKS.has(id) ? 'ats' : 'redaction' })

  const contacts = doc.header.contacts.filter((c) => c.value.trim())
  const hasEmail = contacts.some((c) => c.kind === 'email' && /@/.test(c.value))
  const hasPhone = contacts.some((c) => c.kind === 'phone' && /\d{6,}/.test(c.value.replace(/\s/g, '')))
  add('contact', 'Coordonnées', hasEmail && hasPhone ? 'ok' : 'error', hasEmail && hasPhone ? 'Email et téléphone présents.' : `Ajoutez ${!hasEmail ? 'un email' : ''}${!hasEmail && !hasPhone ? ' et ' : ''}${!hasPhone ? 'un téléphone' : ''}.`)

  add('title', 'Titre du poste', doc.header.title.trim() ? 'ok' : 'warn', doc.header.title.trim() ? 'Un titre clair aide l\'ATS à classer votre profil.' : 'Ajoutez sous votre nom l\'intitulé du poste visé.')
  if (doc.job?.title?.trim() && doc.header.title.trim()) {
    const want = cvStems(doc.job.title).filter((s) => !STOPWORDS.has(s))
    const have = new Set(cvStems(doc.header.title))
    const ok = want.filter((s) => have.has(s)).length
    add('title-match', 'Titre aligné sur l\'offre', ok >= Math.ceil(want.length / 2) ? 'ok' : 'warn', ok >= Math.ceil(want.length / 2) ? 'Votre titre reprend l\'intitulé de l\'offre.' : `Reprenez l'intitulé de l'offre (« ${doc.job.title} ») dans votre titre.`)
  }

  const summary = of('summary')[0]?.items[0]?.description?.trim() ?? ''
  add('summary', 'Résumé de profil', !summary ? 'warn' : summary.length < 150 ? 'warn' : summary.length > 700 ? 'warn' : 'ok', !summary ? 'Ajoutez un court résumé : c\'est souvent la première chose lue.' : summary.length < 150 ? 'Résumé un peu court, visez 3 à 4 lignes.' : summary.length > 700 ? 'Résumé long, visez 3 à 4 lignes.' : 'Longueur adaptée.')

  const exp = of('experience').flatMap((s) => s.items.filter((i) => !i.hidden))
  if (!exp.length) add('exp', 'Expérience', 'error', 'Aucune expérience renseignée.')
  else {
    const noDates = exp.filter((i) => !i.start?.year)
    const noCompany = exp.filter((i) => !i.subtitle?.trim())
    add('exp-dates', 'Dates des expériences', noDates.length ? 'warn' : 'ok', noDates.length ? `${noDates.length} poste(s) sans date de début : les ATS calculent l'ancienneté avec ces dates.` : 'Toutes les expériences sont datées.')
    if (noCompany.length) add('exp-company', 'Entreprises', 'warn', `${noCompany.length} poste(s) sans nom d'entreprise.`)
    const bad = exp.filter((i) => {
      const n = (i.bullets ?? []).filter((b) => b.trim()).length
      return n < 2 || n > 7
    })
    add('exp-bullets', 'Puces par poste', bad.length ? 'warn' : 'ok', bad.length ? `Visez 3 à 6 puces par poste (${bad.map((i) => i.title || 'sans titre').slice(0, 3).join(', ')}).` : 'Nombre de puces équilibré.')
  }

  const bullets = bulletsOf(secs.flatMap((s) => (['experience', 'projects', 'volunteering', 'custom'].includes(s.type) ? s.items : [])))
  if (bullets.length) {
    const quant = bullets.filter((b) => /\d/.test(b)).length / bullets.length
    add('quant', 'Résultats chiffrés', quant >= 0.3 ? 'ok' : quant >= 0.15 ? 'warn' : 'error', `${Math.round(quant * 100)} % des puces contiennent un chiffre (objectif : 30 % et plus).`)
    const verbs = bullets.filter(startsWithAction).length / bullets.length
    add('verbs', 'Verbes d\'action', verbs >= 0.5 ? 'ok' : 'warn', `${Math.round(verbs * 100)} % des puces commencent par un verbe ou un nom d'action (piloté, pilotage, déploiement...).`)
    const long = bullets.filter((b) => stripInline(b).length > 220).length
    if (long) add('long-bullets', 'Puces trop longues', 'warn', `${long} puce(s) dépassent 2 lignes : allez à l'essentiel.`)
  }

  add('education', 'Formation', of('education').length ? 'ok' : 'warn', of('education').length ? 'Section présente.' : 'Ajoutez une section Formation, attendue par la plupart des ATS.')
  add('skills', 'Compétences', of('skills').length ? 'ok' : 'warn', of('skills').length ? 'Section présente.' : 'Ajoutez une section Compétences : c\'est là que les ATS cherchent les mots-clés.')

  const nonStd = secs.filter((s) => {
    const al = SECTION_DEFS[s.type].atsAliases
    if (!al.length) return false
    const t = strip(s.title.trim())
    return !al.some((a) => strip(a) === t || t.includes(strip(a)))
  })
  add('headings', 'Titres de sections', nonStd.length ? 'warn' : 'ok', nonStd.length ? `Titres peu standards : ${nonStd.map((s) => `« ${s.title} »`).join(', ')}. Préférez des intitulés classiques.` : 'Intitulés reconnus par les ATS.')

  const words = resumeToText(doc).split(/\s+/).filter(Boolean).length
  add('length', 'Longueur', pages <= 2 && words >= 250 && words <= 1000 ? 'ok' : 'warn', `${pages} page(s), ${words} mots. ${pages > 2 ? 'Visez 2 pages maximum.' : words < 250 ? 'Contenu un peu léger.' : words > 1000 ? 'Contenu dense, pensez à synthétiser.' : 'Bon équilibre.'}`)

  if (doc.style.showPhoto && doc.header.photo) add('photo', 'Photo', 'info', 'Acceptée en France, mais ignorée par les ATS. À retirer pour les candidatures à l\'international.')
  if (doc.layout.columns === 2) add('columns', 'Mise en page deux colonnes', 'info', 'Bien lue par les ATS récents, mais certains outils anciens mélangent l\'ordre des colonnes. Pour une candidature via un portail ancien (Taleo, par exemple), préférez un modèle une colonne.')
  add('format', 'Format du fichier', 'ok', 'PDF avec texte sélectionnable, polices intégrées, liens actifs.')
  return checks
}

/** Lisibilité ATS (0-100) : uniquement les contrôles qui affectent l'analyse par un logiciel. */
export function parseScore(checks: Check[]): number {
  const pts = checks.filter((c) => c.kind === 'ats' && c.status !== 'info')
  return Math.round((pts.reduce((a, c) => a + (c.status === 'ok' ? 1 : c.status === 'warn' ? 0.6 : 0), 0) / Math.max(1, pts.length)) * 100)
}

/** Score global : 75 % correspondance des mots-clés, 25 % lisibilité. Les conseils de rédaction ne comptent pas. */
export function overallScore(match: MatchResult | null, checks: Check[]): number {
  const p = parseScore(checks)
  if (!match || !match.total) return p
  return Math.round(match.score * 0.75 + p * 0.25)
}
