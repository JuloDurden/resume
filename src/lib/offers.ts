import type { AnyDoc, Offer } from '../types'
import { uid } from './ids'

export { JOB_STATUS } from './jobs'

export function newOffer(partial: Partial<Offer> = {}): Offer {
  const now = Date.now()
  return { status: 'todo', ...partial, id: uid(), createdAt: now, updatedAt: now }
}

/** Domaine d'un site (sans protocole ni www). */
export function domainOf(url?: string): string | undefined {
  if (!url?.trim()) return
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return
  }
}

/** Logo d'entreprise via le service public de favicons de Google (image chargée par le navigateur). */
export function logoUrl(o: Pick<Offer, 'logo' | 'website'>): string | undefined {
  if (o.logo) return o.logo
  const d = domainOf(o.website)
  return d ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128` : undefined
}

export const linkedinSearch = (keywords: string) => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`

/** Découpe « Poste souhaité - Entreprise » ; l'offre rattachée, si elle existe, fait foi. */
export function docTitle(d: AnyDoc, offer?: Offer): { title: string; company?: string } {
  const m = /^(.*\S)\s+[-|@]\s+(\S.*)$/.exec(d.name.trim())
  const parsed = m ? { title: m[1], company: m[2] } : { title: d.name }
  return {
    title: parsed.title || offer?.title || d.name,
    company: offer?.company || parsed.company,
  }
}
