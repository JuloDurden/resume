import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { del, get, set } from 'idb-keyval'
import type { Feed } from '../types'

const idb: StateStorage = {
  getItem: async (n) => (await get<string>(n)) ?? null,
  setItem: async (n, v) => {
    await set(n, v)
  },
  removeItem: async (n) => {
    await del(n)
  },
}

interface FeedState {
  feed: Feed | null
  /** dernière consultation de l'onglet Annonces (pour signaler les nouveautés) */
  seenAt: number
  setFeed: (f: Feed) => void
  markSeen: () => void
}

/** Flux d'annonces écrit par la tâche GitHub de veille, conservé localement pour une consultation hors ligne. */
export const useFeed = create<FeedState>()(
  persist(
    (setState) => ({
      feed: null,
      seenAt: 0,
      setFeed: (feed) => setState({ feed }),
      markSeen: () => setState({ seenAt: Date.now() }),
    }),
    { name: 'resume-feed', storage: createJSONStorage(() => idb), partialize: (s) => ({ feed: s.feed, seenAt: s.seenAt }) as never },
  ),
)
