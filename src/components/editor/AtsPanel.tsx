import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Info, Plus, RotateCcw, Sparkles, Trash2, XCircle } from 'lucide-react'
import type { JobStatus, JobTarget, ResumeDoc } from '../../types'
import { JOB_STATUS, jobsOf } from '../../lib/jobs'
import { matchKeywords, overallScore, parseScore, runChecks, cvStems, type CheckStatus } from '../../lib/ats'
import { resumeToText } from '../../lib/export'
import { Field, Select, TextArea, TextInput, confirmAction } from '../ui'

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
  doc: ResumeDoc
  pages: number
  setJob: (j: JobTarget) => void
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onScore: (score: number) => void
  onDeep: (action: 'ats' | 'tailor', missing: string[]) => void
}

const fmtDate = (t?: number) => (t ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

function OffersList({ doc, onSelect, onNew, onDelete }: Pick<Props, 'doc' | 'onSelect' | 'onNew' | 'onDelete'>) {
  const jobs = jobsOf(doc)
  const active = doc.job?.id ?? (jobs[0]?.id === 'initial' ? 'initial' : undefined)
  return (
    <section className="style-group">
      <div className="offers-head">
        <h3>Mes offres ({jobs.length})</h3>
        <button className="btn sm" onClick={onNew}>
          <Plus size={14} /> Nouvelle offre
        </button>
      </div>
      {jobs.length === 0 ? (
        <p className="muted small">Collez une offre ci-dessous : elle sera conservée ici avec son score et le suivi de votre candidature.</p>
      ) : (
        <ul className="offers">
          {jobs.map((j) => (
            <li key={j.id} className={j.id === active ? 'on' : ''} onClick={() => j.id && onSelect(j.id)}>
              <div className="offer-main">
                <strong>{j.title || 'Offre sans titre'}</strong>
                <span>
                  {[j.company, fmtDate(j.createdAt)].filter(Boolean).join(' · ')}
                </span>
              </div>
              <span className={`offer-status st-${j.status ?? 'todo'}`}>{JOB_STATUS[j.status ?? 'todo']}</span>
              {j.lastScore !== undefined && <span className={`offer-score ${j.lastScore >= 75 ? 'good' : j.lastScore >= 55 ? 'mid' : 'low'}`}>{j.lastScore}</span>}
              <button
                className="icon-btn xs"
                title="Supprimer cette offre"
                onClick={(e) => {
                  e.stopPropagation()
                  if (j.id && confirmAction(`Supprimer l'offre « ${j.title || 'sans titre'} » ?`)) onDelete(j.id)
                }}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function AtsPanel({ doc, pages, setJob, onSelect, onNew, onDelete, onScore, onDeep }: Props) {
  const job = doc.job ?? {}
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
    if (match && job.lastScore !== score) onScore(score)
  }, [score, match, job.lastScore, onScore])

  const toggleIgnore = (key: string) => setJob({ ...job, ignored: ignored.includes(key) ? ignored.filter((k) => k !== key) : [...ignored, key] })
  const addExtra = () => {
    const v = extra.trim()
    if (!v || !cvStems(v).length) return
    setJob({ ...job, extra: [...extras, v] })
    setExtra('')
  }

  return (
    <div className="panel-content">
      <OffersList doc={doc} onSelect={onSelect} onNew={onNew} onDelete={onDelete} />
      <section className="style-group">
        <h3>Offre analysée</h3>
        <div className="form-stack">
          <div className="grid-2">
            <Field label="Intitulé du poste">
              <TextInput value={job.title} onChange={(v) => setJob({ ...job, title: v })} />
            </Field>
            <Field label="Entreprise">
              <TextInput value={job.company} onChange={(v) => setJob({ ...job, company: v })} />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Suivi">
              <Select value={job.status ?? 'todo'} onChange={(v) => setJob({ ...job, status: v })} options={(Object.keys(JOB_STATUS) as JobStatus[]).map((k) => ({ value: k, label: JOB_STATUS[k] }))} />
            </Field>
            <Field label="Lien de l'annonce">
              <div className="row-gap">
                <TextInput value={job.url} onChange={(v) => setJob({ ...job, url: v })} placeholder="https://" />
                {job.url && (
                  <a className="icon-btn bordered" href={/^https?:/i.test(job.url) ? job.url : `https://${job.url}`} target="_blank" rel="noreferrer" title="Ouvrir l'annonce">
                    <ExternalLink size={15} />
                  </a>
                )}
              </div>
            </Field>
          </div>
          <Field label="Texte de l'annonce" hint="Copiez-collez l'annonce complète : missions, profil, compétences.">
            <TextArea value={job.description} minRows={6} onChange={(v) => setJob({ ...job, description: v })} placeholder="Collez ici le texte de l'offre..." />
          </Field>
          <Field label="Notes">
            <TextArea value={job.notes} minRows={2} onChange={(v) => setJob({ ...job, notes: v })} placeholder="Contact, date d'envoi, relance..." />
          </Field>
        </div>
      </section>

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
            <button className="btn ghost sm self-start" onClick={() => setJob({ ...job, ignored: [] })}>
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
