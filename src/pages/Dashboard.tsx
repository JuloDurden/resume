import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, DatabaseBackup, FilePlus2, FileSignature, FileJson, MoreVertical, Pencil, Trash2, Upload } from 'lucide-react'
import type { AnyDoc, ResumeDoc } from '../types'
import { useDocs } from '../store/documents'
import { TEMPLATES } from '../data/templates'
import { newLetter, newResume } from '../data/factory'
import { download, parseJson, safeFileName, toJson } from '../lib/export'
import { DocThumb } from '../components/DocThumb'
import { Field, Menu, MenuItem, Modal, Segmented, Select, TextInput, confirmAction, toast } from '../components/ui'

const fmt = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function NewResumeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tpl, setTpl] = useState('epure')
  const [sample, setSample] = useState(true)
  const [name, setName] = useState('Mon CV')
  const add = useDocs((s) => s.add)
  const navigate = useNavigate()
  const previews = useMemo(() => TEMPLATES.map((t) => ({ t, doc: newResume(t.id, true) })), [])
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
              const d = newResume(tpl, sample, name.trim() || 'Mon CV')
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
        <div className="template-grid wide">
          {previews.map(({ t, doc }) => (
            <button key={t.id} className={`template-card${tpl === t.id ? ' on' : ''}`} onClick={() => setTpl(t.id)}>
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
              if (r?.job) {
                l.job = r.job
                if (r.job.company) l.recipient.company = r.job.company
                if (r.job.title) l.subject = `Candidature au poste de ${r.job.title}`
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
  const { remove, duplicate, update, importDocs, markBackup } = useDocs.getState()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'all' | 'resume' | 'letter'>('all')
  const [modal, setModal] = useState<'resume' | 'letter' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const docs = useMemo(() => Object.values(docsMap).sort((a, b) => b.updatedAt - a.updatedAt), [docsMap])
  const resumes = useMemo(() => docs.filter((d): d is ResumeDoc => d.kind === 'resume'), [docs])
  const shown = docs.filter((d) => filter === 'all' || d.kind === filter)
  const needBackup = docs.length > 0 && (!lastBackup || Date.now() - lastBackup > 14 * 86400000)

  const open = (d: AnyDoc) => navigate(d.kind === 'resume' ? `/cv/${d.id}` : `/lettre/${d.id}`)
  const backup = () => {
    download(`resume-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, toJson(docs))
    markBackup()
    toast.ok(`${docs.length} document(s) sauvegardé(s)`)
  }
  const onImport = async (f: File) => {
    try {
      const n = importDocs(parseJson(await f.text()))
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
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Importer
          </button>
          <button className="btn" onClick={backup} disabled={!docs.length}>
            <DatabaseBackup size={16} /> Sauvegarder tout
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
          Vos documents sont enregistrés uniquement dans ce navigateur. Faites une sauvegarde régulière pour ne rien perdre (et pour les retrouver sur un autre ordinateur).{' '}
          <button className="link" onClick={backup}>
            Sauvegarder maintenant
          </button>
        </div>
      )}

      <div className="dash-filter">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `Tous (${docs.length})` },
            { value: 'resume', label: `CV (${resumes.length})` },
            { value: 'letter', label: `Lettres (${docs.length - resumes.length})` },
          ]}
        />
      </div>

      {!hydrated ? (
        <div className="loading">Chargement...</div>
      ) : !docs.length ? (
        <div className="empty-state">
          <h2>Bienvenue</h2>
          <p>Créez votre premier CV à partir d'un modèle, ou importez une sauvegarde.</p>
          <button className="btn primary" onClick={() => setModal('resume')}>
            <FilePlus2 size={16} /> Créer un CV
          </button>
        </div>
      ) : (
        <div className="doc-grid">
          {shown.map((d) => (
            <div key={d.id} className="doc-card">
              <button className="doc-thumb" onClick={() => open(d)} aria-label={`Ouvrir ${d.name}`}>
                <DocThumb doc={d} width={210} />
              </button>
              <div className="doc-meta">
                <div>
                  <span className={`kind-badge ${d.kind}`}>{d.kind === 'resume' ? 'CV' : 'Lettre'}</span>
                  <strong title={d.name}>{d.name}</strong>
                  <span className="muted small">Modifié le {fmt(d.updatedAt)}</span>
                </div>
                <Menu
                  align="right"
                  trigger={(t) => (
                    <button className="icon-btn" onClick={t} title="Actions">
                      <MoreVertical size={16} />
                    </button>
                  )}
                >
                  {(close) => (
                    <>
                      <MenuItem
                        icon={<Pencil size={14} />}
                        onClick={() => {
                          close()
                          const n = window.prompt('Nouveau nom', d.name)
                          if (n?.trim()) update(d.id, (x) => ({ ...x, name: n.trim() }))
                        }}
                      >
                        Renommer
                      </MenuItem>
                      <MenuItem
                        icon={<Copy size={14} />}
                        onClick={() => {
                          close()
                          duplicate(d.id)
                          toast.ok('Document dupliqué')
                        }}
                      >
                        Dupliquer
                      </MenuItem>
                      <MenuItem
                        icon={<FileJson size={14} />}
                        onClick={() => {
                          close()
                          download(`${safeFileName(d.name)}.json`, toJson([d]))
                        }}
                      >
                        Exporter en JSON
                      </MenuItem>
                      <MenuItem
                        danger
                        icon={<Trash2 size={14} />}
                        onClick={() => {
                          close()
                          if (confirmAction(`Supprimer définitivement « ${d.name} » ?`)) remove(d.id)
                        }}
                      >
                        Supprimer
                      </MenuItem>
                    </>
                  )}
                </Menu>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewResumeModal open={modal === 'resume'} onClose={() => setModal(null)} />
      {modal === 'letter' && <NewLetterModal open onClose={() => setModal(null)} resumes={resumes} />}
    </div>
  )
}
