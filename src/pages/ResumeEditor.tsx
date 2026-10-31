import { useCallback, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Columns2, FileSignature, LayoutTemplate, ListChecks, Palette, PenLine, Sparkles } from 'lucide-react'
import type { ResumeDoc } from '../types'
import { useDoc, useDocs, useOffer } from '../store/documents'
import { applyTemplate } from '../data/templates'
import { newLetter } from '../data/factory'
import { OfferImportModal } from '../components/OfferImportModal'
import { EditorShell, type Tab } from '../components/editor/EditorShell'
import { ContentPanel } from '../components/editor/ContentPanel'
import { StylePanel } from '../components/editor/StylePanel'
import { LayoutPanel, setColumns } from '../components/editor/LayoutPanel'
import { TemplatesPanel } from '../components/editor/TemplatesPanel'
import { AtsPanel } from '../components/editor/AtsPanel'
import { ClaudePanel, type ClaudeRequest } from '../components/editor/ClaudePanel'
import { Preview, usePrint } from '../components/editor/Preview'
import { MenuItem, toast } from '../components/ui'

const TABS: Tab[] = [
  { id: 'content', label: 'Contenu', icon: <PenLine size={18} /> },
  { id: 'templates', label: 'Modèles', icon: <LayoutTemplate size={18} /> },
  { id: 'style', label: 'Style', icon: <Palette size={18} /> },
  { id: 'layout', label: 'Sections', icon: <Columns2 size={18} /> },
  { id: 'ats', label: 'ATS', icon: <ListChecks size={18} /> },
  { id: 'claude', label: 'Claude', icon: <Sparkles size={18} /> },
]

export default function ResumeEditorRoute() {
  const { id } = useParams()
  return <ResumeEditor key={id} id={id} />
}

function ResumeEditor({ id }: { id: string | undefined }) {
  const doc = useDoc<ResumeDoc>(id)
  const hydrated = useDocs((s) => s.hydrated)
  const updateStore = useDocs((s) => s.update)
  const add = useDocs((s) => s.add)
  const navigate = useNavigate()
  const [tab, setTab] = useState('content')
  const [active, setActive] = useState<string | null>('header')
  const [pages, setPages] = useState(1)
  const [request, setRequest] = useState<ClaudeRequest | null>(null)
  const [importing, setImporting] = useState(false)
  const { print, portal } = usePrint(doc)
  const offer = useOffer(doc?.offerId)
  // vue du CV avec l'offre rattachée, utilisée par l'ATS et les prompts Claude
  const view = useMemo(() => (doc ? { ...doc, job: offer } : undefined), [doc, offer])

  const update = useCallback((fn: (d: ResumeDoc) => ResumeDoc) => id && updateStore<ResumeDoc>(id, fn), [id, updateStore])
  const askClaude = useCallback((action: ClaudeRequest['action'], itemId?: string, keywords?: string[]) => {
    setRequest({ action, itemId, keywords, nonce: Date.now() })
    setTab('claude')
  }, [])

  if (!hydrated) return <div className="loading">Chargement...</div>
  if (!doc || !view || doc.kind !== 'resume') return <Navigate to="/" replace />

  const panel = (() => {
    switch (tab) {
      case 'content':
        return <ContentPanel doc={doc} update={update} active={active} setActive={setActive} onAskClaude={(a, item) => askClaude(a, item)} />
      case 'templates':
        return (
          <TemplatesPanel
            doc={doc}
            onApply={(t, keep) => {
              update((d) => applyTemplate(d, t, keep))
              toast.ok('Modèle appliqué (annulable avec Ctrl+Z)')
            }}
          />
        )
      case 'style':
        return (
          <StylePanel
            style={doc.style}
            hasSidebar={doc.layout.columns === 2}
            onChange={(p) => update((d) => ({ ...d, style: { ...d.style, ...p } }))}
            columns={{ columns: doc.layout.columns, position: doc.layout.sidebarPosition }}
            onColumns={(c, pos) => update((d) => setColumns(d, c, pos))}
          />
        )
      case 'layout':
        return <LayoutPanel doc={doc} update={update} />
      case 'ats':
        return (
          <AtsPanel
            doc={view}
            pages={pages}
            onLink={(oid) => update((d) => ({ ...d, offerId: oid }))}
            onImportLink={() => setImporting(true)}
            onDeep={(a, missing) => askClaude(a, undefined, missing)}
          />
        )
      case 'claude':
        return <ClaudePanel doc={view} update={update} request={request} onGoAts={() => setTab('ats')} />
    }
  })()

  return (
    <>
      <EditorShell
        doc={doc}
        tabs={TABS}
        tab={tab}
        setTab={setTab}
        panel={panel}
        onPrint={print}
        preview={
          <Preview
            doc={doc}
            active={tab === 'content' ? active : null}
            onPageCount={setPages}
            onSectionClick={(sid) => {
              setTab('content')
              setActive(sid)
            }}
          />
        }
        extraMenu={(close) => (
          <MenuItem
            icon={<FileSignature size={15} />}
            onClick={() => {
              close()
              const l = newLetter(doc.templateId, false, doc, offer ? [offer.title, offer.company].filter(Boolean).join(' - ') : doc.name)
              l.offerId = doc.offerId
              if (offer?.company) l.recipient.company = offer.company
              if (offer?.title) l.subject = `Candidature au poste de ${offer.title}`
              add(l)
              navigate(`/lettre/${l.id}`)
            }}
          >
            Créer une lettre assortie
          </MenuItem>
        )}
      />
      {portal}
      <OfferImportModal open={importing} onClose={() => setImporting(false)} onCreated={(o) => update((d) => ({ ...d, offerId: o.id }))} />
    </>
  )
}
