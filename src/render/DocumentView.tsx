import { useEffect, useMemo } from 'react'
import type { LetterDoc, ResumeDoc } from '../types'
import { ensureFont } from '../lib/fonts'
import { renderInline, paragraphs } from '../lib/inline'
import { HeaderBlock, sectionBlocks } from './parts'
import { Paginator, type Block } from './Paginator'
import './cv.css'

interface CommonProps {
  maxPages?: number
  onSectionClick?: (id: string) => void
  activeSection?: string
  onPageCount?: (n: number) => void
  className?: string
}

function useFonts(a: string, b: string) {
  useEffect(() => {
    ensureFont(a)
    ensureFont(b)
  }, [a, b])
}

export function ResumeView({ doc, ...rest }: { doc: ResumeDoc } & CommonProps) {
  const { style, layout } = doc
  useFonts(style.fontHeading, style.fontBody)
  const two = layout.columns === 2
  const placement = !two && style.headerPlacement === 'sidebar' ? 'top' : style.headerPlacement
  // photo seule en haut de la colonne latérale, le reste de l'en-tête restant à sa place
  const sidePhoto = two && !!style.photoInSidebar && style.showPhoto && !!doc.header.photo && placement !== 'sidebar'
  const headerStyle = sidePhoto ? { ...style, showPhoto: false } : style

  const { main, side } = useMemo(() => {
    const byId = new Map(doc.sections.map((s) => [s.id, s]))
    const build = (ids: string[]) =>
      ids
        .map((id) => byId.get(id))
        .filter((s): s is NonNullable<typeof s> => !!s && !s.hidden)
        .flatMap((s) => sectionBlocks(s, style))
    let mainB: Block[] = build(two ? layout.main : [...layout.main, ...layout.side])
    let sideB: Block[] = two ? build(layout.side) : []
    const headerBlock: Block = { key: 'header', sectionId: 'header', node: <HeaderBlock header={doc.header} style={headerStyle} where={placement === 'sidebar' ? 'sidebar' : 'main'} /> }
    if (placement === 'main') mainB = [headerBlock, ...mainB]
    if (placement === 'sidebar') sideB = [headerBlock, ...sideB]
    if (sidePhoto)
      sideB = [
        {
          key: 'side-photo',
          sectionId: 'header',
          node: (
            <div className="cv-side-photo">
              <img className={`cv-photo shape-${style.photoShape}`} src={doc.header.photo} alt="" />
            </div>
          ),
        },
        ...sideB,
      ]
    return { main: mainB, side: sideB }
  }, [doc, style, headerStyle, layout, two, placement, sidePhoto])

  const header =
    placement === 'top' ? (
      <div className={`cv-blk cv-top-header${style.headerLayout === 'banner' ? ' banner' : ''}${rest.onSectionClick ? ' cv-clickable' : ''}`} onClick={rest.onSectionClick ? () => rest.onSectionClick!('header') : undefined}>
        <HeaderBlock header={doc.header} style={headerStyle} where="top" />
      </div>
    ) : null

  return (
    <Paginator
      style={style}
      columns={layout.columns}
      sidebarPosition={layout.sidebarPosition}
      sidebarWidth={layout.sidebarWidth}
      header={header}
      main={main}
      side={side}
      {...rest}
    />
  )
}

export function LetterView({ doc, ...rest }: { doc: LetterDoc } & CommonProps) {
  const { style } = doc
  useFonts(style.fontHeading, style.fontBody)
  const main = useMemo(() => {
    const blocks: Block[] = []
    const r = doc.recipient
    const recipientLines = [r.name, r.title, r.company, ...(r.address ?? '').split('\n')].filter((x) => x && x.trim())
    if (recipientLines.length)
      blocks.push({
        key: 'recipient',
        sectionId: 'recipient',
        node: (
          <div className="lt-recipient">
            {recipientLines.map((l, i) => (
              <div key={i} className={i === 0 ? 'strong' : ''}>
                {l}
              </div>
            ))}
          </div>
        ),
      })
    const when = [doc.place, doc.date].filter(Boolean).join(', le ')
    if (when) blocks.push({ key: 'date', sectionId: 'meta', node: <div className="lt-date">{when}</div> })
    if (doc.subject)
      blocks.push({
        key: 'subject',
        sectionId: 'meta',
        node: (
          <div className="lt-subject">
            <span>Objet : </span>
            {renderInline(doc.subject)}
          </div>
        ),
      })
    if (doc.salutation) blocks.push({ key: 'salutation', sectionId: 'body', node: <div className="lt-salutation">{doc.salutation}</div> })
    paragraphs(doc.body).forEach((p, i) => blocks.push({ key: `p${i}`, sectionId: 'body', node: <p className="lt-p">{renderInline(p)}</p> }))
    if (doc.closing) blocks.push({ key: 'closing', sectionId: 'body', node: <p className="lt-p">{renderInline(doc.closing)}</p> })
    if (doc.signature) blocks.push({ key: 'signature', sectionId: 'body', node: <div className="lt-signature">{doc.signature}</div> })
    return blocks
  }, [doc])

  const header = (
    <div className={`cv-blk cv-top-header${style.headerLayout === 'banner' ? ' banner' : ''}${rest.onSectionClick ? ' cv-clickable' : ''}`} onClick={rest.onSectionClick ? () => rest.onSectionClick!('header') : undefined}>
      <HeaderBlock header={doc.header} style={{ ...style, showPhoto: style.showPhoto }} where="top" />
    </div>
  )

  return <Paginator style={style} columns={1} sidebarPosition="right" sidebarWidth={30} header={header} main={main} side={[]} className="is-letter" {...rest} />
}

export function AnyDocView({ doc, ...rest }: { doc: ResumeDoc | LetterDoc } & CommonProps) {
  return doc.kind === 'resume' ? <ResumeView doc={doc} {...rest} /> : <LetterView doc={doc} {...rest} />
}
