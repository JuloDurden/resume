/**
 * Référentiel ROME 4.0 (France Travail, Licence Ouverte) : intitulés équivalents et fiches métiers.
 * Les données sont servies avec l'application (public/rome) et chargées à la demande.
 */

export interface RomeIndex {
  version: string
  metiers: Record<string, string>
  appellations: [string, string][] // [intitulé, code ROME]
}

export interface RomeGroup {
  g: string
  items: { l: string; c: 0 | 1 }[]
}

export interface RomeFiche {
  code: string
  intitule: string
  appellations: string[]
  definition: string
  acces: string
  savoirFaire: RomeGroup[]
  savoirEtre: string[]
  savoirs: RomeGroup[]
  contextes: { g: string; items: string[] }[]
  secteurs: string[]
  mobilites: { code: string; intitule: string }[]
}

export const ROME_SOURCE = 'France Travail, ROME 4.0 (Licence Ouverte)'
export const metierscopeUrl = (code: string) => `https://candidat.francetravail.fr/metierscope/fiche-metier/${code}`
export const isRomeCode = (s?: string) => !!s && /^[A-N]\d{4}$/.test(s)

const base = () => `${import.meta.env.BASE_URL}rome/`

let indexP: Promise<RomeIndex> | null = null
export function loadRomeIndex(): Promise<RomeIndex> {
  indexP ??= fetch(`${base()}index.json`).then((r) => {
    if (!r.ok) throw new Error('Référentiel ROME indisponible')
    return r.json()
  })
  indexP.catch(() => (indexP = null))
  return indexP
}

const fiches = new Map<string, Promise<RomeFiche>>()
export function loadFiche(code: string): Promise<RomeFiche> {
  if (!fiches.has(code)) {
    const p = fetch(`${base()}fiches/${code}.json`).then((r) => {
      if (!r.ok) throw new Error(`Fiche ${code} introuvable`)
      return r.json() as Promise<RomeFiche>
    })
    p.catch(() => fiches.delete(code))
    fiches.set(code, p)
  }
  return fiches.get(code)!
}

/* ---------- Recherche ---------- */

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'en', 'et', 'a', 'au', 'aux', 'un', 'une', 'pour', 'sur', 'h', 'f'])

export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\((e|ne|le|se|trice|euse|ere|ice)\)/g, '')

const root = (w: string) => (w.length > 5 ? w.replace(/(euse|rice|eur|ere|ier|iere|ive|if|e|s)$/, '') : w)

export function tokens(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w))
    .map(root)
}

interface Prepared {
  label: string
  code: string
  toks: string[]
  norm: string
}

let prepared: Prepared[] | null = null
function prepare(ix: RomeIndex): Prepared[] {
  prepared ??= [
    ...ix.appellations.map(([label, code]) => ({ label, code, toks: tokens(label), norm: normalize(label) })),
    ...Object.entries(ix.metiers).map(([code, label]) => ({ label, code, toks: tokens(label), norm: normalize(label) })),
  ]
  return prepared
}

export interface RomeHit {
  code: string
  intitule: string
  score: number
  matches: string[]
}

// Mots interchangeables dans les intitulés (un « responsable de secteur » est souvent un « chef de secteur »)
const SYNONYMS: string[][] = [
  ['responsable', 'chef', 'manager', 'manag', 'directeur'],
  ['vend', 'conseill', 'commercial'],
  ['assistant', 'adjoint'],
  ['develop', 'program'],
  ['digital', 'numerique', 'web'],
  ['informatique', 'si', 'it'],
].map((g) => g.map(root))

function wordMatch(t: string, w: string): number {
  if (w === t) return 1
  if (t.length >= 4 && w.length >= 4 && (w.startsWith(t) || t.startsWith(w))) return 1
  for (const g of SYNONYMS) if (g.some((x) => t.startsWith(x)) && g.some((x) => w.startsWith(x))) return 0.8
  return 0
}

/** Recherche tolérante : mots dans le désordre, accents, masculin/féminin, synonymes courants. */
export function searchRome(ix: RomeIndex, query: string, limit = 12): RomeHit[] {
  const q = tokens(query)
  if (!q.length) return []
  const nq = normalize(query).trim()
  const need = q.length === 1 ? 1 : q.length === 2 ? 0.8 : 0.6
  const byCode = new Map<string, RomeHit & { n: number }>()
  for (const p of prepare(ix)) {
    let m = 0
    for (const t of q) m += Math.max(0, ...p.toks.map((w) => wordMatch(t, w)))
    const ratio = m / q.length
    if (ratio < need) continue
    const score = ratio * 10 + (p.norm.includes(nq) ? 4 : 0) + (p.norm.startsWith(nq) ? 1 : 0) - Math.max(0, p.toks.length - q.length) * 0.4
    const cur = byCode.get(p.code) ?? { code: p.code, intitule: ix.metiers[p.code] ?? p.code, score: 0, matches: [], n: 0 }
    cur.score = Math.max(cur.score, score)
    cur.n++
    if (p.label !== cur.intitule) cur.matches.push(p.label)
    byCode.set(p.code, cur)
  }
  if (!byCode.size && q.length > 3) return searchRome(ix, q.slice(0, 3).join(' '), limit)
  return [...byCode.values()]
    .map((h) => {
      // les intitulés les plus proches de la recherche d'abord
      h.matches.sort((a, b) => tokens(a).length - tokens(b).length)
      h.matches = h.matches.slice(0, 4)
      return { code: h.code, intitule: h.intitule, matches: h.matches, score: h.score + Math.min(0.3, 0.05 * (h.n - 1)) }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/* ---------- Masculin / féminin ---------- */

export type Gender = 'm' | 'f' | 'both'

/** « Chef / Cheffe de rayon » → « Chef de rayon » (m) ou « Cheffe de rayon » (f). */
export function genderForm(label: string, g: Gender): string {
  if (g === 'both') return label
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
  const m = /^(.+?)\s+\/\s+(.+)$/.exec(label)
  if (!m) {
    // « Responsable commercial(e) » : on retire ou on intègre la marque du féminin
    return g === 'm' ? clean(label.replace(/\((e|ne|le|se|trice|euse|ère|ice)\)/g, '')) : clean(label.replace(/(\w+)\((e|ne|le|se)\)/g, '$1$2'))
  }
  const left = m[1].split(' ')
  const right = m[2].split(' ')
  return g === 'f' ? clean(m[2]) : clean([...left, ...right.slice(left.length)].join(' '))
}

/** Garde la partie principale d'un intitulé long : « Responsable de secteur - déploiement d'outils » → « Responsable de secteur ». */
export function mainTitle(title = ''): string {
  return title.split(/\s+[-–|/(&]\s*|,\s|\s+chez\s/i)[0].trim() || title.trim()
}

/** Mots du contexte (entreprise, puces) qui distinguent des métiers proches de la recherche : suggestions pour l'affiner. */
export function refineWords(ix: RomeIndex, query: string, context: string, max = 6): string[] {
  const q = tokens(query)
  if (!q.length) return []
  const qs = new Set(q)
  // vocabulaire des intitulés qui partagent au moins un mot avec la recherche
  const vocab = new Set<string>()
  for (const p of prepare(ix)) if (q.some((t) => p.toks.some((w) => wordMatch(t, w) > 0))) p.toks.forEach((w) => vocab.add(w))
  const counts = new Map<string, { n: number; word: string }>()
  for (const raw of context.split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 5) continue
    const t = tokens(raw)[0]
    if (!t || qs.has(t) || !vocab.has(t) || GENERIC.has(t)) continue
    const e = counts.get(t) ?? { n: 0, word: raw.toLowerCase() }
    e.n++
    counts.set(t, e)
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, max).map((e) => e.word)
}

const GENERIC = new Set(
  'equipe equipes outil outils suivi mise place gestion aupres jusqu selon tous niveau retour retours formation accompagnement environ puis avec dans pour metier metiers travail jour vers lecteur adoption ajustement evolution evolutions validation besoin besoins terrain mettre groupe partie parties'
    .split(' ')
    .map(root),
)
