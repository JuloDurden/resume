import { memo } from 'react'
import type { AnyDoc } from '../types'
import { AnyDocView } from '../render/DocumentView'
import { PAGE_SIZES } from '../render/Paginator'

/** Miniature de la première page d'un document. */
export const DocThumb = memo(function DocThumb({ doc, width }: { doc: AnyDoc; width: number }) {
  const size = PAGE_SIZES[doc.style.pageFormat] ?? PAGE_SIZES.A4
  const zoom = width / size.w
  return (
    <div className="thumb" style={{ width, height: size.h * zoom }}>
      <div className="thumb-inner" style={{ zoom }}>
        <AnyDocView doc={doc} maxPages={1} />
      </div>
    </div>
  )
})
