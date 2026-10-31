import type { AnyDoc } from '../types'

export interface Showcase {
  publishedAt: string
  author?: string
  intro?: string
  documents: AnyDoc[]
}

/** Prépare une copie publiable d'un document : rien de ce qui n'a pas à être public ne sort. */
export function sanitizeForShowcase(d: AnyDoc, hideContacts: boolean): AnyDoc {
  const c: AnyDoc = structuredClone(d)
  delete c.offerId
  if (c.kind === 'resume') {
    delete c.job
    delete c.jobs
  } else {
    delete c.job
    delete c.signatureImage // une signature manuscrite ne doit jamais être publiée
    delete c.linkedResumeId
  }
  if (hideContacts) {
    c.header = {
      ...c.header,
      contacts: c.header.contacts
        .filter((x) => !['phone', 'email', 'info'].includes(x.kind))
        .map((x) => (x.kind === 'location' ? { ...x, value: x.value.split(/[,(]/)[0].trim() } : x)),
    }
  }
  return c
}

let cache: Promise<Showcase | null> | null = null

/** Charge la vitrine publiée avec l'application (fichier public/showcase.json). */
export function loadShowcase(): Promise<Showcase | null> {
  cache ??= fetch(`${import.meta.env.BASE_URL}showcase.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? (r.json() as Promise<Showcase>) : null))
    .then((s) => (s && Array.isArray(s.documents) ? s : null))
    .catch(() => null)
  return cache
}
