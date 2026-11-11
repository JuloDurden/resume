import { useEffect, useMemo, useState } from 'react'
import { Link2, Plus, Pin, ShieldBan, Flag, Wand2, BellRing, BookOpen, CalendarClock, Ban, Trash2, X, Target, Sparkles, Check, AlertTriangle, ArrowDownWideNarrow, Briefcase, ChevronDown, ChevronUp, Clock, Euro, ExternalLink, Eye, EyeOff, MapPin, RefreshCw, Search, Settings2, Star } from 'lucide-react'
import type { FeedItem, JobReview, MarkState, Offer, ResumeDoc } from '../../types'
import { useNavigate } from 'react-router-dom'
import { uid } from '../../lib/ids'
import { companyKey, groupJobs, titleKey } from '../../lib/dedupe'
import { JOB_STATUS } from '../../lib/jobs'
import { benchFor, compareSalary, fmtK, fmtSalary, salaryBenchmarks, salaryOf, type Salary, type SalaryBench } from '../../lib/salary'
import { redFlags, type RedFlag } from '../../lib/redflags'
import { applyLearning, titleSimilarity, locationOf, regionOf, REGIONS, prefFor, bestReference, learnFromMarks, geocode, matchBest, resolveProfile, scoreClass, type MatchResult } from '../../lib/match'
import { ClaudeRankModal, MatchProfileModal } from './MatchTools'
import { AddJobModal } from './AddJobModal'
import { useDocs } from '../../store/documents'
import { useFeed } from '../../store/feed'
import { useSync } from '../../store/sync'
import { ago, offerFromItem } from '../../lib/watch'
import { useRomeDrawer } from '../RomeDrawer'
import { AlertsModal } from './AlertsModal'
import { Modal, Segmented, toast } from '../ui'

type Filter = 'new' | 'fav' | 'applied' | 'hidden' | 'out'

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/** Vrai si l'annonce contient un des termes exclus (au début d'un mot, sans tenir compte des accents). */
export function excluded(item: FeedItem, terms: string[], titleOnly = false): boolean {
  if (!terms.length) return false
  const hay = ` ${norm(titleOnly ? item.title : `${item.title} ${item.company ?? ''} ${item.contract ?? ''}`).replace(/[^a-z0-9]+/g, ' ')} `
  return terms.some((t) => {
    const k = norm(t).replace(/[^a-z0-9]+/g, ' ').trim()
    return k && hay.includes(` ${k}`)
  })
}

function TermInput({ terms, onAdd, placeholder }: { terms: string[]; onAdd: (t: string[]) => void; placeholder: string }) {
  const [v, setV] = useState('')
  const add = () => {
    const parts = v
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x && !terms.some((t) => norm(t) === norm(x)))
    if (parts.length) onAdd(parts)
    setV('')
  }
  return (
    <input
      className="exclude-input"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault()
          add()
        }
      }}
      onBlur={add}
      placeholder={placeholder}
    />
  )
}

/** Filtre rapide (le temps de la visite) : titre, entreprise ou contrat. Une épingle le rend définitif. */
function ExcludeBar({ terms, onChange, count, onPin, banned, onManage }: { terms: string[]; onChange: (t: string[]) => void; count: number; onPin: (t: string) => void; banned: number; onManage: () => void }) {
  return (
    <div className="exclude-bar">
      <span className="muted small" title="Masque le temps de la visite les annonces dont le titre, l'entreprise ou le contrat contient ces mots">
        <Ban size={13} /> Filtrer :
      </span>
      {terms.map((t) => (
        <span key={t} className="exclude-chip">
          {t}
          <button title={`Exclure « ${t} » définitivement (titre des annonces)`} onClick={() => onPin(t)}>
            <Pin size={12} />
          </button>
          <button title={`Ne plus filtrer « ${t} »`} onClick={() => onChange(terms.filter((x) => x !== t))}>
            <X size={12} />
          </button>
        </span>
      ))}
      <TermInput terms={terms} onAdd={(p) => onChange([...terms, ...p])} placeholder={terms.length ? 'Ajouter un mot' : 'Filtre rapide : ex. alternance, B2B (Entrée pour valider)'} />
      {count > 0 && <span className="muted small">{count} masquée{count > 1 ? 's' : ''} par le filtre</span>}
      <button className="btn sm ghost" onClick={onManage} title="Mots qui retirent définitivement les annonces dont le titre les contient">
        <ShieldBan size={14} /> Mots exclus ({banned})
      </button>
    </div>
  )
}

/** Liste des mots exclus définitivement, avec le nombre d'annonces retirées par chacun. */
function BannedModal({ open, onClose, terms, onChange, all }: { open: boolean; onClose: () => void; terms: string[]; onChange: (t: string[]) => void; all: FeedItem[] }) {
  return (
    <Modal open={open} onClose={onClose} title="Mots exclus définitivement">
      <div className="form-stack">
        <p className="muted small">
          Toute annonce dont le <strong>titre</strong> contient un de ces mots est retirée de la liste, sans être supprimée : retirez le mot pour la voir à nouveau. Les favoris et les candidatures ne sont jamais retirés. La liste est synchronisée entre vos navigateurs.
        </p>
        <div className="exclude-bar">
          <TermInput terms={terms} onAdd={(p) => onChange([...terms, ...p])} placeholder="Ajouter un mot, ex. immobilier (Entrée pour valider)" />
        </div>
        {terms.length ? (
          <ul className="banned-list">
            {terms.map((t) => {
              const n = all.filter((i) => excluded(i, [t], true)).length
              return (
                <li key={t}>
                  <strong>{t}</strong>
                  <span className="muted small">
                    {n} annonce{n > 1 ? 's' : ''} retirée{n > 1 ? 's' : ''}
                  </span>
                  <button className="btn sm ghost" onClick={() => onChange(terms.filter((x) => x !== t))}>
                    <Eye size={13} /> Retirer le mot
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="muted small">Aucun mot exclu pour le moment.</p>
        )}
      </div>
    </Modal>
  )
}

/** Recherche web de l'offre (intitulé, entreprise, ville), quand le lien de l'email ne mène plus à l'annonce. */
const findUrl = (i: FeedItem) => {
  const title = i.title.replace(/\s*[(-]?\s*\b[hfHF]\s*\/\s*[hfHF](\s*\/\s*\w+)?\s*\)?/g, '').trim()
  return `https://www.google.com/search?q=${encodeURIComponent([`"${title}"`, i.company, (i.location ?? '').replace(/\(.*?\)/g, '').trim(), 'emploi'].filter(Boolean).join(' '))}`
}

type SalaryInfo = { s?: Salary; cmp?: ReturnType<typeof compareSalary>; bench?: SalaryBench }
const benchLabel = (b: SalaryBench) => `médiane « ${b.family} »${b.region ? `, ${REGIONS[b.region] ?? 'région'}` : ', toutes régions'} : ${fmtK(b.median)} (${b.n} annonces)`

function Insights({ salary, flags }: { salary?: SalaryInfo; flags: RedFlag[] }) {
  return (
    <div className="insights">
      <div className="insight-row">
        <Euro size={13} />
        {salary?.s ? (
          <span>
            Salaire : <strong>{fmtSalary(salary.s)}</strong> brut annuel
            {salary.cmp ? <span className={`sal-cmp ${salary.cmp.tone}`}> {salary.cmp.label}</span> : <span className="muted"> (pas encore assez d'annonces comparables pour situer ce salaire)</span>}
          </span>
        ) : salary?.bench ? (
          <span>
            Salaire non indiqué. Repère : <strong>{fmtK(salary.bench.median)}</strong> brut annuel, {benchLabel(salary.bench).replace(/ : .*?\(/, ' (')}
          </span>
        ) : (
          <span className="muted">Salaire non indiqué, et pas encore assez d'annonces comparables pour donner un repère.</span>
        )}
      </div>
      {flags.length > 0 && (
        <div className="flags">
          <strong>
            <Flag size={13} /> Points à surveiller ({flags.length})
          </strong>
          <ul>
            {flags.map((f) => (
              <li key={f.label} className={`lvl${f.level}`}>
                <b>{f.label}</b>
                {f.quote && <em> {f.quote}</em>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Rattacher l'annonce à une candidature déjà créée (offres triées par proximité avec l'annonce). */
function LinkPicker({ offers, item, onPick }: { offers: Offer[]; item: FeedItem; onPick: (o: Offer) => void }) {
  const [open, setOpen] = useState(false)
  const sorted = useMemo(
    () => [...offers].sort((a, b) => Number(companyKey(b.company) === companyKey(item.company)) - Number(companyKey(a.company) === companyKey(item.company)) || titleSimilarity(item.title, b.title ?? '') - titleSimilarity(item.title, a.title ?? '')),
    [offers, item],
  )
  return (
    <span className="link-picker">
      <button className="btn sm ghost" onClick={() => setOpen((o) => !o)} title="Vous avez déjà postulé : rattacher cette annonce à la candidature existante">
        <Link2 size={13} /> Déjà postulé
      </button>
      {open && (
        <div className="menu link-menu">
          {sorted.slice(0, 12).map((o) => (
            <button
              key={o.id}
              className="menu-item"
              onClick={() => {
                setOpen(false)
                onPick(o)
              }}
            >
              <strong>{o.title ?? 'Sans titre'}</strong>
              <span className="muted small">
                {o.company ?? ''} · {JOB_STATUS[o.status ?? 'todo']}
              </span>
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

/** Coller le texte d'une annonce que le site ne fournit pas (France Travail, Glassdoor...) : la note est recalculée. */
function PasteText({ item }: { item: FeedItem & { pasted?: boolean } }) {
  const setText = useDocs((s) => s.setText)
  const [open, setOpen] = useState(false)
  const [v, setV] = useState('')
  const short = !item.fullText || item.fullText.length < 600 || !!item.facts?.summaryOnly
  if (!short && !item.pasted) return null
  if (item.pasted && !open)
    return (
      <p className="muted small">
        Texte collé par vous.{' '}
        <button className="link" onClick={() => setText(item.id, '')}>
          Retirer
        </button>
      </p>
    )
  return open ? (
    <div className="paste-box">
      <textarea className="input" rows={7} value={v} onChange={(e) => setV(e.target.value)} placeholder="Ouvrez l'annonce, copiez tout son texte (Ctrl+A, Ctrl+C) et collez-le ici." autoFocus />
      <div className="row-gap">
        <button
          className="btn sm primary"
          disabled={v.trim().length < 200}
          onClick={() => {
            setText(item.id, v)
            setOpen(false)
            toast.ok('Texte enregistré : note recalculée')
          }}
        >
          Enregistrer le texte
        </button>
        <button className="btn sm ghost" onClick={() => setOpen(false)}>
          Annuler
        </button>
      </div>
    </div>
  ) : (
    <p className="muted small">
      {item.fullText ? 'Seul un résumé de cette annonce a pu être lu.' : "Le site ne fournit pas le texte de cette annonce."}{' '}
      <button className="link" onClick={() => setOpen(true)}>
        Coller le texte de l'annonce
      </button>
    </p>
  )
}

function MatchDetails({ m, review, tracks, onTrack }: { m: MatchResult; review?: JobReview; tracks?: { id: string; name: string }[]; onTrack?: (id: string) => void }) {
  const pct = (v: number) => `${Math.round(v * 100)} %`
  return (
    <div className="match-details">
      {!!m.capped && (
        <p className="match-capped">
          <AlertTriangle size={13} /> Texte complet de l'annonce non lu : expérience et diplôme demandés inconnus, note plafonnée à {m.capped}. Collez le texte ci-dessous pour une note juste.
        </p>
      )}
      {m.out && (
        <p className="match-out">
          <AlertTriangle size={13} /> Hors critères : {m.out}. Note ramenée à 0.
        </p>
      )}
      <div className="match-chips">
        {m.track && (
          <span
            className="track"
            title={`${m.track.forced ? 'Profil choisi par vous' : "Profil déduit de l'intitulé et des missions décrites"}${m.track.nature?.length ? ` (missions repérées : ${m.track.nature.map((n) => `${n.hits} ${n.label}`).join(', ')})` : ''}`}
          >
            <Briefcase size={12} /> Profil{' '}
            {tracks && onTrack ? (
              <select className="track-select" value={m.track.forced ? m.track.id : ''} onChange={(e) => onTrack(e.target.value)} onClick={(e) => e.stopPropagation()}>
                <option value="">{m.track.forced ? 'automatique' : `${m.track.name} (auto)`}</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              m.track.name
            )}
          </span>
        )}
        <span className={m.title.v >= 0.75 ? 'ok' : m.title.v >= 0.4 ? 'mid' : 'no'} title="Intitulé comparé à vos métiers visés">
          <Target size={12} /> Intitulé {pct(m.title.v)}
          {m.title.target && m.title.v > 0 ? ` (${m.title.target})` : ''}
          {m.title.other ? `, autre métier : « ${m.title.other} »` : ''}
        </span>
        {m.skills ? (
          <span className={m.skills.v >= 0.5 ? 'ok' : m.skills.v >= 0.25 ? 'mid' : 'no'} title={m.skills.matched.join(', ') || 'Aucune compétence du CV trouvée'}>
            <Check size={12} /> Compétences {m.skills.matched.length}/{m.skills.total}
          </span>
        ) : (
          <span className="na" title="Le texte complet de l'annonce n'est pas disponible">Compétences : texte indisponible</span>
        )}
        <span className={m.level.v >= 0.8 ? 'ok' : m.level.v >= 0.45 ? 'mid' : 'no'} title={`${m.level.quote ? `« ${m.level.quote} »\n` : ''}Niveau visé pour ce métier : ${m.level.pref === 'junior' ? 'junior ou débutant' : m.level.pref === 'senior' ? 'confirmé ou management' : 'tous niveaux'} (réglable dans chaque alerte ou profil)`}>
          {m.level.label}
        </span>
        <span className={m.place.v >= 0.85 ? 'ok' : m.place.v >= 0.5 ? 'mid' : 'no'}>
          <MapPin size={12} /> {m.place.label}
        </span>
        {!!m.learned && (
          <span className={m.learned > 0 ? 'ok' : 'no'} title="Selon les annonces que vous avez mises en favori, en candidature ou masquées">
            {m.learned > 0 ? '+' : ''}
            {m.learned} selon vos choix
          </span>
        )}
        {m.degree && (
          <span className="no">
            <AlertTriangle size={12} /> Bac+{m.degree.required} {m.degree.strict ? 'exigé' : 'demandé'}
          </span>
        )}
      </div>
      {m.skills && m.skills.matched.length > 0 && <p className="small muted">Compétences retrouvées : {m.skills.matched.join(', ')}</p>}
      {review && (
        <div className="review-box">
          <strong>
            <Sparkles size={13} /> Avis de Claude : {review.score}/100
          </strong>
          {review.verdict && <p>{review.verdict}</p>}
          <div className="review-cols">
            {!!review.pros?.length && (
              <ul className="pros">
                {review.pros.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            {!!review.cons?.length && (
              <ul className="cons">
                {review.cons.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
          </div>
          {review.tip && <p className="small"><strong>Conseil :</strong> {review.tip}</p>}
        </div>
      )}
    </div>
  )
}

function JobCard({ item, tracks, onTrack, linked, offers, onLink, degraded, salary, flags, others, mark, onMark, alertNames, onApply, onTailor, isNew, selected, onSelect, match, review }: { item: FeedItem; tracks?: { id: string; name: string }[]; onTrack?: (id: string) => void; linked?: { offer: Offer; sure: boolean }; offers: Offer[]; onLink: (o: Offer) => void; degraded?: boolean; salary?: SalaryInfo; flags: RedFlag[]; others: FeedItem[]; mark: MarkState; onMark: (s: MarkState) => void; alertNames: string[]; onApply: () => void; onTailor: () => void; isNew: boolean; selected: boolean; onSelect: (v: boolean) => void; match?: MatchResult; review?: JobReview }) {
  const openRome = useRomeDrawer((s) => s.open)
  const [open, setOpen] = useState(false)
  return (
    <article className={`job-card${mark === 'hidden' ? ' hidden' : ''}${selected ? ' selected' : ''}`}>
      <div className="jc-head">
        <input type="checkbox" className="jc-check" checked={selected} onChange={(e) => onSelect(e.target.checked)} title="Sélectionner" />
        {item.logo ? <img className="offer-logo" src={item.logo} alt="" width={36} height={36} /> : <span className="offer-logo fallback" style={{ width: 36, height: 36, fontSize: 16 }}>{(item.company ?? item.title).charAt(0).toUpperCase()}</span>}
        <div className="jc-title">
          <strong>
            {isNew && <span className="new-dot" title="Nouvelle depuis votre dernière visite" />}
            {item.closed && <span className="jc-closed">Expirée</span>}
            {item.title}
          </strong>
          <span>{item.company ?? 'Entreprise non communiquée'}</span>
        </div>
        {review && (
          <span className={`match-badge claude ${scoreClass(review.score)}`} title={`Avis de Claude : ${review.verdict ?? ''}`}>
            <Sparkles size={11} /> {review.score}
          </span>
        )}
        {match && (
          <button className={`match-badge ${scoreClass(match.score)}${match.capped ? ' capped' : ''}`} title={match.capped ? `Note plafonnée à ${match.capped} : texte complet de l'annonce non lu (détails)` : `Indice de correspondance avec votre profil${match.track ? ` « ${match.track.name} »` : ''} (détails)`} onClick={() => setOpen((o) => !o)}>
            {match.score}
            {match.capped ? '?' : ''}
            {match.track && !match.out && <small className="badge-track">{match.track.name}</small>}
          </button>
        )}
        <button className={`icon-btn${mark === 'fav' ? ' fav' : ''}`} title={mark === 'fav' ? 'Retirer des favoris' : 'Mettre en favori'} onClick={() => onMark(mark === 'fav' ? 'none' : 'fav')}>
          <Star size={17} fill={mark === 'fav' ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="jc-meta">
        {(() => {
          const w = locationOf(item)
          return w.loc ? (
            <span title={w.fromText ? `Le site indique « ${item.location ?? 'aucun lieu'} » ; lieu lu dans le texte de l'annonce` : undefined}>
              <MapPin size={12} /> {w.loc}
              {w.fromText ? ' *' : ''}
            </span>
          ) : null
        })()}
        {item.contract && (
          <span>
            <Briefcase size={12} /> {item.contract}
            {item.worktime ? `, ${item.worktime.toLowerCase()}` : ''}
          </span>
        )}
        {salary?.s || item.salary ? (
          <span className={salary?.cmp ? `sal-cmp ${salary.cmp.tone}` : undefined} title={salary?.cmp?.label}>
            <Euro size={12} /> {salary?.s ? fmtSalary(salary.s) : item.salary}
            {salary?.cmp?.tone === 'low' ? ' ↓' : salary?.cmp?.tone === 'high' ? ' ↑' : ''}
            {salary?.bench && <span className="muted"> · médiane {fmtK(salary.bench.median)}</span>}
          </span>
        ) : (
          salary?.bench && (
            <span className="muted" title={`Salaire non indiqué. ${benchLabel(salary.bench)}`}>
              <Euro size={12} /> ≈ {fmtK(salary.bench.median)} (médiane)
            </span>
          )
        )}
        {flags.length > 0 && (
          <span className={`jc-flags lvl${Math.max(...flags.map((f) => f.level))}`} title={flags.map((f) => f.label).join(', ')}>
            <Flag size={12} /> {flags.length} point{flags.length > 1 ? 's' : ''} à surveiller
          </span>
        )}
        <span>
          <Clock size={12} /> {ago(item.date)}
        </span>
        {item.until && (
          <span className={new Date(item.until).getTime() - Date.now() < 7 * 86400000 ? 'jc-until' : undefined}>
            <CalendarClock size={12} /> jusqu'au {new Date(item.until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>
      <div className="jc-tags">
        <span className="jc-source">{item.source.replace(' (alerte email)', '')}</span>
        {others.map((o) => (
          <a key={o.id} className="jc-source also" href={o.url} target="_blank" rel="noreferrer" title="Même offre publiée sur un autre site">
            + {o.source.replace(' (alerte email)', '')}
          </a>
        ))}
        {alertNames.filter((n) => n !== 'Alerte email').map((n) => (
          <span key={n} className="jc-alert">
            {n}
          </span>
        ))}
      </div>
      {degraded && <p className="jc-degraded">Le site {item.source.replace(' (alerte email)', '')} est en mode dégradé en ce moment : ses liens peuvent afficher « offre indisponible ». Réessayez plus tard ou utilisez « Retrouver ».</p>}
      {open && (
        <div className="jc-open">
          {match && <MatchDetails m={match} review={review} tracks={tracks} onTrack={onTrack} />}
          <Insights salary={salary} flags={flags} />
          {item.fullText ? (
            <details className="jc-full" open>
              <summary>Texte complet de l'annonce</summary>
              <div className="jc-desc">{item.fullText}</div>
            </details>
          ) : (
            item.description && <p className="jc-desc">{item.description}</p>
          )}
          <PasteText item={item} />
        </div>
      )}
      <div className="jc-actions">
        {linked?.sure ? (
          <span className="applied-badge" title={linked.offer.title}>
            Candidature : {JOB_STATUS[linked.offer.status ?? 'todo'].toLowerCase()}
          </span>
        ) : linked ? (
          <span className="link-suggest">
            Déjà une candidature « {linked.offer.title} » ?{' '}
            <button className="btn sm" onClick={() => onLink(linked.offer)}>
              <Link2 size={13} /> Rattacher
            </button>
          </span>
        ) : mark === 'applied' ? (
          <span className="applied-badge">Candidature créée</span>
        ) : (
          <button className="btn sm primary" onClick={onApply}>
            Créer la candidature
          </button>
        )}
        {!linked?.sure && mark !== 'applied' && offers.length > 0 && <LinkPicker offers={offers} item={item} onPick={onLink} />}
        <button className="btn sm claude" onClick={onTailor} title="Crée la candidature et une copie de votre CV de référence, puis ouvre l'adaptation avec Claude">
          <Wand2 size={13} /> CV adapté
        </button>
        <a className="btn sm" href={item.url} target="_blank" rel="noreferrer" title={degraded ? 'Le site est en mode dégradé : le lien peut afficher « offre indisponible » sans que l\'offre soit supprimée' : undefined}>
          <ExternalLink size={13} /> Annonce{degraded ? ' ⚠' : ''}
        </a>
        <a className="btn sm ghost" href={findUrl(item)} target="_blank" rel="noreferrer" title="Lien cassé ou annonce introuvable : retrouver l'offre ailleurs (site de l'employeur, autres sites d'emploi)">
          <Search size={13} /> Retrouver
        </a>
        {(
          <button className="btn sm ghost" onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {open ? 'Réduire' : 'Détails'}
          </button>
        )}
        {item.rome && (
          <button className="btn sm ghost" title={item.romeLabel} onClick={() => openRome({ code: item.rome, query: item.title, label: 'Fiche métier du poste' })}>
            <BookOpen size={13} /> Fiche métier
          </button>
        )}
        <span className="spacer" />
        {mark === 'hidden' ? (
          <>
            <button className="btn sm ghost" onClick={() => onMark('none')}>
              <Eye size={13} /> Restaurer
            </button>
            <button className="btn sm ghost danger" onClick={() => onMark('deleted')} title="Supprimer définitivement cette annonce">
              <Trash2 size={13} /> Supprimer
            </button>
          </>
        ) : (
          mark !== 'applied' && (
            <>
              <button className="btn sm ghost" onClick={() => onMark('hidden')} title="Ne plus afficher cette annonce (récupérable dans « Masquées »)">
                <EyeOff size={13} /> Masquer
              </button>
              <button className="btn sm ghost danger icon-only" onClick={() => onMark('deleted')} title="Supprimer définitivement cette annonce">
                <Trash2 size={14} />
              </button>
            </>
          )
        )}
      </div>
    </article>
  )
}

export function JobsView({ onShowOffers }: { onShowOffers: () => void }) {
  const feed = useFeed((s) => s.feed)
  const seenAt = useFeed((s) => s.seenAt)
  const markSeen = useFeed((s) => s.markSeen)
  const watch = useDocs((s) => s.watch)
  const saveOffer = useDocs((s) => s.saveOffer)
  const setTrackFor = useDocs((s) => s.setTrackFor)
  const offers = useDocs((s) => s.offers)
  const addDoc = useDocs((s) => s.add)
  const navigate = useNavigate()
  const markMany = useDocs((s) => s.markMany)
  const setExcludes = useDocs((s) => s.setExcludes)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const syncStatus = useSync((s) => s.status)
  const runSync = useSync((s) => s.run)
  const [filter, setFilter] = useState<Filter>('new')
  const [alert, setAlert] = useState<string>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'date' | 'score'>(() => {
    try {
      return localStorage.getItem('resume-jobs-sort') === 'score' ? 'score' : 'date'
    } catch {
      return 'date'
    }
  })
  const [profileOpen, setProfileOpen] = useState(false)
  const [claudeOpen, setClaudeOpen] = useState(false)
  const [geoTick, setGeoTick] = useState(0)
  const docsMap = useDocs((s) => s.docs)
  const [settings, setSettings] = useState(false)
  // date de la visite précédente, lue une fois le stockage local chargé (pour signaler les nouveautés)
  const [lastSeen, setLastSeen] = useState(0)
  useEffect(() => {
    const go = () => {
      setLastSeen(useFeed.getState().seenAt)
      markSeen()
    }
    const unsub = useFeed.persist.hasHydrated() ? (go(), undefined) : useFeed.persist.onFinishHydration(go)
    return () => {
      unsub?.()
      markSeen()
    }
  }, [markSeen])
  void seenAt

  // mots exclus définitivement (titre, synchronisés) et filtre rapide (le temps de la visite)
  const terms = useMemo(() => watch.excludes ?? [], [watch.excludes])
  const [quick, setQuick] = useState<string[]>([])
  const [bannedOpen, setBannedOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  // annonces de la veille + annonces ajoutées à la main pas encore traitées par la veille
  const all = useMemo(() => {
    const fromFeed = feed?.items ?? []
    const ids = new Set(fromFeed.map((i) => i.id))
    const texts = watch.texts ?? {}
    return [...(watch.manual ?? []).filter((m) => !ids.has(m.id)), ...fromFeed]
      .filter((i) => watch.marks[i.id]?.s !== 'deleted')
      .map((i) => (texts[i.id] ? { ...i, fullText: texts[i.id], facts: { ...i.facts, summaryOnly: false }, pasted: true } : i))
  }, [feed, watch.marks, watch.manual, watch.texts])
  // les termes exclus ne cachent pas les favoris ni les candidatures
  const kept = (i: FeedItem) => ['fav', 'applied'].includes(watch.marks[i.id]?.s ?? '')
  const unbanned = useMemo(() => all.filter((i) => kept(i) || !excluded(i, terms, true)), [all, terms, watch.marks]) // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(() => unbanned.filter((i) => kept(i) || !excluded(i, quick)), [unbanned, quick, watch.marks]) // eslint-disable-line react-hooks/exhaustive-deps
  const excludedCount = unbanned.length - items.length
  // une même offre reçue par plusieurs sites : une seule carte
  const groups = useMemo(() => groupJobs(items), [items])
  const groupOf = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])
  const RANK: MarkState[] = ['applied', 'fav', 'none', 'hidden']
  const groupMark = (id: string): MarkState => {
    const ms = (groupOf.get(id)?.members ?? [{ id }]).map((m) => watch.marks[m.id]?.s ?? 'none')
    return RANK.find((r) => ms.includes(r)) ?? 'none'
  }
  const expand = (ids: string[]) => ids.flatMap((id) => groupOf.get(id)?.members.map((m) => m.id) ?? [id])
  const titlesOf = (ids: string[]) => Object.fromEntries(expand(ids).map((id) => [id, items.find((i) => i.id === id)?.title ?? '']))
  const markGroup = (ids: string[], st: MarkState) => markMany(expand(ids), st, titlesOf(ids))
  const gitems = useMemo(() => groups.map((g) => g.item), [groups])
  const names = useMemo<Record<string, string>>(() => ({ email: 'Alerte email', manual: 'Ajout manuel', ...Object.fromEntries(watch.alerts.map((a) => [a.id, a.keywords])) }), [watch.alerts])
  const markOf = groupMark
  const nq = q.trim().toLowerCase()
  const cvs = useMemo(() => Object.values(docsMap).filter((d): d is ResumeDoc => d.kind === 'resume'), [docsMap])
  const profile = useMemo(() => resolveProfile(watch.profile, cvs, watch.alerts), [watch.profile, cvs, watch.alerts, geoTick]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => geocode([...items.map((i) => locationOf(i).loc), ...(feed?.salaryLog ?? []).map((e) => e.location), watch.alerts[0]?.commune], () => setGeoTick((t) => t + 1)), [items, watch.alerts, feed, geoTick])
  const learned = useMemo(() => {
    const titles = new Map((feed?.items ?? []).map((i) => [i.id, i.title]))
    return learnFromMarks(Object.fromEntries(Object.entries(watch.marks).map(([id, m]) => [id, m.t ? m : { ...m, t: titles.get(id) }])))
  }, [watch.marks, feed])
  const matches = useMemo(() => Object.fromEntries(gitems.map((i) => [i.id, applyLearning(matchBest(i, profile, prefFor(i, watch.alerts), watch.trackFor?.[i.id]?.v || undefined), i, learned)])), [gitems, profile, geoTick, learned, watch.alerts, watch.trackFor]) // eslint-disable-line react-hooks/exhaustive-deps
  const reviews = watch.reviews ?? {}
  // repère de salaire : médiane des annonces reçues pour le même métier visé
  const familyOf = (i: FeedItem) => (matches[i.id] && matches[i.id].title.v >= 0.6 ? matches[i.id].title.target : undefined)
  const benches = useMemo(() => {
    // annonces en cours + historique de l'année (annonces supprimées comprises)
    const seen = new Set(gitems.map((i) => i.id))
    const past: FeedItem[] = (feed?.salaryLog ?? []).filter((e) => !seen.has(e.id)).map((e) => ({ id: e.id, title: e.title, location: e.location, salary: e.salary, alerts: [], url: '', source: '' }))
    const fam = (i: FeedItem) => matches[i.id] ? familyOf(i) : (() => { const t = profile.targets.map((x) => [x, titleSimilarity(i.title, x)] as const).sort((a, b) => b[1] - a[1])[0]; return t && t[1] >= 0.6 ? t[0] : undefined })()
    return salaryBenchmarks([...gitems, ...past], fam, regionOf)
  }, [gitems, matches, geoTick, feed, profile]) // eslint-disable-line react-hooks/exhaustive-deps
  const salaries = useMemo(
    () =>
      Object.fromEntries(
        gitems.map((i) => {
          const s = salaryOf(i)
          const bench = benchFor(benches, familyOf(i), regionOf(i))
          return [i.id, s ? { s, bench, cmp: compareSalary(s, bench, (c) => REGIONS[c] ?? 'région') } : bench ? { bench } : undefined]
        }),
      ),
    [gitems, benches], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const flagsOf = useMemo(() => Object.fromEntries(gitems.map((i) => [i.id, redFlags(i)])), [gitems])
  const rank = (i: FeedItem) => reviews[i.id]?.score ?? matches[i.id]?.score ?? 0
  // onglet de chaque annonce : son marquage, ou « hors critères » (note 0) si elle n'est pas encore triée
  // candidature déjà créée pour cette annonce : liée (veille, rattachement manuel) ou même poste chez la même entreprise
  const offersList = useMemo(() => Object.values(offers), [offers])
  const linkedOffer = useMemo(() => {
    const map: Record<string, { offer: Offer; sure: boolean }> = {}
    for (const g of groups) {
      const ids = g.members.map((m) => m.id)
      const sure = offersList.find((o) => (o.sourceId && ids.includes(o.sourceId)) || o.jobIds?.some((x) => ids.includes(x)))
      if (sure) {
        map[g.id] = { offer: sure, sure: true }
        continue
      }
      const ck = companyKey(g.item.company)
      const tk = titleKey(g.item.title)
      const same = (o: Offer) => { const oc = companyKey(o.company); return !!oc && (oc === ck || oc.startsWith(`${ck} `) || ck.startsWith(`${oc} `)) }
      const exact = ck ? offersList.find((o) => same(o) && titleKey(o.title ?? '') === tk) : undefined
      if (exact) {
        map[g.id] = { offer: exact, sure: true }
        continue
      }
      const guess = ck ? offersList.find((o) => same(o) && titleSimilarity(g.item.title, o.title ?? '') >= 0.6 && titleSimilarity(o.title ?? '', g.item.title) >= 0.6) : undefined
      if (guess) map[g.id] = { offer: guess, sure: false }
    }
    return map
  }, [groups, offersList])
  const tabOf = (id: string): Filter => {
    if (linkedOffer[id]?.sure) return 'applied'
    const m = markOf(id)
    if (m === 'none') return matches[id]?.out ? 'out' : 'new'
    return m as Filter
  }
  const counts = useMemo(() => {
    const c = { new: 0, fav: 0, applied: 0, hidden: 0, out: 0 }
    for (const i of gitems) {
      const t = tabOf(i.id)
      if (t in c) c[t as keyof typeof c]++
    }
    return c
  }, [gitems, watch.marks, matches]) // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = gitems.filter((i) => {
    if (tabOf(i.id) !== filter) return false
    if (alert !== 'all' && !i.alerts.includes(alert)) return false
    if (nq && !`${i.title} ${i.company ?? ''} ${i.location ?? ''}`.toLowerCase().includes(nq)) return false
    return true
  })
  const shown = sort === 'score' ? [...filtered].sort((a, b) => rank(b) - rank(a)) : filtered

  useEffect(() => setSelected(new Set()), [filter, alert, q, terms, quick])
  const shownIds = shown.map((i) => i.id)
  const sel = shownIds.filter((id) => selected.has(id))
  const allSel = shownIds.length > 0 && sel.length === shownIds.length
  const toggle = (id: string, v: boolean) =>
    setSelected((p) => {
      const n = new Set(p)
      if (v) n.add(id)
      else n.delete(id)
      return n
    })
  const bulk = (st: MarkState, msg: string) => {
    markGroup(sel, st)
    toast.ok(`${sel.length} annonce${sel.length > 1 ? 's' : ''} ${msg}`)
    setSelected(new Set())
  }
  const removeAll = (ids: string[]) => {
    if (!ids.length || !window.confirm(`Supprimer définitivement ${ids.length} annonce${ids.length > 1 ? 's' : ''} ? Elles ne reviendront pas, même si une alerte les renvoie.`)) return
    markGroup(ids, 'deleted')
    toast.ok(`${ids.length} annonce${ids.length > 1 ? 's' : ''} supprimée${ids.length > 1 ? 's' : ''}`)
    setSelected(new Set())
  }

  /** Candidature de l'annonce (créée une seule fois, même si l'annonce existe sur plusieurs sites). */
  const offerFor = (i: FeedItem) => {
    const ids = expand([i.id])
    const existing = Object.values(useDocs.getState().offers).find((o) => (o.sourceId && ids.includes(o.sourceId)) || o.jobIds?.some((x) => ids.includes(x)))
    if (existing) return existing
    const o = offerFromItem(i)
    saveOffer(o)
    markGroup([i.id], 'applied')
    return o
  }
  /** Rattache l'annonce (et ses doublons) à une candidature existante. */
  const linkTo = (i: FeedItem, o: Offer) => {
    const ids = expand([i.id])
    saveOffer({ ...o, jobIds: [...new Set([...(o.jobIds ?? []), ...ids])], description: o.description || i.fullText || i.description, url: o.url || i.url })
    markGroup([i.id], 'applied')
    toast.ok(`Annonce rattachée à votre candidature « ${o.title ?? o.company ?? ''} »`)
  }
  const apply = (i: FeedItem) => {
    offerFor(i)
    toast.ok('Candidature créée : rattachez-y un CV et une lettre depuis l\'onglet Offres')
    onShowOffers()
  }
  const tailor = (i: FeedItem) => {
    // CV de référence le plus proche de l'annonce, sinon le CV du profil
    // CV du profil de recherche qui correspond le mieux, sinon le CV de référence le plus proche de l'annonce
    const track = profile.tracks?.find((t) => t.id === matches[i.id]?.track?.id)
    const cv = (track?.cv?.reference ? track.cv : undefined) ?? bestReference(i.title, cvs.filter((d) => d.reference)) ?? track?.cv ?? profile.cv
    if (!cv) return toast.error('Aucun CV : créez-en un ou choisissez un CV de référence dans « Profil »')
    const o = offerFor(i)
    const now = Date.now()
    const title = i.title.replace(/\s*[(-]?\s*\b[hfHF]\s*\/\s*[hfHF](\s*\/\s*\w+)?\s*\)?/g, '').replace(/\s*\((cdi|cdd)\)\s*$/i, '').trim()
    const copy: ResumeDoc = { ...structuredClone(cv), reference: undefined, id: uid(), name: [title, o.company].filter(Boolean).join(' - '), offerId: o.id, createdAt: now, updatedAt: now, header: { ...cv.header, title } }
    addDoc(copy)
    navigate(`/cv/${copy.id}?claude=tailor`)
    toast.ok(`CV créé à partir de « ${cv.name} » : copiez le prompt d'adaptation pour Claude`)
  }

  const noAlerts = !watch.alerts.length
  return (
    <>
      <div className="jobs-head">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'new', label: `À trier (${counts.new})` },
            { value: 'fav', label: `Favoris (${counts.fav})` },
            { value: 'applied', label: `Candidatures (${counts.applied})` },
            { value: 'hidden', label: `Masquées (${counts.hidden})` },
            { value: 'out', label: `Hors critères (${counts.out})`, title: 'Offres en présentiel au-delà de votre périmètre de recherche (note 0)' },
          ]}
        />
        <div className="row-gap">
          <button className="btn" onClick={() => setAddOpen(true)} title="Ajouter une annonce trouvée ailleurs, depuis son lien">
            <Plus size={16} /> Ajouter une annonce
          </button>
          <button className="btn" onClick={() => setProfileOpen(true)} title="CV de référence, métiers visés, diplôme, domicile">
            <Target size={16} /> Mon profil
          </button>
          <button className="btn" onClick={() => setSettings(true)}>
            <Settings2 size={16} /> Alertes et veille
          </button>
          <button className="btn icon-only" onClick={() => runSync()} disabled={syncStatus === 'syncing' || syncStatus === 'off'} title="Récupérer la dernière veille">
            <RefreshCw size={16} className={syncStatus === 'syncing' ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {noAlerts ? (
        <div className="empty-state">
          <BellRing size={28} className="muted" />
          <h2>Créez votre première alerte</h2>
          <p>Indiquez le métier recherché et la ville. Resume lit vos alertes email (LinkedIn, France Travail, Glassdoor, Jobijoba...) et les offres de la fonction publique, puis vous donne des liens de recherche vers les autres sites.</p>
          <button className="btn primary" onClick={() => setSettings(true)}>
            <BellRing size={16} /> Créer une alerte
          </button>
        </div>
      ) : (
        <>
          <div className="jobs-filters">
            <div className="jf-row">
              <div className="rome-search small">
                <Search size={15} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (poste, entreprise, ville)" />
                {q && (
                  <button className="icon-btn xs" onClick={() => setQ('')} title="Effacer">
                    <X size={13} />
                  </button>
                )}
              </div>
              <select className="input select alert-select" value={alert} onChange={(e) => setAlert(e.target.value)} title="Filtrer par alerte">
                <option value="all">Toutes les alertes</option>
                {gitems.some((i) => i.alerts.includes('email')) && <option value="email">Alertes email</option>}
                {watch.alerts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.keywords || 'Sans titre'}
                  </option>
                ))}
              </select>
              <div className="jf-sort">
                <span className="muted small">Trier :</span>
                <Segmented
                  value={sort}
                  onChange={(v) => {
                    setSort(v)
                    try {
                      localStorage.setItem('resume-jobs-sort', v)
                    } catch {
                      /* ignore */
                    }
                  }}
                  options={[
                    { value: 'date', label: 'Récentes' },
                    { value: 'score', label: <><ArrowDownWideNarrow size={13} /> Correspondance</>, title: 'Trier par indice de correspondance (avis de Claude en priorité)' },
                  ]}
                />
              </div>
            </div>
            <ExcludeBar
              terms={quick}
              onChange={setQuick}
              count={excludedCount}
              banned={terms.length}
              onManage={() => setBannedOpen(true)}
              onPin={(t) => {
                setQuick(quick.filter((x) => x !== t))
                if (!terms.some((x) => norm(x) === norm(t))) setExcludes([...terms, t])
                toast.ok(`« ${t} » exclu définitivement : gérez la liste dans « Mots exclus »`)
              }}
            />
          </div>

          {feed?.status === 'error' && (
            <div className="notice warn">
              La dernière veille a échoué : {feed.errors?.join(' ')}{' '}
              <button className="link" onClick={() => setSettings(true)}>
                Vérifier la configuration
              </button>
            </div>
          )}

          {feed && shown.length > 0 && (
            <div className={`bulk-bar${sel.length ? ' active' : ''}`}>
              <label className="bulk-all">
                <input type="checkbox" checked={allSel} ref={(el) => { if (el) el.indeterminate = sel.length > 0 && !allSel }} onChange={(e) => setSelected(e.target.checked ? new Set(shownIds) : new Set())} />
                {sel.length ? `${sel.length} sélectionnée${sel.length > 1 ? 's' : ''}` : `${shownIds.length} annonce${shownIds.length > 1 ? 's' : ''}`}
              </label>
              {sel.length > 0 ? (
                <>
                  {filter !== 'fav' && (
                    <button className="btn sm" onClick={() => bulk('fav', 'en favori')}>
                      <Star size={13} /> Favori
                    </button>
                  )}
                  {filter === 'hidden' || filter === 'fav' ? (
                    <button className="btn sm" onClick={() => bulk('none', 'remises à trier')}>
                      <Eye size={13} /> Restaurer
                    </button>
                  ) : (
                    <button className="btn sm" onClick={() => bulk('hidden', 'masquée(s)')}>
                      <EyeOff size={13} /> Masquer
                    </button>
                  )}
                  <button className="btn sm danger" onClick={() => removeAll(sel)}>
                    <Trash2 size={13} /> Supprimer
                  </button>
                  <button className="btn sm ghost" onClick={() => setSelected(new Set())}>
                    Annuler
                  </button>
                </>
              ) : (
                <>
                  <span className="muted small">Veille du {new Date(feed.updatedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  {(filter === 'hidden' || filter === 'out') && (
                    <button className="btn sm ghost danger" onClick={() => removeAll(shownIds)}>
                      <Trash2 size={13} /> Tout supprimer
                    </button>
                  )}
                  <button className="btn sm claude" onClick={() => setClaudeOpen(true)} title="Faire évaluer les meilleures annonces par Claude">
                    <Sparkles size={14} /> Affiner avec Claude
                  </button>
                </>
              )}
            </div>
          )}

          {!feed ? (
            <div className="empty-state">
              <p>Les annonces apparaîtront ici une fois la veille automatique activée.</p>
              <button className="btn" onClick={() => setSettings(true)}>
                <Settings2 size={16} /> Activer la veille
              </button>
            </div>
          ) : shown.length ? (
            <div className="job-list">
              {shown.map((i) => (
                <JobCard key={i.id} item={i} tracks={profile.tracks} onTrack={(t) => setTrackFor(expand([i.id]), t)} linked={linkedOffer[i.id]} offers={offersList} onLink={(o) => linkTo(i, o)} degraded={Object.keys(feed?.sources?.degraded ?? {}).some((h) => i.url.includes(h))} salary={salaries[i.id]} flags={flagsOf[i.id] ?? []} others={(groupOf.get(i.id)?.members ?? []).filter((m) => m.id !== i.id && m.url !== i.url)} mark={markOf(i.id)} onMark={(st) => markGroup([i.id], st)} onTailor={() => tailor(i)} selected={selected.has(i.id)} onSelect={(v) => toggle(i.id, v)} alertNames={i.alerts.map((a) => names[a]).filter(Boolean)} match={matches[i.id]} review={reviews[i.id]} onApply={() => apply(i)} isNew={!!i.firstSeen && new Date(i.firstSeen).getTime() > lastSeen && lastSeen > 0} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>{filter === 'new' ? 'Toutes les annonces ont été triées.' : filter === 'out' ? 'Aucune offre hors de votre périmètre.' : 'Rien ici pour le moment.'}</p>
            </div>
          )}

        </>
      )}
      <AlertsModal open={settings} onClose={() => setSettings(false)} />
      <AddJobModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => {
          setFilter('new')
          setQ('')
        }}
      />
      <BannedModal open={bannedOpen} onClose={() => setBannedOpen(false)} terms={terms} onChange={setExcludes} all={all} />
      <MatchProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <ClaudeRankModal open={claudeOpen} onClose={() => setClaudeOpen(false)} items={[...filtered].sort((a, b) => (matches[b.id]?.score ?? 0) - (matches[a.id]?.score ?? 0)).map((i) => ({ ...i, score: matches[i.id]?.score }))} />
    </>
  )
}
