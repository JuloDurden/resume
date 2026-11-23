import { cleanPost, shortDocName } from './filename'
import type { AnyDoc, Offer } from '../types'
import { uid } from './ids'

/**
 * Migration : les offres autrefois stockées dans chaque CV (job / jobs) ou lettre (job)
 * deviennent des offres globales, et le document est rattaché à son offre active.
 */
export function migrate(state: { docs: Record<string, AnyDoc>; offers: Record<string, Offer> }) {
  const offers = { ...state.offers }
  const docs = { ...state.docs }
  for (const [id, d] of Object.entries(docs)) {
    const legacy = [...(d.kind === 'resume' ? (d.jobs ?? []) : []), ...(d.job ? [d.job] : [])].filter((j) => j && (j.title || j.description || j.company))
    if (!legacy.length) continue
    let activeId: string | undefined = d.offerId
    for (const j of legacy) {
      const oid = j.id && j.id !== 'initial' ? j.id : uid()
      if (!offers[oid]) {
        const { lastScore, ...rest } = j
        offers[oid] = { ...rest, id: oid, createdAt: j.createdAt ?? d.createdAt, updatedAt: Date.now(), scores: lastScore !== undefined ? { [id]: lastScore } : {} }
      }
      if (d.job && (j === d.job || j.id === d.job.id)) activeId = activeId ?? oid
    }
    const next = { ...d, offerId: activeId, job: undefined } as AnyDoc
    if (next.kind === 'resume') delete next.jobs
    docs[id] = next
  }
  // anciennes candidatures spontanées saisies comme des offres « Candidature spontanée <poste> »
  for (const [id, o] of Object.entries(offers)) {
    if (o.spontaneous || !/^\s*candidature\s+spontan[ée]e\b/i.test(o.title ?? '')) continue
    const post = cleanPost(o.title)
    offers[id] = { ...o, spontaneous: true, posts: post ? [post] : [], title: post || 'Candidature spontanée', updatedAt: (o.updatedAt ?? 0) + 1 }
  }
  return { docs, offers }
}


/** Une fois par navigateur : « Poste H/F - Entreprise » devient « Poste » (l'entreprise et la ville sont dans l'offre). Les noms personnalisés ne changent pas. */
export function shortenDocNames(docs: Record<string, AnyDoc>, offers: Record<string, Offer>): Record<string, AnyDoc> | null {
  const KEY = 'resume-doc-names-v1'
  try {
    if (localStorage.getItem(KEY)) return null
    localStorage.setItem(KEY, String(Date.now()))
  } catch {
    return null
  }
  let changed = false
  const out = { ...docs }
  for (const [id, d] of Object.entries(docs)) {
    const name = shortDocName(d, d.offerId ? offers[d.offerId] : undefined)
    if (!name) continue
    // date à peine avancée : la synchronisation retient le nouveau nom sans bouleverser l'ordre des documents
    out[id] = { ...d, name, updatedAt: d.updatedAt + 1 }
    changed = true
  }
  return changed ? out : null
}
