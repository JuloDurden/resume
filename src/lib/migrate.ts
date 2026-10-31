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
  return { docs, offers }
}

