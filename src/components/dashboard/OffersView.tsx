import { docNameFor } from '../../lib/filename'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, MailCheck, Building2, ChevronDown, Sparkles, BarChart3, BellRing, Undo2, BookOpen, CalendarClock, CalendarDays, Euro, Globe, Briefcase, Columns3, ExternalLink, FilePlus2, FileSignature, List, Link2, MessagesSquare, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { FollowUpModal, FollowUpPlanner, InterviewModal, InterviewPlanner, InterviewReport, RecruiterUpdateModal, ShareModal, followUpLabel } from './OfferTools'
import { FEELING, MODE_LABEL, toReport, datedInterviews, daysUntil, fmtIn, fmtLong, fmtShort, offerSalary, slotWhere, upcomingInterview } from '../../lib/interviews'
import { announcedBy, followUpsSinceUpdate, nextFollowUp, setDefaultFollowUpDays, setSilentDays, silentSince } from '../../lib/followup'
import { OfferStats } from './OfferStats'
import { Timeline, pastSteps } from './MetroTimeline'
import { ReplyCard, useMailInbox } from './MailInbox'
import { MAIL_MARK, type InboxItem } from '../../lib/replies'
import { CompanyAnalysisModal, CompanyCard, SpontaneousModal } from './SpontaneousTools'
import type { AnyDoc, JobStatus, LetterDoc, Offer, ResumeDoc } from '../../types'
import { useDocs } from '../../store/documents'
import { useFeed } from '../../store/feed'
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

type Filter = 'all' | Stage
type View = 'cards' | 'columns' | 'stats'

const docName = (o: Offer) => (o.spontaneous ? (o.posts?.length === 1 ? docNameFor(o.posts[0]) : 'Candidature spontanée') : docNameFor(o.title, o.location))

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

const DAY = 86400000
const since = (t?: number) => {
  if (!t) return ''
  const d = Math.floor((Date.now() - t) / DAY)
  return d <= 0 ? "aujourd'hui" : d === 1 ? 'hier' : `il y a ${d} j`
}
const frDay = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const href = (u: string) => (/^https?:/i.test(u) ? u : `https://${u}`)

type Stage = 'now' | 'interview' | 'wait' | 'done'
type Next = { text: string; tone: 'hot' | 'ok' | 'muted' | ''; stage: Stage; act?: 'followup' | 'planner' | 'prep' | 'cv' | 'open' | 'interview' | 'report' | 'analysis'; title?: string; slot?: string }

/** Prochaine étape d'une candidature, et le groupe où elle se range (à faire, entretien, en attente, terminée). */
function nextStep(o: Offer, docs: AnyDoc[]): Next {
  const st = o.status ?? 'todo'
  if (st === 'rejected') return { text: `Refusée${o.statusAt?.rejected ? ` le ${frDay(o.statusAt.rejected)}` : ''}`, tone: 'muted', stage: 'done' }
  if (st === 'offer') return { text: 'Proposition reçue : à étudier', tone: 'ok', stage: 'now', act: 'open' }
  if (o.spontaneous && !o.analysis && st === 'todo') return { text: "Analyser l'entreprise", tone: 'hot', stage: 'now', act: 'analysis', title: 'Claude cherche ses besoins et note ton adéquation' }
  if (st === 'interview') {
    const past = toReport(o)
    if (past) return { text: "Compte rendu d'entretien", tone: 'hot', stage: 'now', act: 'report', slot: past.id, title: `Entretien du ${fmtLong(past.at)} : confirmez-le et notez vos impressions` }
    const next = upcomingInterview(o)
    if (next) {
      const d = daysUntil(next.at)
      const day = d <= 1 ? `${fmtIn(next.at)}, ${fmtShort(next.at).split(', ')[1]}` : fmtShort(next.at).split(', ')[0]
      const title = `Entretien ${fmtLong(next.at)}${slotWhere(next) ? `, ${slotWhere(next)}` : ''}`
      // préparation à faire : urgente à 5 jours de l'entretien
      if (!o.interview) return d <= 5 ? { text: `Préparer l'entretien (${fmtIn(next.at)})`, tone: 'hot', stage: 'now', act: 'prep', title } : { text: `Entretien ${day}`, tone: '', stage: 'interview', act: 'interview', title }
      return { text: `Entretien ${day} · prêt`, tone: 'ok', stage: 'interview', act: 'prep', title }
    }
    if (!datedInterviews(o).length) return { text: "Entretien : préciser la date", tone: 'hot', stage: 'now', act: 'interview' }
    const lastFu = Math.max(0, ...(o.followUps ?? []))
    if (o.answerBy && daysUntil(o.answerBy) < 0 && lastFu > o.answerBy - DAY) return { text: `Relancé le ${frDay(lastFu)}, en attente`, tone: 'muted', stage: 'interview', act: 'interview' }
    if (o.answerBy) return daysUntil(o.answerBy) >= 0 ? { text: `Retour attendu le ${frDay(o.answerBy)}`, tone: '', stage: 'interview', act: 'interview' } : { text: `Sans retour depuis le ${frDay(o.answerBy)}`, tone: 'hot', stage: 'now', act: 'followup' }
    const last = datedInterviews(o).at(-1)!
    return { text: last.feeling ? `Entretien passé · ${FEELING[last.feeling].label.toLowerCase()}` : 'Entretien passé, en attente', tone: 'muted', stage: 'interview', act: 'report', slot: last.id, title: 'Ajoutez la date de retour annoncée pour être averti au bon moment' }
  }
  if (st === 'todo') return docs.some((d) => d.kind === 'resume') ? { text: 'À envoyer', tone: 'hot', stage: 'now', act: 'open' } : { text: 'Préparer le CV', tone: 'hot', stage: 'now', act: 'cv' }
  const fu = followUpLabel(o)
  if (fu?.due) return { text: fu.label === 'Seconde relance' ? 'Seconde relance à faire' : "Relancer aujourd'hui", tone: 'hot', stage: 'now', act: 'followup' }
  const n = nextFollowUp(o)
  const promised = announcedBy(o)
  if (promised) return { text: `Retour annoncé le ${frDay(promised)}`, tone: 'ok', stage: 'wait', act: 'planner', title: n ? `Sans nouvelles, relance proposée le ${frDay(n)}` : undefined }
  if (n) return { text: `${followUpsSinceUpdate(o).length ? 'Seconde relance' : 'Relance'} le ${frDay(n)}`, tone: '', stage: 'wait', act: 'planner' }
  const quiet = silentSince(o)
  if (quiet) return { text: `Sans réponse depuis le ${frDay(quiet)}`, tone: 'muted', stage: 'wait', act: 'planner', title: 'Aucune nouvelle depuis la dernière relance (délai réglable dans Réglages, Relances)' }
  return { text: o.noFollowUp ? 'Sans relance' : 'En attente', tone: 'muted', stage: 'wait', act: 'planner' }
}

/** Réponses montrées dans chaque candidature ouverte (la carte est recréée quand la candidature change de groupe). */
const keptMails = new Map<string, InboxItem[]>()

function OfferRow({ offer, docs, resumes, onEdit, open, onOpen, narrow, mails, offers }: { offer: Offer; docs: AnyDoc[]; resumes: ResumeDoc[]; onEdit: () => void; open: boolean; onOpen: (v: boolean) => void; narrow?: boolean; mails?: InboxItem[]; offers: Offer[] }) {
  const navigate = useNavigate()
  const saveOffer = useDocs((s) => s.saveOffer)
  const removeOffer = useDocs((s) => s.removeOffer)
  const markMany = useDocs((s) => s.markMany)
  const feedIds = useFeed((s) => s.feed?.items)
  const sourceIds = [...new Set([offer.sourceId, ...(offer.jobIds ?? [])].filter((x): x is string => !!x))]
  /** Annule la candidature : l'annonce d'origine redevient une annonce à examiner, les documents restent dans « Documents ». */
  const backToJobs = () => {
    const live = sourceIds.filter((id) => feedIds?.some((i) => i.id === id))
    const msg = [
      `Renvoyer « ${offer.title ?? ''} » dans les annonces ?`,
      'La candidature est retirée de cet onglet.',
      docs.length ? `Ses ${docs.length} document(s) (CV, lettre) sont conservés dans « Documents ».` : '',
      status !== 'todo' ? `Attention : son suivi (statut « ${JOB_STATUS[status]} », relances, entretiens) sera perdu.` : '',
      live.length ? '' : "L'annonce n'est plus dans la veille (expirée ou retirée) : elle ne réapparaîtra que si elle est de nouveau publiée.",
    ]
      .filter(Boolean)
      .join('\n\n')
    if (!confirmAction(msg)) return
    markMany(sourceIds, 'none')
    removeOffer(offer.id)
    toast.ok(live.length ? "Annonce renvoyée dans « Annonces »" : 'Candidature retirée')
  }
  const add = useDocs((s) => s.add)
  const [cvModal, setCvModal] = useState(false)
  const [followUp, setFollowUp] = useState(false)
  const [planner, setPlanner] = useState(false)
  const [share, setShare] = useState(false)
  const [prep, setPrep] = useState(false)
  const [ivPlan, setIvPlan] = useState<false | true | 'add'>(false)
  const [analysing, setAnalysing] = useState(false)
  const [replying, setReplying] = useState(false)
  const [reportFor, setReportFor] = useState<string | null>(null)
  const [tab, setTab] = useState<'suivi' | 'docs' | 'echanges' | 'entreprise'>(offer.spontaneous ? 'entreprise' : 'suivi')
  // réponses Gmail montrées dans la candidature ouverte : gardées après la décision, pour pouvoir l'annuler
  const [kept, setKept] = useState<InboxItem[]>(() => (open ? keptMails.get(offer.id) ?? [] : []))
  useEffect(() => {
    setKept((k) => {
      if (!open) {
        keptMails.delete(offer.id)
        return k.length ? [] : k
      }
      const add = (mails ?? []).filter((m) => !k.some((x) => x.r.id === m.r.id))
      if (!add.length) return k
      keptMails.set(offer.id, [...k, ...add])
      return [...k, ...add]
    })
  }, [open, mails, offer.id])
  const minPay = useDocs((s) => s.watch.profile?.salary?.min)
  const pay = offerSalary(offer)
  const payTone = pay?.max && minPay ? (pay.max < minPay ? 'below' : 'ok') : ''
  const slots = datedInterviews(offer)
  const openRome = useRomeDrawer((s) => s.open)
  const linkedCv = docs.find((d): d is ResumeDoc => d.kind === 'resume')
  const scores = Object.entries(offer.scores ?? {}).filter(([id]) => docs.some((d) => d.id === id))
  const best = scores.length ? Math.max(...scores.map(([, v]) => v)) : undefined
  const next = nextStep(offer, docs)
  const sent = offer.statusAt?.applied
  const status = offer.status ?? 'todo'
  const sortedDocs = [...docs].sort((a, b) => Number(b.kind === 'resume') - Number(a.kind === 'resume') || b.updatedAt - a.updatedAt)

  const createLetter = () => {
    const l: LetterDoc = newLetter(linkedCv?.templateId ?? 'epure', !linkedCv, linkedCv, docName(offer))
    l.offerId = offer.id
    if (offer.company) l.recipient = { ...l.recipient, company: offer.company }
    if (offer.title) l.subject = `Candidature au poste de ${offer.title}`
    add(l)
    navigate(`/lettre/${l.id}`)
  }
  const act = () => {
    if (next.act === 'followup') setFollowUp(true)
    else if (next.act === 'planner') setPlanner(true)
    else if (next.act === 'prep') setPrep(true)
    else if (next.act === 'interview') setIvPlan(true)
    else if (next.act === 'analysis') setAnalysing(true)
    else if (next.act === 'report' && next.slot) setReportFor(next.slot)
    else if (next.act === 'cv') setCvModal(true)
    else onOpen(true)
  }
  const fu = followUpLabel(offer)

  return (
    <article
      data-offer={offer.id}
      className={`offer-row${open ? ' open' : ''}${narrow ? ' narrow' : ''}${next.stage === 'now' ? ' hot' : ''}${status === 'rejected' ? ' done' : ''}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, a, input, select, textarea, label, .or-open, .co-card, .menu-wrap')) return
        onOpen(!open)
      }}
    >
      <div className="or-line">
        <OfferLogo offer={offer} size={34} />
        <div className="or-main">
          <strong title={offer.title}>{offer.title || 'Offre sans titre'}</strong>
          <span>
            {offer.spontaneous && (
              <em className="spont-badge" title="Candidature spontanée">
                Spontanée
              </em>
            )}
            {offer.company || 'Entreprise ?'}
            {offer.spontaneous && offer.analysis?.fit !== undefined && (
              <>
                {' · '}
                <span className={`co-fit-inline ${offer.analysis.fit >= 70 ? 'ok' : offer.analysis.fit >= 50 ? 'mid' : 'low'}`} title="Adéquation selon Claude">
                  adéquation {offer.analysis.fit}
                </span>
              </>
            )}
            {pay && pay.max ? (
              <>
                {' · '}
                <span className={payTone ? `pay ${payTone}` : undefined} title={payTone === 'below' ? 'Sous votre salaire minimum' : 'Salaire annoncé'}>
                  {pay.text}
                </span>
              </>
            ) : null}
            {status === 'todo' ? ` · ajoutée ${since(offer.createdAt)}` : sent ? ` · envoyée ${since(sent)}` : ''}
          </span>
        </div>
        {!!mails?.length && (
          <button className={`mail-mark t-${mails[0].r.kind}`} onClick={() => onOpen(true)} title="Réponse lue dans Gmail, à confirmer">
            <Mail size={13} /> {MAIL_MARK[mails[0].r.kind]}
            {mails.length > 1 ? ` +${mails.length - 1}` : ''}
          </button>
        )}
        {!narrow && (
          <span className="or-status">
            <select className={`status-select st-${status}`} value={status} onChange={(e) => {
                const v = e.target.value as JobStatus
                saveOffer({ ...offer, status: v })
                // passage en entretien : on demande tout de suite la date, l'heure et le lieu
                if (v === 'interview' && !offer.interviews?.length) setIvPlan(true)
              }} aria-label="Statut de la candidature">
              {(Object.keys(JOB_STATUS) as JobStatus[]).map((k) => (
                <option key={k} value={k}>
                  {JOB_STATUS[k]}
                </option>
              ))}
            </select>
          </span>
        )}
        <button className={`or-next ${next.tone}`} onClick={act} title={next.title ?? (next.act === 'planner' && fu ? fu.title : undefined)}>
          {next.tone === 'hot' ? <BellRing size={13} /> : next.act === 'prep' ? <MessagesSquare size={13} /> : next.act === 'planner' ? <CalendarClock size={13} /> : null} {next.text}
        </button>
        <span className="or-docs">
          {sortedDocs.slice(0, 3).map((d) => (
            <button key={d.id} className={`or-doc ${d.kind}`} onClick={() => navigate(openPath(d))} title={d.name}>
              {d.kind === 'resume' ? 'CV' : 'Lettre'}
            </button>
          ))}
          {sortedDocs.length > 3 && <span className="muted small">+{sortedDocs.length - 3}</span>}
          {offer.share && (
            <button className="or-web" onClick={() => setShare(true)} title="Dossier en ligne pour le recruteur" aria-label="Dossier en ligne pour le recruteur">
              <Globe size={14} />
            </button>
          )}
        </span>
        {!narrow && (
          <span className={`or-ats ${best === undefined ? '' : best >= 75 ? 'good' : best >= 55 ? 'mid' : 'low'}`} title={best === undefined ? undefined : 'Meilleur score ATS des CV rattachés'}>
            {best ?? ''}
          </span>
        )}
        <Menu
          align="right"
          trigger={(t) => (
            <button className="icon-btn" onClick={t} title="Actions" aria-label="Actions">
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
              {offer.url && (
                <MenuItem
                  icon={<ExternalLink size={14} />}
                  onClick={() => {
                    close()
                    window.open(href(offer.url!), '_blank', 'noopener')
                  }}
                >
                  {offer.spontaneous ? 'Page carrières' : "Voir l'annonce"}
                </MenuItem>
              )}
              <MenuItem
                icon={<Globe size={14} />}
                onClick={() => {
                  close()
                  setShare(true)
                }}
              >
                {offer.share ? 'Dossier pour le recruteur (en ligne)' : 'Dossier pour le recruteur…'}
              </MenuItem>
              {status !== 'todo' && status !== 'rejected' && (
                <MenuItem
                  icon={<MailCheck size={14} />}
                  onClick={() => {
                    close()
                    setReplying(true)
                  }}
                >
                  Noter une réponse du recruteur…
                </MenuItem>
              )}
              {offer.spontaneous && (
                <MenuItem
                  icon={<Sparkles size={14} />}
                  onClick={() => {
                    close()
                    setAnalysing(true)
                  }}
                >
                  {offer.analysis ? "Refaire l'analyse de l'entreprise" : "Analyser l'entreprise"}
                </MenuItem>
              )}
              <MenuItem
                icon={<CalendarDays size={14} />}
                onClick={() => {
                  close()
                  setIvPlan(true)
                }}
              >
                {offer.interviews?.length ? 'Entretien : date, heure et lieu' : 'Planifier un entretien…'}
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
              {status === 'applied' && (
                <MenuItem
                  icon={<CalendarClock size={14} />}
                  onClick={() => {
                    close()
                    setPlanner(true)
                  }}
                >
                  Jour de candidature et relance
                </MenuItem>
              )}
              {status === 'applied' && (
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
              {sourceIds.length > 0 && (
                <MenuItem
                  icon={<Undo2 size={14} />}
                  onClick={() => {
                    close()
                    backToJobs()
                  }}
                >
                  Renvoyer dans les annonces
                </MenuItem>
              )}
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

      {open && (
        <div className="or-open tabbed">
          {kept.length > 0 && (
            <div className="or-mails">
              {kept.map((it) => (
                <ReplyCard key={it.r.id} item={mails?.find((m) => m.r.id === it.r.id) ?? it} compact offers={offers} />
              ))}
            </div>
          )}
          <div className="or-tabs" role="tablist" aria-label="Fiche de la candidature">
            {([
              ['suivi', 'Suivi'],
              ['docs', `Documents (${docs.length})`],
              ['echanges', `Échanges (${pastSteps(offer)})`],
              ...(offer.spontaneous ? [['entreprise', 'Entreprise']] : []),
            ] as [typeof tab, string][]).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="or-tab" role="tabpanel">
            {tab === 'suivi' && (
              <section>
                <p>
                  {[offer.location, offer.contract].filter(Boolean).join(' · ') || 'Lieu non précisé'}
                </p>
                <p>
                  <Euro size={13} className="muted" />{' '}
                  {pay ? (
                    <span className={payTone ? `pay ${payTone}` : undefined}>
                      {pay.text}
                      {pay.max ? ' brut annuel' : ''}
                      {payTone === 'below' && ' (sous votre minimum)'}
                    </span>
                  ) : (
                    <span className="muted">
                      Salaire non indiqué{' '}
                      <button className="link" onClick={onEdit}>
                        ajouter
                      </button>
                    </span>
                  )}
                </p>
                {(status === 'interview' || slots.length > 0) && (
                  <div className="or-iv">
                    {slots.map((s, i) => (
                      <div key={s.id} className={`iv-line${s.at < Date.now() - 2 * 3600000 && !s.done ? ' muted' : ''}`}>
                        <CalendarDays size={13} /> <strong>{slots.length > 1 ? `Entretien ${i + 1}` : 'Entretien'}</strong> {fmtShort(s.at)}
                        {s.at > Date.now() ? <span className="muted"> ({fmtIn(s.at)})</span> : ''}
                        {s.done && <span className={`feel-chip f-${s.feeling ?? 'none'}`}>{s.feeling ? FEELING[s.feeling].label : 'Passé'}</span>}
                        {s.at < Date.now() && (
                          <>
                            {' '}
                            <button className="link small" onClick={() => setReportFor(s.id)}>
                              {s.done ? (s.report ? 'modifier le compte rendu' : 'ajouter un compte rendu') : 'passé ? compte rendu'}
                            </button>
                          </>
                        )}
                        {slotWhere(s) && (
                          <>
                            <br />
                            <span className="small">
                              {s.mode === 'video' && s.place && /^https?:/i.test(s.place) ? (
                                <>
                                  {MODE_LABEL.video},{' '}
                                  <a href={s.place} target="_blank" rel="noreferrer">
                                    rejoindre
                                  </a>
                                  {s.with ? `, avec ${s.with}` : ''}
                                </>
                              ) : (
                                slotWhere(s)
                              )}
                            </span>
                          </>
                        )}
                        {s.report && (
                          <details className="iv-report">
                            <summary>Compte rendu</summary>
                            <p>{s.report}</p>
                          </details>
                        )}
                      </div>
                    ))}
                    {offer.answerBy && <p>Retour attendu le {new Date(offer.answerBy).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>}
                    <p>
                      {!slots.length && <span className="muted">Date de l'entretien non précisée </span>}
                      <button className="link" onClick={() => setIvPlan(true)}>
                        {slots.length ? 'modifier, ajouter une étape' : 'préciser'}
                      </button>
                    </p>
                  </div>
                )}
                {status === 'applied' && (
                  <p>
                    {fu ? fu.title.split('.')[0] : 'Pas de relance prévue'}{' '}
                    <button className="link" onClick={() => setPlanner(true)}>
                      changer
                    </button>
                  </p>
                )}
                {offer.share && (
                  <p className="ok-text">
                    Dossier en ligne pour le recruteur{' '}
                    <button className="link" onClick={() => setShare(true)}>
                      lien et réglages
                    </button>
                  </p>
                )}
                {!!offer.contacts?.length && <p>Contact : {offer.contacts.map((c) => [c.name, c.role, c.email].filter(Boolean).join(', ')).join(' ; ')}</p>}
                {offer.notes && <p className="muted">{offer.notes}</p>}
              </section>
            )}
            {tab === 'docs' && (
              <section>
                <div className="oc-docs">
                  {sortedDocs.map((d) => (
                    <button key={d.id} className="oc-doc" onClick={() => navigate(openPath(d))} title={d.name}>
                      <DocThumb doc={d} width={86} />
                      <span className={`kind-badge ${d.kind}`}>{d.kind === 'resume' ? 'CV' : 'Lettre'}</span>
                    </button>
                  ))}
                </div>
                <Menu
                  trigger={(t) => (
                    <button className="btn sm" onClick={t}>
                      <Plus size={14} /> Document <ChevronDown size={13} />
                    </button>
                  )}
                >
                  {(close) => (
                    <>
                      <MenuItem
                        icon={<FilePlus2 size={14} />}
                        onClick={() => {
                          close()
                          if (resumes.length) setCvModal(true)
                          else toast.error("Créez d'abord un CV dans l'onglet Documents")
                        }}
                      >
                        CV adapté à cette offre
                      </MenuItem>
                      <MenuItem
                        icon={<FileSignature size={14} />}
                        onClick={() => {
                          close()
                          createLetter()
                        }}
                      >
                        Lettre de motivation
                      </MenuItem>
                    </>
                  )}
                </Menu>
              </section>
            )}
            {tab === 'echanges' && <Timeline offer={offer} />}
            {tab === 'entreprise' && offer.spontaneous && <CompanyCard offer={offer} onAnalyse={() => setAnalysing(true)} />}
          </div>
          <section className="or-actions">
            <div className="row-gap wrap">
              {offer.url && (
                <a className="btn sm" href={href(offer.url)} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} /> {offer.spontaneous ? 'Page carrières' : "Voir l'annonce"}
                </a>
              )}
              <button className="btn sm" onClick={() => setIvPlan(true)}>
                <CalendarDays size={13} /> {offer.interviews?.length ? 'Entretien' : 'Planifier un entretien'}
              </button>
              <button className="btn sm" onClick={() => setPrep(true)}>
                <MessagesSquare size={13} /> {offer.interview ? 'Préparation' : "Préparer l'entretien"}
              </button>
              {status === 'applied' && (
                <button className="btn sm" onClick={() => setFollowUp(true)}>
                  <BellRing size={13} /> Relancer
                </button>
              )}
              {status !== 'todo' && status !== 'rejected' && (
                <button className="btn sm" onClick={() => setReplying(true)}>
                  <MailCheck size={13} /> Noter une réponse
                </button>
              )}
              <button className="btn sm" onClick={() => setShare(true)}>
                <Globe size={13} /> Dossier recruteur
              </button>
              <button className="btn sm ghost" onClick={onEdit}>
                <Pencil size={13} /> Modifier l'offre
              </button>
            </div>
          </section>
        </div>
      )}
      {cvModal && <NewCvForOffer offer={offer} resumes={resumes} onClose={() => setCvModal(false)} />}
      {followUp && <FollowUpModal offer={offer} onClose={() => setFollowUp(false)} />}
      {planner && <FollowUpPlanner offer={offer} onClose={() => setPlanner(false)} />}
      {share && <ShareModal offer={offer} onClose={() => setShare(false)} />}
      {prep && <InterviewModal offer={offer} onClose={() => setPrep(false)} />}
      {replying && <RecruiterUpdateModal offer={offer} onClose={() => setReplying(false)} onInterview={() => setIvPlan(true)} />}
      {analysing && <CompanyAnalysisModal offer={offer} onClose={() => setAnalysing(false)} />}
      {ivPlan && <InterviewPlanner offer={offer} addNext={ivPlan === 'add'} onClose={() => setIvPlan(false)} />}
      {reportFor && <InterviewReport offer={offer} slotId={reportFor} onClose={() => setReportFor(null)} onNext={() => setIvPlan('add')} />}
    </article>
  )
}

export function OffersView() {
  const offersMap = useDocs((s) => s.offers)
  setDefaultFollowUpDays(useDocs((s) => s.watch.profile?.followUpDays))
  setSilentDays(useDocs((s) => s.watch.profile?.silentDays))
  const inbox = useMailInbox()
  const mailsOf = useMemo(() => {
    const m = new Map<string, InboxItem[]>()
    for (const it of inbox.pending) if (it.offer) m.set(it.offer.id, [...(m.get(it.offer.id) ?? []), it])
    return m
  }, [inbox])
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
  const [spontaneous, setSpontaneous] = useState(false)
  const [analyseNew, setAnalyseNew] = useState<Offer | null>(null)
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [doneOpen, setDoneOpen] = useState(false)
  // candidature ouverte depuis une autre vue (carte des entreprises)
  useEffect(() => {
    const take = () => {
      const id = sessionStorage.getItem('resume-open-offer')
      if (!id) return
      sessionStorage.removeItem('resume-open-offer')
      setOpenId(id)
      setDoneOpen(true)
      setTimeout(() => document.querySelector(`[data-offer="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
    }
    take()
    window.addEventListener('resume-open-offer', take)
    return () => window.removeEventListener('resume-open-offer', take)
  }, [])
  // les plus récentes d'abord (date d'envoi, sinon de création)
  const offers = useMemo(() => Object.values(offersMap).sort((a, b) => (b.statusAt?.applied ?? b.createdAt) - (a.statusAt?.applied ?? a.createdAt)), [offersMap])
  const docs = useMemo(() => Object.values(docsMap), [docsMap])
  const resumes = useMemo(() => docs.filter((d): d is ResumeDoc => d.kind === 'resume').sort((a, b) => b.updatedAt - a.updatedAt), [docs])
  const docsOf = (o: Offer) => docs.filter((d) => d.offerId === o.id)
  const stageOf = (o: Offer) => nextStep(o, docsOf(o)).stage
  const nq = q.trim().toLowerCase()
  const searched = offers.filter((o) => !nq || `${o.title ?? ''} ${o.company ?? ''} ${o.location ?? ''}`.toLowerCase().includes(nq))
  const shown = searched.filter((o) => filter === 'all' || stageOf(o) === filter)
  const count = (st: Stage) => offers.filter((o) => stageOf(o) === st).length
  const editingOffer = editing ? offersMap[editing] : undefined
  const row = (o: Offer, narrow?: boolean) => (
    <OfferRow key={o.id} offer={o} docs={docsOf(o)} resumes={resumes} onEdit={() => setEditing(o.id)} open={openId === o.id} onOpen={(v) => setOpenId(v ? o.id : null)} narrow={narrow} mails={mailsOf.get(o.id)} offers={offers} />
  )
  const STAGES: { id: Stage; title: string; sub: string }[] = [
    { id: 'now', title: 'À faire maintenant', sub: 'relances dues, entretiens à préparer, candidatures à envoyer' },
    { id: 'wait', title: 'En attente de réponse', sub: 'la relance est proposée à la date prévue' },
    { id: 'interview', title: 'Entretiens', sub: 'à venir ou en attente du retour' },
    { id: 'done', title: 'Refusées', sub: 'repliées' },
  ]

  return (
    <>
      <div className="dash-filter">
        <div className="offer-counters" role="tablist" aria-label="Filtrer les candidatures">
          {([
            { id: 'all', n: offers.length, label: 'candidatures' },
            { id: 'now', n: count('now'), label: 'à faire maintenant' },
            { id: 'wait', n: count('wait'), label: 'en attente de réponse' },
            { id: 'interview', n: count('interview'), label: 'entretiens' },
            { id: 'done', n: count('done'), label: 'refusées' },
          ] as { id: Filter; n: number; label: string }[]).map((k) => (
            <button key={k.id} role="tab" aria-selected={filter === k.id} className={`oc-counter c-${k.id}${filter === k.id ? ' on' : ''}`} onClick={() => setFilter(k.id)}>
              <strong>{k.n}</strong>
              <span>{k.label}</span>
            </button>
          ))}
        </div>
        <div className="row-gap">
          <input className="input offer-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (poste, entreprise)" aria-label="Rechercher une candidature" />
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
              { value: 'cards', label: <List size={15} />, title: 'Liste par étapes' },
              { value: 'columns', label: <Columns3 size={15} />, title: 'Colonnes par statut' },
              { value: 'stats', label: <BarChart3 size={15} />, title: 'Statistiques de recherche' },
            ]}
          />
          <Menu
            align="right"
            trigger={(t) => (
              <button className="btn primary" onClick={t}>
                <Plus size={16} /> Candidature <ChevronDown size={14} />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  icon={<Link2 size={15} />}
                  onClick={() => {
                    close()
                    setImporting(true)
                  }}
                >
                  À une offre, depuis son lien
                </MenuItem>
                <MenuItem
                  icon={<Pencil size={15} />}
                  onClick={() => {
                    close()
                    const o = newOffer()
                    saveOffer(o)
                    setEditing(o.id)
                  }}
                >
                  À une offre, saisie à la main
                </MenuItem>
                <MenuItem
                  icon={<Building2 size={15} />}
                  onClick={() => {
                    close()
                    setSpontaneous(true)
                  }}
                >
                  Candidature spontanée
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>
      {!offers.length ? (
        <div className="empty-state">
          <Briefcase size={28} className="muted" />
          <h2>Aucune offre</h2>
          <p>Ajoutez une offre depuis son lien : vous y rattacherez ensuite un CV et une lettre de motivation, et suivrez l'avancement de la candidature.</p>
          <div className="row-gap">
            <button className="btn primary" onClick={() => setImporting(true)}>
              <Link2 size={16} /> Ajouter une offre
            </button>
            <button className="btn" onClick={() => setSpontaneous(true)}>
              <Building2 size={16} /> Candidature spontanée
            </button>
          </div>
        </div>
      ) : view === 'stats' ? (
        <OfferStats offers={offers} />
      ) : view === 'columns' ? (
        <div className={`offer-columns${openId && shown.some((o) => o.id === openId) ? ' has-open' : ''}`}>
          {(Object.keys(JOB_STATUS) as JobStatus[]).map((st) => {
            const col = shown.filter((o) => (o.status ?? 'todo') === st)
            return (
              <div key={st} className={`offer-col st-${st}`}>
                <h3>
                  {JOB_STATUS[st]} <span>{col.length}</span>
                </h3>
                {col.map((o) => row(o, true))}
              </div>
            )
          })}
        </div>
      ) : (
        <div className={`offer-list${openId && shown.some((o) => o.id === openId) ? ' has-open' : ''}`}>
          {!shown.length && <p className="muted">Aucune candidature ici{nq ? ' pour cette recherche' : ''}.</p>}
          {(filter === 'all' ? STAGES : STAGES.filter((g) => g.id === filter)).map((g) => {
            const items = shown.filter((o) => stageOf(o) === g.id)
            if (!items.length) return null
            const collapsed = g.id === 'done' && filter === 'all' && !doneOpen && !items.some((o) => o.id === openId) && !nq
            return (
              <section key={g.id} className={`job-zone oz-${g.id}`}>
                <div className="zone-head">
                  <span className="zone-dot" />
                  <h3>{g.title}</h3>
                  <span className="muted small">{g.sub}</span>
                  <span className="zone-line" />
                  <span className="muted small">{items.length}</span>
                  {g.id === 'done' && doneOpen && filter === 'all' && (
                    <button className="btn xs ghost" onClick={() => setDoneOpen(false)}>
                      Replier
                    </button>
                  )}
                </div>
                {collapsed ? (
                  <button className="zone-more" onClick={() => setDoneOpen(true)}>
                    Afficher les {items.length} candidature{items.length > 1 ? 's' : ''} refusée{items.length > 1 ? 's' : ''}
                  </button>
                ) : (
                  items.map((o) => row(o))
                )}
              </section>
            )
          })}
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
      {spontaneous && <SpontaneousModal onClose={() => setSpontaneous(false)} onCreated={(o) => setAnalyseNew(o)} />}
      {analyseNew && <CompanyAnalysisModal offer={useDocs.getState().offers[analyseNew.id] ?? analyseNew} onClose={() => setAnalyseNew(null)} />}
    </>
  )
}
