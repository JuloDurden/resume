// Rangement des documents par profil de recherche (IT / Produit, Management…) ou par candidature.
import type { AnyDoc, FeedItem, Offer, ResumeDoc, WatchState } from '../types'
import { matchBest, resolveProfile } from './match'

export const NO_TRACK = ''

/**
 * Profils de recherche de chaque document :
 * 1. choix fait à la main (« Classer dans… ») ;
 * 2. CV de référence choisi comme CV de base d'un ou plusieurs profils ;
 * 3. document rattaché à une offre : profil de l'offre, choisi comme pour les annonces (nature du poste, intitulé, compétences) ;
 * 4. lettre liée à un CV : profil de ce CV ;
 * 5. sinon, d'après le titre visé du document, s'il ressemble nettement aux métiers d'un profil.
 */
export function docTracks(docs: AnyDoc[], offers: Record<string, Offer>, watch: WatchState): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const tracks = watch.profile?.tracks ?? []
  if (!tracks.length) return out
  const resumes = docs.filter((d): d is ResumeDoc => d.kind === 'resume')
  const data = resolveProfile(watch.profile, resumes, watch.alerts)
  const cache = new Map<string, string | undefined>()
  const trackOfText = (key: string, item: FeedItem, needTitle: boolean) => {
    if (cache.has(key)) return cache.get(key)
    const forced = item.id ? watch.trackFor?.[item.id]?.v || undefined : undefined
    const r = matchBest(item, data, 'any', forced)
    const id = r.track && (!needTitle || forced || r.title.v >= 0.5) ? r.track.id : undefined
    cache.set(key, id)
    return id
  }
  const byOffer = (o: Offer) => {
    const src = o.jobIds?.[0] ?? o.sourceId ?? o.id
    return trackOfText(`o:${o.id}`, { id: src, alerts: [], title: o.posts?.join(' ') || o.title || '', company: o.company, description: o.description, location: o.location } as unknown as FeedItem, false)
  }
  const auto = (d: AnyDoc): string[] => {
    if (d.kind === 'resume') {
      const base = tracks.filter((t) => t.cvId === d.id).map((t) => t.id)
      if (base.length) return base
    }
    const o = d.offerId ? offers[d.offerId] : undefined
    if (o) {
      const t = byOffer(o)
      if (t) return [t]
    }
    if (d.kind === 'letter' && d.linkedResumeId) {
      const cv = docs.find((x) => x.id === d.linkedResumeId)
      if (cv && cv.id !== d.id) return pick(cv)
    }
    const title = d.kind === 'resume' ? d.header.title.split('|')[0] : d.name
    const t = trackOfText(`d:${d.id}`, { id: '', alerts: [], title } as unknown as FeedItem, true)
    return t ? [t] : []
  }
  const pick = (d: AnyDoc): string[] => {
    if (d.trackId !== undefined) return d.trackId ? [d.trackId] : []
    return out.get(d.id) ?? auto(d)
  }
  for (const d of docs) out.set(d.id, pick(d))
  return out
}
