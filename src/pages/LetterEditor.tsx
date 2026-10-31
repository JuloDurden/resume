import { useCallback, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { ClipboardCopy, ExternalLink, Link2, Plus, LayoutTemplate, Palette, PenLine, RefreshCw, Sparkles } from 'lucide-react'
import type { LetterDoc, ResumeDoc } from '../types'
import { useDoc, useDocs, useOffer } from '../store/documents'
import { OfferFields } from '../components/OfferFields'
import { OfferImportModal } from '../components/OfferImportModal'
import { newOffer } from '../lib/offers'
import { applyLetterTemplate } from '../data/letterTemplates'
import { todayFr } from '../lib/dates'
import { CLAUDE_URL, buildPrompt, copyText, extractJson } from '../lib/prompts'
import { EditorShell, type Tab } from '../components/editor/EditorShell'
import { HeaderForm } from '../components/editor/HeaderForm'
import { SignatureInput } from '../components/editor/fields'
import { StylePanel } from '../components/editor/StylePanel'
import { LetterLayoutPanel } from '../components/editor/LetterLayoutPanel'
import { TemplatesPanel } from '../components/editor/TemplatesPanel'
import { ClaudeIntro } from '../components/editor/ClaudePanel'
import { Preview, usePrint } from '../components/editor/Preview'
import { Field, Select, TextArea, TextInput, toast } from '../components/ui'

const TABS: Tab[] = [
  { id: 'content', label: 'Contenu', icon: <PenLine size={18} /> },
  { id: 'templates', label: 'Modèles', icon: <LayoutTemplate size={18} /> },
  { id: 'style', label: 'Style', icon: <Palette size={18} /> },
  { id: 'claude', label: 'Claude', icon: <Sparkles size={18} /> },
]

function Card({ id, title, open, setOpen, children }: { id: string; title: string; open: string | null; setOpen: (v: string | null) => void; children: React.ReactNode }) {
  const isOpen = open === id
  return (
    <div className={`sec-card${isOpen ? ' open' : ''}`}>
      <div className="sec-head" onClick={() => setOpen(isOpen ? null : id)}>
        <span className="sec-title">{title}</span>
      </div>
      {isOpen && <div className="sec-body">{children}</div>}
    </div>
  )
}

function LetterContent({ doc, update, active, setActive }: { doc: LetterDoc; update: (fn: (d: LetterDoc) => LetterDoc) => void; active: string | null; setActive: (v: string | null) => void }) {
  const all = useDocs((s) => s.docs)
  const resumes = useMemo(() => Object.values(all).filter((d): d is ResumeDoc => d.kind === 'resume'), [all])
  const set = (p: Partial<LetterDoc>) => update((d) => ({ ...d, ...p }))
  const linked = resumes.find((r) => r.id === doc.linkedResumeId)
  const words = doc.body.split(/\s+/).filter(Boolean).length
  return (
    <div className="panel-content">
      <div className="options-box">
        <Field label="CV associé" hint="Sert à synchroniser l'en-tête et le style, et à rédiger avec Claude.">
          <div className="row-gap">
            <Select value={doc.linkedResumeId ?? ''} onChange={(v) => set({ linkedResumeId: v || undefined })} options={[{ value: '', label: 'Aucun' }, ...resumes.map((r) => ({ value: r.id, label: r.name }))]} />
            <button
              className="btn sm"
              disabled={!linked}
              title="Copier l'en-tête et le style du CV"
              onClick={() => {
                if (!linked) return
                set({ header: structuredClone(linked.header), style: { ...linked.style, headerPlacement: 'top' }, templateId: linked.templateId, signature: linked.header.name })
                toast.ok('En-tête et style synchronisés')
              }}
            >
              <RefreshCw size={14} /> Synchroniser
            </button>
          </div>
        </Field>
      </div>
      <Card id="header" title="Expéditeur" open={active} setOpen={setActive}>
        <HeaderForm header={doc.header} onChange={(h) => set({ header: h })} />
      </Card>
      <Card id="recipient" title="Destinataire" open={active} setOpen={setActive}>
        <div className="form-stack">
          <div className="grid-2">
            <Field label="Nom ou civilité">
              <TextInput value={doc.recipient.name} onChange={(v) => set({ recipient: { ...doc.recipient, name: v } })} />
            </Field>
            <Field label="Fonction">
              <TextInput value={doc.recipient.title} onChange={(v) => set({ recipient: { ...doc.recipient, title: v } })} />
            </Field>
          </div>
          <Field label="Entreprise">
            <TextInput value={doc.recipient.company} onChange={(v) => set({ recipient: { ...doc.recipient, company: v } })} />
          </Field>
          <Field label="Adresse">
            <TextArea value={doc.recipient.address} onChange={(v) => set({ recipient: { ...doc.recipient, address: v } })} />
          </Field>
        </div>
      </Card>
      <Card id="meta" title="Lieu, date et objet" open={active} setOpen={setActive}>
        <div className="form-stack">
          <div className="grid-2">
            <Field label="Lieu">
              <TextInput value={doc.place} onChange={(v) => set({ place: v })} />
            </Field>
            <Field label="Date">
              <div className="row-gap">
                <TextInput value={doc.date} onChange={(v) => set({ date: v })} />
                <button className="btn sm" onClick={() => set({ date: todayFr() })} title="Date du jour">
                  Aujourd'hui
                </button>
              </div>
            </Field>
          </div>
          <Field label="Objet">
            <TextInput value={doc.subject} onChange={(v) => set({ subject: v })} />
          </Field>
        </div>
      </Card>
      <Card id="body" title="Corps de la lettre" open={active} setOpen={setActive}>
        <div className="form-stack">
          <Field label="Formule d'appel">
            <TextInput value={doc.salutation} onChange={(v) => set({ salutation: v })} />
          </Field>
          <Field label="Texte" hint={`${words} mots. Séparez les paragraphes par une ligne vide. **gras**, *italique*.`}>
            <TextArea value={doc.body} minRows={12} onChange={(v) => set({ body: v })} />
          </Field>
          <Field label="Formule de politesse">
            <TextArea value={doc.closing} minRows={2} onChange={(v) => set({ closing: v })} />
          </Field>
          <Field label="Nom sous la signature">
            <TextInput value={doc.signature} onChange={(v) => set({ signature: v })} />
          </Field>
          <Field label="Signature manuscrite">
            <SignatureInput value={doc.signatureImage} onChange={(v) => set({ signatureImage: v })} />
          </Field>
        </div>
      </Card>
      <Card id="job" title="Offre d'emploi" open={active} setOpen={setActive}>
        <LetterOfferCard doc={doc} set={set} />
      </Card>
    </div>
  )
}

function LetterOfferCard({ doc, set }: { doc: LetterDoc; set: (p: Partial<LetterDoc>) => void }) {
  const offersMap = useDocs((s) => s.offers)
  const saveOffer = useDocs((s) => s.saveOffer)
  const offers = useMemo(() => Object.values(offersMap).sort((a, b) => b.createdAt - a.createdAt), [offersMap])
  const offer = doc.offerId ? offersMap[doc.offerId] : undefined
  const [importing, setImporting] = useState(false)
  return (
    <div className="form-stack">
      <Field label="Offre rattachée" hint="La lettre apparaît avec cette offre sur l'accueil, et Claude s'en sert pour rédiger.">
        <div className="row-gap">
          <Select value={doc.offerId ?? ''} onChange={(v) => set({ offerId: v || undefined })} options={[{ value: '', label: 'Aucune' }, ...offers.map((o) => ({ value: o.id, label: [o.title || 'Sans titre', o.company].filter(Boolean).join(' - ') }))]} />
          <button className="btn sm" onClick={() => setImporting(true)} title="Depuis un lien">
            <Link2 size={14} />
          </button>
          <button
            className="btn sm"
            title="Nouvelle offre"
            onClick={() => {
              const o = newOffer({ company: doc.recipient.company || undefined })
              saveOffer(o)
              set({ offerId: o.id })
            }}
          >
            <Plus size={14} />
          </button>
        </div>
      </Field>
      {offer && <OfferFields offer={offer} onChange={saveOffer} compact />}
      <OfferImportModal
        open={importing}
        onClose={() => setImporting(false)}
        onCreated={(o) => {
          const p: Partial<LetterDoc> = { offerId: o.id }
          if (o.company && !doc.recipient.company) p.recipient = { ...doc.recipient, company: o.company }
          if (o.title) p.subject = `Candidature au poste de ${o.title}`
          set(p)
        }}
      />
    </div>
  )
}

function LetterClaude({ doc, update, goJob }: { doc: LetterDoc; update: (fn: (d: LetterDoc) => LetterDoc) => void; goJob: () => void }) {
  const resume = useDocs((s) => (doc.linkedResumeId ? (s.docs[doc.linkedResumeId] as ResumeDoc | undefined) : undefined))
  const [mode, setMode] = useState<'letter' | 'improve-letter'>(doc.body.trim() ? 'improve-letter' : 'letter')
  const [answer, setAnswer] = useState('')
  const offer = useOffer(doc.offerId)
  const canWrite = !!resume && !!offer?.description?.trim()
  const prompt =
    mode === 'letter'
      ? canWrite
        ? buildPrompt('letter', { ...resume!, job: offer })
        : ''
      : buildPrompt('improve-letter', resume ?? ({ sections: [], header: doc.header, layout: { main: [], side: [] } } as unknown as ResumeDoc), { letter: { ...doc, job: offer } })
  const copy = async (open: boolean) => {
    if (!(await copyText(prompt))) return toast.error('Copie impossible')
    toast.ok('Prompt copié')
    if (open) window.open(CLAUDE_URL, '_blank', 'noopener')
  }
  const apply = () => {
    try {
      const data = extractJson<Partial<LetterDoc>>(answer)
      update((d) => ({
        ...d,
        subject: data.subject ?? d.subject,
        salutation: data.salutation ?? d.salutation,
        body: data.body ?? d.body,
        closing: data.closing ?? d.closing,
        recipient: data.recipient ? { ...d.recipient, ...Object.fromEntries(Object.entries(data.recipient).filter(([, v]) => v)) } : d.recipient,
      }))
      setAnswer('')
      toast.ok('Lettre mise à jour (annulable avec Ctrl+Z)')
    } catch (e) {
      toast.error(`Réponse non reconnue : ${e instanceof Error ? e.message : ''}`)
    }
  }
  return (
    <div className="panel-content">
      <ClaudeIntro />
      <Field label="Action">
        <Select
          value={mode}
          onChange={setMode}
          options={[
            { value: 'letter', label: 'Rédiger la lettre à partir du CV et de l\'offre' },
            { value: 'improve-letter', label: 'Relire et améliorer la lettre actuelle' },
          ]}
        />
      </Field>
      {mode === 'letter' && !canWrite ? (
        <div className="notice warn">
          Associez un CV (onglet Contenu) et collez le texte de l'offre.{' '}
          <button className="link" onClick={goJob}>
            Compléter
          </button>
        </div>
      ) : (
        <>
          <div className="step">
            <span className="step-n">1</span>
            <div className="step-body">
              <strong>Copiez le prompt et ouvrez Claude</strong>
              <div className="row-gap">
                <button className="btn primary sm" onClick={() => copy(true)}>
                  <ExternalLink size={14} /> Copier et ouvrir Claude
                </button>
                <button className="btn sm" onClick={() => copy(false)}>
                  <ClipboardCopy size={14} /> Copier
                </button>
              </div>
              <details>
                <summary>Voir le prompt</summary>
                <pre className="prompt-preview">{prompt}</pre>
              </details>
            </div>
          </div>
          <div className="step">
            <span className="step-n">2</span>
            <div className="step-body">
              <strong>Collez la réponse de Claude</strong>
              <TextArea value={answer} onChange={setAnswer} minRows={6} placeholder="Collez ici la réponse complète..." />
              <button className="btn primary sm self-start" disabled={!answer.trim()} onClick={apply}>
                <Sparkles size={14} /> Appliquer à la lettre
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function LetterEditorRoute() {
  const { id } = useParams()
  return <LetterEditor key={id} id={id} />
}

function LetterEditor({ id }: { id: string | undefined }) {
  const doc = useDoc<LetterDoc>(id)
  const hydrated = useDocs((s) => s.hydrated)
  const updateStore = useDocs((s) => s.update)
  const [tab, setTab] = useState('content')
  const [active, setActive] = useState<string | null>('body')
  const { print, portal } = usePrint(doc)
  const update = useCallback((fn: (d: LetterDoc) => LetterDoc) => id && updateStore<LetterDoc>(id, fn), [id, updateStore])

  if (!hydrated) return <div className="loading">Chargement...</div>
  if (!doc || doc.kind !== 'letter') return <Navigate to="/" replace />

  const panel = (() => {
    switch (tab) {
      case 'content':
        return <LetterContent doc={doc} update={update} active={active} setActive={setActive} />
      case 'templates':
        return (
          <TemplatesPanel
            doc={doc}
            onApply={(t, keep) =>
              update((d) => applyLetterTemplate(d, t, keep))
            }
          />
        )
      case 'style':
        return (
          <>
            <LetterLayoutPanel doc={doc} onChange={(p) => update((d) => ({ ...d, options: { ...d.options, ...p } }))} />
            <StylePanel style={doc.style} hasSidebar={doc.options?.layout === 'sidebar'} isLetter onChange={(p) => update((d) => ({ ...d, style: { ...d.style, ...p } }))} />
          </>
        )
      case 'claude':
        return (
          <LetterClaude
            doc={doc}
            update={update}
            goJob={() => {
              setTab('content')
              setActive('job')
            }}
          />
        )
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
            onSectionClick={(sid) => {
              setTab('content')
              setActive(sid)
            }}
          />
        }
      />
      {portal}
    </>
  )
}
