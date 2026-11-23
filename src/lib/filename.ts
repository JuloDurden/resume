// Noms lisibles : nom des documents dans Resume (le poste seul) et nom des PDF envoyés aux recruteurs.
import type { AnyDoc, Offer } from '../types'

/** Intitulé de poste sans mention H/F, sans « Candidature spontanée », sans ville en suffixe. */
export function cleanPost(title?: string, city?: string): string {
  let t = (title ?? '').replace(/\s+/g, ' ').trim()
  t = t.replace(/\s*[([]?\s*\b(?:h\s*[/\-.]\s*f|f\s*[/\-.]\s*h)(?:\s*[/\-.]\s*(?:x|n|d))?\s*[)\]]?\s*/gi, ' ').trim()
  t = t.replace(/^candidature\s+spontan[ée]e\s*[:\-–]?\s*/i, '').trim()
  const c = city?.split(/[,(]/)[0].trim()
  if (c) t = t.replace(new RegExp(`\\s*[-–,]\\s*${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*$`, 'i'), '').trim()
  return t.replace(/\s*[-–,:]\s*$/, '').trim()
}

/** « JULIEN CLAVEL » ou « Julien Clavel » → « Julien CLAVEL ». */
export function personName(raw?: string): string {
  const parts = (raw ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return parts.join(' ')
  const cap = (w: string) => w.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_m, s: string, l: string) => s + l.toUpperCase())
  return [...parts.slice(0, -1).map(cap), parts.at(-1)!.toUpperCase()].join(' ')
}

/** Document rédigé en anglais ? (traduction par Claude) */
export function isEnglish(doc: AnyDoc): boolean {
  if (doc.kind === 'letter') return /^\s*dear\b/i.test(doc.salutation ?? '') || /\b(regards|sincerely|yours faithfully)\b/i.test(doc.closing ?? '')
  const titles = doc.sections.map((s) => s.title.toLowerCase()).join(' ')
  const en = (titles.match(/\b(experience|skills|education|summary|profile|languages|interests|projects)\b/g) ?? []).length
  const fr = (titles.match(/(expérience|compétence|formation|résumé|profil|langues|centres|projets|réalisations)/g) ?? []).length
  return en > fr
}

const cut = (s: string, max = 60) => (s.length <= max ? s : s.slice(0, max).replace(/\s+\S*$/, '').trim())
/** Retire les caractères interdits dans un nom de fichier, garde accents et espaces. */
export const fileSafe = (s: string) =>
  s
    .replace(/[/\\:*?"<>|]+/g, ' ')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Nom du PDF : « Julien CLAVEL - CV - Responsable d'exploitation - GSF ». */
export function pdfFileName(doc: AnyDoc, offer?: Offer): string {
  if (doc.fileName?.trim()) return fileSafe(doc.fileName)
  const en = isEnglish(doc)
  const type = doc.kind === 'resume' ? (en ? 'Resume' : 'CV') : en ? 'Cover Letter' : 'Lettre de motivation'
  const job = doc.job
  const company = offer?.company || job?.company || (doc.kind === 'letter' ? doc.recipient.company : '') || ''
  const rawTitle = offer?.title || job?.title || (doc.kind === 'resume' ? doc.header.title.split('|')[0] : doc.subject?.replace(/^.*\bposte\s+(?:de|d['’])\s*/i, '')) || ''
  const post = offer?.spontaneous ? (offer.posts?.length === 1 ? cut(cleanPost(offer.posts[0])) : 'Candidature spontanée') : cut(cleanPost(rawTitle, offer?.location))
  return fileSafe([personName(doc.header.name), type, post, company].filter((x) => x && x.trim()).join(' - '))
}

/** Nom du document dans Resume pour une offre : le poste seul. */
export const docNameFor = (title?: string, city?: string) => cleanPost(title, city) || 'Poste'

/** Nouveau nom d'un document existant nommé « Poste H/F - Entreprise » ; undefined si le nom est personnalisé. */
export function shortDocName(doc: AnyDoc, offer?: Offer): string | undefined {
  const name = doc.name.trim()
  const title = (offer?.title || doc.job?.title || '').trim()
  const companies = [offer?.company, doc.job?.company, doc.kind === 'letter' ? doc.recipient.company : ''].filter((c): c is string => !!c?.trim())
  let next: string | undefined
  if (title && name.toLowerCase().startsWith(title.toLowerCase())) next = docNameFor(title, offer?.location)
  else {
    const c = companies.find((c) => name.toLowerCase().endsWith(` - ${c.toLowerCase()}`))
    if (c) next = cleanPost(name.slice(0, -(c.length + 3)), offer?.location) || docNameFor(title)
    else if (/\b(h\s*\/\s*f|f\s*\/\s*h)\b/i.test(name)) next = cleanPost(name)
  }
  return next && next !== name ? next : undefined
}
