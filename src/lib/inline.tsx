import { Fragment, type ReactNode } from 'react'

// Mini markdown en ligne : **gras**, *italique*, __souligné__, [texte](url)
const TOKEN = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\))/g

/** Espaces insécables de la typographie française (avant : ; ! ? % et dans les guillemets). */
export function frenchSpaces(text: string): string {
  return text.replace(/ ([:;!?%»])/g, '\u00a0$1').replace(/« /g, '«\u00a0')
}

export function renderInline(text: string | undefined, linkColor?: string): ReactNode {
  if (!text) return null
  const parts = frenchSpaces(text).split(TOKEN)
  return parts.map((p, i) => {
    if (!p) return null
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('__') && p.endsWith('__') && p.length > 4) return <u key={i}>{p.slice(2, -2)}</u>
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>
    const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(p)
    if (m) {
      const href = /^(https?:|mailto:|tel:)/i.test(m[2]) ? m[2] : `https://${m[2]}`
      return (
        <a key={i} href={href} target="_blank" rel="noreferrer" style={{ color: linkColor ?? 'inherit' }}>
          {m[1]}
        </a>
      )
    }
    return <Fragment key={i}>{p}</Fragment>
  })
}

export function stripInline(text: string | undefined): string {
  if (!text) return ''
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*\s][^*]*)\*/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
}

export function paragraphs(text: string | undefined): string[] {
  if (!text) return []
  return text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
}
