import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { del, get, set } from 'idb-keyval'
import type { AnyDoc } from '../types'
import { uid } from '../lib/ids'

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

interface DocsState {
  docs: Record<string, AnyDoc>
  hydrated: boolean
  history: Record<string, History>
  lastBackup?: number
  add: (doc: AnyDoc) => void
  update: <T extends AnyDoc>(id: string, fn: (d: T) => T, opts?: { coalesce?: boolean }) => void
  remove: (id: string) => void
  duplicate: (id: string) => string | undefined
  importDocs: (docs: AnyDoc[]) => number
  undo: (id: string) => void
  redo: (id: string) => void
  markBackup: () => void
}

const MAX_HISTORY = 80

export const useDocs = create<DocsState>()(
  persist(
    (setState, getState) => ({
      docs: {},
      hydrated: false,
      history: {},
      add: (doc) => setState((s) => ({ docs: { ...s.docs, [doc.id]: doc } })),
      update: (id, fn, opts) =>
        setState((s) => {
          const cur = s.docs[id]
          if (!cur) return s
          const next = { ...(fn(cur as never) as AnyDoc), updatedAt: Date.now() }
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
          return { docs }
        }),
      duplicate: (id) => {
        const cur = getState().docs[id]
        if (!cur) return
        const copy = structuredClone(cur)
        copy.id = uid()
        copy.name = `${cur.name} (copie)`
        copy.createdAt = copy.updatedAt = Date.now()
        getState().add(copy)
        return copy.id
      },
      importDocs: (docs) => {
        let n = 0
        setState((s) => {
          const all = { ...s.docs }
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
          return { docs: all }
        })
        return n
      },
      undo: (id) =>
        setState((s) => {
          const h = s.history[id]
          const cur = s.docs[id]
          if (!h || !h.past.length || !cur) return s
          const prev = h.past[h.past.length - 1]
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
          const nxt = h.future[0]
          return {
            docs: { ...s.docs, [id]: nxt },
            history: { ...s.history, [id]: { past: [...h.past, cur], future: h.future.slice(1), lastPush: 0 } },
          }
        }),
      markBackup: () => setState({ lastBackup: Date.now() }),
    }),
    {
      name: 'resume-app-docs',
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ docs: s.docs, lastBackup: s.lastBackup }) as unknown as DocsState,
      onRehydrateStorage: () => () => {
        useDocs.setState({ hydrated: true })
      },
    },
  ),
)

export function useDoc<T extends AnyDoc>(id: string | undefined): T | undefined {
  return useDocs((s) => (id ? (s.docs[id] as T | undefined) : undefined))
}

if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {})
}
