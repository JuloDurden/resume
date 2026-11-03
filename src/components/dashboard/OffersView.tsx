import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, BellRing, BookOpen, Briefcase, Columns3, ExternalLink, FilePlus2, FileSignature, LayoutGrid, Link2, MapPin, MessagesSquare, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { FollowUpModal, InterviewModal, followUpLabel } from './OfferTools'
import { isDue } from '../../lib/followup'
import { OfferStats } from './OfferStats'
import type { AnyDoc, JobStatus, LetterDoc, Offer, ResumeDoc } from '../../types'
import { useDocs } from '../../store/documents'
import { JOB_STATUS, newOffer } from '../../lib/offers'
import { uid } from '../../lib/ids'
import { newLetter } from '../../data/factory'
import { DocThumb } from '../DocThumb'
import { OfferFields } from '../OfferFields'
import { OfferImportModal } from '../OfferImportModal'
import { OfferLogo } from '../editor/AtsPanel'
import { useRomeDrawer } from '../RomeDrawer'
import { Menu, MenuItem, Modal, Segmented, Select, confirmAction, toast } from '../ui'
import { openPath } from './DocCard'

type Filter = 'all' | 'active' | 'followup' | 'interview' | 'closed'
type View = 'cards' | 'columns' | 'stats'

const docName = (o: Offer) => [o.title || 'Poste', o.company].filter(Boolean).join(' - ')

function NewCvForOffer({ offer, resumes, onClose }: { offer: Offer; resumes: ResumeDoc[]; onClose: () => void }) {
  const [from, setFrom] = useState(resumes[0]?.id ?? '')
  const add = useDocs((s) => s.add)
  const navigate = useNavigate()
  return (
    <Modal
      open
      onClose={onClose}
      title="CV pour cette offre"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn primary"
            disabled={!from}
            onClick={() => {
              const src = resumes.find((r) => r.id === from)
              if (!src) return
              const copy: ResumeDoc = { ...structuredClone(src), id: uid(), name: docName(offer), offerId: offer.id, createdAt: Date.now(), updatedAt: Date.now() }
              add(copy)
              onClose()
              navigate(`/cv/${copy.id}`)
              toast.ok('Copie créée : adaptez-la à l\'offre (onglets ATS et Claude)')
            }}
          >
            Créer la copie
          </button>
        </>
      }
    >
      <div className="form-stack">
        <p className="muted small">Une copie du CV choisi est créée, nommée « {docName(offer)} » et rattachée à l'offre. Le CV d'origine reste intact.</p>
        <Select value={from} onChange={setFrom} options={resumes.map((r) => ({ value: r.id, label: r.name }))} />
      </div>
    </Modal>
  )
}

function OfferCard({ offer, docs, resumes, onEdit }: { offer: Offer; docs: AnyDoc[]; resumes: ResumeDoc[]; onEdit: () => void }) {
  const navigate = useNavigate()
  const saveOffer = useDocs((s) => s.saveOffer)
  const removeOffer = useDocs((s) => s.removeOffer)
  const add = useDocs((s) => s.add)
  const [cvModal, setCvModal] = useState(false)
  const [followUp, setFollowUp] = useState(false)
  const [prep, setPrep] = useState(false)
  const fu = followUpLabel(offer)
  const openRome = useRomeDrawer((s) => s.open)
  const linkedCv = docs.find((d): d is ResumeDoc => d.kind === 'resume')
  const scores = Object.entries(offer.scores ?? {}).filter(([id]) => docs.some((d) => d.id === id))
  const best = scores.length ? Math.max(...scores.map(([, v]) => v)) : undefined

  const createLetter = () => {
    const l: LetterDoc = newLetter(linkedCv?.templateId ?? 'epure', !linkedCv, linkedCv, docName(offer))
    l.offerId = offer.id
    if (offer.company) l.recipient = { ...l.recipient, company: offer.company }
    if (offer.title) l.subject = `Candidature au poste de ${offer.title}`
    add(l)
    navigate(`/lettre/${l.id}`)
  }

  return (
    <div className="offer-card">
      <div className="oc-head">
        <OfferLogo offer={offer} size={40} />
        <div className="oc-title">
          <strong title={offer.title}>{offer.title || 'Offre sans titre'}</strong>
          <span>
            {offer.company || 'Entreprise ?'}
            {offer.location && (
              <>
                {' · '}
                <MapPin size={11} /> {offer.location}
              </>
            )}
          </span>
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
                  onEdit()
                }}
              >
                Modifier l'offre
              </MenuItem>
              <MenuItem
                icon={<MessagesSquare size={14} />}
                onClick={() => {
                  close()
                  setPrep(true)
                }}
              >
                {offer.interview ? "Préparation d'entretien" : "Préparer l'entretien"}
              </MenuItem>
              {offer.status === 'applied' && (
                <MenuItem
                  icon={<BellRing size={14} />}
                  onClick={() => {
                    close()
                    setFollowUp(true)
                  }}
                >
                  Relancer maintenant
                </MenuItem>
              )}
              <MenuItem
                icon={<BookOpen size={14} />}
                onClick={() => {
                  close()
                  openRome({ query: offer.title, code: offer.romeCode, context: offer.description, label: 'Fiche métier du poste visé' })
                }}
              >
                Fiche métier
              </MenuItem>
              <MenuItem
                danger
                icon={<Trash2 size={14} />}
                onClick={() => {
                  close()
                  if (confirmAction(`Supprimer l'offre « ${offer.title ?? ''} » ? Les CV et lettres sont conservés.`)) removeOffer(offer.id)
                }}
              >
                Supprimer l'offre
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
      <div className="oc-status">
        <select className={`status-select st-${offer.status ?? 'todo'}`} value={offer.status ?? 'todo'} onChange={(e) => saveOffer({ ...offer, status: e.target.value as JobStatus })}>
          {(Object.keys(JOB_STATUS) as JobStatus[]).map((k) => (
            <option key={k} value={k}>
              {JOB_STATUS[k]}
            </option>
          ))}
        </select>
        {best !== undefined && <span className={`offer-score ${best >= 75 ? 'good' : best >= 55 ? 'mid' : 'low'}`} title="Meilleur score ATS des CV rattachés">ATS {best}</span>}
        {fu &&
          (fu.due ? (
            <button className="followup-badge due" onClick={() => setFollowUp(true)} title="Préparer l'email de relance">
              <BellRing size={12} /> {fu.label}
            </button>
          ) : (
            <span className="followup-badge" title="Relance proposée automatiquement 7 jours après l'envoi">
              {fu.label}
            </span>
          ))}
        {(offer.status === 'interview' || offer.interview) && (
          <button className={`followup-badge prep${offer.interview ? ' ready' : ''}`} onClick={() => setPrep(true)}>
            <MessagesSquare size={12} /> {offer.interview ? 'Préparation prête' : "Préparer l'entretien"}
          </button>
        )}
        <span className="muted small">Ajoutée le {new Date(offer.createdAt).toLocaleDateString('fr-FR')}</span>
        {offer.url && (
          <a className="btn ghost sm" href={/^https?:/i.test(offer.url) ? offer.url : `https://${offer.url}`} target="_blank" rel="noreferrer">
            <ExternalLink size={13} /> Annonce
          </a>
        )}
      </div>
      <div className="oc-docs">
        {docs.map((d) => (
          <button key={d.id} className="oc-doc" onClick={() => navigate(openPath(d))} title={d.name}>
            <DocThumb doc={d} width={86} />
            <span className={`kind-badge ${d.kind}`}>{d.kind === 'resume' ? 'CV' : 'Lettre'}</span>
          </button>
        ))}
        <div className="oc-add">
          <button className="btn sm" onClick={() => setCvModal(true)} disabled={!resumes.length}>
            <FilePlus2 size={14} /> CV
          </button>
          <button className="btn sm" onClick={createLetter}>
            <FileSignature size={14} /> Lettre
          </button>
        </div>
      </div>
      {cvModal && <NewCvForOffer offer={offer} resumes={resumes} onClose={() => setCvModal(false)} />}
      {followUp && <FollowUpModal offer={offer} onClose={() => setFollowUp(false)} />}
      {prep && <InterviewModal offer={offer} onClose={() => setPrep(false)} />}
    </div>
  )
}

export function OffersView() {
  const offersMap = useDocs((s) => s.offers)
  const docsMap = useDocs((s) => s.docs)
  const saveOffer = useDocs((s) => s.saveOffer)
  const [filter, setFilter] = useState<Filter>('all')
  const [view, setView] = useState<View>(() => {
    try {
      return (localStorage.getItem('resume-offers-view') as View) || 'cards'
    } catch {
      return 'cards'
    }
  })
  const [editing, setEditing] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const offers = useMemo(() => Object.values(offersMap).sort((a, b) => b.createdAt - a.createdAt), [offersMap])
  const docs = useMemo(() => Object.values(docsMap), [docsMap])
  const resumes = useMemo(() => docs.filter((d): d is ResumeDoc => d.kind === 'resume').sort((a, b) => b.updatedAt - a.updatedAt), [docs])
  const match = (o: Offer) => {
    const s = o.status ?? 'todo'
    if (filter === 'active') return s === 'todo' || s === 'applied'
    if (filter === 'followup') return isDue(o)
    if (filter === 'interview') return s === 'interview' || s === 'offer'
    if (filter === 'closed') return s === 'rejected'
    return true
  }
  const shown = offers.filter(match)
  const editingOffer = editing ? offersMap[editing] : undefined

  return (
    <>
      <div className="dash-filter">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `Toutes (${offers.length})` },
            { value: 'active', label: 'En cours' },
            { value: 'followup', label: `À relancer (${offers.filter((o) => isDue(o)).length})` },
            { value: 'interview', label: 'Entretiens' },
            { value: 'closed', label: 'Refusées' },
          ]}
        />
        <div className="row-gap">
          <Segmented
            value={view}
            onChange={(v) => {
              setView(v)
              try {
                localStorage.setItem('resume-offers-view', v)
              } catch {
                /* ignore */
              }
            }}
            options={[
              { value: 'cards', label: <LayoutGrid size={15} />, title: 'Cartes' },
              { value: 'columns', label: <Columns3 size={15} />, title: 'Colonnes par statut' },
              { value: 'stats', label: <BarChart3 size={15} />, title: 'Statistiques de recherche' },
            ]}
          />
          <button className="btn" onClick={() => setImporting(true)}>
            <Link2 size={16} /> Offre depuis un lien
          </button>
          <button
            className="btn"
            onClick={() => {
              const o = newOffer()
              saveOffer(o)
              setEditing(o.id)
            }}
          >
            <Plus size={16} /> Offre manuelle
          </button>
        </div>
      </div>
      {!offers.length ? (
        <div className="empty-state">
          <Briefcase size={28} className="muted" />
          <h2>Aucune offre</h2>
          <p>Ajoutez une offre depuis son lien : vous y rattacherez ensuite un CV et une lettre de motivation, et suivrez l'avancement de la candidature.</p>
          <button className="btn primary" onClick={() => setImporting(true)}>
            <Link2 size={16} /> Ajouter une offre
          </button>
        </div>
      ) : view === 'stats' ? (
        <OfferStats offers={offers} />
      ) : view === 'columns' ? (
        <div className="offer-columns">
          {(Object.keys(JOB_STATUS) as JobStatus[]).map((st) => {
            const col = shown.filter((o) => (o.status ?? 'todo') === st)
            return (
              <div key={st} className={`offer-col st-${st}`}>
                <h3>
                  {JOB_STATUS[st]} <span>{col.length}</span>
                </h3>
                {col.map((o) => (
                  <OfferCard key={o.id} offer={o} docs={docs.filter((d) => d.offerId === o.id)} resumes={resumes} onEdit={() => setEditing(o.id)} />
                ))}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="offer-grid">
          {shown.map((o) => (
            <OfferCard key={o.id} offer={o} docs={docs.filter((d) => d.offerId === o.id)} resumes={resumes} onEdit={() => setEditing(o.id)} />
          ))}
        </div>
      )}
      {editingOffer && (
        <Modal
          open
          wide
          onClose={() => setEditing(null)}
          title="Offre d'emploi"
          footer={
            <button className="btn primary" onClick={() => setEditing(null)}>
              Fermer
            </button>
          }
        >
          <OfferFields offer={editingOffer} onChange={saveOffer} compact />
        </Modal>
      )}
      <OfferImportModal open={importing} onClose={() => setImporting(false)} />
    </>
  )
}
