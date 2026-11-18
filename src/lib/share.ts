// Dossier de candidature partagé : une page publique qui montre au recruteur l'offre, le CV et la lettre
// réalisés avec Resume. Publié dans le dossier public/ de l'application (fichier c/<identifiant>.json).
import type { AnyDoc, Offer } from '../types'
import { sanitizeForShowcase } from './showcase'
import { appRepoFromLocation, type ShowcaseTarget } from './github'

export interface SharedApplication {
  v: 1
  publishedAt: string
  author?: string
  offer: { title?: string; company?: string; location?: string }
  resume?: AnyDoc
  letter?: AnyDoc
}

/** Identifiant difficile à deviner : la page n'est trouvée que par qui a le lien. */
export function newSlug(): string {
  const a = new Uint8Array(9)
  crypto.getRandomValues(a)
  return [...a].map((b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')
}

export const shareFile = (slug: string) => `c/${slug}.json`

/** Adresse publique de la page (application servie par GitHub Pages). */
export function shareUrl(slug: string, target?: ShowcaseTarget | null): string {
  const t = target ?? appRepoFromLocation()
  const base = t ? `https://${t.owner}.github.io/${t.repo}/` : `${location.origin}${import.meta.env.BASE_URL}`
  return `${base}#/c/${slug}`
}

export function buildShared(offer: Offer, resume: AnyDoc | undefined, letter: AnyDoc | undefined, hideContacts: boolean): SharedApplication {
  return {
    v: 1,
    publishedAt: new Date().toISOString(),
    author: resume?.header.name ?? letter?.header.name,
    offer: { title: offer.title, company: offer.company, location: offer.location },
    resume: resume && sanitizeForShowcase(resume, hideContacts),
    letter: letter && sanitizeForShowcase(letter, hideContacts),
  }
}

export async function loadShared(slug: string): Promise<SharedApplication | null> {
  if (!/^[a-z0-9]{6,20}$/.test(slug)) return null
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}${shareFile(slug)}`, { cache: 'no-cache' })
    if (!r.ok) return null
    const s = (await r.json()) as SharedApplication
    return s && s.v === 1 ? s : null
  } catch {
    return null
  }
}

/** Remplace, dans le CV, le lien vers l'application (projet « Resume ») par celui du dossier partagé. */
export function withShareLink<T extends AnyDoc>(doc: T, url: string): T {
  if (doc.kind !== 'resume') return doc
  const t = appRepoFromLocation()
  const host = (t ? `${t.owner}.github.io/${t.repo}` : 'github.io/resume').toLowerCase()
  const isApp = (link: string) => link.toLowerCase().includes(host)
  let changed = false
  const sections = doc.sections.map((s) =>
    s.type !== 'projects'
      ? s
      : {
          ...s,
          items: s.items.map((it) => {
            if (it.link && isApp(it.link) && it.link !== url) {
              changed = true
              return { ...it, link: url }
            }
            return it
          }),
        },
  )
  return changed ? ({ ...doc, sections, updatedAt: Date.now() } as T) : doc
}
