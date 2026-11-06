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
export type GeoPoint = { lat: number; lon: number; reg?: string }
let geoCache: Record<string, GeoPoint | null> = {}
try {
  geoCache = JSON.parse(localStorage.getItem(GEO_KEY) ?? '{}')
} catch {
  geoCache = {}
}
const pending = new Map<string, Promise<void>>()
/** lieux introuvables pendant cette session (réseau) : pas de nouvel essai avant rechargement */
const failed = new Set<string>()

/** Nom de commune exploitable à partir d'un lieu d'annonce (« Montpellier (34) », « 34 - MONTPELLIER »...). */
export function placeName(loc?: string): string | undefined {
  if (!loc) return undefined
  if (/distance|t[ée]l[ée]travail|remote|^\s*france\s*$|^(occitanie|[iî]le-de-france|r[ée]gion)/i.test(loc)) return undefined
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

/** Département indiqué dans un lieu : « (92) », « 34 - Montpellier », « 33185 ». */
export function deptOf(loc?: string): string | undefined {
  if (!loc) return undefined
  const m = /\((\d{2}|2[AB]|97\d)\)|^\s*(\d{2}|2[AB])\s*-|\b(\d{2})\d{3}\b/i.exec(loc)
  return (m?.[1] ?? m?.[2] ?? m?.[3])?.toUpperCase()
}

/**
 * Lieu indiqué dans le texte de l'annonce : « basé à La Défense (92) », « Localisation : Le Haillan (33) »,
 * « Lieu de travail : Toulouse ». Utile quand le site n'affiche que « France » ou une région.
 */
export function textLocation(i: FeedItem): string | undefined {
  const t = `${i.fullText ?? ''}\n${i.description ?? ''}`
  const re =
    /(?:[Bb]as[ée]e?s?\s+(?:à|a|au|sur|en|dans)|[Ll]ocalisation\s*:|[Ll]ieu\s+de\s+travail\s*:|[Ll]ieu\s*:|[Ll]ocalis[ée]e?\s+(?:à|a|au)|[Ss]itu[ée]e?\s+(?:à|a|au)|[Pp]oste\s+(?:situ[ée]\s+|bas[ée]\s+)?(?:à|a|sur))\s*(?:la ville de\s+)?((?:[A-ZÉÈÎÂ][\wÀ-ÿ'’-]*|de|du|des|la|le|les|sur|en|l['’])(?:[ \t-]+(?:[A-ZÉÈÎÂ][\wÀ-ÿ'’-]*|de|du|des|la|le|les|sur|en|l['’]))*(?:\s*\(\s*(?:\d{2,3}|2[AB])\s*\))?)/g
  for (const m of t.matchAll(re)) {
    const v = m[1].replace(/\s+(de|du|des|la|le|les|sur|en|l['’])$/i, '').trim()
    if (v.length < 3 || /^(France|Remote|Télétravail|Paris et|Notre|Nos|Votre|Vous|Le|La|Les)$/i.test(v)) continue
    return v
  }
  return undefined
}

/** Lieu à retenir : celui du site, sauf s'il est générique (« France », une région) et que le texte précise mieux. */
export function locationOf(i: FeedItem): { loc?: string; fromText: boolean } {
  if (placeName(i.location)) return { loc: i.location, fromText: false }
  const t = textLocation(i)
  return t ? { loc: t, fromText: true } : { loc: i.location, fromText: false }
}

export function geoOf(loc?: string): GeoPoint | null | undefined {
  const k = placeName(loc)
  const byName = k ? geoCache[strip(k)] : null
  if (byName) return byName
  // commune inconnue (« La Défense ») : centre de la principale commune du département
  const d = deptOf(loc)
  if (d) return geoCache[`dep:${d}`] ?? (byName === null ? undefined : byName)
  return k ? byName : null
}

/** Géolocalise les lieux inconnus ; appelle onDone quand de nouvelles positions sont connues. */
export function geocode(locs: (string | undefined)[], onDone: () => void) {
  const names = [...new Set(locs.map(placeName).filter((x): x is string => !!x))].filter((k) => !(strip(k) in geoCache) && !pending.has(strip(k)) && !failed.has(strip(k)))
  const depts = [...new Set(locs.map(deptOf).filter((x): x is string => !!x))].filter((d) => !(`dep:${d}` in geoCache) && !pending.has(`dep:${d}`) && !failed.has(`dep:${d}`))
  const todo: [string, () => Promise<void>][] = [
    ...names.slice(0, 40).map((name): [string, () => Promise<void>] => [
      strip(name),
      async () => {
        const r = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(name)}&fields=centre,codeRegion&boost=population&limit=1`)
        const c = ((await r.json()) as { centre?: { coordinates: [number, number] }; codeRegion?: string }[])[0]
        geoCache[strip(name)] = c?.centre ? { lon: c.centre.coordinates[0], lat: c.centre.coordinates[1], reg: c.codeRegion } : null
      },
    ]),
    ...depts.slice(0, 20).map((d): [string, () => Promise<void>] => [
      `dep:${d}`,
      async () => {
        const r = await fetch(`https://geo.api.gouv.fr/departements/${d}/communes?fields=centre,population,codeRegion`)
        const list = ((await r.json()) as { centre?: { coordinates: [number, number] }; population?: number; codeRegion?: string }[]).sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
        const c = list[0]
        geoCache[`dep:${d}`] = c?.centre ? { lon: c.centre.coordinates[0], lat: c.centre.coordinates[1], reg: c.codeRegion } : null
      },
    ]),
  ]
  if (!todo.length) return
  Promise.all(
    todo.map(([k, run]) => {
      const p = run()
        .catch(() => {
          failed.add(k) // réessai à la prochaine ouverture
        })
        .finally(() => pending.delete(k))
      pending.set(k, p)
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

export const REGIONS: Record<string, string> = {
  '11': 'Île-de-France', '24': 'Centre-Val de Loire', '27': 'Bourgogne-Franche-Comté', '28': 'Normandie', '32': 'Hauts-de-France', '44': 'Grand Est', '52': 'Pays de la Loire', '53': 'Bretagne', '75': 'Nouvelle-Aquitaine', '76': 'Occitanie', '84': 'Auvergne-Rhône-Alpes', '93': "Provence-Alpes-Côte d'Azur", '94': 'Corse',
}

/** Région d'une annonce (code INSEE), si son lieu est géolocalisé. */
export const regionOf = (i: FeedItem) => geoOf(locationOf(i).loc)?.reg

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
  level: { v: number; label: string; kind: 'junior' | 'neutral' | 'mid' | 'senior'; quote?: string; pref: LevelPref }
  place: { v: number; label: string }
  degree?: { required: number; strict: boolean; factor: number }
  /** hors critères (note 0) : raison */
  out?: string
  /** ajustement selon vos choix passés */
  learned?: number
}

/** Niveau d'expérience recherché pour une alerte. */
export type LevelPref = 'junior' | 'any' | 'senior'

const NUMS: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, quinze: 15 }
const N = String.raw`(\d{1,2}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|quinze)`
const toN = (x: string) => (/^\d+$/.test(x) ? Number(x) : NUMS[x] ?? NaN)

export interface Experience {
  /** années minimum demandées (0 = débutant accepté) */
  min?: number
  max?: number
  kind: 'junior' | 'neutral' | 'mid' | 'senior'
  label: string
  /** extrait de l'annonce */
  quote?: string
}

/**
 * Expérience demandée : on cherche, phrase par phrase, « expérience » ou « expérimenté » et ce qui l'accompagne
 * (« 3 à 5 ans », « au moins 2 années », « première expérience », « 5+ years »), plus junior, senior, débutant, confirmé.
 */
export function experienceOf(title: string, text: string, level?: string): Experience {
  const t = strip(title)
  if (/\b(junior|debutant|debutante|jr)\b|premier emploi|jeune diplome|\bstage\b|stagiaire|alternan|apprenti/.test(t)) return { min: 0, max: 2, kind: 'junior', label: 'Poste junior ou débutant' }
  if (/\b(senior|sr|expert|experte|experimente|experimentee|confirme|confirmee|lead|principal|staff)\b|head of|\bdirect(eur|rice|or)\b/.test(t)) return { min: 5, kind: 'senior', label: 'Poste senior (intitulé)' }
  const fl = strip(level ?? '')
  if (/premier emploi|debutant|stage/.test(fl)) return { min: 0, max: 2, kind: 'junior', label: `LinkedIn : ${level}` }
  if (/directeur|cadre dirigeant/.test(fl)) return { min: 8, kind: 'senior', label: `LinkedIn : ${level}` }

  const sentences = strip(text).replace(/\s+/g, ' ').split(/(?<=[.!?;•\n])\s+|\s[-•]\s/)
  let found: Experience | undefined
  const keep = (e: Experience) => {
    // on garde l'exigence la plus forte trouvée dans l'annonce
    if (!found || (e.min ?? 0) > (found.min ?? 0) || (found.kind === 'neutral' && e.kind !== 'neutral')) found = e
  }
  for (const sRaw of sentences) {
    if (!/experien|experiment|\bans\b|annees?|years?|junior|senior|debutant|confirme/.test(sRaw)) continue
    const s = sRaw.slice(0, 400)
    const q = sRaw.slice(0, 160)
    const hasExp = /experien|experiment|years? of|years? experience|\bxp\b|pratique|anciennete/.test(s)
    if (hasExp) {
      const range = new RegExp(String.raw`\b${N}\s*(?:a|-|ou|/)\s*${N}\s*(?:ans|annees?|years?)`).exec(s)
      const single = new RegExp(String.raw`(?:minimum|au moins|plus de|min\.?|>\s*)?\s*\b${N}\s*(\+)?\s*(?:ans|annees?|years?)(?:\s+minimum)?`).exec(s)
      if (range) {
        const a = toN(range[1])
        const b2 = toN(range[2])
        if (a < 25 && b2 < 30) keep({ min: a, max: b2, kind: a >= 5 ? 'senior' : a >= 3 ? 'mid' : 'junior', label: `${a} à ${b2} ans d'expérience`, quote: q })
        continue
      }
      // « depuis 20 ans », « plus de 30 ans d'existence » : l'entreprise, pas le candidat
      if (single && !/depuis|existence|cree|fond|histoire|leader|plus de \d+ ans d.experience dans (le|la|les) (secteur|domaine)/.test(s.slice(Math.max(0, single.index - 30), single.index + 40))) {
        const n = toN(single[1])
        if (n < 25) {
          keep({ min: n, kind: n >= 5 ? 'senior' : n >= 3 ? 'mid' : 'junior', label: `${n}${single[2] ? '+' : ''} an${n > 1 ? 's' : ''} d'expérience minimum`, quote: q })
          continue
        }
      }
      if (/premiere experience|1ere experience|debutant|sans experience|aucune experience|jeune diplome|experience (n.est pas|non) (exigee|requise|obligatoire)|une experience (en|dans|sur|de) [^.]{0,40}(serait|est) un (plus|atout)/.test(s)) {
        keep({ min: 0, max: 2, kind: 'junior', label: 'Première expérience ou débutant accepté', quote: q })
        continue
      }
      if (/(deuxieme|seconde|2e|2eme) experience/.test(s)) {
        keep({ min: 2, max: 3, kind: 'junior', label: 'Deuxième expérience', quote: q })
        continue
      }
      if (/(solide|significative|longue|forte|confirmee|reussie de plusieurs|importante) experience|experience (solide|significative|confirmee|importante|averee)|experimente|profil (senior|confirme)/.test(s)) {
        keep({ min: 4, kind: 'mid', label: 'Expérience significative demandée', quote: q })
        continue
      }
    }
    if (/\bjunior\b|debutants? (accepte|bienvenu)/.test(s)) keep({ min: 0, max: 2, kind: 'junior', label: 'Junior ou débutant accepté', quote: q })
    else if (/\bsenior\b|profil confirme/.test(s)) keep({ min: 5, kind: 'senior', label: 'Profil senior recherché', quote: q })
  }
  return found ?? { kind: 'neutral', label: 'Expérience non précisée' }
}

/** Note du niveau selon ce que vous visez pour l'alerte : junior (0 à 2 ans), tous niveaux, ou confirmé / management. */
export function levelScore(e: Experience, pref: LevelPref): number {
  const min = e.min ?? (e.kind === 'neutral' ? undefined : 0)
  if (pref === 'junior') {
    if (e.kind === 'neutral') return 0.6
    if ((min ?? 0) <= 2) return 1
    if ((min ?? 0) <= 3) return 0.5
    if ((min ?? 0) <= 4) return 0.3
    return 0.1
  }
  if (pref === 'senior') {
    if (e.kind === 'junior') return 0.1
    if (e.kind === 'neutral') return 0.7
    if ((min ?? 0) >= 5) return 1
    return (min ?? 0) >= 3 ? 0.85 : 0.5
  }
  return e.kind === 'neutral' ? 0.7 : (min ?? 0) >= 8 ? 0.4 : 0.8
}

function levelOf(i: FeedItem, text: string, pref: LevelPref): MatchResult['level'] {
  const e = experienceOf(i.title, text, i.facts?.level ?? i.experience)
  return { v: levelScore(e, pref), label: e.label, kind: e.kind, quote: e.quote, pref }
}

/**
 * Diplôme demandé. On tolère un niveau au-dessus du vôtre (bac+3 pour un bac+2) ; au-delà, la note baisse,
 * fortement si l'exigence est ferme.
 */
function degreeOf(text: string, mine: number): MatchResult['degree'] {
  const t = strip(text)
  let req = 0
  let strict = false
  for (const m of t.matchAll(/bac\s*\+\s*(\d)(?:\s*(?:\/|a|ou|-)\s*\+?\s*(\d))?|\b(master|mba|ingenieur|grande ecole|doctorat|\bm2\b|niveau 7|rncp 7)\b/g)) {
    const n = m[1] ? Number(m[1]) : m[3] === 'doctorat' ? 8 : 5
    if (n > 8) continue
    const ctx = t.slice(Math.max(0, m.index! - 70), m.index! + 70)
    // « ingénieur » seul est souvent un intitulé, pas un diplôme demandé
    if (m[3] === 'ingenieur' && !/diplom|ecole|formation/.test(ctx)) continue
    if (!/exig|requis|obligatoire|minimum|imperati|indispensable|formation|diplom|titulaire|niveau|issu|cursus|vous avez|vous etes|profil|de type|souhait/.test(ctx)) continue
    if (n > req) {
      req = n
      strict = /exig|requis|obligatoire|imperati|indispensable|minimum/.test(ctx) && !/ou equivalent|ou experience|equivalence/.test(ctx)
    }
  }
  const ok = mine + 1
  if (!req || req <= ok) return undefined
  const gap = req - ok
  return { required: req, strict, factor: strict ? (gap >= 2 ? 0.4 : 0.55) : gap >= 2 ? 0.6 : 0.75 }
}

export function matchItem(i: FeedItem, p: ProfileData, pref: LevelPref = 'any'): MatchResult {
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

  const level = levelOf(i, text, pref)

  // distance au domicile ; au-delà du périmètre, une offre en présentiel est hors critères
  let place: MatchResult['place'] = { v: 0.6, label: i.location ?? 'Lieu non précisé' }
  let out: string | undefined
  const remote = remoteOf(i, text)
  const where = locationOf(i)
  if (/distance|t[ée]l[ée]travail|remote/i.test(`${i.location ?? ''} ${i.worktime ?? ''}`) && !where.fromText) place = { v: 0.85, label: 'Télétravail' }
  else if (p.home) {
    const g = geoOf(where.loc)
    if (g) {
      const d = Math.round(km(p.home, g))
      const max = p.maxKm ?? 50
      place = { v: d <= 15 ? 1 : d <= 30 ? 0.85 : d <= max ? 0.6 : remote === 'full' ? 0.75 : remote === 'partial' ? 0.3 : 0, label: `${d} km${d > max && remote ? remote === 'full' ? ', télétravail complet' : ', télétravail partiel' : ''}` }
      if (where.fromText) place.label += ` (${where.loc}, lu dans l'annonce)`
      if (d > max && !remote) out = `À ${d} km${where.fromText ? ` (${where.loc}, lieu lu dans le texte)` : ''}, au-delà de votre périmètre de ${max} km, sans télétravail mentionné`
      // hybride très loin : quelques jours sur site par semaine restent intenables
      else if (d > max * 2 && remote === 'partial') out = `À ${d} km, en hybride : trop loin pour les jours sur site`
    }
  }

  const degree = degreeOf(body, p.degree)

  // sans texte complet, les compétences comptent pour une valeur moyenne : une annonce peu détaillée n'est pas avantagée
  const base = (title.v * 35 + (skills ? skills.v : 0.45) * 25 + level.v * 20 + place.v * 20) / 100
  const score = out ? 0 : Math.round(100 * base * (degree?.factor ?? 1) * (level.v <= 0.15 ? 0.85 : 1))
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
export const geocodeCacheForTests = (name: string, pos: GeoPoint) => {
  geoCache[strip(name)] = pos
}

/** Niveau visé pour une annonce : celui de l'alerte qui l'a trouvée, ou de l'alerte dont un intitulé est le plus proche. */
export function prefFor(i: FeedItem, alerts: Alert[]): LevelPref {
  const direct = alerts.find((a) => i.alerts.includes(a.id) && a.level)
  if (direct?.level) return direct.level
  let best: { v: number; level: LevelPref } | undefined
  for (const a of alerts)
    for (const k of a.keywords.split(/,|;|\||\s+ou\s+/i)) {
      if (!k.trim() || /^junior$/i.test(k.trim())) continue
      const v = titleSimilarity(i.title, k)
      if (v >= 0.5 && (!best || v > best.v)) best = { v, level: a.level ?? 'any' }
    }
  return best?.level ?? 'any'
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
