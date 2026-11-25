// Entreprises autour d'un point : API Recherche d'entreprises (data.gouv.fr, base SIRENE de l'INSEE).
// Gratuite, sans clé, 7 appels par seconde au plus ; les résultats sont triés par taille d'entreprise.
// Les pages déjà lues sont gardées 14 jours dans ce navigateur (rien n'est synchronisé).
import { get, set } from 'idb-keyval'
import { inSector, sectorDef, type SectorQuery } from './sectors'

const API = 'https://recherche-entreprises.api.gouv.fr'
const CACHE_KEY = 'resume-places-v1'
const TTL = 14 * 86400000
/** rayon maximal accepté par l'API (km) */
export const MAX_RADIUS = 50

export interface Place {
  siren: string
  name: string
  naf: string
  /** tranche d'effectif de l'entreprise (toutes implantations) */
  size?: string
  /** PME, ETI, GE */
  cat?: string
  lat: number
  lon: number
  city?: string
  address?: string
  /** tranche d'effectif de l'établissement affiché */
  localSize?: string
  /** établissements ouverts dans la zone */
  sites: number
}

type Point = { lat: number; lon: number }
type CacheEntry = { at: number; places: Place[]; pages: number }
let cache: Record<string, CacheEntry> | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined
async function loadCache() {
  if (!cache) {
    try {
      cache = ((await get(CACHE_KEY)) as Record<string, CacheEntry> | undefined) ?? {}
    } catch {
      cache = {}
    }
    const now = Date.now()
    for (const [k, v] of Object.entries(cache)) if (now - v.at > TTL) delete cache[k]
  }
  return cache
}
function saveCache() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (cache) set(CACHE_KEY, cache).catch(() => undefined)
  }, 800)
}

// file d'attente : un appel toutes les 170 ms (sous la limite de 7 par seconde)
let last = 0
let chain: Promise<unknown> = Promise.resolve()
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = last + 170 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    last = Date.now()
    return fn()
  })
  chain = run.catch(() => undefined)
  return run
}
async function getJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await throttled(() => fetch(url))
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)))
      continue
    }
    if (!r.ok) throw new Error(`Recherche d'entreprises : erreur ${r.status}`)
    return r.json()
  }
  throw new Error("Recherche d'entreprises : trop d'appels, réessayez dans un instant")
}

export const km = (a: Point, b: Point) => {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

const SMALL = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'au', 'aux', 'sur', 'pour', 'a', 'd', 'l'])
/** « SOPRA STERIA GROUP » → « Sopra Steria Group » ; les sigles courts restent en capitales. */
export function prettyName(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim()
  if (s !== s.toUpperCase()) return s
  return s
    .split(' ')
    .map((w, i) => {
      const bare = w.replace(/[^\p{L}]/gu, '')
      if (/^\(/.test(w) || (bare.length <= 3 && !SMALL.has(bare.toLowerCase())) || /\d/.test(w)) return w
      const low = w.toLowerCase()
      if (i > 0 && SMALL.has(bare.toLowerCase())) return low
      const cap = low.replace(/(^|[-'’(])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
      // « D'Information » → « d'Information » (sauf en tête)
      return i > 0 ? cap.replace(/^([DL])(['’])/, (_m, l: string, q: string) => l.toLowerCase() + q) : cap
    })
    .join(' ')
}

/** Établissement retenu pour une entreprise : ouvert, dans la zone, le plus gros (sinon le plus proche). */
function toPlace(r: any, center: Point, radius: number, nearest = false): Place | undefined {
  const open = ((r.matching_etablissements ?? []) as any[])
    .filter((e) => e.etat_administratif === 'A' && e.latitude && e.longitude)
    .map((e) => ({ e, p: { lat: parseFloat(e.latitude), lon: parseFloat(e.longitude) } }))
    .filter((x) => Number.isFinite(x.p.lat) && km(center, x.p) <= radius + 0.5)
  if (!open.length) return undefined
  const rank = (s?: string) => (s && /^\d\d$/.test(s) ? parseInt(s, 10) : 0)
  if (nearest) open.sort((a, b) => km(center, a.p) - km(center, b.p))
  else open.sort((a, b) => rank(b.e.tranche_effectif_salarie) - rank(a.e.tranche_effectif_salarie) || km(center, a.p) - km(center, b.p))
  const best = open[0]
  const enseigne = best.e.liste_enseignes?.[0] || best.e.nom_commercial
  const base = r.sigle && r.nom_raison_sociale ? `${r.nom_raison_sociale} (${r.sigle})` : r.nom_complet || r.nom_raison_sociale || ''
  return {
    siren: r.siren,
    name: prettyName(base || enseigne || r.siren),
    naf: r.activite_principale || best.e.activite_principale || '',
    size: r.tranche_effectif_salarie ?? undefined,
    cat: r.categorie_entreprise ?? undefined,
    lat: best.p.lat,
    lon: best.p.lon,
    city: best.e.libelle_commune ? prettyName(best.e.libelle_commune) : undefined,
    address: best.e.adresse ?? undefined,
    localSize: best.e.tranche_effectif_salarie && best.e.tranche_effectif_salarie !== 'NN' ? best.e.tranche_effectif_salarie : undefined,
    sites: open.length,
  }
}

const qid = (q: SectorQuery) => (q.section ? `s:${q.section}` : `c:${q.codes!.join(',')}`)
const centerKey = (c: Point) => `${c.lat.toFixed(2)},${c.lon.toFixed(2)}`

/** Une page de résultats d'une requête (25 entreprises). */
async function page(q: SectorQuery, center: Point, n: number): Promise<{ places: Place[]; total: number }> {
  const store = await loadCache()
  const key = `${qid(q)}|${centerKey(center)}|${n}`
  const hit = store[key]
  if (hit) return { places: hit.places, total: hit.pages }
  const params = new URLSearchParams({
    lat: String(center.lat),
    long: String(center.lon),
    radius: String(MAX_RADIUS),
    per_page: '25',
    page: String(n),
    minimal: 'true',
    include: 'matching_etablissements',
    etat_administratif: 'A',
  })
  if (q.section) params.set('section_activite_principale', q.section)
  if (q.codes) params.set('activite_principale', q.codes.join(','))
  const d = await getJson(`${API}/near_point?${params}`)
  const places = ((d.results ?? []) as any[]).map((r) => toPlace(r, center, MAX_RADIUS)).filter((p): p is Place => !!p)
  store[key] = { at: Date.now(), places, pages: d.total_pages ?? 1 }
  saveCache()
  return { places, total: d.total_pages ?? 1 }
}

/**
 * Entreprises d'un secteur dans un rayon de 50 km (les plus grandes d'abord).
 * pages : nombre de pages de 25 entreprises lues par requête du secteur.
 */
export async function nearbySector(sector: string, center: Point, pages: number): Promise<Place[]> {
  const def = sectorDef(sector)
  if (!def) return []
  const out = new Map<string, Place>()
  for (const q of def.queries) {
    for (let n = 1; n <= pages; n++) {
      const { places, total } = await page(q, center, n)
      for (const p of places) if (inSector(p.naf, def) && !out.has(p.siren)) out.set(p.siren, p)
      if (n >= total) break
    }
  }
  return [...out.values()]
}

/** Recherche par nom autour d'un point (département compris) : pour localiser une entreprise suivie. */
export async function searchPlaces(q: string, center: Point, opts: { dept?: string; nearest?: boolean } = {}): Promise<Place[]> {
  const params = new URLSearchParams({ q, per_page: '10', minimal: 'true', include: 'matching_etablissements', etat_administratif: 'A' })
  if (opts.dept) params.set('departement', opts.dept)
  const d = await getJson(`${API}/search?${params}`)
  return ((d.results ?? []) as any[])
    .map((r) => toPlace(r, center, 400, opts.nearest))
    .filter((p): p is Place => !!p)
    .sort((a, b) => km(center, a) - km(center, b))
}

/** Département d'un code postal ou d'une adresse (« 34000 MONTPELLIER » → 34). */
export const deptOfAddress = (a?: string) => /\b(\d{2})\d{3}\b/.exec(a ?? '')?.[1]

export const annuaireUrl = (siren: string) => `https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}`

/** Une adresse de site d'emploi plutôt que la page carrières d'une entreprise. */
export function guessBoard(c: { url: string }): boolean {
  try {
    const u = new URL(c.url)
    return /emploi|afjv|indeed|hellowork|apec\.|cadremploi|meteojob|francetravail|jobteaser|monster|jobijoba|regionsjob/i.test(u.hostname) && !/societe|entreprise|compan/i.test(u.pathname)
  } catch {
    return false
  }
}


export interface Address {
  label: string
  lat: number
  lon: number
  city?: string
  postcode?: string
}
/** Adresses correspondant à un texte (Géoplateforme IGN, Base Adresse Nationale). */
export async function searchAddress(q: string, near?: Point): Promise<Address[]> {
  const params = new URLSearchParams({ q, limit: '5' })
  if (near) {
    params.set('lat', String(near.lat))
    params.set('lon', String(near.lon))
  }
  const r = await fetch(`https://data.geopf.fr/geocodage/search?${params}`)
  if (!r.ok) throw new Error(`Recherche d'adresse : erreur ${r.status}`)
  const d = await r.json()
  return ((d.features ?? []) as any[]).map((f) => ({
    label: f.properties?.label ?? q,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    city: f.properties?.city,
    postcode: f.properties?.postcode,
  }))
}
