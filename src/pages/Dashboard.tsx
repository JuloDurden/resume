import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, BellRing, Briefcase, DatabaseBackup, RefreshCw, FileUp, FilePlus2, FileSignature, FileJson, Files, Upload } from 'lucide-react'
import type { ResumeDoc } from '../types'
import { uid } from '../lib/ids'
import { useDocs } from '../store/documents'
import { TEMPLATES } from '../data/templates'
import { newLetter, newResume } from '../data/factory'
import { download, parseBackup, toJson } from '../lib/export'
import { DocThumb } from '../components/DocThumb'
import { DocCard } from '../components/dashboard/DocCard'
import { SitesView } from '../components/dashboard/SitesView'
import { OffersView } from '../components/dashboard/OffersView'
import { JobsView } from '../components/dashboard/JobsView'
import { useFeed } from '../store/feed'
import { PdfImportModal } from '../components/PdfImportModal'
import { SyncButton, SyncModal } from '../components/SyncModal'
import { ShowcaseGrid, ShowcaseIntro, useShowcase } from './Showcase'
import { useSync } from '../store/sync'
import { Field, Menu, MenuItem, Modal, Segmented, Select, TextInput, toast } from '../components/ui'


function NewResumeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tpl, setTpl] = useState('epure')
  const [sample, setSample] = useState(true)
  const [name, setName] = useState('Mon CV')
  const add = useDocs((s) => s.add)
  const navigate = useNavigate()
  const previews = useMemo(() => TEMPLATES.map((t) => ({ t, doc: newResume(t.id, true) })), [])
  const docsMap = useDocs((s) => s.docs)
  const refs = useMemo(() => Object.values(docsMap).filter((d): d is ResumeDoc => d.kind === 'resume' && !!d.reference), [docsMap])
  const [fromRef, setFromRef] = useState<string | null>(null)
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Nouveau CV"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn primary"
            onClick={() => {
              const ref = refs.find((r) => r.id === fromRef)
              const now = Date.now()
              const d = ref ? { ...structuredClone(ref), id: uid(), reference: undefined, offerId: undefined, name: name.trim() || `${ref.name} - candidature`, createdAt: now, updatedAt: now } : newResume(tpl, sample, name.trim() || 'Mon CV')
              add(d)
              onClose()
              navigate(`/cv/${d.id}`)
            }}
          >
            Créer le CV
          </button>
        </>
      }
    >
      <div className="form-stack">
        <div className="grid-2">
          <Field label="Nom du document">
            <TextInput value={name} onChange={setName} autoFocus />
          </Field>
          <Field label="Contenu de départ">
            <Segmented
              value={sample ? 1 : 0}
              onChange={(v) => setSample(v === 1)}
              options={[
                { value: 1, label: 'Exemple à modifier' },
                { value: 0, label: 'Vierge' },
              ]}
            />
          </Field>
        </div>
        {refs.length > 0 && (
          <>
            <h3 className="modal-h3">Partir d'un de mes CV de référence</h3>
            <div className="template-grid wide">
              {refs.map((r) => (
                <button
                  key={r.id}
                  className={`template-card${fromRef === r.id ? ' on' : ''}`}
                  onClick={() => {
                    setFromRef(r.id)
                    setName(`${r.name} - candidature`)
                  }}
                >
                  <DocThumb doc={r} width={170} />
                  <div className="tc-meta">
                    <strong>{r.name}</strong>
                    <span>{r.header.title}</span>
                  </div>
                </button>
              ))}
            </div>
            <h3 className="modal-h3">Ou partir d'un modèle vierge</h3>
          </>
        )}
        <div className="template-grid wide">
          {previews.map(({ t, doc }) => (
            <button key={t.id} className={`template-card${!fromRef && tpl === t.id ? ' on' : ''}`} onClick={() => { setTpl(t.id); setFromRef(null) }}>
              <DocThumb doc={doc} width={170} />
              <div className="tc-meta">
                <strong>{t.name}</strong>
                <span>{t.description}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function NewLetterModal({ open, onClose, resumes }: { open: boolean; onClose: () => void; resumes: ResumeDoc[] }) {
  const [from, setFrom] = useState(resumes[0]?.id ?? '')
  const [name, setName] = useState('Lettre de motivation')
  const add = useDocs((s) => s.add)
  const navigate = useNavigate()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nouvelle lettre de motivation"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn primary"
            onClick={() => {
              const r = resumes.find((x) => x.id === from)
              const l = newLetter(r?.templateId ?? 'epure', !r, r, name.trim() || 'Lettre de motivation')
              const of = r?.offerId ? useDocs.getState().offers[r.offerId] : undefined
              if (of) {
                l.offerId = of.id
                if (of.company) l.recipient.company = of.company
                if (of.title) l.subject = `Candidature au poste de ${of.title}`
              }
              add(l)
              onClose()
              navigate(`/lettre/${l.id}`)
            }}
          >
            Créer la lettre
          </button>
        </>
      }
    >
      <div className="form-stack">
        <Field label="Nom du document">
          <TextInput value={name} onChange={setName} autoFocus />
        </Field>
        <Field label="Assortir à un CV" hint="La lettre reprend l'en-tête, les coordonnées et le style du CV choisi.">
          <Select value={from} onChange={setFrom} options={[{ value: '', label: 'Aucun (exemple)' }, ...resumes.map((r) => ({ value: r.id, label: r.name }))]} />
        </Field>
      </div>
    </Modal>
  )
}

export default function Dashboard() {
  const docsMap = useDocs((s) => s.docs)
  const hydrated = useDocs((s) => s.hydrated)
  const lastBackup = useDocs((s) => s.lastBackup)
  const { importDocs, markBackup } = useDocs.getState()
  const [filter, setFilter] = useState<'all' | 'reference' | 'resume' | 'letter'>('all')
  const [view, setView] = useState<'docs' | 'offers' | 'jobs' | 'sites'>(() => {
    const v = localStorage.getItem('resume-dash-view')
    return v === 'offers' || v === 'jobs' || v === 'sites' ? v : 'docs'
  })
  const newJobs = useFeed((s) => (s.feed?.items ?? []).filter((i) => i.firstSeen && new Date(i.firstSeen).getTime() > s.seenAt).length)
  const offersCount = useDocs((s) => Object.keys(s.offers).length)
  useEffect(() => localStorage.setItem('resume-dash-view', view), [view])
  const [modal, setModal] = useState<'resume' | 'letter' | 'pdf' | 'sync' | null>(null)
  const showcase = useShowcase()
  const syncOn = useSync((s) => s.status !== 'off')
  const fileRef = useRef<HTMLInputElement>(null)

  const docs = useMemo(() => Object.values(docsMap).sort((a, b) => b.updatedAt - a.updatedAt), [docsMap])
  const resumes = useMemo(() => docs.filter((d): d is ResumeDoc => d.kind === 'resume'), [docs])
  const refs = useMemo(() => resumes.filter((d) => d.reference), [resumes])
  // CV de référence en tête de liste
  const shown = docs
    .filter((d) => filter === 'all' || (filter === 'reference' ? d.kind === 'resume' && d.reference : d.kind === filter))
    .sort((a, b) => Number(b.kind === 'resume' && !!b.reference) - Number(a.kind === 'resume' && !!a.reference))
  const needBackup = !syncOn && docs.length > 0 && (!lastBackup || Date.now() - lastBackup > 14 * 86400000)

  const backup = () => {
    download(`resume-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, toJson(docs, Object.values(useDocs.getState().offers)))
    markBackup()
    toast.ok(`${docs.length} document(s) sauvegardé(s)`)
  }
  const onImport = async (f: File) => {
    try {
      const b = parseBackup(await f.text())
      const n = importDocs(b.docs, b.offers)
      toast.ok(n ? `${n} document(s) importé(s)` : 'Ces documents sont déjà présents')
    } catch (e) {
      toast.error(`Import impossible : ${e instanceof Error ? e.message : 'fichier invalide'}`)
    }
  }

  return (
    <div className="dashboard">
      <header className="dash-head">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={30} height={30} />
          <span>Resume</span>
        </div>
        <div className="dash-actions">
          <Menu
            align="right"
            trigger={(t) => (
              <button className="btn" onClick={t}>
                <Upload size={16} /> Importer
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  icon={<FileUp size={15} />}
                  onClick={() => {
                    close()
                    setModal('pdf')
                  }}
                >
                  Un CV PDF (avec Claude)
                </MenuItem>
                <MenuItem
                  icon={<FileJson size={15} />}
                  onClick={() => {
                    close()
                    fileRef.current?.click()
                  }}
                >
                  Une sauvegarde JSON
                </MenuItem>
              </>
            )}
          </Menu>
          <SyncButton onClick={() => setModal('sync')} />
          <button className="btn" onClick={backup} disabled={!docs.length} title="Télécharger une sauvegarde JSON complète">
            <DatabaseBackup size={16} /> JSON
          </button>
          <button className="btn" onClick={() => setModal('letter')}>
            <FileSignature size={16} /> Nouvelle lettre
          </button>
          <button className="btn primary" onClick={() => setModal('resume')}>
            <FilePlus2 size={16} /> Nouveau CV
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0]).finally(() => (e.target.value = ''))} />
      </header>

      {needBackup && (
        <div className="notice info">
          Vos documents sont enregistrés uniquement dans ce navigateur.{' '}
          <button className="link" onClick={() => setModal('sync')}>
            Activez la sauvegarde automatique sur GitHub
          </button>{' '}
          ou{' '}
          <button className="link" onClick={backup}>
            téléchargez une sauvegarde
          </button>
          .
        </div>
      )}

      <div className="dash-tabs">
        <button className={view === 'docs' ? 'on' : ''} onClick={() => setView('docs')}>
          <Files size={16} /> Documents
        </button>
        <button className={view === 'offers' ? 'on' : ''} onClick={() => setView('offers')}>
          <Briefcase size={16} /> Offres <em>{offersCount}</em>
        </button>
        <button className={view === 'jobs' ? 'on' : ''} onClick={() => setView('jobs')}>
          <BellRing size={16} /> Annonces {newJobs > 0 && view !== 'jobs' && <em className="badge-new">{newJobs}</em>}
        </button>
        <button className={view === 'sites' ? 'on' : ''} onClick={() => setView('sites')}>
          <Globe size={16} /> Sites et entreprises
        </button>
      </div>

      {view === 'sites' ? (
        <SitesView />
      ) : view === 'jobs' ? (
        <JobsView onShowOffers={() => setView('offers')} />
      ) : view === 'offers' ? (
        <OffersView />
      ) : (
        <>
      <div className="dash-filter">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `Tous (${docs.length})` },
            { value: 'reference', label: `CV de référence (${refs.length})`, title: 'Vos CV modèles par type de poste, à dupliquer pour chaque candidature' },
            { value: 'resume', label: `CV (${resumes.length})` },
            { value: 'letter', label: `Lettres (${docs.length - resumes.length})` },
          ]}
        />
      </div>

      {!hydrated ? (
        <div className="loading">Chargement...</div>
      ) : !docs.length ? (
        <>
        {showcase && (
          <>
            <ShowcaseIntro sc={showcase} />
            <ShowcaseGrid sc={showcase} />
          </>
        )}
        <div className="empty-state">
          <h2>{showcase ? 'Votre espace' : 'Bienvenue'}</h2>
          <p>Créez votre premier CV à partir d'un modèle, importez un CV PDF existant, ou restaurez une sauvegarde.</p>
          <div className="row-gap">
            <button className="btn primary" onClick={() => setModal('resume')}>
              <FilePlus2 size={16} /> Créer un CV
            </button>
            <button className="btn" onClick={() => setModal('pdf')}>
              <FileUp size={16} /> Importer un CV PDF
            </button>
            <button className="btn" onClick={() => setModal('sync')}>
              <RefreshCw size={16} /> Retrouver ma sauvegarde GitHub
            </button>
          </div>
        </div>
        </>
      ) : (
        <div className="doc-grid">
          {shown.map((d) => (
            <DocCard key={d.id} doc={d} />
          ))}
        </div>
      )}
        </>
      )}

      <NewResumeModal open={modal === 'resume'} onClose={() => setModal(null)} />
      {modal === 'letter' && <NewLetterModal open onClose={() => setModal(null)} resumes={resumes} />}
      <PdfImportModal open={modal === 'pdf'} onClose={() => setModal(null)} />
      <SyncModal open={modal === 'sync'} onClose={() => setModal(null)} />
    </div>
  )
}
