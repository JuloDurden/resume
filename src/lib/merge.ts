import type { AnyDoc, Offer } from '../types'

export interface DataSet {
  docs: Record<string, AnyDoc>
  offers: Record<string, Offer>
  deleted: Record<string, number>
}

/** Durée de conservation des suppressions (pour qu'un appareil resté hors ligne ne fasse pas revenir un document supprimé). */
export const TOMBSTONE_TTL = 365 * 86400000

function mergeMap<T extends { updatedAt: number }>(a: Record<string, T>, b: Record<string, T>, deleted: Record<string, number>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[id]
    const y = b[id]
    // la version la plus récente gagne ; à égalité, on garde celle de `a`
    const pick = x && y ? ((y.updatedAt ?? 0) > (x.updatedAt ?? 0) ? y : x) : (x ?? y)
    // une suppression postérieure à la dernière modification l'emporte
    if (pick && !(deleted[id] && deleted[id] >= (pick.updatedAt ?? 0))) out[id] = pick
  }
  return out
}

export function mergeDeleted(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  const now = Date.now()
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const t = Math.max(a[id] ?? 0, b[id] ?? 0)
    if (now - t < TOMBSTONE_TTL) out[id] = t
  }
  return out
}

/**
 * Fusion sans perte de deux états : chaque document garde sa version la plus récente,
 * les suppressions sont propagées. Fonction pure, utilisée pour GitHub et entre onglets.
 */
export function mergeData(a: DataSet, b: DataSet): DataSet {
  const deleted = mergeDeleted(a.deleted, b.deleted)
  return { docs: mergeMap(a.docs, b.docs, deleted), offers: mergeMap(a.offers, b.offers, deleted), deleted }
}

/** Indique si la fusion a modifié `a` (par référence d'objet). */
export function differs(a: DataSet, m: DataSet): boolean {
  const ka = Object.keys(a.docs)
  const ko = Object.keys(a.offers)
  return (
    ka.length !== Object.keys(m.docs).length ||
    ko.length !== Object.keys(m.offers).length ||
    ka.some((id) => a.docs[id] !== m.docs[id]) ||
    ko.some((id) => a.offers[id] !== m.offers[id]) ||
    Object.keys(m.deleted).length !== Object.keys(a.deleted).length
  )
}

export const toSet = (docs: AnyDoc[], offers: Offer[], deleted: Record<string, number>): DataSet => ({
  docs: Object.fromEntries(docs.map((d) => [d.id, d])),
  offers: Object.fromEntries(offers.map((o) => [o.id, o])),
  deleted,
})
