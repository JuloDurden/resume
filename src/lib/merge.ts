import type { AnyDoc, Offer, WatchState } from '../types'

export interface DataSet {
  docs: Record<string, AnyDoc>
  offers: Record<string, Offer>
  deleted: Record<string, number>
  watch?: WatchState
}

export const EMPTY_WATCH: WatchState = { alerts: [], alertsAt: 0, marks: {} }

/** Alertes : la liste la plus récente gagne. Marques (favori, masquée) : fusion annonce par annonce. */
export function mergeWatch(a?: WatchState, b?: WatchState): WatchState | undefined {
  if (!a) return b
  if (!b) return a
  const marks = { ...a.marks }
  for (const [id, m] of Object.entries(b.marks)) if (!marks[id] || m.at > marks[id].at) marks[id] = m
  const newer = b.alertsAt > a.alertsAt ? b : a
  const same = newer === a && Object.keys(marks).length === Object.keys(a.marks).length && Object.entries(b.marks).every(([id, m]) => a.marks[id] && a.marks[id].at >= m.at)
  return same ? a : { alerts: newer.alerts, alertsAt: newer.alertsAt, excludes: newer.excludes, marks }
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
  return { docs: mergeMap(a.docs, b.docs, deleted), offers: mergeMap(a.offers, b.offers, deleted), deleted, watch: mergeWatch(a.watch, b.watch) }
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
    Object.keys(m.deleted).length !== Object.keys(a.deleted).length ||
    a.watch !== m.watch
  )
}

export const toSet = (docs: AnyDoc[], offers: Offer[], deleted: Record<string, number>, watch?: WatchState): DataSet => ({
  docs: Object.fromEntries(docs.map((d) => [d.id, d])),
  offers: Object.fromEntries(offers.map((o) => [o.id, o])),
  deleted,
  watch,
})
