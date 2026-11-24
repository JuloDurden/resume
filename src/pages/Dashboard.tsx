import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, Plus, Settings, Globe, BellRing, Briefcase, RefreshCw, FileUp, FilePlus2, FileSignature, FileJson, Files } from 'lucide-react'
import type { ResumeDoc } from '../types'
import { uid } from '../lib/ids'
import { useDocs } from '../store/documents'
import { TEMPLATES } from '../data/templates'
import { newLetter, newResume } from '../data/factory'
import { DocThumb } from '../components/DocThumb'
import { DocsBrowser } from '../components/dashboard/DocsBrowser'
import { SitesView } from '../components/dashboard/SitesView'
import { OffersView } from '../components/dashboard/OffersView'
import { JobsView } from '../components/dashboard/JobsView'
import { useFeed } from '../store/feed'
import { PdfImportModal } from '../components/PdfImportModal'
import { SyncButton } from '../components/SyncModal'
import { SettingsModal, ThemeToggle, downloadBackup, importBackupFile, type SettingsTab } from '../components/SettingsModal'
import { SharedIntro, ShowcaseGrid, ShowcaseIntro, useSharedShowcase, useShowcase } from './Showcase'
import { useSync } from '../store/sync'
import { Field, Menu, MenuItem, Modal, Segmented, Select, TextInput } from '../components/ui'


type CvSource = 'blank' | 'pdf' | 'json'

/** Création de CV : de zéro (modèle ou CV de référence), depuis un CV PDF lu par Claude, ou depuis une sauvegarde JSON. */
function NewResumeModal({ open, onClose, onPdf, onJson, initial = 'blank' }: { open: boolean; onClose: () => void; onPdf: () => void; onJson: () => void; initial?: CvSource }) {
  const [source, setSource] = useState<CvSource>(initial)
  useEffect(() => {
    if (open) setSource(initial)
  }, [open, initial])
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
      title="Création de CV"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          {source === 'pdf' ? (
            <button
              className="btn primary"
              onClick={() => {
                onClose()
                onPdf()
              }}
            >
              <FileUp size={16} /> Continuer avec Claude
            </button>
          ) : source === 'json' ? (
            <button
              className="btn primary"
              onClick={() => {
                onClose()
                onJson()
              }}
            >
              <FileJson size={16} /> Choisir le fichier JSON
            </button>
          ) : (
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
          )}
        </>
      }
    >
      <div className="form-stack">
        <Segmented
          value={source}
          onChange={setSource}
          options={[
            { value: 'blank', label: 'De zéro' },
            { value: 'pdf', label: 'Depuis un CV PDF (Claude)' },
            { value: 'json', label: 'Depuis une sauvegarde JSON' },
          ]}
        />
        {source === 'pdf' ? (
          <div className="source-help">
            <FileUp size={28} />
            <div>
              <strong>Votre CV PDF, remis en forme dans Resume</strong>
              <p className="muted">Claude lit le PDF et renvoie son contenu. Vous collez sa réponse, le CV est créé, modifiable section par section.</p>
            </div>
          </div>
        ) : source === 'json' ? (
          <div className="source-help">
            <FileJson size={28} />
            <div>
              <strong>Un fichier exporté depuis Resume</strong>
              <p className="muted">Un CV exporté en JSON ou une sauvegarde complète : les documents absents sont ajoutés, ceux déjà présents ne sont pas dupliqués.</p>
            </div>
          </div>
        ) : (
        <>
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
        </>
        )}
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
  const [filter, setFilter] = useState<'all' | 'reference' | 'resume' | 'letter'>('all')
  const [view, setView] = useState<'docs' | 'offers' | 'jobs' | 'sites'>(() => {
    const v = localStorage.getItem('resume-dash-view')
    return v === 'offers' || v === 'jobs' || v === 'sites' ? v : 'docs'
  })
  const newJobs = useFeed((s) => (s.feed?.items ?? []).filter((i) => i.firstSeen && new Date(i.firstSeen).getTime() > s.seenAt).length)
  const offersCount = useDocs((s) => Object.keys(s.offers).length)
  useEffect(() => localStorage.setItem('resume-dash-view', view), [view])
  const [modal, setModal] = useState<'resume' | 'letter' | 'pdf' | null>(null)
  const [settings, setSettings] = useState<SettingsTab | null>(null)
  // lien donné à un recruteur (/c/<identifiant>) : la vitrine montre le CV et la lettre de cette candidature
  const { slug } = useParams()
  const vitrine = useShowcase()
  const shared = useSharedShowcase(slug)
  const showcase = slug ? shared ?? undefined : vitrine
  const syncOn = useSync((s) => s.status !== 'off')
  const fileRef = useRef<HTMLInputElement>(null)

  const docs = useMemo(() => Object.values(docsMap).sort((a, b) => b.updatedAt - a.updatedAt), [docsMap])
  const resumes = useMemo(() => docs.filter((d): d is ResumeDoc => d.kind === 'resume'), [docs])
  const refs = useMemo(() => resumes.filter((d) => d.reference), [resumes])
  // du plus récent au plus ancien (date de modification affichée sur les cartes), CV de référence compris
  const shown = docs.filter((d) => filter === 'all' || (filter === 'reference' ? d.kind === 'resume' && d.reference : d.kind === filter))
  const needBackup = !syncOn && docs.length > 0 && (!lastBackup || Date.now() - lastBackup > 14 * 86400000)

  const backup = downloadBackup
  const onImport = importBackupFile

  return (
    <div className="dashboard">
      <header className="dash-head">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={30} height={30} />
          <span>Resume</span>
        </div>
        <div className="dash-actions">
          <SyncButton onClick={() => setSettings('sync')} />
          <ThemeToggle />
          <button className="icon-btn" onClick={() => setSettings('ui')} title="Réglages" aria-label="Réglages">
            <Settings size={18} />
          </button>
          <Menu
            align="right"
            trigger={(t) => (
              <button className="btn primary" onClick={t}>
                <Plus size={16} /> Nouveau <ChevronDown size={14} />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  icon={<FilePlus2 size={15} />}
                  onClick={() => {
                    close()
                    setModal('resume')
                  }}
                >
                  CV…
                </MenuItem>
                <MenuItem
                  icon={<FileSignature size={15} />}
                  onClick={() => {
                    close()
                    setModal('letter')
                  }}
                >
                  Lettre de motivation…
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0]).finally(() => (e.target.value = ''))} />
      </header>

      {needBackup && (
        <div className="notice info">
          Vos documents sont enregistrés uniquement dans ce navigateur.{' '}
          <button className="link" onClick={() => setSettings('sync')}>
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
          <Briefcase size={16} /> Candidatures <em>{offersCount}</em>
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

      {slug && shared && hydrated && docs.length > 0 && (
        <>
          <SharedIntro sc={shared} />
          <ShowcaseGrid sc={shared} base={`/c/${slug}`} />
        </>
      )}
      {slug && shared === null && <p className="notice warn">Ce dossier de candidature n'existe pas ou n'est plus en ligne.</p>}
      {!hydrated ? (
        <div className="loading">Chargement...</div>
      ) : !docs.length ? (
        <>
        {showcase && (
          <>
            {slug && shared ? <SharedIntro sc={shared} /> : <ShowcaseIntro sc={showcase} />}
            <ShowcaseGrid sc={showcase} base={slug ? `/c/${slug}` : '/vitrine'} />
          </>
        )}
        <div className="empty-state">
          <h2>{showcase ? 'Votre espace' : 'Bienvenue'}</h2>
          <p>Créez votre premier CV : à partir d'un modèle, d'un CV PDF existant ou d'une sauvegarde.</p>
          <div className="row-gap">
            <button className="btn primary" onClick={() => setModal('resume')}>
              <FilePlus2 size={16} /> Créer un CV
            </button>
            <button className="btn" onClick={() => setSettings('sync')}>
              <RefreshCw size={16} /> Retrouver ma sauvegarde GitHub
            </button>
          </div>
        </div>
        </>
      ) : (
        <DocsBrowser
          docs={shown}
          left={
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
          }
        />
      )}
        </>
      )}

      <NewResumeModal open={modal === 'resume'} onClose={() => setModal(null)} onPdf={() => setModal('pdf')} onJson={() => fileRef.current?.click()} />
      {modal === 'letter' && <NewLetterModal open onClose={() => setModal(null)} resumes={resumes} />}
      <PdfImportModal open={modal === 'pdf'} onClose={() => setModal(null)} />
      <SettingsModal open={settings !== null} tab={settings ?? 'sync'} onClose={() => setSettings(null)} />
    </div>
  )
}
