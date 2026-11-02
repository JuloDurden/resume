import { create } from 'zustand'
import { get as idbGet } from 'idb-keyval'
import type { AnyDoc, Offer, WatchState } from '../types'
import { useFeed } from './feed'
import { useDocs } from './documents'
import { GitHubError, lastSyncTime, loadConfig, markFeedRead, sync } from '../lib/github'
import { differs, toSet, type DataSet } from '../lib/merge'

type Status = 'off' | 'idle' | 'syncing' | 'error'

interface SyncStore {
  status: Status
  message?: string
  lastSync?: number
  run: () => Promise<void>
}

let running: Promise<void> | null = null
let again = false
/** vrai pendant qu'on applique des données venues d'ailleurs (pour ne pas les renvoyer en boucle) */
let merging = false

const snapshot = (): DataSet => {
  const s = useDocs.getState()
  return { docs: s.docs, offers: s.offers, deleted: s.deleted, watch: s.watch }
}

function mergeIn(data: DataSet): boolean {
  merging = true
  try {
    return useDocs.getState().mergeIn(data)
  } finally {
    merging = false
  }
}

/** Un seul onglet synchronise à la fois (Web Locks), les autres attendent leur tour. */
function withLock(fn: () => Promise<void>): Promise<void> {
  const locks = (navigator as unknown as { locks?: { request: (n: string, f: () => Promise<void>) => Promise<void> } }).locks
  return locks ? locks.request('resume-github-sync', fn) : fn()
}

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
    running = withLock(async () => {
      try {
        const before = snapshot()
        const res = await sync(cfg, { docs: Object.values(before.docs), offers: Object.values(before.offers), deleted: before.deleted, watch: before.watch })
        if (res.feed) {
          useFeed.getState().setFeed(res.feed.feed)
          markFeedRead(res.feed.sha)
        }
        // fusion avec l'état ACTUEL : ce qui a été créé, modifié ou supprimé pendant la synchronisation est conservé
        const remote = toSet(res.data.docs, res.data.offers, res.data.deleted, res.data.watch)
        mergeIn(remote)
        // des modifications locales sont arrivées pendant l'envoi : on les enverra au passage suivant
        if (differs(remote, snapshot())) again = true
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
          setTimeout(() => get().run(), 1500)
        }
      }
    })
    return running
  },
}))

/* ---------- Plusieurs onglets ouverts ---------- */

interface TabMessage {
  docs: AnyDoc[]
  offers: Offer[]
  deleted: Record<string, number>
  watch?: WatchState
}

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('resume-docs') : null

/** Relit les données enregistrées par les autres onglets et les fusionne (filet de sécurité au retour sur l'onglet). */
async function mergeFromDisk() {
  try {
    const raw = await idbGet<string>('resume-app-docs')
    if (!raw) return
    const st = JSON.parse(raw).state as Partial<DataSet>
    mergeIn({ docs: st.docs ?? {}, offers: st.offers ?? {}, deleted: st.deleted ?? {}, watch: st.watch })
  } catch {
    /* données illisibles : on ignore */
  }
}

let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Synchronise automatiquement : quelques secondes après chaque modification, au retour sur l'onglet,
 * et toutes les 3 minutes. Partage aussi les modifications entre onglets ouverts.
 */
export function startAutoSync() {
  const schedule = (delay: number) => {
    if (!loadConfig()) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      useSync.getState().run()
    }, delay)
  }

  channel?.addEventListener('message', (e: MessageEvent<TabMessage>) => {
    const m = e.data
    mergeIn(toSet(m.docs ?? [], m.offers ?? [], m.deleted ?? {}, m.watch))
  })

  useDocs.subscribe((s, prev) => {
    if (s.hydrated && !prev.hydrated) {
      schedule(300)
      return
    }
    if (s.docs === prev.docs && s.offers === prev.offers && s.deleted === prev.deleted && s.watch === prev.watch) return
    if (merging) return
    // modification faite dans cet onglet : on la diffuse aux autres onglets, puis on programme l'envoi
    const docs = Object.values(s.docs).filter((d) => prev.docs[d.id] !== d)
    const offers = Object.values(s.offers).filter((o) => prev.offers[o.id] !== o)
    try {
      channel?.postMessage({ docs, offers, deleted: s.deleted, watch: s.watch } satisfies TabMessage)
    } catch {
      /* message trop volumineux : les autres onglets se rattraperont au retour */
    }
    schedule(4000)
  })

  if (useDocs.getState().hydrated) schedule(300)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    mergeFromDisk()
    schedule(200)
  })
  setInterval(() => document.visibilityState === 'visible' && schedule(0), 180000)
  // dernier envoi avant de fermer l'onglet, si une modification est en attente
  window.addEventListener('pagehide', () => timer && useSync.getState().run())
}
