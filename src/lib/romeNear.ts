// Métiers proches (référentiel ROME) : rapprocher une annonce des métiers visés et repérer les métiers sans rapport.
import type { MatchProfile } from '../types'
import { loadFiche, searchRome, type RomeIndex } from './rome'

/** Intitulé d'annonce nettoyé pour la recherche ROME (sans H/F, contrat, niveau, précisions après un tiret). */
export const cleanJobTitle = (t: string) =>
  t
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\(?\b[hf]\s*\/\s*[hf](\s*\/\s*(x|nb|ng))?\b\)?/gi, ' ')
    .replace(/\b(cdi|cdd|junior|senior|confirm[ée]e?|alternant|alternance|stage|stagiaire|freelance|expert\(e\)|expert)\b/gi, ' ')
    .replace(/\s[-–|,(_].*$/, '')
    .replace(/\s+/g, ' ')
    .trim()

export interface RomeGuess {
  code: string
  label: string
  /** l'intitulé de l'annonce correspond (presque) mot pour mot à une appellation ROME */
  sure: boolean
}

const cache = new Map<string, RomeGuess[]>()
/** Métiers ROME les plus probables pour un intitulé d'annonce (2 au plus). */
export function romeGuess(ix: RomeIndex, title: string): RomeGuess[] {
  const q = cleanJobTitle(title)
  let r = cache.get(q)
  if (!r) {
    r = q.length < 3 ? [] : searchRome(ix, q, 2).filter((h) => h.score >= 9).map((h) => ({ code: h.code, label: h.intitule, sure: h.score >= 14 }))
    cache.set(q, r)
  }
  return r
}

export interface RomeNear {
  ix: RomeIndex
  /** par profil de recherche : code ROME → raison (« métier visé », « expérience », « métier proche de … ») */
  tracks: Record<string, Map<string, string>>
  /** sous-domaines ROME (3 premiers caractères, ex. M18 informatique) des métiers visés et exercés */
  groups: Set<string>
}

/** Métiers visés et exercés de chaque profil, et leurs métiers proches selon le ROME (mobilités). */
export async function buildRomeNear(ix: RomeIndex, profile?: MatchProfile): Promise<RomeNear | undefined> {
  const tracks = profile?.tracks ?? []
  if (!tracks.length) return undefined
  const out: RomeNear = { ix, tracks: {}, groups: new Set() }
  for (const t of tracks) {
    const base = new Map<string, string>()
    // métier visé : retenu seulement s'il désigne un seul métier ROME (« Responsable de secteur » existe en santé, en assurance,
    // en distribution... : ambigu, donc ignoré ; ce sont alors les expériences rattachées qui comptent)
    for (const target of t.targets) {
      const [h, second] = searchRome(ix, target, 2)
      if (h && h.score >= 12 && (!second || second.score < h.score - 1) && !base.has(h.code)) base.set(h.code, `métier visé « ${target} »`)
    }
    for (const l of Object.values(profile?.experiences ?? {})) if (l.rome && l.tracks?.includes(t.id)) base.set(l.rome, `métier exercé (${l.romeLabel ?? l.rome})`)
    const all = new Map(base)
    const fiches = await Promise.all([...base.keys()].map((c) => loadFiche(c).catch(() => undefined)))
    for (const f of fiches) for (const m of f?.mobilites ?? []) if (!all.has(m.code)) all.set(m.code, `métier proche de « ${f!.intitule} »`)
    for (const c of base.keys()) out.groups.add(c.slice(0, 3))
    out.tracks[t.id] = all
  }
  return out
}
