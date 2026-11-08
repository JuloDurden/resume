import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { del, get, set } from 'idb-keyval'
import type { Alert, AnyDoc, Company, FeedItem, JobReview, MarkState, MatchProfile, Offer, WatchState } from '../types'
import { uid } from '../lib/ids'
import { migrate } from '../lib/migrate'
import { EMPTY_WATCH, differs, mergeData, type DataSet } from '../lib/merge'
export { migrate }

const idbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? null,
  setItem: async (name, value) => {
    await set(name, value)
  },
  removeItem: async (name) => {
    await del(name)
  },
}

interface History {
  past: AnyDoc[]
  future: AnyDoc[]
  lastPush: number
}

export interface DocsState {
  docs: Record<string, AnyDoc>
  offers: Record<string, Offer>
  watch: WatchState
  /** Suppressions récentes (id -> date), utiles à la synchronisation */
  deleted: Record<string, number>
  hydrated: boolean
  history: Record<string, History>
  lastBackup?: number
  add: (doc: AnyDoc) => void
  update: <T extends AnyDoc>(id: string, fn: (d: T) => T, opts?: { coalesce?: boolean; history?: boolean }) => void
  remove: (id: string) => void
  duplicate: (id: string) => string | undefined
  importDocs: (docs: AnyDoc[], offers?: Offer[]) => number
  undo: (id: string) => void
  redo: (id: string) => void
  markBackup: () => void
  saveOffer: (o: Offer) => void
  setAlerts: (alerts: Alert[]) => void
  mark: (id: string, s: MarkState, title?: string) => void
  markMany: (ids: string[], s: MarkState, titles?: Record<string, string>) => void
  setExcludes: (terms: string[]) => void
  setProfile: (p: MatchProfile) => void
  addReviews: (r: Record<string, JobReview>) => void
  addManual: (i: FeedItem) => void
  setCompanies: (c: Company[]) => void
  setText: (id: string, text: string) => void
  removeOffer: (id: string) => void
  /** Fusionne des données venues d'ailleurs (GitHub, autre onglet) sans jamais écraser une modification plus récente. Renvoie true si l'état local a changé. */
  mergeIn: (data: DataSet) => boolean
}

const MAX_HISTORY = 80

export const useDocs = create<DocsState>()(
  persist(
    (setState, getState) => ({
      docs: {},
      offers: {},
      watch: EMPTY_WATCH,
      deleted: {},
      hydrated: false,
      history: {},
      add: (doc) => setState((s) => ({ docs: { ...s.docs, [doc.id]: doc } })),
      update: (id, fn, opts) =>
        setState((s) => {
          const cur = s.docs[id]
          if (!cur) return s
          const next = { ...(fn(cur as never) as AnyDoc), updatedAt: Date.now() }
          if (opts?.history === false) return { docs: { ...s.docs, [id]: next } }
          const h = s.history[id] ?? { past: [], future: [], lastPush: 0 }
          const now = Date.now()
          const coalesce = opts?.coalesce !== false && now - h.lastPush < 700
          const past = coalesce && h.past.length ? h.past : [...h.past, cur].slice(-MAX_HISTORY)
          return {
            docs: { ...s.docs, [id]: next },
            history: { ...s.history, [id]: { past, future: [], lastPush: now } },
          }
        }),
      remove: (id) =>
        setState((s) => {
          const docs = { ...s.docs }
          delete docs[id]
          return { docs, deleted: { ...s.deleted, [id]: Date.now() } }
        }),
      duplicate: (id) => {
        const cur = getState().docs[id]
        if (!cur) return
        const copy = structuredClone(cur)
        copy.id = uid()
        copy.name = `${cur.name} (copie)`
        copy.createdAt = copy.updatedAt = Date.now()
        // la copie d'un CV de référence est un CV de candidature
        if (copy.kind === 'resume') delete copy.reference
        getState().add(copy)
        return copy.id
      },
      importDocs: (docs, offers = []) => {
        let n = 0
        setState((s) => {
          const all = { ...s.docs }
          const allOffers = { ...s.offers }
          for (const o of offers) {
            if (!o?.id) continue
            if (!allOffers[o.id] || (allOffers[o.id].updatedAt ?? 0) < (o.updatedAt ?? 0)) allOffers[o.id] = structuredClone(o)
          }
          for (const d of docs) {
            if (!d || (d.kind !== 'resume' && d.kind !== 'letter')) continue
            const doc = structuredClone(d)
            const existing = doc.id ? all[doc.id] : undefined
            if (existing) {
              // document identique déjà présent : rien à importer
              if (JSON.stringify({ ...existing, updatedAt: 0 }) === JSON.stringify({ ...doc, updatedAt: 0 })) continue
              doc.id = uid()
              doc.name = `${doc.name} (importé)`
            }
            if (!doc.id) doc.id = uid()
            doc.updatedAt = Date.now()
            all[doc.id] = doc
            n++
          }
          return migrate({ docs: all, offers: allOffers })
        })
        return n
      },
      undo: (id) =>
        setState((s) => {
          const h = s.history[id]
          const cur = s.docs[id]
          if (!h || !h.past.length || !cur) return s
          const prev = { ...h.past[h.past.length - 1], updatedAt: Date.now() }
          return {
            docs: { ...s.docs, [id]: prev },
            history: { ...s.history, [id]: { past: h.past.slice(0, -1), future: [cur, ...h.future], lastPush: 0 } },
          }
        }),
      redo: (id) =>
        setState((s) => {
          const h = s.history[id]
          const cur = s.docs[id]
          if (!h || !h.future.length || !cur) return s
          const nxt = { ...h.future[0], updatedAt: Date.now() }
          return {
            docs: { ...s.docs, [id]: nxt },
            history: { ...s.history, [id]: { past: [...h.past, cur], future: h.future.slice(1), lastPush: 0 } },
          }
        }),
      markBackup: () => setState({ lastBackup: Date.now() }),
      setAlerts: (alerts) => setState((s) => ({ watch: { ...s.watch, alerts, alertsAt: Date.now() } })),
      mark: (id, st, t) => setState((s) => ({ watch: { ...s.watch, marks: { ...s.watch.marks, [id]: { s: st, at: Date.now(), ...(t ? { t } : {}) } } } })),
      markMany: (ids, st, titles) =>
        setState((s) => {
          const at = Date.now()
          const marks = { ...s.watch.marks }
          for (const id of ids) marks[id] = { s: st, at, ...(titles?.[id] ? { t: titles[id] } : {}) }
          return { watch: { ...s.watch, marks } }
        }),
      setProfile: (profile) => setState((s) => ({ watch: { ...s.watch, profile, profileAt: Date.now() } })),
      setCompanies: (companies) => setState((s) => ({ watch: { ...s.watch, companies, companiesAt: Date.now() } })),
      setText: (id, text) =>
        setState((s) => {
          const texts = { ...(s.watch.texts ?? {}) }
          if (text.trim()) texts[id] = text.trim().slice(0, 7000)
          else delete texts[id]
          return { watch: { ...s.watch, texts } }
        }),
      addManual: (i) => setState((s) => ({ watch: { ...s.watch, manual: [...(s.watch.manual ?? []).filter((x) => x.id !== i.id), i] } })),
      addReviews: (r) => setState((s) => ({ watch: { ...s.watch, reviews: { ...(s.watch.reviews ?? {}), ...r } } })),
      setExcludes: (terms) => setState((s) => ({ watch: { ...s.watch, excludes: terms, alertsAt: Date.now() } })),
      saveOffer: (o) =>
        setState((s) => {
          const prev = s.offers[o.id]
          const st = o.status ?? 'todo'
          // date de passage à chaque statut, pour les statistiques et les relances
          const statusAt = (!prev || prev.status !== o.status) && !o.statusAt?.[st] ? { ...o.statusAt, [st]: Date.now() } : o.statusAt
          return { offers: { ...s.offers, [o.id]: { ...o, statusAt, updatedAt: Date.now() } } }
        }),
      removeOffer: (id) =>
        setState((s) => {
          const offers = { ...s.offers }
          delete offers[id]
          const docs = Object.fromEntries(
            Object.entries(s.docs).map(([k, d]) => [k, d.offerId === id ? ({ ...d, offerId: undefined, updatedAt: Date.now() } as AnyDoc) : d]),
          )
          return { offers, docs, deleted: { ...s.deleted, [id]: Date.now() } }
        }),
      mergeIn: (data) => {
        const s = getState()
        const cur: DataSet = { docs: s.docs, offers: s.offers, deleted: s.deleted, watch: s.watch }
        const m = mergeData(cur, data)
        if (!differs(cur, m)) return false
        setState({ docs: m.docs, offers: m.offers, deleted: m.deleted, watch: m.watch ?? s.watch })
        return true
      },
    }),
    {
      name: 'resume-app-docs',
      version: 2,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ docs: s.docs, offers: s.offers, deleted: s.deleted, watch: s.watch, lastBackup: s.lastBackup }) as unknown as DocsState,
      migrate: (persisted) => persisted as DocsState,
      onRehydrateStorage: () => () => {
        const s = useDocs.getState()
        useDocs.setState({ ...migrate({ docs: s.docs, offers: s.offers ?? {} }), deleted: s.deleted ?? {}, watch: s.watch ?? EMPTY_WATCH, hydrated: true })
      },
    },
  ),
)

export function useDoc<T extends AnyDoc>(id: string | undefined): T | undefined {
  return useDocs((s) => (id ? (s.docs[id] as T | undefined) : undefined))
}

export function useOffer(id: string | undefined): Offer | undefined {
  return useDocs((s) => (id ? s.offers[id] : undefined))
}

if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {})
}
