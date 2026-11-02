import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sync, type LocalData, type SyncConfig } from '../lib/github'
import { newResume } from '../data/factory'
import type { AnyDoc } from '../types'
import { createHash } from 'node:crypto'

/* ---- faux localStorage, un par appareil ---- */
const stores: Record<string, Map<string, string>> = { A: new Map(), B: new Map() }
let current = stores.A
const device = (n: 'A' | 'B') => (current = stores[n])
;(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => current.get(k) ?? null,
  setItem: (k: string, v: string) => void current.set(k, v),
  removeItem: (k: string) => void current.delete(k),
}

/* ---- faux GitHub (API Git en mémoire) ---- */
const blobs = new Map<string, string>() // sha -> contenu utf8
const trees = new Map<string, Record<string, string>>() // sha -> path -> blob sha
const commits = new Map<string, { tree: string }>()
let head = ''
let n = 0
const id = () => `x${++n}`
const gitSha = (c: string) => {
  const b = Buffer.from(c, 'utf8')
  return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex')
}
function reset() {
  blobs.clear(); trees.clear(); commits.clear()
  const t = id(); trees.set(t, {})
  head = id(); commits.set(head, { tree: t })
  stores.A.clear(); stores.B.clear()
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status })
vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
  const p = url.replace('https://api.github.com/repos/me/data', '')
  const m = init.method ?? 'GET'
  const body = init.body ? JSON.parse(init.body as string) : undefined
  if (m === 'GET' && p === '/git/ref/heads/main') return json({ object: { sha: head } })
  if (m === 'GET' && p.startsWith('/git/trees/')) {
    const t = trees.get(commits.get(p.split('/')[3].split('?')[0])!.tree)!
    return json({ truncated: false, tree: Object.entries(t).map(([path, sha]) => ({ path, sha, type: 'blob' })) })
  }
  if (m === 'GET' && p.startsWith('/git/blobs/')) return json({ content: Buffer.from(blobs.get(p.split('/')[3])!, 'utf8').toString('base64') })
  if (m === 'GET' && p.startsWith('/git/commits/')) return json({ tree: { sha: commits.get(p.split('/')[3])!.tree } })
  if (m === 'POST' && p === '/git/blobs') {
    const c = Buffer.from(body.content, 'base64').toString('utf8')
    const sha = gitSha(c); blobs.set(sha, c); return json({ sha })
  }
  if (m === 'POST' && p === '/git/trees') {
    const t = { ...trees.get(body.base_tree)! }
    for (const e of body.tree) { if (e.sha === null) delete t[e.path]; else t[e.path] = e.sha }
    const sha = id(); trees.set(sha, t); return json({ sha })
  }
  if (m === 'POST' && p === '/git/commits') { const sha = id(); commits.set(sha, { tree: body.tree }); return json({ sha }) }
  if (m === 'PATCH' && p === '/git/refs/heads/main') { head = body.sha; return json({}) }
  return json({ message: `non simulé : ${m} ${p}` }, 500)
})

const cfg: SyncConfig = { token: 't', owner: 'me', repo: 'data', branch: 'main' }
const remotePaths = () => Object.keys(trees.get(commits.get(head)!.tree)!).sort()
const local = (docs: AnyDoc[], deleted: Record<string, number> = {}): LocalData => ({ docs, offers: [], deleted })
const ids = (d: LocalData) => d.docs.map((x) => x.id).sort()

describe('synchronisation GitHub', () => {
  beforeEach(reset)

  it('envoie, récupère, fusionne et propage les suppressions entre deux appareils', async () => {
    const d1 = newResume('epure', true, 'CV 1')
    const d2 = newResume('epure', true, 'CV 2')
    device('A')
    let A = (await sync(cfg, local([d1, d2]))).data
    expect(remotePaths()).toEqual(['data/deleted.json', `data/documents/${d1.id}.json`, `data/documents/${d2.id}.json`].sort())

    device('B')
    let B = (await sync(cfg, local([]))).data
    expect(ids(B)).toEqual([d1.id, d2.id].sort())

    // B modifie d1 et supprime d2
    const d1b = { ...B.docs.find((x) => x.id === d1.id)!, name: 'CV 1 modifié', updatedAt: Date.now() + 1000 }
    const r = await sync(cfg, local([d1b], { [d2.id]: Date.now() + 1000 }))
    B = r.data
    expect(remotePaths()).not.toContain(`data/documents/${d2.id}.json`)

    // A récupère la modification et la suppression
    device('A')
    const rA = await sync(cfg, local(A.docs, {}))
    A = rA.data
    expect(rA.changedLocal).toBe(true)
    expect(ids(A)).toEqual([d1.id])
    expect(A.docs[0].name).toBe('CV 1 modifié')

    // créations simultanées sur les deux appareils : on garde tout
    const d3 = newResume('epure', false, 'CV 3')
    A = (await sync(cfg, local([...A.docs, d3], A.deleted))).data
    device('B')
    const d4 = newResume('epure', false, 'CV 4')
    B = (await sync(cfg, local([...B.docs, d4], B.deleted))).data
    expect(ids(B)).toEqual([d1.id, d3.id, d4.id].sort())
    device('A')
    A = (await sync(cfg, local(A.docs, A.deleted))).data
    expect(ids(A)).toEqual([d1.id, d3.id, d4.id].sort())

    // rien à faire : aucun nouvel envoi
    const again = await sync(cfg, local(A.docs, A.deleted))
    expect(again.pushed).toBe(0)
  })

  it('la version la plus récente gagne en cas de modification des deux côtés', async () => {
    const d = newResume('epure', true, 'Base')
    device('A'); await sync(cfg, local([d]))
    device('B'); const B = (await sync(cfg, local([]))).data
    device('A'); await sync(cfg, local([{ ...d, name: 'Version A', updatedAt: d.updatedAt + 10 }]))
    device('B')
    const r = await sync(cfg, local([{ ...B.docs[0], name: 'Version B', updatedAt: d.updatedAt + 20 }]))
    expect(r.data.docs[0].name).toBe('Version B')
    device('A')
    const rA = await sync(cfg, local([{ ...d, name: 'Version A', updatedAt: d.updatedAt + 10 }]))
    expect(rA.data.docs[0].name).toBe('Version B')
  })
})

import { mergeData, toSet } from '../lib/merge'

describe('fusion sans perte', () => {
  beforeEach(reset)

  it('conserve un CV créé et une suppression faite PENDANT une synchronisation', async () => {
    const a = newResume('epure', true, 'A')
    const b = newResume('epure', true, 'B')
    device('A')
    const before = toSet([a, b], [], {})
    const res = await sync(cfg, { docs: [a, b], offers: [], deleted: {} }) // synchro lancée
    // pendant la synchro : création d'un CV, suppression de B, modification de A
    const c = newResume('epure', true, 'Nouveau CV importé')
    const a2 = { ...a, name: 'A modifié', updatedAt: Date.now() + 5 }
    const now = toSet([a2, c], [], { [b.id]: Date.now() + 5 })
    void before
    const merged = mergeData(now, toSet(res.data.docs, res.data.offers, res.data.deleted))
    expect(Object.keys(merged.docs).sort()).toEqual([a.id, c.id].sort())
    expect(merged.docs[a.id].name).toBe('A modifié')
  })

  it("un onglet resté ouvert avec d'anciennes données n'écrase pas les versions récentes", async () => {
    const d = newResume('epure', true, 'Original')
    device('A')
    await sync(cfg, { docs: [d], offers: [], deleted: {} })
    // un autre onglet du même navigateur (même localStorage) modifie et envoie
    const recent = { ...d, name: 'Version récente', updatedAt: d.updatedAt + 1000 }
    await sync(cfg, { docs: [recent], offers: [], deleted: {} })
    // l'onglet resté ouvert synchronise avec son ancienne version
    const r = await sync(cfg, { docs: [d], offers: [], deleted: {} })
    expect(r.data.docs[0].name).toBe('Version récente')
    const again = await sync(cfg, { docs: r.data.docs, offers: [], deleted: r.data.deleted })
    expect(again.pushed).toBe(0)
  })
})
