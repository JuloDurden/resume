// Page Documents : vue liste triable ou grille à zoom, sélection multiple, aperçu, PDF groupé.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, Copy, Download, Eye, LayoutGrid, List, Star, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import type { AnyDoc } from '../../types'
import { useDocs } from '../../store/documents'
import { DocThumb } from '../DocThumb'
import { OfferLogo } from '../editor/AtsPanel'
import { usePrintMany } from '../editor/Preview'
import { AnyDocView } from '../../render/DocumentView'
import { Modal, Segmented, confirmAction, toast } from '../ui'
import { DocCard, openPath } from './DocCard'

type View = 'list' | 'grid'
type SortKey = 'name' | 'kind' | 'offer' | 'date'

const read = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k)
    return v === null ? d : (JSON.parse(v) as T)
  } catch {
    return d
  }
}
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* réglage non mémorisé */
  }
}
const fmt = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

/** Aperçu en grand d'un document. */
export function DocPreviewModal({ doc, onClose }: { doc: AnyDoc; onClose: () => void }) {
  const navigate = useNavigate()
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={doc.name}
      footer={
        <button className="btn primary" onClick={() => navigate(openPath(doc))}>
          Ouvrir dans l'éditeur
        </button>
      }
    >
      <div className="doc-preview-big">
        <AnyDocView doc={doc} />
      </div>
    </Modal>
  )
}

/** Grande miniature au survol d'une carte (après un court délai). */
function HoverPreview({ doc, rect }: { doc: AnyDoc; rect: DOMRect }) {
  const W = 360
  const H = W * 1.414 + 40
  const right = rect.right + 12 + W < window.innerWidth
  const left = right ? rect.right + 12 : Math.max(8, rect.left - W - 12)
  const top = Math.min(Math.max(8, rect.top - 20), window.innerHeight - H - 8)
  return createPortal(
    <div className="hover-preview" style={{ left, top, width: W }}>
      <DocThumb doc={doc} width={W - 16} />
      <div className="hover-preview-meta">
        <strong>{doc.name}</strong> · {fmt(doc.updatedAt)}
      </div>
    </div>,
    document.body,
  )
}

export function DocsBrowser({ docs, left }: { docs: AnyDoc[]; left?: React.ReactNode }) {
  const navigate = useNavigate()
  const offers = useDocs((s) => s.offers)
  const { remove, duplicate, update } = useDocs.getState()
  const [view, setView] = useState<View>(() => read('resume-docs-view', 'list'))
  const [zoom, setZoom] = useState<number>(() => read('resume-docs-zoom', 170))
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>(() => read('resume-docs-sort', { key: 'date', dir: -1 }))
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<AnyDoc | null>(null)
  const [hover, setHover] = useState<{ doc: AnyDoc; rect: DOMRect } | null>(null)
  const hoverTimer = useRef(0)
  const lastClicked = useRef<string | null>(null)
  const { print, printing, portal } = usePrintMany()
  useEffect(() => write('resume-docs-view', view), [view])
  useEffect(() => write('resume-docs-zoom', zoom), [zoom])
  useEffect(() => write('resume-docs-sort', sort), [sort])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const info = (d: AnyDoc) => {
      const o = d.offerId ? offers[d.offerId] : undefined
      return { d, o, offer: o ? [o.company, o.title].filter(Boolean).join(' · ') : '' }
    }
    const list = docs.map(info).filter((r) => !needle || `${r.d.name} ${r.offer}`.toLowerCase().includes(needle))
    const val = (r: ReturnType<typeof info>) => (sort.key === 'name' ? r.d.name.toLowerCase() : sort.key === 'kind' ? r.d.kind : sort.key === 'offer' ? r.offer.toLowerCase() || '￿' : r.d.updatedAt)
    return list.sort((a, b) => {
      const x = val(a)
      const y = val(b)
      return (x < y ? -1 : x > y ? 1 : b.d.updatedAt - a.d.updatedAt) * (x === y ? 1 : sort.dir)
    })
  }, [docs, offers, q, sort])
  // la sélection ne garde que les documents encore affichés
  const selected = rows.filter((r) => sel.has(r.d.id)).map((r) => r.d)

  const toggle = (id: string, shift = false) => {
    setSel((s) => {
      const n = new Set(s)
      if (shift && lastClicked.current) {
        const ids = rows.map((r) => r.d.id)
        const [a, b] = [ids.indexOf(lastClicked.current), ids.indexOf(id)].sort((x, y) => x - y)
        if (a >= 0) ids.slice(a, b + 1).forEach((x) => n.add(x))
      } else if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
    lastClicked.current = id
  }
  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'date' ? -1 : 1 }))
  const del = (list: AnyDoc[]) => {
    if (!confirmAction(list.length === 1 ? `Supprimer « ${list[0].name} » ?` : `Supprimer ces ${list.length} documents ?`)) return
    list.forEach((d) => remove(d.id))
    setSel(new Set())
    toast.ok(list.length === 1 ? 'Document supprimé' : `${list.length} documents supprimés`)
  }
  const dup = (list: AnyDoc[]) => {
    list.forEach((d) => duplicate(d.id))
    setSel(new Set())
    toast.ok(list.length === 1 ? 'Document dupliqué' : `${list.length} documents dupliqués`)
  }
  const pdf = (list: AnyDoc[]) => {
    print(list)
    if (list.length > 1) toast.ok(`${list.length} documents réunis dans un seul PDF : choisissez « Enregistrer au format PDF »`)
  }
  const SortHead = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button className={`th-sort${sort.key === k ? ' on' : ''}`} onClick={() => sortBy(k)}>
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
      </button>
    </th>
  )
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.d.id))

  return (
    <div className="docs-browser">
      <div className="docs-tools">
        {left}
        <span className="docs-tools-gap" />
        <input className="input docs-search" placeholder="Rechercher (nom, offre, entreprise)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un document" />
        {view === 'grid' && (
          <label className="docs-zoom" title="Taille des cartes">
            <ZoomOut size={15} />
            <input type="range" min={110} max={320} step={10} value={zoom} onChange={(e) => setZoom(+e.target.value)} aria-label="Taille des cartes" />
            <ZoomIn size={15} />
          </label>
        )}
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'grid', label: <><LayoutGrid size={14} /> Grille</> },
            { value: 'list', label: <><List size={14} /> Liste</> },
          ]}
        />
      </div>

      {view === 'list' ? (
        <div className="docs-table-wrap">
          <table className="docs-table">
            <thead>
              <tr>
                <th className="c-check">
                  <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.d.id)))} aria-label="Tout sélectionner" />
                </th>
                <th className="c-ref" />
                <SortHead k="name">Nom</SortHead>
                <SortHead k="kind">Type</SortHead>
                <SortHead k="offer">Offre rattachée</SortHead>
                <SortHead k="date">Modifié</SortHead>
                <th className="c-act" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ d, o }) => {
                const ref = d.kind === 'resume' && !!d.reference
                return (
                  <tr key={d.id} className={sel.has(d.id) ? 'sel' : undefined}>
                    <td className="c-check">
                      <input type="checkbox" checked={sel.has(d.id)} onChange={() => {}} onClick={(e) => toggle(d.id, e.shiftKey)} aria-label={`Sélectionner ${d.name}`} />
                    </td>
                    <td className="c-ref">
                      {d.kind === 'resume' && (
                        <button className={`ref-star${ref ? ' on' : ''}`} onClick={() => update(d.id, (x) => ({ ...x, reference: !ref }) as AnyDoc)} title={ref ? 'CV de référence (cliquer pour retirer)' : 'Marquer comme CV de référence'} aria-pressed={ref}>
                          <Star size={15} />
                        </button>
                      )}
                    </td>
                    <td className="c-name">
                      <button className="link-row" onClick={() => navigate(openPath(d))} title="Ouvrir dans l'éditeur">
                        {d.name}
                      </button>
                    </td>
                    <td>
                      <span className={`kind-badge ${d.kind}`}>{d.kind === 'resume' ? 'CV' : 'Lettre'}</span>
                    </td>
                    <td className="c-offer">
                      {o ? (
                        <span title={[o.company, o.title].filter(Boolean).join(' · ')}>
                          <OfferLogo offer={o} size={16} /> <strong>{o.company}</strong>{o.title ? ` · ${o.title}` : ''}
                        </span>
                      ) : (
                        <span className="muted">Aucune</span>
                      )}
                    </td>
                    <td className="c-date">{fmt(d.updatedAt)}</td>
                    <td className="c-act">
                      <button className="icon-btn" onClick={() => setPreview(d)} title="Aperçu" aria-label={`Aperçu de ${d.name}`}>
                        <Eye size={15} />
                      </button>
                      <button className="icon-btn" onClick={() => dup([d])} title="Dupliquer" aria-label={`Dupliquer ${d.name}`}>
                        <Copy size={15} />
                      </button>
                      <button className="icon-btn" onClick={() => pdf([d])} title="Télécharger en PDF" aria-label={`Télécharger ${d.name}`} disabled={printing}>
                        <Download size={15} />
                      </button>
                      <button className="icon-btn danger" onClick={() => del([d])} title="Supprimer" aria-label={`Supprimer ${d.name}`}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!rows.length && <p className="muted docs-none">Aucun document ne correspond.</p>}
        </div>
      ) : (
        <div className="doc-grid zoomable" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${zoom + 24}px, 1fr))` }}>
          {rows.map(({ d }) => (
            <div
              key={d.id}
              className={`doc-cell${sel.has(d.id) ? ' sel' : ''}${sel.size ? ' selecting' : ''}`}
              onMouseEnter={(e) => {
                if (!matchMedia('(hover: hover)').matches) return
                const el = (e.currentTarget.querySelector('.doc-thumb') as HTMLElement) ?? e.currentTarget
                window.clearTimeout(hoverTimer.current)
                hoverTimer.current = window.setTimeout(() => setHover({ doc: d, rect: el.getBoundingClientRect() }), 400)
              }}
              onMouseLeave={() => {
                window.clearTimeout(hoverTimer.current)
                setHover(null)
              }}
            >
              <input type="checkbox" className="cell-check" checked={sel.has(d.id)} onChange={() => {}} onClick={(e) => toggle(d.id, e.shiftKey)} aria-label={`Sélectionner ${d.name}`} />
              <button className="cell-eye" onClick={() => setPreview(d)} title="Aperçu" aria-label={`Aperçu de ${d.name}`}>
                <Eye size={14} />
              </button>
              <DocCard doc={d} width={zoom} compact={zoom < 170} />
            </div>
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <div className="bulk-bar" role="toolbar" aria-label="Actions sur la sélection">
          <span>
            {selected.length} sélectionné{selected.length > 1 ? 's' : ''}
          </span>
          <button onClick={() => pdf(selected)} disabled={printing}>
            <Download size={14} /> {selected.length > 1 ? 'Un seul PDF' : 'PDF'}
          </button>
          <button onClick={() => dup(selected)}>
            <Copy size={14} /> Dupliquer
          </button>
          <button onClick={() => del(selected)}>
            <Trash2 size={14} /> Supprimer
          </button>
          <button className="bulk-x" onClick={() => setSel(new Set())} aria-label="Annuler la sélection">
            <X size={15} />
          </button>
        </div>
      )}
      {hover && !preview && <HoverPreview doc={hover.doc} rect={hover.rect} />}
      {preview && <DocPreviewModal doc={preview} onClose={() => setPreview(null)} />}
      {portal}
    </div>
  )
}
