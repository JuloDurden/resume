// Indice de correspondance entre une annonce et le profil (CV de référence + métiers visés).
// Calcul local, sans service externe : intitulé, compétences, niveau du poste, distance, diplôme demandé.
import type { Alert, FeedItem, MatchProfile, ResumeDoc } from '../types'
import { stem, strip } from './ats'
import { STOPWORDS } from './stopwords'

/** Mots équivalents ramenés à une même forme (français / anglais, synonymes de fonction). */
const SYN: Record<string, string> = {
  product: 'produit', produit: 'produit', produits: 'produit',
  project: 'projet', projet: 'projet', projets: 'projet', projects: 'projet',
  manager: 'chef', responsable: 'chef', head: 'chef', lead: 'chef', leader: 'chef', chef: 'chef', cheffe: 'chef', pilote: 'chef', coordinateur: 'chef', coordinatrice: 'chef',
  analyst: 'analyst', analyste: 'analyst', analystes: 'analyst',
  owner: 'owner', proprietaire: 'owner',
  delivery: 'delivery', livraison: 'delivery',
  support: 'support', assistance: 'support', helpdesk: 'support',
  digital: 'numerique', numerique: 'numerique', digitale: 'numerique',
  it: 'informatique', informatique: 'informatique', si: 'informatique', dsi: 'informatique', information: 'informatique', informations: 'informatique', systemes: 'informatique', systeme: 'informatique',
  fonctionnel: 'fonctionnel', fonctionnelle: 'fonctionnel', functional: 'fonctionnel',
  operationnel: 'operation', operationnelle: 'operation', operations: 'operation', ops: 'operation',
  transformation: 'transformation', amoa: 'moa', moa: 'moa',
}
const IGNORE = /^(h|f|x|nb|ng|hf|fh|cdi|cdd|de|la|le|les|des|du|en|et|a|au|aux|un|une|pour|chez)$/

const words = (s: string) =>
  strip(s ?? '')
    .replace(/['’]/g, ' ')
    .split(/[^a-z0-9+#]+/)
    .filter((w) => w && !IGNORE.test(w) && !STOPWORDS.has(w))

function canon(w: string): string[] {
  if (w === 'po' || w === 'ppo') return ['produit', 'owner']
  if (w === 'ba') return ['analyst']
  if (w === 'pm') return ['produit', 'chef']
  return [SYN[w] ?? stem(w)]
}
const canonSet = (s: string) => new Set(words(s).flatMap(canon))

/* ---------- profil ---------- */

export interface ProfileData {
  targets: string[]
  skills: string[]
  degree: number
  home?: { lat: number; lon: number; nom: string }
  maxKm?: number
}

/** Compétences du CV, découpées en éléments courts (« Microsoft 365 - SharePoint » donne deux compétences). */
export function cvSkills(doc?: ResumeDoc): string[] {
  if (!doc) return []
  const out: string[] = []
  for (const s of doc.sections) {
    if (s.hidden) continue
    if (s.type === 'skills' || s.type === 'languages')
      for (const it of s.items) {
        if (it.hidden) continue
        for (const t of [...(it.tags ?? []), it.title ?? '']) out.push(...t.split(/\s[-–]\s|[,/;&()]|\set\s/))
      }
    if (s.type === 'certifications') for (const it of s.items) if (!it.hidden && it.title) out.push(it.title)
  }
  return [...new Set(out.map((x) => x.trim()).filter((x) => x.length >= 2 && words(x).length))]
}

export function defaultTargets(alerts: Alert[], doc?: ResumeDoc): string[] {
  const t = alerts.flatMap((a) => a.keywords.split(/,|;|\||\s+ou\s+/i)).map((x) => x.trim())
  if (doc?.header.title) t.push(...doc.header.title.split(/[|•·]/).map((x) => x.trim()))
  const seen = new Set<string>()
  return t.filter((x) => x.length > 2 && !/^junior$/i.test(x) && !seen.has(strip(x)) && seen.add(strip(x)))
}

/* ---------- géolocalisation (geo.api.gouv.fr, mise en cache) ---------- */

const GEO_KEY = 'resume-geo'
let geoCache: Record<string, { lat: number; lon: number } | null> = {}
try {
  geoCache = JSON.parse(localStorage.getItem(GEO_KEY) ?? '{}')
} catch {
  geoCache = {}
}
const pending = new Map<string, Promise<void>>()

/** Nom de commune exploitable à partir d'un lieu d'annonce (« Montpellier (34) », « 34 - MONTPELLIER »...). */
export function placeName(loc?: string): string | undefined {
  if (!loc) return undefined
  if (/distance|t[ée]l[ée]travail|remote|^france$|occitanie|r[ée]gion/i.test(loc)) return undefined
  const s = loc
    .replace(/\(.*?\)/g, ' ')
    .replace(/^\s*\d{2,3}\s*-\s*/, '')
    .replace(/,.*$/, '')
    .replace(/\bville de\s+/i, '')
    .replace(/\bcedex\b.*$/i, '')
    .replace(/\d{5}/g, ' ')
    .trim()
  return s.length > 1 ? s : undefined
}

export function geoOf(loc?: string): { lat: number; lon: number } | null | undefined {
  const k = placeName(loc)
  if (!k) return null
  return geoCache[strip(k)]
}

/** Géolocalise les lieux inconnus ; appelle onDone quand de nouvelles positions sont connues. */
export function geocode(locs: (string | undefined)[], onDone: () => void) {
  const todo = [...new Set(locs.map(placeName).filter((x): x is string => !!x))].filter((k) => !(strip(k) in geoCache) && !pending.has(strip(k))).slice(0, 40)
  if (!todo.length) return
  const run = async (name: string) => {
    try {
      const r = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(name)}&fields=centre&boost=population&limit=1`)
      const c = ((await r.json()) as { centre?: { coordinates: [number, number] } }[])[0]?.centre?.coordinates
      geoCache[strip(name)] = c ? { lon: c[0], lat: c[1] } : null
    } catch {
      /* réessai à la prochaine ouverture */
    }
  }
  Promise.all(
    todo.map((n) => {
      const p = run(n).finally(() => pending.delete(strip(n)))
      pending.set(strip(n), p)
      return p
    }),
  ).then(() => {
    try {
      localStorage.setItem(GEO_KEY, JSON.stringify(geoCache))
    } catch {
      /* stockage plein ou indisponible */
    }
    onDone()
  })
}

const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180
  const x = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(x))
}

/* ---------- calcul ---------- */

export interface MatchResult {
  score: number
  title: { v: number; target?: string }
  skills: { v: number; matched: string[]; total: number } | null
  level: { v: number; label: string; kind: 'junior' | 'neutral' | 'mid' | 'senior' }
  place: { v: number; label: string }
  degree?: { required: number; strict: boolean; factor: number }
  /** hors critères (note 0) : raison */
  out?: string
  /** ajustement selon vos choix passés */
  learned?: number
}

const JUNIOR = /\bjunior\b|d[ée]butant|premi[eè]re exp[ée]rience|premier emploi|jeune(s)? dipl[oô]m|\bstages?\b|stagiaire|alternan|apprenti|sans exp[ée]rience|\b[01] [àa] [23] ans\b|reconversion/i
const SENIOR = /\bsenior\b|\bsr\b|\bexpert(e)?\b|\bexp[ée]riment[ée](e)?\b|\bconfirm[ée](e)?\b|\blead\b|\bhead of\b|\bdirect(eur|rice|or)\b|\bprincipal\b|\bstaff\b|\bmanager de managers\b/i

function levelOf(i: FeedItem, text: string): MatchResult['level'] {
  const fl = i.facts?.level ?? ''
  if (JUNIOR.test(i.title) || /premier emploi|d[ée]butant|stage/i.test(fl)) return { v: 1, label: 'Poste junior ou débutant accepté', kind: 'junior' }
  if (SENIOR.test(i.title) || /directeur/i.test(fl)) return { v: 0.1, label: 'Poste senior', kind: 'senior' }
  const years = [...text.matchAll(/(\d{1,2})\s*(?:\+\s*)?(?:à\s*\d+\s*)?(?:ans|années)\s*(?:minimum\s*)?(?:d['’]\s*|de\s+)?(?:exp[ée]rience|exp[ée]rience)/gi)].map((m) => Number(m[1])).filter((n) => n < 25)
  const y = years.length ? Math.max(...years) : 0
  if (JUNIOR.test(text) && y < 3) return { v: 0.95, label: 'Débutants acceptés', kind: 'junior' }
  if (y >= 5) return { v: 0.15, label: `${y} ans d'expérience demandés`, kind: 'senior' }
  if (y >= 3 || /confirm/i.test(fl) || SENIOR.test(text.slice(0, 1500))) return { v: 0.45, label: y ? `${y} ans d'expérience demandés` : 'Profil confirmé recherché', kind: 'mid' }
  return { v: 0.65, label: 'Niveau non précisé', kind: 'neutral' }
}

function degreeOf(text: string, mine: number): MatchResult['degree'] {
  const t = strip(text)
  let req = 0
  let strict = false
  for (const m of t.matchAll(/bac\s*\+\s*(\d)|\b(master|ingenieur|grande ecole|doctorat)\b/g)) {
    const n = m[1] ? Number(m[1]) : m[2] === 'doctorat' ? 8 : 5
    if (n > 8) continue
    const ctx = t.slice(Math.max(0, m.index! - 60), m.index! + 60)
    // « ingénieur » seul est souvent un intitulé, pas un diplôme demandé
    if (m[2] === 'ingenieur' && !/diplom|ecole|formation/.test(ctx)) continue
    if (!/exig|requis|obligatoire|minimum|imperati|indispensable|formation|diplom|titulaire|niveau|issu|cursus|vous avez|vous etes|profil/.test(ctx)) continue
    if (n > req) {
      req = n
      strict = /exig|requis|obligatoire|imperati|indispensable|minimum/.test(ctx) && !/ou equivalent|ou experience/.test(ctx)
    }
  }
  if (!req || req <= mine) return undefined
  return { required: req, strict, factor: strict ? 0.55 : 0.8 }
}

export function matchItem(i: FeedItem, p: ProfileData): MatchResult {
  const body = [i.fullText ?? '', i.description ?? '', i.facts?.education ?? '', i.facts?.experience ?? '', i.facts?.skills ?? ''].join('\n')
  const text = `${i.title}\n${body}`

  // intitulé : part des mots du métier visé retrouvés dans le titre
  const tw = canonSet(i.title)
  let title: MatchResult['title'] = { v: 0 }
  for (const t of p.targets) {
    const w = [...canonSet(t)]
    if (!w.length) continue
    const v = w.filter((x) => tw.has(x)).length / w.length
    if (v > title.v) title = { v, target: t }
  }

  // compétences : seulement si l'annonce a un vrai texte
  let skills: MatchResult['skills'] = null
  if (body.trim().length > 250 && p.skills.length) {
    const hay = canonSet(text)
    const matched = p.skills.filter((s) => {
      const w = [...canonSet(s)]
      return w.length && w.filter((x) => hay.has(x)).length / w.length >= 0.6
    })
    const total = p.skills.length
    skills = { v: Math.min(1, matched.length / Math.min(total, 8)), matched, total }
  }

  const level = levelOf(i, text)

  // distance au domicile ; au-delà du périmètre, une offre en présentiel est hors critères
  let place: MatchResult['place'] = { v: 0.6, label: i.location ?? 'Lieu non précisé' }
  let out: string | undefined
  const remote = remoteOf(i, text)
  if (/distance|t[ée]l[ée]travail|remote/i.test(`${i.location ?? ''} ${i.worktime ?? ''}`)) place = { v: 0.85, label: 'Télétravail' }
  else if (p.home) {
    const g = geoOf(i.location)
    if (g) {
      const d = Math.round(km(p.home, g))
      const max = p.maxKm ?? 50
      place = { v: d <= 15 ? 1 : d <= 30 ? 0.85 : d <= max ? 0.6 : remote === 'full' ? 0.75 : remote === 'partial' ? 0.3 : 0, label: `${d} km${d > max && remote ? remote === 'full' ? ', télétravail complet' : ', télétravail partiel' : ''}` }
      if (d > max && !remote) out = `À ${d} km, au-delà de votre périmètre de ${max} km, sans télétravail mentionné`
    }
  }

  const degree = degreeOf(body, p.degree)

  // sans texte complet, les compétences comptent pour une valeur moyenne : une annonce peu détaillée n'est pas avantagée
  const base = (title.v * 35 + (skills ? skills.v : 0.45) * 25 + level.v * 20 + place.v * 20) / 100
  const score = out ? 0 : Math.round(100 * base * (degree?.factor ?? 1) * (level.kind === 'senior' ? 0.85 : 1))
  return { score, title, skills, level, place, degree, out }
}

const NO_REMOTE = /(pas de|sans|aucun)\s+t[ée]l[ée]travail|t[ée]l[ée]travail\s*:\s*(non|aucun|0|pas)|100\s*%\s*(sur site|pr[ée]sentiel)|full on.?site/i
const FULL_REMOTE = /full.?remote|100\s*%\s*(t[ée]l[ée]travail|remote|[àa] distance)|t[ée]l[ée]travail (complet|total|int[ée]gral)/i
const PART_REMOTE = /t[ée]l[ée]travail|remote|hybride|hybrid|[àa] distance|home.?office|jours? (de )?tt\b/i

/** Télétravail possible : complet, partiel, ou non mentionné (undefined). */
export function remoteOf(i: FeedItem, text: string): 'full' | 'partial' | undefined {
  const t = `${i.location ?? ''} ${i.worktime ?? ''} ${i.title}\n${text}`
  if (/^\s*(à distance|a distance|remote|télétravail)\s*$/i.test(i.worktime ?? '') || /\((à distance|remote)\)/i.test(i.location ?? '') || FULL_REMOTE.test(`${i.location ?? ''} ${i.title}`)) return 'full'
  if (/hybride|hybrid/i.test(i.worktime ?? '')) return 'partial'
  if (NO_REMOTE.test(t) && !/hybride|hybrid/i.test(t)) return undefined
  if (FULL_REMOTE.test(t)) return 'full'
  return PART_REMOTE.test(t) ? 'partial' : undefined
}

export const scoreClass = (s: number) => (s >= 70 ? 'high' : s >= 50 ? 'mid' : 'low')

/** Profil complet (avec valeurs par défaut) à partir des réglages enregistrés. */
export function resolveProfile(saved: MatchProfile | undefined, docs: ResumeDoc[], alerts: Alert[]): ProfileData & { cv?: ResumeDoc } {
  const cv = docs.find((d) => d.id === saved?.cvId) ?? [...docs].sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const home = saved?.home ?? (() => {
    const g = geoOf(alerts[0]?.commune)
    return g ? { ...g, nom: alerts[0].commune! } : undefined
  })()
  return {
    cv,
    targets: saved?.targets?.length ? saved.targets : defaultTargets(alerts, cv),
    skills: cvSkills(cv),
    degree: saved?.degree ?? 2,
    home,
    maxKm: saved?.maxKm ?? 50,
  }
}

/* ---------- apprentissage à partir de vos choix ---------- */

export type Learned = Map<string, { pos: number; neg: number }>

/** Mots des intitulés mis en favori ou en candidature (positifs), masqués ou supprimés (négatifs). */
export function learnFromMarks(marks: Record<string, { s: string; t?: string }>): Learned {
  const m: Learned = new Map()
  for (const { s, t } of Object.values(marks)) {
    if (!t || s === 'none') continue
    const good = s === 'fav' || s === 'applied'
    for (const w of canonSet(t)) {
      const e = m.get(w) ?? { pos: 0, neg: 0 }
      if (good) e.pos++
      else e.neg++
      m.set(w, e)
    }
  }
  return m
}

/** Ajuste l'indice (au plus 12 points) selon les mots de l'intitulé que vous avez déjà retenus ou écartés. */
export function applyLearning(r: MatchResult, i: FeedItem, learned: Learned): MatchResult & { learned?: number } {
  if (!learned.size || r.out) return r
  let sum = 0
  let n = 0
  for (const w of canonSet(i.title)) {
    const e = learned.get(w)
    if (!e || e.pos + e.neg < 2) continue
    // un favori pèse plus qu'une annonce masquée (on masque beaucoup, on retient peu)
    sum += (e.pos * 3 - e.neg) / (e.pos * 3 + e.neg + 2)
    n++
  }
  if (!n) return r
  const adj = Math.round(12 * (sum / n))
  if (!adj) return r
  return { ...r, score: Math.max(0, Math.min(100, r.score + adj)), learned: adj }
}

/** Pour les tests : position connue d'une commune. */
export const geocodeCacheForTests = (name: string, pos: { lat: number; lon: number }) => {
  geoCache[strip(name)] = pos
}

/** Proximité de deux intitulés (0 à 1) : part des mots de b retrouvés dans a, synonymes compris. */
export function titleSimilarity(a: string, b: string): number {
  const A = canonSet(a)
  const B = [...canonSet(b)]
  return B.length ? B.filter((x) => A.has(x)).length / B.length : 0
}

/** CV de référence le plus proche d'un intitulé d'annonce. */
export function bestReference(title: string, refs: ResumeDoc[]): ResumeDoc | undefined {
  let best: { d: ResumeDoc; v: number } | undefined
  for (const d of refs) {
    const v = Math.max(titleSimilarity(title, d.header.title ?? ''), titleSimilarity(title, d.name))
    if (!best || v > best.v) best = { d, v }
  }
  return best && best.v > 0 ? best.d : refs.length === 1 ? refs[0] : undefined
}
