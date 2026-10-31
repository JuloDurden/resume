import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Download, FileJson, FileText, FileType2, Redo2, Undo2 } from 'lucide-react'
import type { AnyDoc } from '../../types'
import { useDocs } from '../../store/documents'
import { docToText, download, offersOf, safeFileName, toJson } from '../../lib/export'
import { Menu, MenuItem, toast } from '../ui'

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
  return (
    <div className="editor">
      <header className="topbar">
        <Link to="/" className="icon-btn" title="Mes documents">
          <ChevronLeft size={18} />
        </Link>
        <span className={`kind-badge ${doc.kind}`}>{doc.kind === 'resume' ? 'CV' : 'Lettre'}</span>
        <input className="doc-name" value={doc.name} onChange={(e) => update(doc.id, (d) => ({ ...d, name: e.target.value }))} aria-label="Nom du document" />
        <SavedBadge at={doc.updatedAt} />
        <div className="topbar-spacer" />
        <button className="icon-btn" onClick={() => undo(doc.id)} disabled={!hist?.past.length} title="Annuler (Ctrl+Z)">
          <Undo2 size={17} />
        </button>
        <button className="icon-btn" onClick={() => redo(doc.id)} disabled={!hist?.future.length} title="Rétablir (Ctrl+Y)">
          <Redo2 size={17} />
        </button>
        <button className="btn primary" onClick={onPrint} title="Ctrl+P">
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
