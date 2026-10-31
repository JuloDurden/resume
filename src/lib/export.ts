import type { AnyDoc, LetterDoc, Offer, ResumeDoc, Section } from '../types'
import { formatRange } from './dates'
import { paragraphs, stripInline } from './inline'
import { SECTION_DEFS } from '../data/sectionDefs'

export const APP_FORMAT = 'resume-app'
export const APP_VERSION = 1

export function download(filename: string, content: string, mime = 'application/json') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function safeFileName(name: string) {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9-_ ]+/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'document'
  )
}

export function toJson(docs: AnyDoc[], offers: Offer[] = []): string {
  return JSON.stringify({ format: APP_FORMAT, version: APP_VERSION, exportedAt: new Date().toISOString(), documents: docs, offers }, null, 2)
}

/** Lit une sauvegarde : documents et offres (les anciennes sauvegardes n'ont que des documents). */
export function parseBackup(text: string): { docs: AnyDoc[]; offers: Offer[] } {
  const data = JSON.parse(text)
  const offers: Offer[] = Array.isArray(data?.offers) ? data.offers : []
  if (Array.isArray(data)) return { docs: data, offers }
  if (data?.documents && Array.isArray(data.documents)) return { docs: data.documents, offers }
  if (data?.kind === 'resume' || data?.kind === 'letter') return { docs: [data], offers }
  throw new Error('Format de fichier non reconnu')
}

export const parseJson = (text: string): AnyDoc[] => parseBackup(text).docs

/** Offres rattachées à une liste de documents. */
export function offersOf(docs: AnyDoc[], all: Record<string, Offer>): Offer[] {
  return [...new Set(docs.map((d) => d.offerId).filter(Boolean) as string[])].map((id) => all[id]).filter(Boolean)
}

/* ---------- Texte brut et Markdown ---------- */

const contactLine = (doc: { header: ResumeDoc['header'] }) =>
  doc.header.contacts
    .map((c) => c.value.trim())
    .filter(Boolean)
    .join(' | ')

function sectionLines(s: Section, doc: ResumeDoc, md: boolean): string[] {
  const out: string[] = []
  const b = md ? '- ' : '• '
  const o = s.options
  for (const it of s.items.filter((i) => !i.hidden)) {
    switch (s.type) {
      case 'summary':
      case 'text':
        out.push(...paragraphs(md ? it.description : stripInline(it.description)), '')
        break
      case 'skills': {
        const tags = (it.tags ?? []).filter(Boolean).join(', ')
        if (tags) out.push(it.title ? `${md ? '**' : ''}${it.title}${md ? '**' : ''} : ${tags}` : tags)
        break
      }
      case 'languages':
        out.push(`${b}${it.title}${it.subtitle ? ` : ${it.subtitle}` : ''}`)
        break
      case 'achievements':
      case 'interests':
      case 'references':
        out.push(`${b}${md ? `**${it.title ?? ''}**` : it.title ?? ''}${it.subtitle ? `, ${it.subtitle}` : ''}${it.description ? ` : ${md ? it.description : stripInline(it.description)}` : ''}`)
        break
      default: {
        const dates = o.showDates !== false ? formatRange(it, doc.style) : ''
        const title = [it.title, it.subtitle].filter(Boolean).join(md ? ' | ' : ', ')
        const meta = [o.showLocation !== false ? it.location : '', dates].filter(Boolean).join(' | ')
        if (md) out.push(`### ${title || 'Sans titre'}`, meta ? `*${meta}*` : '')
        else out.push(title, meta)
        if (o.showLink && it.link) out.push(it.link)
        if (o.showDescription !== false && it.description) out.push(md ? it.description : stripInline(it.description))
        if (o.showBullets !== false) for (const x of (it.bullets ?? []).filter((y) => y.trim())) out.push(`${b}${md ? x : stripInline(x)}`)
        out.push('')
      }
    }
  }
  return out.filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
}

export function orderedSections(doc: ResumeDoc): Section[] {
  const byId = new Map(doc.sections.map((s) => [s.id, s]))
  return [...doc.layout.main, ...doc.layout.side].map((id) => byId.get(id)).filter((s): s is Section => !!s && !s.hidden)
}

export function resumeToText(doc: ResumeDoc, md = false): string {
  const lines: string[] = []
  lines.push(md ? `# ${doc.header.name}` : doc.header.name.toUpperCase())
  if (doc.header.title) lines.push(md ? `**${doc.header.title}**` : doc.header.title)
  const c = contactLine(doc)
  if (c) lines.push(c)
  lines.push('')
  for (const s of orderedSections(doc)) {
    lines.push(md ? `## ${s.title}` : s.title.toUpperCase(), '')
    lines.push(...sectionLines(s, doc, md))
    if (lines[lines.length - 1] !== '') lines.push('')
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

export function letterToText(doc: LetterDoc, md = false): string {
  const r = doc.recipient
  const lines = [
    md ? `**${doc.header.name}**` : doc.header.name,
    contactLine(doc),
    '',
    ...[r.name, r.title, r.company, r.address].filter(Boolean) as string[],
    '',
    [doc.place, doc.date].filter(Boolean).join(', le '),
    '',
    doc.subject ? `${md ? '**Objet :** ' : 'Objet : '}${doc.subject}` : '',
    '',
    doc.salutation ?? '',
    '',
    ...paragraphs(md ? doc.body : stripInline(doc.body)).flatMap((p) => [p, '']),
    doc.closing ?? '',
    '',
    doc.signature ?? '',
  ]
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

export const docToText = (d: AnyDoc, md = false) => (d.kind === 'resume' ? resumeToText(d, md) : letterToText(d, md))

/** Données du CV sans la mise en forme : utile pour Claude. */
export function resumeContentJson(doc: ResumeDoc) {
  return {
    header: { ...doc.header, photo: undefined },
    sections: orderedSections(doc).map((s) => ({
      type: s.type,
      typeLabel: SECTION_DEFS[s.type].label,
      title: s.title,
      items: s.items.map(({ id: _id, ...rest }) => rest),
    })),
  }
}

/* ---------- PDF (impression du navigateur) ---------- */

export function printDocument(name: string, format: 'A4' | 'Letter') {
  const prevTitle = document.title
  document.title = safeFileName(name)
  const style = document.createElement('style')
  style.id = 'print-page-size'
  style.textContent = `@page { size: ${format === 'Letter' ? 'letter' : 'A4'}; margin: 0; }`
  document.head.appendChild(style)
  const done = () => {
    document.title = prevTitle
    style.remove()
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  setTimeout(() => window.print(), 50)
}
