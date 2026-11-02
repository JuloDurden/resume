import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { ArrowLeft, Check, ClipboardCopy, ExternalLink, Plus, Search, Sparkles, Star, X } from 'lucide-react'
import { ROME_SOURCE, genderForm, mainTitle, loadFiche, loadRomeIndex, metierscopeUrl, refineWords, searchRome, type Gender, type RomeFiche, type RomeHit, type RomeIndex } from '../lib/rome'
import { CLAUDE_URL, copyText, parseBullets } from '../lib/prompts'
import { Segmented, TextArea, toast } from './ui'

export interface RomeContext {
  /** texte de recherche initial (intitulé du poste ou de l'offre) */
  query?: string
  /** code ROME connu (ouvre directement la fiche) */
  code?: string
  /** texte du contexte (entreprise, puces) pour proposer des mots qui affinent la recherche */
  context?: string
  /** si fourni : les intitulés deviennent sélectionnables pour ce poste */
  onPick?: (title: string) => void
  /** intitulés déjà retenus pour ce poste */
  picked?: string[]
  /** prompt Claude pour choisir l'intitulé le mieux adapté à une offre */
  claudePrompt?: (fiche: RomeFiche) => string
  label?: string
}

interface DrawerState {
  ctx: RomeContext | null
  open: (ctx: RomeContext) => void
  close: () => void
}

export const useRomeDrawer = create<DrawerState>((set) => ({
  ctx: null,
  open: (ctx) => set({ ctx }),
  close: () => set({ ctx: null }),
}))

const GENDER_KEY = 'resume-rome-gender'

function FicheView({ fiche, ctx, gender, onOpen }: { fiche: RomeFiche; ctx: RomeContext; gender: Gender; onOpen: (code: string) => void }) {
  const [picked, setPicked] = useState<string[]>(ctx.picked ?? [])
  const [answer, setAnswer] = useState('')
  const [showAllSkills, setShowAllSkills] = useState(false)
  const titles = useMemo(() => [...new Set([genderForm(fiche.intitule, gender), ...fiche.appellations.map((a) => genderForm(a, gender))])], [fiche, gender])
  const pick = (t: string) => {
    ctx.onPick?.(t)
    setPicked((p) => (p.includes(t) ? p : [...p, t]))
    toast.ok(`« ${t} » ajouté aux intitulés du poste`)
  }
  const core = fiche.savoirFaire.flatMap((g) => g.items.filter((i) => i.c).map((i) => i.l))
  return (
    <div className="rome-fiche">
      <div className="rome-fiche-head">
        <span className="rome-code">{fiche.code}</span>
        <h2>{genderForm(fiche.intitule, gender)}</h2>
        <a className="btn sm" href={metierscopeUrl(fiche.code)} target="_blank" rel="noreferrer">
          <ExternalLink size={13} /> MétierScope
        </a>
      </div>

      <section>
        <h3>Intitulés équivalents ({titles.length})</h3>
        <p className="muted small">{ctx.onPick ? 'Cliquez sur un intitulé pour l\'ajouter aux variantes de ce poste.' : 'Intitulés reconnus pour ce métier : utiles pour vos recherches et vos mots-clés.'}</p>
        <div className="rome-titles">
          {titles.map((t) =>
            ctx.onPick ? (
              <button key={t} className={`rome-title${picked.includes(t) ? ' on' : ''}`} onClick={() => pick(t)}>
                {picked.includes(t) ? <Check size={12} /> : <Plus size={12} />}
                {t}
              </button>
            ) : (
              <span key={t} className="rome-title static">
                {t}
              </span>
            ),
          )}
        </div>
      </section>

      {ctx.claudePrompt && ctx.onPick && (
        <section className="rome-claude">
          <h3>
            <Sparkles size={14} /> Intitulé le plus adapté à l'offre
          </h3>
          <div className="row-gap">
            <button
              className="btn sm primary"
              onClick={async () => {
                if (await copyText(ctx.claudePrompt!(fiche))) {
                  toast.ok('Prompt copié')
                  window.open(CLAUDE_URL, '_blank', 'noopener')
                }
              }}
            >
              <ClipboardCopy size={14} /> Copier et ouvrir Claude
            </button>
          </div>
          <TextArea value={answer} onChange={setAnswer} minRows={2} placeholder="Collez la réponse de Claude (une puce par intitulé)..." />
          {answer.trim() && (
            <div className="rome-titles">
              {parseBullets(answer).map((t) => (
                <button key={t} className={`rome-title${picked.includes(t) ? ' on' : ''}`} onClick={() => pick(t.replace(/\s*[:(].*$/, '').trim())}>
                  <Plus size={12} />
                  {t}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {fiche.definition && (
        <section>
          <h3>Définition</h3>
          <p>{fiche.definition}</p>
        </section>
      )}
      {fiche.acces && (
        <section>
          <h3>Accès au métier</h3>
          <p>{fiche.acces}</p>
        </section>
      )}
      {fiche.savoirFaire.length > 0 && (
        <section>
          <h3>Compétences</h3>
          {core.length > 0 && (
            <>
              <div className="rome-sub">
                <Star size={12} /> Cœur de métier
              </div>
              <ul className="rome-list">
                {core.map((l) => (
                  <li key={l} className="core">
                    {l}
                    <CopyBtn text={l} />
                  </li>
                ))}
              </ul>
            </>
          )}
          <button className="btn ghost sm" onClick={() => setShowAllSkills((v) => !v)}>
            {showAllSkills ? 'Masquer' : 'Voir'} toutes les compétences ({fiche.savoirFaire.reduce((a, g) => a + g.items.length, 0)})
          </button>
          {showAllSkills &&
            fiche.savoirFaire.map((g) => (
              <div key={g.g}>
                <div className="rome-sub">{g.g}</div>
                <ul className="rome-list">
                  {g.items.map((i) => (
                    <li key={i.l} className={i.c ? 'core' : ''}>
                      {i.l}
                      <CopyBtn text={i.l} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </section>
      )}
      {fiche.savoirEtre.length > 0 && (
        <section>
          <h3>Savoir-être professionnels</h3>
          <div className="rome-chips">
            {fiche.savoirEtre.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
        </section>
      )}
      {fiche.savoirs.length > 0 && (
        <section>
          <h3>Savoirs</h3>
          {fiche.savoirs.map((g) => (
            <div key={g.g}>
              <div className="rome-sub">{g.g}</div>
              <div className="rome-chips">
                {g.items.map((i) => (
                  <span key={i.l}>{i.l}</span>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
      {fiche.contextes.length > 0 && (
        <section>
          <h3>Contextes de travail</h3>
          {fiche.contextes.map((g) => (
            <div key={g.g} className="rome-ctx">
              <strong>{g.g} : </strong>
              {g.items.join(', ')}
            </div>
          ))}
        </section>
      )}
      {fiche.mobilites.length > 0 && (
        <section>
          <h3>Métiers proches (mobilités)</h3>
          <div className="rome-mob">
            {fiche.mobilites.map((m) => (
              <button key={m.code} onClick={() => onOpen(m.code)}>
                <span className="rome-code">{m.code}</span> {genderForm(m.intitule, gender)}
              </button>
            ))}
          </div>
        </section>
      )}
      <p className="rome-source">Source : {ROME_SOURCE}.</p>
    </div>
  )
}

function CopyBtn({ text }: { text: string }) {
  return (
    <button
      className="icon-btn xs rome-copy"
      title="Copier"
      onClick={async () => {
        if (await copyText(text)) toast.ok('Copié')
      }}
    >
      <ClipboardCopy size={12} />
    </button>
  )
}

/** Volet latéral : recherche dans le ROME et fiche métier. */
export function RomeDrawer() {
  const { ctx, close } = useRomeDrawer()
  const [ix, setIx] = useState<RomeIndex | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const [fiche, setFiche] = useState<RomeFiche | null>(null)
  const [gender, setGender] = useState<Gender>(() => (localStorage.getItem(GENDER_KEY) as Gender) || 'm')

  useEffect(() => {
    if (!ctx) return
    setQuery(mainTitle(ctx.query ?? ''))
    setCode(ctx.code ?? null)
    loadRomeIndex()
      .then(setIx)
      .catch((e) => setError(e.message))
  }, [ctx])

  useEffect(() => {
    if (!code) return setFiche(null)
    setFiche(null)
    loadFiche(code)
      .then(setFiche)
      .catch((e) => setError(e.message))
  }, [code])

  useEffect(() => {
    if (!ctx) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ctx, close])

  const hits: RomeHit[] = useMemo(() => (ix && query.trim() ? searchRome(ix, query) : []), [ix, query])
  const refine = useMemo(() => (ix && ctx?.context ? refineWords(ix, query, ctx.context) : []), [ix, query, ctx?.context])

  if (!ctx) return null
  return (
    <aside className="rome-drawer" role="dialog" aria-label="Fiche métier">
      <header>
        {code && (
          <button className="icon-btn" onClick={() => setCode(null)} title="Retour à la recherche">
            <ArrowLeft size={17} />
          </button>
        )}
        <strong>{ctx.label ?? 'Fiches métiers ROME'}</strong>
        <Segmented
          value={gender}
          onChange={(g) => {
            setGender(g)
            localStorage.setItem(GENDER_KEY, g)
          }}
          options={[
            { value: 'm', label: 'Masculin' },
            { value: 'f', label: 'Féminin' },
            { value: 'both', label: 'M / F' },
          ]}
        />
        <button className="icon-btn" onClick={close} title="Fermer (Échap)">
          <X size={18} />
        </button>
      </header>
      <div className="rome-body">
        {error && <div className="notice warn">{error}</div>}
        {!code ? (
          <>
            <div className="rome-search">
              <Search size={16} />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Intitulé de poste ou métier (ex. chef de secteur, product owner)" />
            </div>
            {refine.length > 0 && (
              <div className="rome-refine">
                <span className="muted small">Affiner avec :</span>
                {refine.map((w) => (
                  <button key={w} onClick={() => setQuery((q) => `${q} ${w}`.trim())}>
                    + {w}
                  </button>
                ))}
              </div>
            )}
            {!ix && !error && <p className="muted">Chargement du référentiel...</p>}
            {ix && query.trim() && !hits.length && <p className="muted">Aucun métier trouvé. Essayez un autre mot (ex. « chef » au lieu de « responsable »).</p>}
            <ul className="rome-hits">
              {hits.map((h) => (
                <li key={h.code}>
                  <button onClick={() => setCode(h.code)}>
                    <span className="rome-code">{h.code}</span>
                    <span className="rome-hit-main">
                      <strong>{genderForm(h.intitule, gender)}</strong>
                      {h.matches.length > 0 && <span>{h.matches.map((m) => genderForm(m, gender)).join(' · ')}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {ix && <p className="rome-source">{ix.version}. Source : {ROME_SOURCE}.</p>}
          </>
        ) : fiche ? (
          <FicheView key={fiche.code} fiche={fiche} ctx={ctx} gender={gender} onOpen={setCode} />
        ) : (
          !error && <p className="muted">Chargement de la fiche...</p>
        )}
      </div>
    </aside>
  )
}
