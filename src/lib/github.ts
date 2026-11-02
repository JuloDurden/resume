import type { AnyDoc, Offer } from '../types'
import { mergeData, toSet } from './merge'

/* ---------- Configuration (propre à chaque navigateur) ---------- */

export interface SyncConfig {
  token: string
  owner: string
  repo: string
  branch: string
}

const CONFIG_KEY = 'resume-sync-config'
const STATE_KEY = 'resume-sync-state'

export function loadConfig(): SyncConfig | null {
  try {
    const c = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null')
    return c?.token ? c : null
  } catch {
    return null
  }
}

export function saveConfig(c: SyncConfig | null) {
  if (c) localStorage.setItem(CONFIG_KEY, JSON.stringify(c))
  else {
    localStorage.removeItem(CONFIG_KEY)
    localStorage.removeItem(STATE_KEY)
  }
}

interface SyncState {
  /** sha Git de chaque fichier tel que vu lors de la dernière synchronisation */
  shas: Record<string, string>
  lastSync?: number
}

const loadState = (): SyncState => {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) ?? '') as SyncState
  } catch {
    return { shas: {} }
  }
}
const saveState = (s: SyncState) => localStorage.setItem(STATE_KEY, JSON.stringify(s))
export const lastSyncTime = () => loadState().lastSync

/* ---------- API GitHub ---------- */

export class GitHubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function gh<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  if (!res.ok) {
    let msg = res.statusText
    try {
      msg = (await res.json()).message ?? msg
    } catch {
      /* corps vide */
    }
    throw new GitHubError(res.status, msg)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

export async function whoAmI(token: string): Promise<string> {
  return (await gh<{ login: string }>(token, '/user')).login
}

/** Vérifie l'accès au dépôt de données. Renvoie 'ok', 'missing' (dépôt absent) ou lève une erreur. */
export async function checkRepo(c: SyncConfig): Promise<'ok' | 'missing'> {
  try {
    const r = await gh<{ private: boolean; permissions?: { push: boolean } }>(c.token, `/repos/${c.owner}/${c.repo}`)
    if (r.permissions && !r.permissions.push) throw new GitHubError(403, 'Le token ne peut pas écrire dans ce dépôt.')
    if (!r.private) throw new GitHubError(400, 'Ce dépôt est public : vos documents y seraient visibles par tous. Utilisez un dépôt privé.')
    return 'ok'
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return 'missing'
    throw e
  }
}

export async function createRepo(c: SyncConfig) {
  await gh(c.token, '/user/repos', {
    method: 'POST',
    body: JSON.stringify({ name: c.repo, private: true, auto_init: true, description: 'Sauvegarde privée de Resume (CV et lettres de motivation)' }),
  })
}

/* ---------- Encodage ---------- */

function b64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''))
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function utf8ToB64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Calcule le sha Git d'un blob, pour savoir si un fichier distant a changé sans le télécharger. */
async function gitSha(content: string): Promise<string> {
  const body = new TextEncoder().encode(content)
  const head = new TextEncoder().encode(`blob ${body.length}\0`)
  const all = new Uint8Array(head.length + body.length)
  all.set(head)
  all.set(body, head.length)
  const h = await crypto.subtle.digest('SHA-1', all)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/* ---------- Synchronisation ---------- */

const DOC_DIR = 'data/documents/'
const OFFER_DIR = 'data/offers/'
const DELETED = 'data/deleted.json'
const serialize = (x: unknown) => JSON.stringify(x, null, 1) + '\n'

export interface LocalData {
  docs: AnyDoc[]
  offers: Offer[]
  deleted: Record<string, number>
}

export interface SyncResult {
  data: LocalData
  /** les données locales ont changé (à appliquer dans le store) */
  changedLocal: boolean
  pushed: number
  pulled: number
}

interface TreeEntry {
  path: string
  sha: string
  type: string
}

/**
 * Synchronise dans les deux sens. Pour chaque document ou offre, la version la plus récente gagne ;
 * une suppression plus récente que la dernière modification l'emporte aussi.
 */
export async function sync(c: SyncConfig, local: LocalData, attempt = 0): Promise<SyncResult> {
  const base = `/repos/${c.owner}/${c.repo}`

  // 1. état distant
  const ref = await gh<{ object: { sha: string } }>(c.token, `${base}/git/ref/heads/${c.branch}`)
  const headSha = ref.object.sha
  const tree = await gh<{ tree: TreeEntry[]; truncated: boolean }>(c.token, `${base}/git/trees/${headSha}?recursive=1`)
  const remoteFiles = new Map(tree.tree.filter((t) => t.type === 'blob' && t.path.startsWith('data/')).map((t) => [t.path, t.sha]))

  // 2. lecture des fichiers distants modifiés depuis la dernière synchronisation
  const remoteDocs = new Map<string, AnyDoc>()
  const remoteOffers = new Map<string, Offer>()
  let remoteDeleted: Record<string, number> = {}
  let pulled = 0
  const localDocs = new Map(local.docs.map((d) => [d.id, d]))
  const localOffers = new Map(local.offers.map((o) => [o.id, o]))
  await Promise.all(
    [...remoteFiles].map(async ([path, sha]) => {
      const id = path.replace(/^.*\//, '').replace(/\.json$/, '')
      const isDoc = path.startsWith(DOC_DIR)
      const isOffer = path.startsWith(OFFER_DIR)
      if (!isDoc && !isOffer && path !== DELETED) return
      // inutile de télécharger un fichier identique à la version locale (comparaison par contenu,
      // fiable même si plusieurs onglets ou appareils synchronisent)
      const mine = isDoc ? localDocs.get(id) : isOffer ? localOffers.get(id) : undefined
      if (mine && (await gitSha(serialize(mine))) === sha) return
      const blob = await gh<{ content: string }>(c.token, `${base}/git/blobs/${sha}`)
      const value = JSON.parse(b64ToUtf8(blob.content))
      pulled++
      if (path === DELETED) remoteDeleted = value
      else if (isDoc) remoteDocs.set(id, value)
      else if (isOffer) remoteOffers.set(id, value)
    }),
  )

  // 3. fusion (les fichiers distants non téléchargés sont identiques aux versions locales)
  const merged = mergeData(toSet(local.docs, local.offers, local.deleted), toSet([...remoteDocs.values()], [...remoteOffers.values()], remoteDeleted))
  const docs = new Map(Object.entries(merged.docs))
  const offers = new Map(Object.entries(merged.offers))

  // 4. fichiers à écrire ou supprimer
  const wanted = new Map<string, string>()
  for (const d of docs.values()) wanted.set(DOC_DIR + d.id + '.json', serialize(d))
  for (const o of offers.values()) wanted.set(OFFER_DIR + o.id + '.json', serialize(o))
  const recentDeleted = merged.deleted
  wanted.set(DELETED, serialize(recentDeleted))

  const changes: { path: string; content?: string }[] = []
  const newShas: Record<string, string> = {}
  for (const [path, content] of wanted) {
    const sha = await gitSha(content)
    newShas[path] = sha
    if (remoteFiles.get(path) !== sha) changes.push({ path, content })
  }
  for (const path of remoteFiles.keys()) if (!wanted.has(path) && (path.startsWith(DOC_DIR) || path.startsWith(OFFER_DIR))) changes.push({ path })

  // 5. un seul commit pour toutes les modifications
  if (changes.length) {
    const commit = await gh<{ tree: { sha: string } }>(c.token, `${base}/git/commits/${headSha}`)
    const entries = await Promise.all(
      changes.map(async (ch) => {
        if (ch.content === undefined) return { path: ch.path, mode: '100644', type: 'blob', sha: null }
        const blob = await gh<{ sha: string }>(c.token, `${base}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: utf8ToB64(ch.content), encoding: 'base64' }) })
        return { path: ch.path, mode: '100644', type: 'blob', sha: blob.sha }
      }),
    )
    const newTree = await gh<{ sha: string }>(c.token, `${base}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: commit.tree.sha, tree: entries }) })
    const newCommit = await gh<{ sha: string }>(c.token, `${base}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({ message: `Synchronisation Resume (${changes.length} fichier${changes.length > 1 ? 's' : ''})`, tree: newTree.sha, parents: [headSha] }),
    })
    try {
      await gh(c.token, `${base}/git/refs/heads/${c.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: newCommit.sha }) })
    } catch (e) {
      // un autre appareil a écrit entre-temps : on recommence une fois avec l'état à jour
      if (e instanceof GitHubError && (e.status === 422 || e.status === 409) && attempt < 2) return sync(c, local, attempt + 1)
      throw e
    }
  }

  saveState({ shas: newShas, lastSync: Date.now() })
  void remoteFiles
  const data: LocalData = { docs: [...docs.values()], offers: [...offers.values()], deleted: recentDeleted }
  const changedLocal =
    data.docs.length !== local.docs.length ||
    data.offers.length !== local.offers.length ||
    data.docs.some((d) => localDocs.get(d.id) !== d) ||
    data.offers.some((o) => localOffers.get(o.id) !== o)
  return { data, changedLocal, pushed: changes.length, pulled }
}

/* ---------- Vitrine publique ---------- */

export interface ShowcaseTarget {
  owner: string
  repo: string
  branch: string
}

/** Dépôt de l'application, déduit de l'adresse GitHub Pages (ex. julodurden.github.io/resume). */
export function appRepoFromLocation(): ShowcaseTarget | null {
  const m = /^([^.]+)\.github\.io$/.exec(location.hostname)
  const repo = location.pathname.split('/').filter(Boolean)[0]
  return m && repo ? { owner: m[1], repo, branch: 'main' } : null
}

export async function publishShowcase(token: string, t: ShowcaseTarget, content: string) {
  const path = `/repos/${t.owner}/${t.repo}/contents/public/showcase.json`
  let sha: string | undefined
  try {
    sha = (await gh<{ sha: string }>(token, `${path}?ref=${t.branch}`)).sha
  } catch (e) {
    if (!(e instanceof GitHubError && e.status === 404)) throw e
  }
  await gh(token, path, {
    method: 'PUT',
    body: JSON.stringify({ message: 'Mise à jour de la vitrine', content: utf8ToB64(content), branch: t.branch, sha }),
  })
}
