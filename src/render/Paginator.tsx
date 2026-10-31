import { useEffect, useLayoutEffect, useReducer, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { PageFormat, StyleSettings } from '../types'
import { fontStack } from '../lib/fonts'

export const MM = 96 / 25.4
export const PT = 96 / 72

export const PAGE_SIZES: Record<PageFormat, { w: number; h: number; css: string }> = {
  A4: { w: 210 * MM, h: 297 * MM, css: 'A4' },
  Letter: { w: 215.9 * MM, h: 279.4 * MM, css: 'letter' },
}

export interface Block {
  key: string
  node: ReactNode
  sectionId?: string
}

export function themeVars(s: StyleSettings): CSSProperties {
  return {
    ['--fs' as string]: `${s.fontSize * PT}px`,
    ['--lh' as string]: String(s.lineHeight),
    ['--hs' as string]: `${s.headingSize * PT}px`,
    ['--ns' as string]: `${s.nameSize * PT}px`,
    ['--fh' as string]: fontStack(s.fontHeading),
    ['--fb' as string]: fontStack(s.fontBody),
    ['--sec' as string]: `${s.sectionSpacing * MM}px`,
    ['--item' as string]: `${s.itemSpacing * MM}px`,
    ['--margin' as string]: `${s.margin * MM}px`,
    ['--primary' as string]: s.primary,
    ['--accent' as string]: s.accent,
    ['--text' as string]: s.text,
    ['--muted' as string]: s.muted,
    ['--page-bg' as string]: s.pageBg,
    ['--side-bg' as string]: s.sidebarBg,
    ['--side-text' as string]: s.sidebarText,
    ['--side-accent' as string]: s.sidebarAccent,
    ['--header-bg' as string]: s.headerBg,
    ['--header-text' as string]: s.headerText,
    ['--photo' as string]: `${s.photoSize * MM}px`,
    ['--justify' as string]: s.justify ? 'justify' : 'left',
    ['--head-transform' as string]: s.headingUppercase ? 'uppercase' : 'none',
    ['--head-spacing' as string]: s.headingUppercase ? '0.06em' : '0',
    ['--name-transform' as string]: s.nameUppercase ? 'uppercase' : 'none',
    ['--head-weight' as string]: s.headingBold === false ? '400' : '700',
    ['--item-weight' as string]: s.itemTitleBold === false ? '400' : '700',
    ['--sub-weight' as string]: s.itemTitleBold === false ? '400' : '600',
  }
}

interface Props {
  style: StyleSettings
  columns: 1 | 2
  sidebarPosition: 'left' | 'right'
  sidebarWidth: number
  header: ReactNode | null
  headerFullBleed?: boolean
  main: Block[]
  side: Block[]
  maxPages?: number
  onSectionClick?: (sectionId: string) => void
  activeSection?: string
  onPageCount?: (n: number) => void
  className?: string
}

interface Pagination {
  pages: { main: string[]; side: string[] }[]
  headerH: number
  overflow: boolean
}

function paginate(heights: Map<string, number>, main: Block[], side: Block[], first: number, other: number): { pages: { main: string[]; side: string[] }[]; overflow: boolean } {
  let overflow = false
  const flow = (blocks: Block[]) => {
    const pages: string[][] = [[]]
    let used = 0
    for (const b of blocks) {
      const h = heights.get(b.key) ?? 0
      const cap = pages.length === 1 ? first : other
      if (used + h > cap + 0.5 && pages[pages.length - 1].length > 0) {
        pages.push([])
        used = 0
      }
      const cap2 = pages.length === 1 ? first : other
      if (h > cap2 + 0.5) overflow = true
      pages[pages.length - 1].push(b.key)
      used += h
    }
    return pages
  }
  const m = flow(main)
  const s = flow(side)
  const n = Math.max(m.length, s.length, 1)
  return {
    pages: Array.from({ length: n }, (_, i) => ({ main: m[i] ?? [], side: s[i] ?? [] })),
    overflow,
  }
}

export function Paginator(props: Props) {
  const { style, columns, sidebarPosition, sidebarWidth, header, main, side } = props
  const size = PAGE_SIZES[style.pageFormat] ?? PAGE_SIZES.A4
  const W = size.w
  const H = size.h
  const margin = style.margin * MM
  const gap = style.columnGap * MM
  const two = columns === 2
  const sideW = two ? (W * sidebarWidth) / 100 : 0
  const mainW = W - sideW
  const mainInner = two ? mainW - margin - gap / 2 : W - 2 * margin
  const sideInner = two ? sideW - margin - gap / 2 : 0

  const measureRef = useRef<HTMLDivElement>(null)
  const [pag, setPag] = useState<Pagination>({ pages: [{ main: main.map((b) => b.key), side: side.map((b) => b.key) }], headerH: 0, overflow: false })
  const [fontTick, bump] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    const fonts = document.fonts
    if (!fonts) return
    const on = () => bump()
    fonts.addEventListener?.('loadingdone', on)
    fonts.ready.then(on)
    return () => fonts.removeEventListener?.('loadingdone', on)
  }, [])

  useLayoutEffect(() => {
    const root = measureRef.current
    if (!root) return
    // getBoundingClientRect tient compte du zoom CSS de l'aperçu : on ramène les mesures à l'échelle 1
    const ref = root.querySelector<HTMLElement>('[data-mref]')
    const refW = ref?.getBoundingClientRect().width ?? 0
    const scale = refW > 0 ? refW / mainInner : 1
    const heights = new Map<string, number>()
    root.querySelectorAll<HTMLElement>('[data-mkey]').forEach((el) => {
      heights.set(el.dataset.mkey!, el.getBoundingClientRect().height / scale)
    })
    const headerEl = root.querySelector<HTMLElement>('[data-mheader]')
    const headerH = headerEl ? headerEl.getBoundingClientRect().height / scale : 0
    const first = H - (header ? headerH : margin) - margin
    const other = H - 2 * margin
    const res = paginate(heights, main, side, first, other)
    const next: Pagination = { pages: res.pages, headerH, overflow: res.overflow }
    setPag((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  })

  useEffect(() => {
    props.onPageCount?.(pag.pages.length)
  }, [pag.pages.length, props.onPageCount])

  void fontTick

  const byKey = new Map<string, Block>()
  for (const b of main) byKey.set(b.key, b)
  for (const b of side) byKey.set(b.key, b)

  const sideLeft = sidebarPosition === 'left'
  const colTemplate = two ? (sideLeft ? `${sideW}px ${mainW}px` : `${mainW}px ${sideW}px`) : `${W}px`
  const mainPad = two ? (sideLeft ? `0 ${margin}px 0 ${gap / 2}px` : `0 ${gap / 2}px 0 ${margin}px`) : `0 ${margin}px`
  const sidePad = two ? (sideLeft ? `0 ${gap / 2}px 0 ${margin}px` : `0 ${margin}px 0 ${gap / 2}px`) : '0'
  const vars = themeVars(style)
  const pages = props.maxPages ? pag.pages.slice(0, props.maxPages) : pag.pages

  const renderBlock = (key: string) => {
    const b = byKey.get(key)
    if (!b) return null
    const clickable = props.onSectionClick && b.sectionId
    return (
      <div
        key={key}
        className={`cv-blk${clickable ? ' cv-clickable' : ''}${b.sectionId && b.sectionId === props.activeSection ? ' cv-active' : ''}`}
        data-section={b.sectionId}
        onClick={clickable ? () => props.onSectionClick!(b.sectionId!) : undefined}
      >
        {b.node}
      </div>
    )
  }

  return (
    <div className={`cv-root ${props.className ?? ''}`} style={vars}>
      <div className="cv-measure" ref={measureRef} aria-hidden="true">
        {header && (
          <div style={{ width: W }} data-mheader="1">
            <div className="cv-header-wrap">{header}</div>
          </div>
        )}
        <div className="cv-col cv-main" style={{ width: mainInner }} data-mref="1">
          {main.map((b) => (
            <div key={b.key} data-mkey={b.key} className="cv-blk">
              {b.node}
            </div>
          ))}
        </div>
        {two && (
          <div className="cv-col cv-side" style={{ width: sideInner }}>
            {side.map((b) => (
              <div key={b.key} data-mkey={b.key} className="cv-blk">
                {b.node}
              </div>
            ))}
          </div>
        )}
      </div>
      {pages.map((p, i) => {
        const hasHeader = i === 0 && !!header
        const colTop = hasHeader ? 0 : margin
        return (
          <div className="cv-page" key={i} style={{ width: W, height: H }} data-page={i + 1}>
            {two && (
              <div
                className="cv-side-bg"
                style={{
                  width: sideW,
                  [sideLeft ? 'left' : 'right']: 0,
                  top: hasHeader && !props.headerFullBleed ? pag.headerH : hasHeader ? pag.headerH : 0,
                }}
              />
            )}
            {hasHeader && <div className="cv-header-wrap">{header}</div>}
            <div className="cv-cols" style={{ gridTemplateColumns: colTemplate, paddingTop: colTop, paddingBottom: margin }}>
              <div className="cv-col cv-main" style={{ padding: mainPad, order: two && sideLeft ? 2 : 1 }}>
                {p.main.map(renderBlock)}
              </div>
              {two && (
                <div className="cv-col cv-side" style={{ padding: sidePad, order: sideLeft ? 1 : 2 }}>
                  {p.side.map(renderBlock)}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
