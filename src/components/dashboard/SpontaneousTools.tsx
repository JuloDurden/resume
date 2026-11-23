// Candidatures spontanées : création, analyse de l'entreprise par Claude, fiche entreprise.
import { useMemo, useState } from 'react'
import { Download, Building2, ClipboardCopy, ExternalLink, Plus, RefreshCw, Sparkles, X } from 'lucide-react'
import type { Company, FeedItem, Offer, ResumeDoc } from '../../types'
import { useDocs } from '../../store/documents'
import { useFeed } from '../../store/feed'
import { newOffer } from '../../lib/offers'
import { uid } from '../../lib/ids'
import { download, resumeToText } from '../../lib/export'
import { fileSafe } from '../../lib/filename'
import { CLAUDE_URL, copyText } from '../../lib/prompts'
import { analysisMarkdown, VERDICT, companyAnalysisPrompt, companyOpenings, parseCompanyAnalysis, postSuggestions, sameCompany, spontaneousDescription, spontaneousTitle } from '../../lib/spontaneous'
import { Field, Modal, TextArea, TextInput, toast } from '../ui'

const href = (u: string) => (/^https?:/i.test(u) ? u : `https://${u}`)

/** Annonces connues (veille et ajouts manuels). */
function useKnownItems(): FeedItem[] {
  const feed = useFeed((s) => s.feed?.items)
  const manual = useDocs((s) => s.watch.manual)
  return useMemo(() => [...(feed ?? []), ...(manual ?? [])], [feed, manual])
}

/** Ajoute l'entreprise à « Sites et entreprises » si elle n'y est pas ; complète sa page carrières si on la découvre. */
export function ensureCompany(name: string | undefined, url: string | undefined, careers?: string) {
  if (!name?.trim()) return
  const { watch, setCompanies } = useDocs.getState()
  const list: Company[] = watch.companies ?? []
  const found = list.find((c) => sameCompany(c.name, name))
  if (found) {
    // page d'accueil enregistrée faute de mieux : on la remplace par la vraie page carrières
    if (careers && found.url !== careers && found.active === false) setCompanies(list.map((c) => (c.id === found.id ? { ...c, url: careers, active: true } : c)))
    return
  }
  const u = careers || url
  if (!u) return
  // sans page carrières, la veille ne saurait pas lire les offres : l'entreprise est ajoutée en pause
  setCompanies([...list, { id: uid().replace(/[^a-zA-Z0-9]/g, ''), name: name.trim(), url: href(u), active: !!careers }])
}

/** CV de référence qui sert de base à l'analyse : celui du profil de recherche, sinon le plus récent. */
function baseCv(): ResumeDoc | undefined {
  const { docs, watch } = useDocs.getState()
  const all = Object.values(docs).filter((d): d is ResumeDoc => d.kind === 'resume')
  const id = watch.profile?.cvId ?? watch.profile?.tracks?.find((t) => t.cvId)?.cvId
  return (id ? all.find((d) => d.id === id) : undefined) ?? all.filter((d) => d.reference).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? all.sort((a, b) => b.updatedAt - a.updatedAt)[0]
}

/** Choix des postes visés : suggestions cliquables + saisie libre. */
function PostPicker({ offer, value, onChange, max = 10 }: { offer: Pick<Offer, 'company' | 'analysis'>; value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const items = useKnownItems()
  const profile = useDocs((s) => s.watch.profile)
  const [text, setText] = useState('')
  const sugg = postSuggestions({ ...offer, posts: value }, items, profile)
  const add = (t: string) => {
    const v = t.trim()
    if (v && !value.includes(v)) onChange([...value, v])
    setText('')
  }
  return (
    <div className="post-picker">
      <div className="tags-input">
        {value.map((p) => (
          <span key={p} className="chip">
            {p}
            <button type="button" aria-label={`Retirer ${p}`} onClick={() => onChange(value.filter((x) => x !== p))}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={text}
          placeholder={value.length ? '' : 'Poste visé, puis Entrée (facultatif)'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(text)
            }
          }}
          onBlur={() => text.trim() && add(text)}
        />
      </div>
      {sugg.length > 0 && (
        <div className="post-sugg">
          <span className="muted small">Suggestions :</span>
          {sugg.slice(0, max).map((s) => (
            <button key={s.title} type="button" className="sugg-chip" title={s.from} onClick={() => add(s.title)}>
              <Plus size={12} /> {s.title}
              {s.fit !== undefined && <em className={s.fit >= 70 ? 'ok' : s.fit >= 50 ? 'mid' : 'low'}>{s.fit}</em>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Nouvelle candidature spontanée. */
export function SpontaneousModal({ onClose, onCreated, preset }: { onClose: () => void; onCreated?: (o: Offer) => void; preset?: { name?: string; url?: string; careers?: string } }) {
  const saveOffer = useDocs((s) => s.saveOffer)
  const offers = useDocs((s) => s.offers)
  const [company, setCompany] = useState(preset?.name ?? '')
  const [website, setWebsite] = useState(preset?.url ?? '')
  const [careers, setCareers] = useState(preset?.careers ?? '')
  const [location, setLocation] = useState('')
  const [posts, setPosts] = useState<string[]>([])
  const twin = Object.values(offers).find((o) => o.spontaneous && sameCompany(o.company, company))
  const create = () => {
    if (!company.trim()) return toast.error("Indiquez l'entreprise")
    const o = newOffer({ spontaneous: true, company: company.trim(), website: website.trim() || undefined, location: location.trim() || undefined, posts, title: spontaneousTitle(posts), url: careers.trim() || undefined })
    saveOffer(o)
    ensureCompany(company, website, careers.trim() || undefined)
    toast.ok("Candidature spontanée créée : analysez maintenant l'entreprise")
    onClose()
    onCreated?.(o)
  }
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Nouvelle candidature spontanée"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={create}>
            Créer et analyser l'entreprise
          </button>
        </>
      }
    >
      <div className="form-stack">
        <div className="grid-2">
          <Field label="Entreprise">
            <TextInput value={company} onChange={setCompany} placeholder="GSF, Urbasolar…" autoFocus />
          </Field>
          <Field label="Site web">
            <TextInput value={website} onChange={setWebsite} placeholder="https://…" />
          </Field>
          <Field label="Page carrières (facultatif)" hint="Permet à la veille de suivre ses offres. Claude la cherchera sinon.">
            <TextInput value={careers} onChange={setCareers} placeholder="https://…/carrieres" />
          </Field>
          <Field label="Lieu (facultatif)">
            <TextInput value={location} onChange={setLocation} placeholder="Montpellier" />
          </Field>
        </div>
        <Field label="Postes visés" hint="Un ou plusieurs. Après l'analyse, Claude proposera les postes qui correspondent à l'entreprise : vous pourrez les ajouter.">
          <PostPicker offer={{ company }} value={posts} onChange={setPosts} />
        </Field>
        {twin && <p className="notice small">Une candidature spontanée existe déjà pour {twin.company} : « {twin.title} ».</p>}
      </div>
    </Modal>
  )
}

/** Analyse de l'entreprise : prompt à copier dans Claude, réponse à recoller. */
export function CompanyAnalysisModal({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const saveOffer = useDocs((s) => s.saveOffer)
  const profile = useDocs((s) => s.watch.profile)
  const items = useKnownItems()
  const [answer, setAnswer] = useState('')
  const [err, setErr] = useState('')
  const cv = baseCv()
  const openings = companyOpenings(offer.company, items)
  const prompt = companyAnalysisPrompt(offer, { cvText: cv ? resumeToText(cv) : '', profile, openings })
  const save = () => {
    try {
      const a = parseCompanyAnalysis(answer)
      const next: Offer = { ...offer, analysis: a, website: offer.website || a.website, url: offer.url || a.careersUrl }
      next.description = spontaneousDescription(next)
      saveOffer(next)
      ensureCompany(offer.company, next.website, a.careersUrl)
      toast.ok(`Fiche entreprise enregistrée${a.fit !== undefined ? ` : adéquation ${a.fit}/100` : ''}`)
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Analyser ${offer.company || "l'entreprise"} avec Claude`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={save} disabled={!answer.trim()}>
            Enregistrer la fiche
          </button>
        </>
      }
    >
      <div className="form-stack">
        <ol className="steps-list">
          <li>
            <strong>Copiez le prompt</strong> et collez-le dans Claude (recherche web activée).
            <div className="row-gap" style={{ marginTop: 6 }}>
              <button className="btn sm primary" onClick={async () => toast[(await copyText(prompt)) ? 'ok' : 'error']('Prompt copié')}>
                <ClipboardCopy size={14} /> Copier le prompt
              </button>
              <a className="btn sm" href={CLAUDE_URL} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> Ouvrir Claude
              </a>
            </div>
            <p className="muted small">
              Base : {cv ? `CV « ${cv.name} »` : 'aucun CV'}
              {profile?.tracks?.length ? `, profils ${profile.tracks.map((t) => t.name).join(' et ')}` : ''}
              {openings.length ? `, ${openings.length} offre${openings.length > 1 ? 's' : ''} de l'entreprise déjà dans la veille` : ''}.
            </p>
          </li>
          <li>
            <strong>Collez toute sa réponse</strong> ci-dessous (avec le bloc JSON de la fin).
          </li>
        </ol>
        <TextArea
          value={answer}
          minRows={8}
          onChange={(v) => {
            setAnswer(v)
            setErr('')
          }}
          placeholder="Réponse de Claude…"
        />
        {err && <p className="error-text small">{err}</p>}
      </div>
    </Modal>
  )
}

/** Fiche entreprise dans la candidature ouverte. */
export function CompanyCard({ offer, onAnalyse }: { offer: Offer; onAnalyse: () => void }) {
  const saveOffer = useDocs((s) => s.saveOffer)
  const a = offer.analysis
  const setPosts = (posts: string[]) => {
    const next: Offer = { ...offer, posts, title: spontaneousTitle(posts) }
    next.description = spontaneousDescription(next) || offer.description
    saveOffer(next)
  }
  if (!a)
    return (
      <div className="co-card empty">
        <Building2 size={18} className="muted" />
        <div>
          <strong>Entreprise pas encore analysée</strong>
          <p className="muted small">Claude cherche son activité, ses actualités et ses besoins, propose les postes qui te correspondent et note ton adéquation.</p>
        </div>
        <button className="btn sm primary" onClick={onAnalyse}>
          <Sparkles size={14} /> Analyser l'entreprise
        </button>
      </div>
    )
  const tone = a.fit === undefined ? '' : a.fit >= 70 ? 'ok' : a.fit >= 50 ? 'mid' : 'low'
  const v = a.verdict ? VERDICT[a.verdict] : undefined
  return (
    <div className="co-card">
      <div className="co-head">
        {a.fit !== undefined && (
          <div className={`co-fit ${tone}`} title="Adéquation de ton profil, selon Claude">
            <b>{a.fit}</b>
            <span>/100</span>
          </div>
        )}
        <div className="co-id">
          {v && <span className={`co-verdict ${v.tone}`}>{v.label}</span>}
          <p>{a.summary}</p>
          <p className="muted small">{[a.sector, a.size].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="co-actions">
          <button className="btn sm" onClick={async () => toast[(await copyText(analysisMarkdown(offer))) ? 'ok' : 'error']('Fiche copiée : collez-la dans Claude')} title="Copier la fiche en Markdown, prête à coller dans Claude">
            <ClipboardCopy size={13} /> Copier la fiche
          </button>
          <button className="btn sm" onClick={() => download(`${fileSafe(`Analyse - ${offer.company || 'entreprise'}`)}.md`, analysisMarkdown(offer), 'text/markdown')} title="Télécharger la fiche (.md), à joindre dans Claude">
            <Download size={13} /> .md
          </button>
          <button className="btn sm ghost" onClick={onAnalyse} title={`Analyse du ${new Date(a.at).toLocaleDateString('fr-FR')}`}>
            <RefreshCw size={13} /> Refaire
          </button>
        </div>
      </div>
      {a.angle && (
        <p className="co-angle">
          <strong>Angle d'approche :</strong> {a.angle}
        </p>
      )}
      <div className="co-grid">
        {a.needs?.length ? (
          <section>
            <h4>Besoins probables</h4>
            <ul>
              {a.needs.map((n, i) => (
                <li key={i}>
                  {n.need}
                  {n.why && <span className="muted small"> : {n.why}</span>}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section>
          <h4>Ce qui colle / ce qui manque</h4>
          <ul className="co-fitlist">
            {a.matches?.map((m, i) => (
              <li key={`m${i}`} className="ok">
                {m}
              </li>
            ))}
            {a.gaps?.map((m, i) => (
              <li key={`g${i}`} className="gap">
                {m}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h4>Postes visés</h4>
          <PostPicker offer={offer} value={offer.posts ?? []} onChange={setPosts} max={6} />
        </section>
        {(a.contacts?.length || a.news?.length || a.openings?.length) && (
          <section>
            {a.contacts?.length ? (
              <>
                <h4>À qui écrire</h4>
                <ul>
                  {a.contacts.map((c, i) => (
                    <li key={i}>
                      {[c.name, c.role].filter(Boolean).join(', ')}
                      {c.url && (
                        <>
                          {' '}
                          <a href={c.url} target="_blank" rel="noreferrer">
                            source
                          </a>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {a.news?.length ? (
              <>
                <h4>Actualités</h4>
                <ul>
                  {a.news.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {a.openings?.length ? (
              <>
                <h4>Offres publiées</h4>
                <ul>
                  {a.openings.map((o, i) => (
                    <li key={i}>{o.url ? <a href={o.url} target="_blank" rel="noreferrer">{o.title}</a> : o.title}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        )}
      </div>
      {a.sources?.length ? (
        <p className="muted small co-sources">
          Sources :{' '}
          {a.sources.slice(0, 6).map((s, i) => (
            <a key={i} href={s} target="_blank" rel="noreferrer">
              {(() => {
                try {
                  return new URL(s).hostname.replace(/^www\./, '')
                } catch {
                  return s
                }
              })()}
            </a>
          ))}
        </p>
      ) : null}
    </div>
  )
}
