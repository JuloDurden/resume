import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, Plus, RotateCcw, Sparkles, XCircle } from 'lucide-react'
import type { JobTarget, ResumeDoc } from '../../types'
import { matchKeywords, overallScore, runChecks, cvStems, type CheckStatus } from '../../lib/ats'
import { resumeToText } from '../../lib/export'
import { Field, TextArea, TextInput } from '../ui'

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

export function AtsPanel({ doc, pages, setJob, onDeep }: { doc: ResumeDoc; pages: number; setJob: (j: JobTarget) => void; onDeep: (action: 'ats' | 'tailor', missing: string[]) => void }) {
  const job = doc.job ?? {}
  const [extra, setExtra] = useState('')
  const [showText, setShowText] = useState(false)
  const cvText = useMemo(() => resumeToText(doc), [doc])
  const extras = useMemo(() => job.extra ?? [], [job.extra])
  const match = useMemo(() => (job.description?.trim() ? matchKeywords(cvText, job.description, job.ignored ?? [], extras) : null), [cvText, job.description, job.ignored, extras])
  const checks = useMemo(() => runChecks(doc, pages), [doc, pages])
  const score = overallScore(match, checks)
  const missing = match?.keywords.filter((k) => !k.inCv) ?? []
  const found = match?.keywords.filter((k) => k.inCv) ?? []
  const ignored = job.ignored ?? []

  const toggleIgnore = (key: string) => setJob({ ...job, ignored: ignored.includes(key) ? ignored.filter((k) => k !== key) : [...ignored, key] })
  const addExtra = () => {
    const v = extra.trim()
    if (!v || !cvStems(v).length) return
    setJob({ ...job, extra: [...extras, v] })
    setExtra('')
  }

  return (
    <div className="panel-content">
      <section className="style-group">
        <h3>Offre d'emploi</h3>
        <div className="form-stack">
          <div className="grid-2">
            <Field label="Intitulé du poste">
              <TextInput value={job.title} onChange={(v) => setJob({ ...job, title: v })} />
            </Field>
            <Field label="Entreprise">
              <TextInput value={job.company} onChange={(v) => setJob({ ...job, company: v })} />
            </Field>
          </div>
          <Field label="Lien de l'annonce">
            <TextInput value={job.url} onChange={(v) => setJob({ ...job, url: v })} placeholder="https://" />
          </Field>
          <Field label="Texte de l'annonce" hint="Copiez-collez l'annonce complète : missions, profil, compétences.">
            <TextArea value={job.description} minRows={6} onChange={(v) => setJob({ ...job, description: v })} placeholder="Collez ici le texte de l'offre..." />
          </Field>
        </div>
      </section>

      <section className="style-group">
        <div className="ats-scores">
          <Gauge value={score} label="Score global" />
          {match && <Gauge value={match.score} label="Mots-clés" />}
          <div className="ats-summary">
            {match ? (
              <p>
                <strong>
                  {match.matched} / {match.total}
                </strong>{' '}
                mots-clés de l'offre trouvés dans votre CV.
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
              <button key={k.key} className="kw missing" onClick={() => toggleIgnore(k.key)} title="Ignorer ce mot-clé">
                {k.label}
                {k.freq > 1 && <em>×{k.freq}</em>}
              </button>
            ))}
            {!missing.length && <span className="muted small">Aucun, bravo.</span>}
          </div>
          <h3>Mots-clés présents ({found.length})</h3>
          <div className="kw-list">
            {found.map((k) => (
              <button key={k.key} className="kw found" onClick={() => toggleIgnore(k.key)} title={`${k.inCv} occurrence(s) dans le CV. Cliquer pour ignorer.`}>
                {k.label}
                <em>{k.inCv}</em>
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
        <h3>Contrôles de lisibilité ATS</h3>
        <ul className="checks">
          {checks.map((c) => (
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
        <button className="btn ghost sm self-start" onClick={() => setShowText((s) => !s)}>
          {showText ? 'Masquer' : 'Voir'} le texte lu par un ATS
        </button>
        {showText && <pre className="ats-text">{cvText}</pre>}
      </section>
    </div>
  )
}
