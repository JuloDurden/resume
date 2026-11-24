// Secteurs proposés pour chaque profil de recherche, d'après les entreprises des candidatures.
import type { MatchTrack, Offer } from '../types'
import { deptOf, titleSimilarity } from './match'
import { searchPlaces } from './places'
import { sectorOfNaf } from './sectors'

type Point = { lat: number; lon: number }

/** Profil le plus proche d'un intitulé (plusieurs postes possibles, séparés par « / »). */
export function trackOfTitle(title: string, tracks: MatchTrack[]): MatchTrack | undefined {
  let best: { t: MatchTrack; v: number } | undefined
  for (const part of title.split(/\s+\/\s+/)) {
    for (const t of tracks) {
      for (const target of t.targets) {
        const v = Math.max(titleSimilarity(part, target), titleSimilarity(target, part))
        if (!best || v > best.v) best = { t, v }
      }
    }
  }
  return best && best.v >= 0.5 ? best.t : undefined
}

/** Secteur d'une entreprise (code NAF trouvé dans la base SIRENE). */
export async function companySector(name: string, center: Point, location?: string): Promise<{ sector?: string; naf?: string }> {
  try {
    const dept = deptOf(location) ?? '34'
    const list = await searchPlaces(name, center, { dept })
    const p = list[0] ?? (await searchPlaces(name, center))[0]
    return p ? { sector: sectorOfNaf(p.naf), naf: p.naf } : {}
  } catch {
    return {}
  }
}

/** Secteurs par profil, du plus fréquent au moins fréquent, d'après les candidatures. */
export async function suggestSectors(tracks: MatchTrack[], offers: Offer[], center: Point): Promise<Record<string, string[]>> {
  const count: Record<string, Map<string, number>> = Object.fromEntries(tracks.map((t) => [t.id, new Map()]))
  const seen = new Map<string, string | undefined>()
  for (const o of offers) {
    if (!o.company?.trim()) continue
    const key = o.company.trim().toLowerCase()
    if (!seen.has(key)) seen.set(key, (await companySector(o.company, center, o.location)).sector)
    const sector = seen.get(key)
    if (!sector) continue
    const titles = o.spontaneous && o.posts?.length ? o.posts : [o.title ?? '']
    const hit = new Set<string>()
    for (const title of titles) {
      const t = trackOfTitle(title, tracks)
      if (t) hit.add(t.id)
    }
    // poste multiple : le secteur vaut pour chacun des profils concernés
    for (const id of hit) count[id].set(sector, (count[id].get(sector) ?? 0) + 1)
  }
  return Object.fromEntries(Object.entries(count).map(([id, m]) => [id, [...m.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s)]))
}
