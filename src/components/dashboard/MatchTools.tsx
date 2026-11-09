import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronUp, ClipboardCopy, ExternalLink, MapPin, Plus, Search, Sparkles, Trash2, X } from 'lucide-react'
import type { ExperienceLink, FeedItem, JobReview, MatchProfile, MatchTrack, ResumeDoc } from '../../types'
import { experiencePool, fmtYears, trackRomeSkills, trackYears, type PoolExperience } from '../../lib/tracks'
import { loadFiche, loadRomeIndex, mainTitle, metierscopeUrl, searchRome, type RomeFiche, type RomeIndex } from '../../lib/rome'
import { uid } from '../../lib/ids'
import { useDocs } from '../../store/documents'
import { findCommunes, type Commune } from '../../lib/watch'
import { cvSkills, resolveProfile } from '../../lib/match'
import { resumeToText } from '../../lib/export'
import { CLAUDE_URL, copyText, extractJson, jobRankPrompt, type ClaudeReviews } from '../../lib/prompts'
import { Field, Modal, Segmented, Select, TextArea, TextInput, toast } from '../ui'

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

/* ---------- profils de recherche par défaut ---------- */

const MGMT = /responsable|manager|chef d.equipe|chef de secteur|exploitation|agence|magasin|commercial|back.office|encadr|superviseur|directeur/i
const IT = /informatique|developpeur|d[ée]veloppeur|product|owner|business analyst|amoa|\bsi\b|syst[èe]mes? d.information|num[ée]rique|digital|support|technicien|projet/i

function defaultTracks(targets: string[], cvs: ResumeDoc[], cvId?: string): MatchTrack[] {
  const mgmt = targets.filter((t) => MGMT.test(t) && !IT.test(t))
  const it = targets.filter((t) => !mgmt.includes(t))
  const refs = cvs.filter((d) => d.reference)
  const mgmtCv = refs.find((d) => MGMT.test(`${d.name} ${d.header.title ?? ''}`) && !IT.test(`${d.name} ${d.header.title ?? ''}`))
  return [
    { id: 'it', name: 'IT / Produit', targets: it, level: 'junior', cvId },
    { id: 'mgmt', name: 'Management', targets: [...new Set([...mgmt, "Responsable d'exploitation", "Responsable d'équipe", 'Responsable de secteur'])], level: 'senior', cvId: mgmtCv?.id ?? cvId },
  ]
}

function defaultLinks(pool: PoolExperience[], tracks: MatchTrack[]): Record<string, ExperienceLink> {
  const out: Record<string, ExperienceLink> = {}
  for (const e of pool) {
    const t: string[] = []
    if (IT.test(e.title) && tracks.some((x) => x.id === 'it')) t.push('it')
    if (MGMT.test(e.title) && !IT.test(e.title.replace(/d[ée]ploiement d.outils/i, '')) && tracks.some((x) => x.id === 'mgmt')) t.push('mgmt')
    out[e.key] = { tracks: t }
  }
  return out
}

const LEVELS: { value: 'junior' | 'any' | 'senior'; label: string; title: string }[] = [
  { value: 'junior', label: 'Junior', title: 'Poste junior ou débutant : un plus ; poste senior : un frein' },
  { value: 'any', label: 'Tous niveaux', title: "Pas de préférence, sauf expérience demandée bien au-delà de la vôtre" },
  { value: 'senior', label: 'Confirmé', title: 'Poste confirmé ou management : un plus ; poste junior : un frein' },
]

/** Réglages du profil utilisé pour l'indice de correspondance : général, profils de recherche, parcours. */
export function MatchProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const docsMap = useDocs((s) => s.docs)
  const setProfile = useDocs((s) => s.setProfile)
  const cvs = useMemo(() => Object.values(docsMap).filter((d): d is ResumeDoc => d.kind === 'resume').sort((a, b) => b.updatedAt - a.updatedAt), [docsMap])
  const pool = useMemo(() => experiencePool(cvs), [cvs])
  const init = (): MatchProfile => {
    const saved = useDocs.getState().watch.profile
    const r = resolveProfile(saved, cvs, useDocs.getState().watch.alerts)
    const base: MatchProfile = { cvId: r.cv?.id, targets: r.targets, degree: r.degree, home: r.home, maxKm: r.maxKm, tracks: saved?.tracks, experiences: saved?.experiences }
    if (!base.tracks?.length) base.tracks = defaultTracks(r.targets, cvs, r.cv?.id)
    const links = { ...defaultLinks(pool, base.tracks), ...(base.experiences ?? {}) }
    return { ...base, experiences: links }
  }
  const [draft, setDraft] = useState<MatchProfile>(init)
  const [tab, setTab] = useState<string>('general')
  useEffect(() => {
    if (open) {
      setDraft(init())
      setTab(useDocs.getState().watch.profile?.tracks?.length ? 'general' : 'parcours')
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const tracks = draft.tracks ?? []
  const setTrack = (id: string, t: Partial<MatchTrack>) => setDraft((d) => ({ ...d, tracks: (d.tracks ?? []).map((x) => (x.id === id ? { ...x, ...t } : x)) }))
  const setLink = (key: string, l: ExperienceLink) => setDraft((d) => ({ ...d, experiences: { ...(d.experiences ?? {}), [key]: l } }))
  const addTrack = () => {
    const id = uid()
    setDraft((d) => ({ ...d, tracks: [...(d.tracks ?? []), { id, name: 'Nouveau profil', targets: [], level: 'any', cvId: d.cvId }] }))
    setTab(id)
  }
  const removeTrack = (id: string) => {
    if (tracks.length <= 1) return toast.error('Gardez au moins un profil de recherche')
    setDraft((d) => ({ ...d, tracks: (d.tracks ?? []).filter((t) => t.id !== id), experiences: Object.fromEntries(Object.entries(d.experiences ?? {}).map(([k, l]) => [k, { ...l, tracks: l.tracks?.filter((x) => x !== id) }])) }))
    setTab('general')
  }
  const save = () => {
    const ts = tracks.filter((t) => t.targets.length)
    if (!ts.length) return toast.error('Indiquez au moins un métier visé dans un profil')
    setProfile({ ...draft, tracks: ts, targets: [...new Set(ts.flatMap((t) => t.targets))] })
    toast.ok('Profil enregistré : les indices sont recalculés')
    onClose()
  }
  const cvOptions = [...cvs].sort((a, b) => Number(!!b.reference) - Number(!!a.reference)).map((d) => ({ value: d.id, label: d.reference ? `${d.name} (référence)` : d.name }))
  const current = tracks.find((t) => t.id === tab)
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Mon profil de recherche"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={save}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="form-stack">
        <div className="profile-tabs">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'general', label: 'Général' },
              ...tracks.map((t) => ({ value: t.id, label: t.name || 'Sans nom' })),
              { value: 'parcours', label: 'Mon parcours' },
            ]}
          />
          <button className="btn sm ghost" onClick={addTrack} title="Ajouter un profil de recherche">
            <Plus size={14} /> Profil
          </button>
        </div>

        {tab === 'general' && (
          <>
            <p className="muted small">
              Chaque annonce est notée face à chacun de vos profils de recherche, et la meilleure note l'emporte (le nom du profil s'affiche à côté de la note). Dans un profil : intitulé proche d'un métier visé (35 %), compétences retrouvées dans le texte (25 %), niveau du poste comparé au niveau visé et à vos années d'expérience dans ce domaine (20 %), distance (20 %). Un diplôme exigé supérieur au vôtre fait baisser l'indice.
            </p>
            <div className="track-summary">
              {tracks.map((t) => (
                <TrackSummary key={t.id} track={t} pool={pool} links={draft.experiences} cvs={cvs} onOpen={() => setTab(t.id)} />
              ))}
            </div>
            <div className="grid-2">
              <Field label="Votre niveau de diplôme">
                <Select value={draft.degree} onChange={(degree) => setDraft({ ...draft, degree })} options={DEGREES} />
              </Field>
              <Field label="Domicile (calcul des distances)">
                <HomeInput value={draft.home} onChange={(home) => setDraft({ ...draft, home })} />
              </Field>
              <Field label="Périmètre de recherche" hint="Au-delà, une offre sans télétravail mentionné reçoit la note 0 et passe dans « Hors critères ».">
                <Select value={draft.maxKm ?? 50} onChange={(maxKm) => setDraft({ ...draft, maxKm })} options={[20, 30, 40, 50, 75, 100, 150].map((d) => ({ value: d, label: `${d} km autour du domicile` }))} />
              </Field>
            </div>
          </>
        )}

        {current && (
          <TrackEditor
            track={current}
            cvs={cvs}
            cvOptions={cvOptions}
            pool={pool}
            links={draft.experiences}
            onChange={(t) => setTrack(current.id, t)}
            onRemove={() => removeTrack(current.id)}
            onParcours={() => setTab('parcours')}
          />
        )}

        {tab === 'parcours' && (
          <>
            <p className="muted small">
              Comme sur votre profil France Travail : rattachez chaque expérience de vos CV à un métier du référentiel ROME, cochez les savoir-faire que vous y avez exercés, et indiquez pour quels profils de recherche elle compte. Les années d'expérience de chaque profil et ses compétences en découlent.
            </p>
            {!pool.length && <p className="muted">Aucune expérience datée dans vos CV.</p>}
            {pool.map((e) => (
              <ExperienceRow key={e.key} exp={e} link={draft.experiences?.[e.key] ?? {}} tracks={tracks} onChange={(l) => setLink(e.key, l)} />
            ))}
          </>
        )}
      </div>
    </Modal>
  )
}

function TrackSummary({ track, pool, links, cvs, onOpen }: { track: MatchTrack; pool: PoolExperience[]; links?: Record<string, ExperienceLink>; cvs: ResumeDoc[]; onOpen: () => void }) {
  const years = trackYears(track.id, pool, links)
  const rome = trackRomeSkills(track.id, links).length
  const cv = cvs.find((d) => d.id === track.cvId)
  return (
    <button className="track-card" onClick={onOpen}>
      <strong>{track.name}</strong>
      <span className="small">
        {LEVELS.find((l) => l.value === (track.level ?? 'any'))?.label} · {fmtYears(years)} d'expérience · {track.targets.length} métier{track.targets.length > 1 ? 's' : ''} visé{track.targets.length > 1 ? 's' : ''}
      </span>
      <span className="small muted">
        {rome} savoir-faire ROME · CV : {cv?.name ?? 'aucun'}
      </span>
    </button>
  )
}

function TrackEditor({ track, cvs, cvOptions, pool, links, onChange, onRemove, onParcours }: { track: MatchTrack; cvs: ResumeDoc[]; cvOptions: { value: string; label: string }[]; pool: PoolExperience[]; links?: Record<string, ExperienceLink>; onChange: (t: Partial<MatchTrack>) => void; onRemove: () => void; onParcours: () => void }) {
  const skills = cvSkills(cvs.find((d) => d.id === track.cvId))
  const linked = pool.filter((e) => links?.[e.key]?.tracks?.includes(track.id))
  const rome = trackRomeSkills(track.id, links)
  return (
    <>
      <div className="grid-2">
        <Field label="Nom du profil">
          <TextInput value={track.name} onChange={(name) => onChange({ name })} />
        </Field>
        <Field label="Niveau visé" hint="Remplace le niveau des alertes pour ce profil.">
          <Segmented value={track.level ?? 'any'} onChange={(level) => onChange({ level })} options={LEVELS} />
        </Field>
      </div>
      <Field label="Métiers visés" hint="Entrée ou virgule pour ajouter. Les équivalents sont reconnus (Product Owner, PO, chef de produit...).">
        <Chips values={track.targets} onChange={(targets) => onChange({ targets })} placeholder="ex. Responsable d'exploitation" />
      </Field>
      <Field label="CV de référence de ce profil" hint="Ses compétences comptent pour ce profil ; il sert de base au « CV adapté ».">
        <Select value={track.cvId ?? ''} onChange={(v) => onChange({ cvId: v || undefined })} options={cvOptions} />
      </Field>
      {skills.length > 0 && (
        <div className="skill-preview">
          <span className="muted small">{skills.length} compétences du CV :</span> {skills.map((s) => <span key={s} className="skill-pill">{s}</span>)}
        </div>
      )}
      <Field label="Compétences en plus" hint="Ce que le CV ne dit pas (ex. management d'équipe, planning, budget).">
        <Chips values={track.skills ?? []} onChange={(skills) => onChange({ skills })} placeholder="ex. encadrement d'équipe" />
      </Field>
      <div className="track-parcours">
        <strong className="small">
          Expériences comptées : {fmtYears(trackYears(track.id, pool, links))}, {rome.length} savoir-faire ROME
        </strong>
        {linked.length ? (
          <ul className="small">
            {linked.map((e) => (
              <li key={e.key}>
                {e.title} <span className="muted">· {e.company} · {fmtYears(e.months / 12)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">Aucune expérience rattachée.</p>
        )}
        <div className="row-gap">
          <button className="btn sm" onClick={onParcours}>
            Modifier dans « Mon parcours »
          </button>
          <button className="btn sm ghost danger" onClick={onRemove}>
            <Trash2 size={14} /> Supprimer ce profil
          </button>
        </div>
      </div>
    </>
  )
}

const fmtDate = (d?: { year?: number; month?: number }) => (d?.year ? `${d.month ? `${String(d.month).padStart(2, '0')}/` : ''}${d.year}` : '')

function ExperienceRow({ exp, link, tracks, onChange }: { exp: PoolExperience; link: ExperienceLink; tracks: MatchTrack[]; onChange: (l: ExperienceLink) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState(false)
  const [q, setQ] = useState(mainTitle(exp.title))
  const [ix, setIx] = useState<RomeIndex | null>(null)
  const [fiche, setFiche] = useState<RomeFiche | null>(null)
  useEffect(() => {
    if (!search && link.rome) return
    loadRomeIndex()
      .then(setIx)
      .catch(() => toast.error('Référentiel ROME indisponible'))
  }, [search, link.rome])
  // métiers ROME proposés d'après l'intitulé de l'expérience (à confirmer : l'intitulé d'un CV est souvent personnalisé)
  const suggestions = useMemo(() => (ix && !link.rome ? searchRome(ix, mainTitle(exp.title), 3) : []), [ix, link.rome, exp.title])
  const pick = (code: string, label: string) => {
    onChange({ ...link, rome: code, romeLabel: label, skills: code === link.rome ? link.skills : [] })
    setSearch(false)
    setOpen(true)
  }
  useEffect(() => {
    if (!open || !link.rome) return
    setFiche(null)
    loadFiche(link.rome)
      .then(setFiche)
      .catch(() => toast.error('Fiche ROME introuvable'))
  }, [open, link.rome])
  const hits = useMemo(() => (ix && search && q.trim() ? searchRome(ix, q, 8) : []), [ix, search, q])
  const picked = new Set(link.skills ?? [])
  const toggle = (l: string) => onChange({ ...link, skills: picked.has(l) ? [...picked].filter((x) => x !== l) : [...picked, l] })
  const keyItems = fiche ? fiche.savoirFaire.flatMap((g) => g.items.filter((i) => i.c).map((i) => i.l)) : []
  return (
    <div className="exp-row">
      <div className="exp-head">
        <div>
          <strong>{exp.title}</strong>
          <span className="small muted">
            {' '}
            · {exp.company} · {fmtDate(exp.start)} à {exp.current ? "aujourd'hui" : fmtDate(exp.end) || '?'} ({fmtYears(exp.months / 12)})
          </span>
        </div>
        <div className="exp-tracks">
          {tracks.map((t) => {
            const on = !!link.tracks?.includes(t.id)
            return (
              <button key={t.id} className={`track-toggle${on ? ' on' : ''}`} onClick={() => onChange({ ...link, tracks: on ? link.tracks!.filter((x) => x !== t.id) : [...(link.tracks ?? []), t.id] })} title={`Compter cette expérience pour le profil « ${t.name} »`}>
                {on ? <Check size={12} /> : null} {t.name}
              </button>
            )
          })}
        </div>
      </div>
      <div className="exp-rome small">
        <span className="muted">Métier ROME :</span>{' '}
        {link.rome ? (
          <>
            <strong>{link.romeLabel}</strong> <span className="muted">({link.rome})</span>
          </>
        ) : (
          <>
            <em className="muted">non rattaché</em>
            {suggestions.map((h) => (
              <button key={h.code} className="btn xs" onClick={() => pick(h.code, h.intitule)} title="Rattacher à ce métier">
                {h.intitule}
              </button>
            ))}
          </>
        )}
        <button className="btn xs ghost" onClick={() => setSearch((s) => !s)}>
          <Search size={12} /> {link.rome ? 'Changer' : 'Chercher'}
        </button>
        {link.rome && (
          <button className="btn xs ghost" onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Savoir-faire ({picked.size})
          </button>
        )}
      </div>
      {search && (
        <div className="rome-pick">
          <TextInput value={q} onChange={setQ} placeholder="Intitulé du métier exercé" autoFocus />
          <div className="rome-hits">
            {hits.map((h) => (
              <button
                key={h.code}
                className="menu-item"
                onClick={() => pick(h.code, h.intitule)}
              >
                <strong>{h.intitule}</strong> <span className="muted small">{h.code}{h.matches.length ? ` · ${h.matches.slice(0, 2).join(', ')}` : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {open && link.rome && (
        <div className="rome-skills">
          {!fiche ? (
            <p className="small muted">Chargement de la fiche…</p>
          ) : (
            <>
              <div className="row-gap small">
                <button className="btn xs" onClick={() => onChange({ ...link, skills: [...new Set([...picked, ...keyItems])] })}>
                  Cocher les compétences clés ({keyItems.length})
                </button>
                {picked.size > 0 && (
                  <button className="btn xs ghost" onClick={() => onChange({ ...link, skills: [] })}>
                    Tout décocher
                  </button>
                )}
                <a className="small" href={metierscopeUrl(link.rome)} target="_blank" rel="noopener noreferrer">
                  Fiche Métierscope <ExternalLink size={11} />
                </a>
              </div>
              {fiche.savoirFaire.map((g) => (
                <div key={g.g} className="rome-group">
                  <span className="small muted">{g.g}</span>
                  <div className="rome-pills">
                    {g.items.map((i) => (
                      <button key={i.l} className={`rome-pill${picked.has(i.l) ? ' on' : ''}${i.c ? ' key' : ''}`} onClick={() => toggle(i.l)} title={i.c ? 'Compétence clé du métier' : undefined}>
                        {i.l}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
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


