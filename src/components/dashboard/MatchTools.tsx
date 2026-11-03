import { useEffect, useMemo, useState } from 'react'
import { ClipboardCopy, ExternalLink, MapPin, Sparkles, X } from 'lucide-react'
import type { FeedItem, JobReview, MatchProfile, ResumeDoc } from '../../types'
import { useDocs } from '../../store/documents'
import { findCommunes, type Commune } from '../../lib/watch'
import { cvSkills, resolveProfile } from '../../lib/match'
import { resumeToText } from '../../lib/export'
import { CLAUDE_URL, copyText, extractJson, jobRankPrompt, type ClaudeReviews } from '../../lib/prompts'
import { Field, Modal, Select, TextArea, TextInput, toast } from '../ui'

const DEGREES = [
  { value: 0, label: 'Bac ou sans diplôme' },
  { value: 2, label: 'Bac+2 (BTS, DUT, titre RNCP niveau 5)' },
  { value: 3, label: 'Bac+3 (licence, titre RNCP niveau 6)' },
  { value: 4, label: 'Bac+4' },
  { value: 5, label: 'Bac+5 (master, ingénieur)' },
]

function Chips({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [v, setV] = useState('')
  const add = () => {
    const parts = v.split(',').map((x) => x.trim()).filter((x) => x && !values.includes(x))
    if (parts.length) onChange([...values, ...parts])
    setV('')
  }
  return (
    <div className="exclude-bar chips-input">
      {values.map((t) => (
        <span key={t} className="exclude-chip target">
          {t}
          <button onClick={() => onChange(values.filter((x) => x !== t))} title="Retirer">
            <X size={12} />
          </button>
        </span>
      ))}
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
    </div>
  )
}

function HomeInput({ value, onChange }: { value?: MatchProfile['home']; onChange: (h: MatchProfile['home']) => void }) {
  const [q, setQ] = useState(value?.nom ?? '')
  const [list, setList] = useState<Commune[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open || q === value?.nom) return
    const t = setTimeout(() => findCommunes(q).then(setList).catch(() => setList([])), 250)
    return () => clearTimeout(t)
  }, [q, open, value?.nom])
  return (
    <div className="commune-input">
      <TextInput
        value={q}
        onChange={(v) => {
          setQ(v)
          setOpen(true)
        }}
        placeholder="Ville ou code postal"
      />
      {open && list.length > 0 && (
        <div className="commune-list">
          {list.map((c) => (
            <button
              key={c.code}
              onClick={async () => {
                setQ(c.nom)
                setOpen(false)
                try {
                  const r = await fetch(`https://geo.api.gouv.fr/communes/${c.code}?fields=centre`)
                  const [lon, lat] = ((await r.json()) as { centre: { coordinates: [number, number] } }).centre.coordinates
                  onChange({ nom: c.nom, lat, lon })
                } catch {
                  toast.error('Position de la commune introuvable')
                }
              }}
            >
              <MapPin size={12} /> {c.nom} <em>({c.departement})</em>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Réglages du profil utilisé pour l'indice de correspondance. */
export function MatchProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const docsMap = useDocs((s) => s.docs)
  const watch = useDocs((s) => s.watch)
  const setProfile = useDocs((s) => s.setProfile)
  const cvs = useMemo(() => Object.values(docsMap).filter((d): d is ResumeDoc => d.kind === 'resume').sort((a, b) => b.updatedAt - a.updatedAt), [docsMap])
  const resolved = resolveProfile(watch.profile, cvs, watch.alerts)
  const [draft, setDraft] = useState<MatchProfile>({ cvId: resolved.cv?.id, targets: resolved.targets, degree: resolved.degree, home: resolved.home })
  useEffect(() => {
    if (open) {
      const r = resolveProfile(useDocs.getState().watch.profile, cvs, useDocs.getState().watch.alerts)
      setDraft({ cvId: r.cv?.id, targets: r.targets, degree: r.degree, home: r.home })
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const skills = cvSkills(cvs.find((d) => d.id === draft.cvId))
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Profil de correspondance"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn primary"
            onClick={() => {
              setProfile(draft)
              toast.ok('Profil enregistré : les indices sont recalculés')
              onClose()
            }}
          >
            Enregistrer
          </button>
        </>
      }
    >
      <div className="form-stack">
        <p className="muted small">
          L'indice (0 à 100) compare chaque annonce à ce profil : intitulé proche d'un métier visé (35 %), compétences du CV retrouvées dans le texte (25 %), niveau du poste (20 % : un poste junior est un plus, un poste senior un frein), distance (20 %). Un diplôme exigé supérieur au vôtre fait baisser l'indice et s'affiche en alerte.
        </p>
        <Field label="CV de référence (compétences)">
          <Select value={draft.cvId ?? ''} onChange={(v) => setDraft({ ...draft, cvId: v || undefined })} options={cvs.map((d) => ({ value: d.id, label: d.name }))} />
        </Field>
        {skills.length > 0 && (
          <div className="skill-preview">
            <span className="muted small">{skills.length} compétences lues :</span> {skills.map((s) => <span key={s} className="skill-pill">{s}</span>)}
          </div>
        )}
        <Field label="Métiers visés" hint="Entrée ou virgule pour ajouter. Les équivalents sont reconnus (Product Owner, PO, chef de produit...).">
          <Chips values={draft.targets} onChange={(targets) => setDraft({ ...draft, targets })} placeholder="ex. Product Owner, Business Analyst" />
        </Field>
        <div className="grid-2">
          <Field label="Votre niveau de diplôme">
            <Select value={draft.degree} onChange={(degree) => setDraft({ ...draft, degree })} options={DEGREES} />
          </Field>
          <Field label="Domicile (calcul des distances)">
            <HomeInput value={draft.home} onChange={(home) => setDraft({ ...draft, home })} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

/** Prompt pour que Claude classe les meilleures annonces, puis lecture de sa réponse. */
export function ClaudeRankModal({ open, onClose, items }: { open: boolean; onClose: () => void; items: (FeedItem & { score?: number })[] }) {
  const docsMap = useDocs((s) => s.docs)
  const watch = useDocs((s) => s.watch)
  const addReviews = useDocs((s) => s.addReviews)
  const [count, setCount] = useState(15)
  const [answer, setAnswer] = useState('')
  const cvs = useMemo(() => Object.values(docsMap).filter((d): d is ResumeDoc => d.kind === 'resume'), [docsMap])
  const profile = resolveProfile(watch.profile, cvs, watch.alerts)
  const picked = items.slice(0, count)

  const prompt = () =>
    jobRankPrompt(
      profile.cv ? resumeToText(profile.cv) : '',
      picked.map((i) => ({ id: i.id, title: i.title, company: i.company, location: i.location, contract: i.contract, text: i.fullText ?? i.description })),
      { degree: profile.degree, targets: profile.targets },
    )

  const copy = async (go: boolean) => {
    if (!(await copyText(prompt()))) return toast.error('Copie impossible')
    toast.ok('Prompt copié')
    if (go) window.open(CLAUDE_URL, '_blank', 'noopener')
  }

  const apply = () => {
    try {
      const d = extractJson<ClaudeReviews>(answer)
      const ids = new Set(items.map((i) => i.id))
      const out: Record<string, JobReview> = {}
      const at = Date.now()
      for (const r of d.reviews ?? []) {
        if (!r?.id || !ids.has(r.id) || typeof r.score !== 'number') continue
        const list = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && !!v.trim()) : [])
        out[r.id] = { score: Math.max(0, Math.min(100, Math.round(r.score))), verdict: r.verdict, pros: list(r.pros), cons: list(r.cons), tip: r.tip, at }
      }
      const n = Object.keys(out).length
      if (!n) throw new Error('aucune annonce reconnue')
      addReviews(out)
      toast.ok(`Avis de Claude ajouté sur ${n} annonce${n > 1 ? 's' : ''}`)
      setAnswer('')
      onClose()
    } catch (e) {
      toast.error(`Réponse non reconnue : ${e instanceof Error ? e.message : ''}`)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Affiner le classement avec Claude"
      footer={
        <button className="btn primary" disabled={!answer.trim()} onClick={apply}>
          <Sparkles size={16} /> Appliquer les avis
        </button>
      }
    >
      <div className="form-stack">
        <div className="step">
          <span className="step-n">1</span>
          <div className="step-body">
            <strong>Envoyez votre CV et les meilleures annonces à Claude</strong>
            <span className="muted small">
              Les annonces affichées sont prises dans l'ordre de l'indice, avec leur texte complet quand la veille l'a récupéré. CV utilisé : <strong>{profile.cv?.name ?? 'aucun'}</strong>.
            </span>
            <div className="row-gap">
              <Select value={count} onChange={setCount} options={[10, 15, 20, 30].map((n) => ({ value: n, label: `${n} annonces` }))} />
              <button className="btn primary sm" disabled={!picked.length} onClick={() => copy(true)}>
                <ExternalLink size={14} /> Copier et ouvrir Claude
              </button>
              <button className="btn sm" disabled={!picked.length} onClick={() => copy(false)}>
                <ClipboardCopy size={14} /> Copier
              </button>
            </div>
            <ol className="small muted rank-preview">
              {picked.map((i) => (
                <li key={i.id}>
                  {i.title} {i.company ? `· ${i.company}` : ''} {typeof i.score === 'number' ? `(${i.score})` : ''}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="step">
          <span className="step-n">2</span>
          <div className="step-body">
            <strong>Collez la réponse de Claude</strong>
            <TextArea value={answer} onChange={setAnswer} minRows={5} placeholder="Collez ici la réponse (le bloc JSON suffit)..." />
          </div>
        </div>
      </div>
    </Modal>
  )
}


