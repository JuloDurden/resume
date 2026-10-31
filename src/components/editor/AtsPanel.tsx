import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, CheckCircle2, Info, Link2, Plus, RotateCcw, Sparkles, XCircle } from 'lucide-react'
import type { JobTarget, Offer, ResumeDoc } from '../../types'
import { JOB_STATUS, logoUrl, newOffer } from '../../lib/offers'
import { useDocs, useOffer } from '../../store/documents'
import { OfferFields } from '../OfferFields'
import { matchKeywords, overallScore, parseScore, runChecks, cvStems, type CheckStatus } from '../../lib/ats'
import { resumeToText } from '../../lib/export'
import { TextInput } from '../ui'

const STATUS_ICON: Record<CheckStatus, ReactNode> = {
  ok: <CheckCircle2 size={16} className="st-ok" />,
  warn: <AlertTriangle size={16} className="st-warn" />,
  error: <XCircle size={16} className="st-error" />,
  info: <Info size={16} className="st-info" />,
}

function Gauge({ value, label }: { value: number; label: string }) {
  const r = 34
  const c = 2 * Math.PI * r
  const color = value >= 75 ? 'var(--ok)' : value >= 50 ? 'var(--warn)' : 'var(--error)'
  return (
    <div className="gauge">
      <svg width="86" height="86" viewBox="0 0 86 86">
        <circle cx="43" cy="43" r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
        <circle cx="43" cy="43" r={r} fill="none" stroke={color} strokeWidth="8" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} strokeLinecap="round" transform="rotate(-90 43 43)" />
        <text x="43" y="49" textAnchor="middle" fontSize="20" fontWeight="700" fill="currentColor">
          {value}
        </text>
      </svg>
      <span>{label}</span>
    </div>
  )
}

interface Props {
  /** CV, avec `job` = offre rattachée */
  doc: ResumeDoc
  pages: number
  onLink: (offerId: string | undefined) => void
  onDeep: (action: 'ats' | 'tailor', missing: string[]) => void
  onImportLink: () => void
}

const fmtDate = (t?: number) => (t ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export function OfferLogo({ offer, size = 28 }: { offer: Offer; size?: number }) {
  const [broken, setBroken] = useState(false)
  const src = logoUrl(offer)
  const letter = (offer.company || offer.title || '?').trim().charAt(0).toUpperCase()
  return src && !broken ? (
    <img className="offer-logo" src={src} alt="" width={size} height={size} onError={() => setBroken(true)} />
  ) : (
    <span className="offer-logo fallback" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {letter}
    </span>
  )
}

function OffersList({ doc, onLink, onImportLink }: Pick<Props, 'doc' | 'onLink' | 'onImportLink'>) {
  const offersMap = useDocs((s) => s.offers)
  const saveOffer = useDocs((s) => s.saveOffer)
  const offers = useMemo(() => Object.values(offersMap).sort((a, b) => b.createdAt - a.createdAt), [offersMap])
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? offers : offers.slice(0, 5)
  return (
    <section className="style-group">
      <div className="offers-head">
        <h3>Offre rattachée à ce CV</h3>
        <div className="row-gap">
          <button className="btn sm" onClick={onImportLink} title="Lire une annonce depuis son lien, avec Claude">
            <Link2 size={14} /> Depuis un lien
          </button>
          <button
            className="btn sm"
            onClick={() => {
              const o = newOffer()
              saveOffer(o)
              onLink(o.id)
            }}
          >
            <Plus size={14} /> Nouvelle
          </button>
        </div>
      </div>
      {offers.length === 0 ? (
        <p className="muted small">Aucune offre pour l'instant. Créez-en une ou collez son lien : elle sera visible dans la vue « Offres » de l'accueil, avec ce CV et la lettre associée.</p>
      ) : (
        <ul className="offers">
          {shown.map((j) => {
            const linked = j.id === doc.offerId
            const score = j.scores?.[doc.id]
            return (
              <li key={j.id} className={linked ? 'on' : ''} onClick={() => onLink(linked ? undefined : j.id)} title={linked ? 'Cliquer pour détacher ce CV de l\'offre' : 'Rattacher ce CV à cette offre'}>
                <OfferLogo offer={j} size={24} />
                <div className="offer-main">
                  <strong>{j.title || 'Offre sans titre'}</strong>
                  <span>{[j.company, fmtDate(j.createdAt)].filter(Boolean).join(' · ')}</span>
                </div>
                <span className={`offer-status st-${j.status ?? 'todo'}`}>{JOB_STATUS[j.status ?? 'todo']}</span>
                {score !== undefined && <span className={`offer-score ${score >= 75 ? 'good' : score >= 55 ? 'mid' : 'low'}`}>{score}</span>}
                {linked && <Check size={15} className="st-ok" />}
              </li>
            )
          })}
        </ul>
      )}
      {offers.length > 5 && (
        <button className="btn ghost sm self-start" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Afficher moins' : `Afficher les ${offers.length} offres`}
        </button>
      )}
    </section>
  )
}

export function AtsPanel({ doc, pages, onLink, onDeep, onImportLink }: Props) {
  const saveOffer = useDocs((s) => s.saveOffer)
  const offer = useOffer(doc.offerId)
  const job: JobTarget = offer ?? {}
  const setJob = (j: JobTarget) => offer && saveOffer({ ...offer, ...j })
  const [extra, setExtra] = useState('')
  const [showText, setShowText] = useState(false)
  const cvText = useMemo(() => resumeToText(doc), [doc])
  const extras = useMemo(() => job.extra ?? [], [job.extra])
  const match = useMemo(
    () => (job.description?.trim() ? matchKeywords(cvText, job.description, job.ignored ?? [], extras, [job.company ?? '']) : null),
    [cvText, job.description, job.ignored, extras, job.company],
  )
  const checks = useMemo(() => runChecks(doc, pages), [doc, pages])
  const atsChecks = checks.filter((c) => c.kind === 'ats')
  const writing = checks.filter((c) => c.kind === 'redaction')
  const score = overallScore(match, checks)
  const readability = parseScore(checks)
  const missing = match?.keywords.filter((k) => k.match === 'none' || k.match === 'partial') ?? []
  const found = match?.keywords.filter((k) => k.match === 'full' || k.match === 'near') ?? []
  const ignored = job.ignored ?? []

  useEffect(() => {
    if (offer && match && offer.scores?.[doc.id] !== score) saveOffer({ ...offer, scores: { ...offer.scores, [doc.id]: score } })
  }, [score, match, offer, doc.id, saveOffer])

  const toggleIgnore = (key: string) => setJob({ ignored: ignored.includes(key) ? ignored.filter((k) => k !== key) : [...ignored, key] })
  const addExtra = () => {
    const v = extra.trim()
    if (!v || !cvStems(v).length) return
    setJob({ extra: [...extras, v] })
    setExtra('')
  }

  return (
    <div className="panel-content">
      <OffersList doc={doc} onLink={onLink} onImportLink={onImportLink} />
      {offer ? (
        <OfferFields offer={offer} onChange={(o) => saveOffer(o)} />
      ) : (
        <section className="style-group">
          <p className="muted small">Rattachez ce CV à une offre (ou créez-en une) pour mesurer la correspondance des mots-clés. Les contrôles de lisibilité ci-dessous restent valables sans offre.</p>
        </section>
      )}

      <section className="style-group">
        <div className="ats-scores">
          <Gauge value={score} label="Score global" />
          {match && <Gauge value={match.score} label="Mots-clés" />}
          <Gauge value={readability} label="Lisibilité" />
          <div className="ats-summary">
            {match ? (
              <p>
                <strong>
                  {match.matched} / {match.total}
                </strong>{' '}
                mots-clés de l'offre retrouvés.
                <span className="muted small score-formula"> Score global : 75 % mots-clés, 25 % lisibilité.</span>
              </p>
            ) : (
              <p className="muted">Collez une offre pour mesurer la correspondance des mots-clés.</p>
            )}
            <button className="btn sm claude" onClick={() => onDeep('ats', missing.map((k) => k.label))} disabled={!job.description?.trim()}>
              <Sparkles size={14} /> Analyse approfondie avec Claude
            </button>
            <button className="btn sm ghost claude" onClick={() => onDeep('tailor', missing.map((k) => k.label))} disabled={!job.description?.trim()}>
              <Sparkles size={14} /> Adapter le CV avec Claude
            </button>
          </div>
        </div>
      </section>

      {match && (
        <section className="style-group">
          <h3>Mots-clés manquants ({missing.length})</h3>
          <p className="muted small">Ajoutez-les là où ils sont exacts (compétences, puces, résumé). Cliquez sur un mot-clé non pertinent pour l'ignorer.</p>
          <div className="kw-list">
            {missing.map((k) => (
              <button key={k.key} className={`kw ${k.match === 'partial' ? 'partial' : 'missing'}`} onClick={() => toggleIgnore(k.key)} title={k.match === 'partial' ? 'Partiellement présent (une partie des mots). Cliquer pour ignorer.' : 'Absent du CV. Cliquer pour ignorer.'}>
                {k.label}
                {k.freq > 1 && <em>×{k.freq}</em>}
              </button>
            ))}
            {!missing.length && <span className="muted small">Aucun, bravo.</span>}
          </div>
          <h3>Mots-clés présents ({found.length})</h3>
          <div className="kw-list">
            {found.map((k) => (
              <button key={k.key} className={`kw found${k.match === 'near' ? ' near' : ''}`} onClick={() => toggleIgnore(k.key)} title={k.match === 'near' ? 'Présent sous une forme proche (autre ordre ou autre forme du mot). Cliquer pour ignorer.' : `${k.inCv} occurrence(s) dans le CV. Cliquer pour ignorer.`}>
                {k.match === 'near' && '≈ '}
                {k.label}
                {k.match === 'full' && <em>{k.inCv}</em>}
              </button>
            ))}
          </div>
          <div className="row-gap">
            <TextInput value={extra} onChange={setExtra} placeholder="Ajouter un mot-clé à suivre" />
            <button className="btn sm" onClick={addExtra}>
              <Plus size={14} />
            </button>
          </div>
          {ignored.length > 0 && (
            <button className="btn ghost sm self-start" onClick={() => setJob({ ignored: [] })}>
              <RotateCcw size={14} /> Rétablir {ignored.length} mot(s)-clé(s) ignoré(s)
            </button>
          )}
        </section>
      )}

      <section className="style-group">
        <h3>Lisibilité par les ATS (comptée dans le score)</h3>
        <ul className="checks">
          {atsChecks.map((c) => (
            <li key={c.id}>
              {STATUS_ICON[c.status]}
              <div>
                <strong>{c.label}</strong>
                <span>{c.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="style-group">
        <h3>Conseils de rédaction (non comptés)</h3>
        <p className="muted small">Ces conseils visent le recruteur qui lira le CV, pas le logiciel. Suivez-les seulement s'ils servent votre candidature.</p>
        <ul className="checks">
          {writing.map((c) => (
            <li key={c.id}>
              {STATUS_ICON[c.status === 'error' ? 'warn' : c.status]}
              <div>
                <strong>{c.label}</strong>
                <span>{c.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="style-group">
        <button className="btn ghost sm self-start" onClick={() => setShowText((s) => !s)}>
          {showText ? 'Masquer' : 'Voir'} le texte lu par un ATS
        </button>
        {showText && <pre className="ats-text">{cvText}</pre>}
      </section>
    </div>
  )
}
