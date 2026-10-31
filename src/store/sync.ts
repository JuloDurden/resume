import { create } from 'zustand'
import { useDocs } from './documents'
import { GitHubError, lastSyncTime, loadConfig, sync } from '../lib/github'

type Status = 'off' | 'idle' | 'syncing' | 'error'

interface SyncStore {
  status: Status
  message?: string
  lastSync?: number
  run: (reason?: string) => Promise<void>
}

let running: Promise<void> | null = null
let again = false
let applying = false

export const useSync = create<SyncStore>((set, get) => ({
  status: loadConfig() ? 'idle' : 'off',
  lastSync: lastSyncTime(),
  run: async () => {
    const cfg = loadConfig()
    if (!cfg) return set({ status: 'off', message: undefined })
    if (!useDocs.getState().hydrated) return
    if (running) {
      again = true
      return running
    }
    set({ status: 'syncing' })
    running = (async () => {
      try {
        const s = useDocs.getState()
        const res = await sync(cfg, { docs: Object.values(s.docs), offers: Object.values(s.offers), deleted: s.deleted })
        if (res.changedLocal) {
          applying = true
          useDocs.getState().applyRemote(res.data.docs, res.data.offers, res.data.deleted)
          applying = false
        }
        set({ status: 'idle', message: undefined, lastSync: Date.now() })
      } catch (e) {
        const msg =
          e instanceof GitHubError
            ? e.status === 401
              ? 'Token refusé ou expiré.'
              : e.status === 404
                ? 'Dépôt introuvable ou inaccessible avec ce token.'
                : e.message
            : e instanceof Error
              ? e.message
              : 'Erreur inconnue'
        set({ status: 'error', message: msg })
      } finally {
        running = null
        if (again) {
          again = false
          setTimeout(() => get().run(), 500)
        }
      }
    })()
    return running
  },
}))

let timer: ReturnType<typeof setTimeout> | undefined

/** Synchronise automatiquement : quelques secondes après chaque modification, au retour sur l'onglet, et toutes les 3 minutes. */
export function startAutoSync() {
  const schedule = (delay: number) => {
    if (!loadConfig()) return
    clearTimeout(timer)
    timer = setTimeout(() => useSync.getState().run(), delay)
  }
  useDocs.subscribe((s, prev) => {
    if (s.hydrated && !prev.hydrated) schedule(300)
    else if (!applying && (s.docs !== prev.docs || s.offers !== prev.offers || s.deleted !== prev.deleted)) schedule(4000)
  })
  if (useDocs.getState().hydrated) schedule(300)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && schedule(200))
  setInterval(() => document.visibilityState === 'visible' && schedule(0), 180000)
  // dernier envoi avant de fermer l'onglet, si une modification est en attente
  window.addEventListener('pagehide', () => timer && useSync.getState().run())
}
