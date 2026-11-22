import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Download, FileJson, FileSignature, FileText, FileType2, Redo2, Undo2 } from 'lucide-react'
import type { AnyDoc } from '../../types'
import { useDocs } from '../../store/documents'
import { docToText, download, offersOf, safeFileName, toJson } from '../../lib/export'
import { Field, Menu, MenuItem, Modal, toast } from '../ui'
import { pdfFileName } from '../../lib/filename'

export interface Tab {
  id: string
  label: string
  icon: ReactNode
}

function SavedBadge({ at }: { at: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30000)
    return () => clearInterval(t)
  }, [])
  const s = Math.round((Date.now() - at) / 1000)
  const label = s < 10 ? 'Enregistré' : s < 60 ? `Enregistré il y a ${s} s` : `Enregistré il y a ${Math.round(s / 60)} min`
  return <span className="saved">{label}</span>
}

interface Props {
  doc: AnyDoc
  tabs: Tab[]
  tab: string
  setTab: (t: string) => void
  panel: ReactNode
  preview: ReactNode
  onPrint: () => void
  extraMenu?: (close: () => void) => ReactNode
}

export function EditorShell({ doc, tabs, tab, setTab, panel, preview, onPrint, extraMenu }: Props) {
  const update = useDocs((s) => s.update)
  const undo = useDocs((s) => s.undo)
  const redo = useDocs((s) => s.redo)
  const hist = useDocs((s) => s.history[doc.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const t = e.target as HTMLElement
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      const k = e.key.toLowerCase()
      if (k === 'p') {
        e.preventDefault()
        onPrint()
      } else if (!typing && k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo(doc.id)
      } else if (!typing && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo(doc.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc.id, undo, redo, onPrint])

  const base = safeFileName(doc.name)
  const offer = useDocs((s) => (doc.offerId ? s.offers[doc.offerId] : undefined))
  const pdfName = pdfFileName(doc, offer)
  const [naming, setNaming] = useState(false)
  return (
    <div className="editor">
      <header className="topbar">
        <Link to="/" className="icon-btn" title="Mes documents">
          <ChevronLeft size={18} />
        </Link>
        <span className={`kind-badge ${doc.kind}`}>{doc.kind === 'resume' ? 'CV' : 'Lettre'}</span>
        <input className="doc-name" value={doc.name} onChange={(e) => update(doc.id, (d) => ({ ...d, name: e.target.value }))} aria-label="Nom du document" />
        <SavedBadge at={doc.updatedAt} />
        <button className="pdf-name" onClick={() => setNaming(true)} title="Nom proposé à l'enregistrement du PDF : cliquer pour le modifier">
          PDF : {pdfName}.pdf
        </button>
        <div className="topbar-spacer" />
        <button className="icon-btn" onClick={() => undo(doc.id)} disabled={!hist?.past.length} title="Annuler (Ctrl+Z)">
          <Undo2 size={17} />
        </button>
        <button className="icon-btn" onClick={() => redo(doc.id)} disabled={!hist?.future.length} title="Rétablir (Ctrl+Y)">
          <Redo2 size={17} />
        </button>
        <button className="btn primary" onClick={onPrint} title={`${pdfName}.pdf (Ctrl+P)`}>
          <Download size={16} /> PDF
        </button>
        <Menu
          align="right"
          trigger={(t) => (
            <button className="btn" onClick={t}>
              Exporter
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                icon={<FileType2 size={15} />}
                onClick={() => {
                  close()
                  onPrint()
                }}
              >
                PDF (via l'impression)
              </MenuItem>
              <MenuItem
                icon={<FileSignature size={15} />}
                onClick={() => {
                  close()
                  setNaming(true)
                }}
              >
                Nom du fichier PDF…
              </MenuItem>
              <MenuItem
                icon={<FileJson size={15} />}
                onClick={() => {
                  download(`${base}.json`, toJson([doc], offersOf([doc], useDocs.getState().offers)))
                  toast.ok('Fichier JSON téléchargé')
                  close()
                }}
              >
                JSON (sauvegarde réimportable)
              </MenuItem>
              <MenuItem
                icon={<FileText size={15} />}
                onClick={() => {
                  download(`${base}.md`, docToText(doc, true), 'text/markdown')
                  close()
                }}
              >
                Markdown
              </MenuItem>
              <MenuItem
                icon={<FileText size={15} />}
                onClick={() => {
                  download(`${base}.txt`, docToText(doc, false), 'text/plain')
                  close()
                }}
              >
                Texte brut
              </MenuItem>
              {extraMenu?.(close)}
            </>
          )}
        </Menu>
      </header>
      {naming && <PdfNameModal doc={doc} auto={pdfFileName({ ...doc, fileName: undefined }, offer)} onClose={() => setNaming(false)} />}
      <div className="editor-body">
        <nav className="tabs-rail">
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <aside className="side-panel" key={tab}>
          {panel}
        </aside>
        <main className="preview-area">{preview}</main>
      </div>
    </div>
  )
}

/** Nom du PDF : calculé (Prénom NOM - CV - Poste - Entreprise) ou imposé pour ce document. */
function PdfNameModal({ doc, auto, onClose }: { doc: AnyDoc; auto: string; onClose: () => void }) {
  const update = useDocs((s) => s.update)
  const [v, setV] = useState(doc.fileName ?? '')
  const save = () => {
    update(doc.id, (d) => ({ ...d, fileName: v.trim() || undefined }))
    toast.ok(v.trim() ? 'Nom du PDF enregistré' : 'Nom du PDF automatique')
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Nom du fichier PDF"
      footer={
        <>
          {doc.fileName && (
            <button className="btn ghost" onClick={() => setV('')}>
              Revenir au nom automatique
            </button>
          )}
          <button className="btn primary" onClick={save}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="form-stack">
        <p className="muted small">
          Proposé à l'enregistrement du PDF. Le nom du document dans Resume ne change pas. Automatique : <strong>{auto}.pdf</strong>
        </p>
        <Field label="Nom du fichier (sans .pdf)" hint="Laissez vide pour le nom automatique, mis à jour avec l'offre rattachée.">
          <input className="input" value={v} placeholder={auto} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} autoFocus />
        </Field>
      </div>
    </Modal>
  )
}
