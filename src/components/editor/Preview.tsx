import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minus, Plus } from 'lucide-react'
import type { AnyDoc } from '../../types'
import { AnyDocView } from '../../render/DocumentView'
import { PAGE_SIZES } from '../../render/Paginator'
import { printDocument } from '../../lib/export'

interface Props {
  doc: AnyDoc
  active?: string | null
  onSectionClick?: (id: string) => void
  onPageCount?: (n: number) => void
}

export function Preview({ doc, active, onSectionClick, onPageCount }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(() => localStorage.getItem('resume-zoom-fit') !== '0')
  const [zoom, setZoom] = useState(() => Number(localStorage.getItem('resume-zoom')) || 0.9)
  const [pages, setPages] = useState(1)
  const size = PAGE_SIZES[doc.style.pageFormat] ?? PAGE_SIZES.A4

  useLayoutEffect(() => {
    if (!fit) return
    const el = scrollRef.current
    if (!el) return
    const calc = () => setZoom(Math.max(0.3, Math.min(1.6, (el.clientWidth - 64) / size.w)))
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit, size.w])

  useEffect(() => {
    localStorage.setItem('resume-zoom-fit', fit ? '1' : '0')
    if (!fit) localStorage.setItem('resume-zoom', String(zoom))
  }, [fit, zoom])

  const handleCount = useCallback(
    (n: number) => {
      setPages(n)
      onPageCount?.(n)
    },
    [onPageCount],
  )

  const step = (d: number) => {
    setFit(false)
    setZoom((z) => Math.max(0.3, Math.min(2, Math.round((z + d) * 10) / 10)))
  }

  return (
    <div className="preview">
      <div className="preview-scroll" ref={scrollRef}>
        <div className="preview-pages" style={{ zoom }}>
          <AnyDocView doc={doc} activeSection={active ?? undefined} onSectionClick={onSectionClick} onPageCount={handleCount} />
        </div>
      </div>
      <div className="preview-toolbar">
        <span className={`page-count${pages > 2 && doc.kind === 'resume' ? ' warn' : ''}`}>
          {pages} page{pages > 1 ? 's' : ''}
        </span>
        <span className="sep" />
        <button className="icon-btn" onClick={() => step(-0.1)} title="Dézoomer">
          <Minus size={15} />
        </button>
        <span className="zoom-value">{Math.round(zoom * 100)} %</span>
        <button className="icon-btn" onClick={() => step(0.1)} title="Zoomer">
          <Plus size={15} />
        </button>
        <button className={`icon-btn${fit ? ' on' : ''}`} onClick={() => setFit(true)} title="Ajuster à la largeur">
          <Maximize2 size={15} />
        </button>
      </div>
    </div>
  )
}

/** Rend le document à l'échelle 1 dans un conteneur dédié à l'impression, puis lance l'impression (PDF). */
export function usePrint(doc: AnyDoc | undefined) {
  const [printing, setPrinting] = useState(false)
  const print = useCallback(() => setPrinting(true), [])
  useEffect(() => {
    if (!printing || !doc) return
    let cancelled = false
    const done = () => {
      setPrinting(false)
      window.removeEventListener('afterprint', done)
    }
    window.addEventListener('afterprint', done)
    ;(async () => {
      await document.fonts?.ready
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      await new Promise((r) => setTimeout(r, 250))
      if (!cancelled) printDocument(doc.name, doc.style.pageFormat)
    })()
    return () => {
      cancelled = true
      window.removeEventListener('afterprint', done)
    }
  }, [printing, doc])
  const portal = printing && doc ? createPortal(<div className="print-portal"><AnyDocView doc={doc} /></div>, document.body) : null
  return { print, printing, portal }
}
