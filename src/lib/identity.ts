// Identité : nom, photo, coordonnées et signature saisis une fois, reportés dans les en-têtes de tous les documents.
// Les documents gardent leur copie des valeurs (pour les PDF, la vitrine et les dossiers recruteur),
// mais c'est l'identité qui fait foi : la modifier met à jour tous les documents.
import type { AnyDoc, ContactLink, Identity } from '../types'
import { uid } from './ids'

export const IDENTITY_KEY: Record<ContactLink['kind'], keyof Identity> = {
  email: 'email',
  phone: 'phone',
  location: 'location',
  info: 'info',
  github: 'github',
  linkedin: 'linkedin',
  website: 'website',
  other: 'other',
}

/** Valeur de l'identité pour un type de coordonnée (vide si non renseignée). */
export const identityValue = (id: Identity | undefined, kind: ContactLink['kind']) => (id?.[IDENTITY_KEY[kind]] as string | undefined)?.trim() || undefined

/** Première identité : reprise de l'en-tête du CV le plus récent et de la dernière signature. */
export function identityFromDocs(docs: AnyDoc[]): Identity {
  const sorted = [...docs].sort((a, b) => b.updatedAt - a.updatedAt)
  const cv = sorted.find((d) => d.kind === 'resume') ?? sorted[0]
  const sig = sorted.find((d) => d.kind === 'letter' && d.signatureImage)
  const id: Identity = { name: cv?.header.name, photo: sorted.find((d) => d.header.photo)?.header.photo }
  for (const c of cv?.header.contacts ?? []) {
    const k = IDENTITY_KEY[c.kind]
    if (c.value.trim() && !id[k]) (id as Record<string, string>)[k] = c.value.trim()
    if (c.kind === 'other' && c.label && !id.otherLabel) id.otherLabel = c.label
  }
  if (sig?.kind === 'letter') id.signature = sig.signatureImage
  return id
}

/**
 * Reporte l'identité dans un document. Les choix de mise en page (lignes, ordre, photo affichée ou non,
 * coordonnées présentes ou non) restent ceux du document ; seules les valeurs changent.
 * `fill` ajoute aussi les coordonnées absentes (nouveau document).
 */
export function applyIdentity<T extends AnyDoc>(doc: T, id: Identity | undefined, fill = false): T {
  if (!id) return doc
  let changed = false
  const contacts = doc.header.contacts.map((c) => {
    const v = identityValue(id, c.kind)
    const label = c.kind === 'other' && id.otherLabel !== undefined ? id.otherLabel || undefined : c.label
    if ((v && v !== c.value) || label !== c.label) {
      changed = true
      return { ...c, value: v ?? c.value, label }
    }
    return c
  })
  if (fill) {
    // rangement par défaut : coordonnées, puis information, puis liens
    const rowOf: Record<ContactLink['kind'], number> = { email: 0, phone: 0, location: 0, info: 1, linkedin: 2, github: 2, website: 2, other: 2 }
    for (const kind of Object.keys(IDENTITY_KEY) as ContactLink['kind'][]) {
      const v = identityValue(id, kind)
      if (v && !contacts.some((c) => c.kind === kind)) {
        contacts.push({ id: uid(), kind, value: v, row: rowOf[kind], ...(kind === 'other' && id.otherLabel ? { label: id.otherLabel } : {}) })
        changed = true
      }
    }
  }
  const name = id.name?.trim() || doc.header.name
  const photo = id.photo && (doc.header.photo || fill) ? id.photo : doc.header.photo
  if (name !== doc.header.name || photo !== doc.header.photo) changed = true
  let next = changed ? ({ ...doc, header: { ...doc.header, name, photo, contacts } } as T) : doc
  // la signature remplace celle d'une lettre déjà signée (ou d'une nouvelle lettre) ; une lettre volontairement non signée le reste
  if (next.kind === 'letter' && id.signature && (next.signatureImage || fill) && next.signatureImage !== id.signature) next = { ...next, signatureImage: id.signature } as T
  return next
}
