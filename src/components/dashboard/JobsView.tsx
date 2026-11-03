import { useEffect, useMemo, useState } from 'react'
import { BellRing, BookOpen, CalendarClock, Ban, Trash2, X, Target, Sparkles, Check, AlertTriangle, ArrowDownWideNarrow, Briefcase, ChevronDown, ChevronUp, Clock, Euro, ExternalLink, Eye, EyeOff, MapPin, RefreshCw, Search, Settings2, Star } from 'lucide-react'
import type { FeedItem, JobReview, MarkState, ResumeDoc } from '../../types'
import { geocode, matchItem, resolveProfile, scoreClass, type MatchResult } from '../../lib/match'
import { ClaudeRankModal, MatchProfileModal } from './MatchTools'
import { useDocs } from '../../store/documents'
import { useFeed } from '../../store/feed'
import { useSync } from '../../store/sync'
import { ago, offerFromItem, searchLinks } from '../../lib/watch'
import { useRomeDrawer } from '../RomeDrawer'
import { AlertsModal } from './AlertsModal'
import { Segmented, toast } from '../ui'

type Filter = 'new' | 'fav' | 'applied' | 'hidden'

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/** Vrai si l'annonce contient un des termes exclus (au début d'un mot, sans tenir compte des accents). */
export function excluded(item: FeedItem, terms: string[]): boolean {
  if (!terms.length) return false
  const hay = ` ${norm(`${item.title} ${item.company ?? ''} ${item.contract ?? ''}`).replace(/[^a-z0-9]+/g, ' ')} `
  return terms.some((t) => {
    const k = norm(t).replace(/[^a-z0-9]+/g, ' ').trim()
    return k && hay.includes(` ${k}`)
  })
}

function ExcludeBar({ terms, onChange, count }: { terms: string[]; onChange: (t: string[]) => void; count: number }) {
  const [v, setV] = useState('')
  const add = () => {
    const parts = v
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x && !terms.some((t) => norm(t) === norm(x)))
    if (parts.length) onChange([...terms, ...parts])
    setV('')
  }
  return (
    <div className="exclude-bar">
      <span className="muted small">
        <Ban size={13} /> Exclure :
      </span>
      {terms.map((t) => (
        <span key={t} className="exclude-chip">
          {t}
          <button title={`Ne plus exclure « ${t} »`} onClick={() => onChange(terms.filter((x) => x !== t))}>
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
        placeholder={terms.length ? 'Ajouter un terme' : 'ex. alternance, B2B, stage (Entrée pour valider)'}
      />
      {count > 0 && <span className="muted small">{count} annonce{count > 1 ? 's' : ''} exclue{count > 1 ? 's' : ''}</span>}
    </div>
  )
}

function MatchDetails({ m, review }: { m: MatchResult; review?: JobReview }) {
  const pct = (v: number) => `${Math.round(v * 100)} %`
  return (
    <div className="match-details">
      <div className="match-chips">
        <span className={m.title.v >= 0.75 ? 'ok' : m.title.v >= 0.4 ? 'mid' : 'no'} title="Intitulé comparé à vos métiers visés">
          <Target size={12} /> Intitulé {pct(m.title.v)}
          {m.title.target && m.title.v > 0 ? ` (${m.title.target})` : ''}
        </span>
        {m.skills ? (
          <span className={m.skills.v >= 0.5 ? 'ok' : m.skills.v >= 0.25 ? 'mid' : 'no'} title={m.skills.matched.join(', ') || 'Aucune compétence du CV trouvée'}>
            <Check size={12} /> Compétences {m.skills.matched.length}/{m.skills.total}
          </span>
        ) : (
          <span className="na" title="Le texte complet de l'annonce n'est pas disponible">Compétences : texte indisponible</span>
        )}
        <span className={m.level.kind === 'junior' ? 'ok' : m.level.kind === 'senior' ? 'no' : 'mid'}>{m.level.label}</span>
        <span className={m.place.v >= 0.85 ? 'ok' : m.place.v >= 0.5 ? 'mid' : 'no'}>
          <MapPin size={12} /> {m.place.label}
        </span>
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

function JobCard({ item, mark, alertNames, onApply, isNew, selected, onSelect, match, review }: { item: FeedItem; mark: MarkState; alertNames: string[]; onApply: () => void; isNew: boolean; selected: boolean; onSelect: (v: boolean) => void; match?: MatchResult; review?: JobReview }) {
  const setMark = useDocs((s) => s.mark)
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
          <button className={`match-badge ${scoreClass(match.score)}`} title="Indice de correspondance avec votre profil (détails)" onClick={() => setOpen((o) => !o)}>
            {match.score}
          </button>
        )}
        <button className={`icon-btn${mark === 'fav' ? ' fav' : ''}`} title={mark === 'fav' ? 'Retirer des favoris' : 'Mettre en favori'} onClick={() => setMark(item.id, mark === 'fav' ? 'none' : 'fav')}>
          <Star size={17} fill={mark === 'fav' ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="jc-meta">
        {item.location && (
          <span>
            <MapPin size={12} /> {item.location}
          </span>
        )}
        {item.contract && (
          <span>
            <Briefcase size={12} /> {item.contract}
            {item.worktime ? `, ${item.worktime.toLowerCase()}` : ''}
          </span>
        )}
        {item.salary && (
          <span>
            <Euro size={12} /> {item.salary}
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
        <span className="jc-source">{item.source}</span>
        {alertNames.map((n) => (
          <span key={n} className="jc-alert">
            {n}
          </span>
        ))}
      </div>
      {open && (
        <div className="jc-open">
          {match && <MatchDetails m={match} review={review} />}
          {item.fullText ? (
            <details className="jc-full" open>
              <summary>Texte complet de l'annonce</summary>
              <div className="jc-desc">{item.fullText}</div>
            </details>
          ) : (
            item.description && <p className="jc-desc">{item.description}</p>
          )}
          {!item.fullText && <p className="muted small">Texte complet non disponible pour ce site : ouvrez l'annonce pour la lire en entier.</p>}
        </div>
      )}
      <div className="jc-actions">
        {mark === 'applied' ? (
          <span className="applied-badge">Candidature créée</span>
        ) : (
          <button className="btn sm primary" onClick={onApply}>
            Créer la candidature
          </button>
        )}
        <a className="btn sm" href={item.url} target="_blank" rel="noreferrer">
          <ExternalLink size={13} /> Annonce
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
            <button className="btn sm ghost" onClick={() => setMark(item.id, 'none')}>
              <Eye size={13} /> Restaurer
            </button>
            <button className="btn sm ghost danger" onClick={() => setMark(item.id, 'deleted')} title="Supprimer définitivement cette annonce">
              <Trash2 size={13} /> Supprimer
            </button>
          </>
        ) : (
          mark !== 'applied' && (
            <button className="btn sm ghost" onClick={() => setMark(item.id, 'hidden')} title="Ne plus afficher cette annonce">
              <EyeOff size={13} /> Masquer
            </button>
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
  const setMark = useDocs((s) => s.mark)
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

  const terms = useMemo(() => watch.excludes ?? [], [watch.excludes])
  const markOf = (id: string): MarkState => watch.marks[id]?.s ?? 'none'
  const all = useMemo(() => (feed?.items ?? []).filter((i) => watch.marks[i.id]?.s !== 'deleted'), [feed, watch.marks])
  // les termes exclus ne cachent pas les favoris ni les candidatures
  const items = useMemo(() => all.filter((i) => ['fav', 'applied'].includes(watch.marks[i.id]?.s ?? '') || !excluded(i, terms)), [all, terms, watch.marks])
  const excludedCount = all.length - items.length
  const names = useMemo<Record<string, string>>(() => ({ email: 'Alerte email', ...Object.fromEntries(watch.alerts.map((a) => [a.id, a.keywords])) }), [watch.alerts])
  const counts = useMemo(() => {
    const c = { new: 0, fav: 0, applied: 0, hidden: 0 }
    for (const i of items) {
      const m = markOf(i.id)
      if (m === 'none') c.new++
      else if (m !== 'deleted') c[m]++
    }
    return c
  }, [items, watch.marks]) // eslint-disable-line react-hooks/exhaustive-deps
  const nq = q.trim().toLowerCase()
  const cvs = useMemo(() => Object.values(docsMap).filter((d): d is ResumeDoc => d.kind === 'resume'), [docsMap])
  const profile = useMemo(() => resolveProfile(watch.profile, cvs, watch.alerts), [watch.profile, cvs, watch.alerts, geoTick]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => geocode([...items.map((i) => i.location), watch.alerts[0]?.commune], () => setGeoTick((t) => t + 1)), [items, watch.alerts])
  const matches = useMemo(() => Object.fromEntries(items.map((i) => [i.id, matchItem(i, profile)])), [items, profile, geoTick]) // eslint-disable-line react-hooks/exhaustive-deps
  const reviews = watch.reviews ?? {}
  const rank = (i: FeedItem) => reviews[i.id]?.score ?? matches[i.id]?.score ?? 0
  const filtered = items.filter((i) => {
    const m = markOf(i.id)
    if (filter === 'new' ? m !== 'none' : m !== filter) return false
    if (alert !== 'all' && !i.alerts.includes(alert)) return false
    if (nq && !`${i.title} ${i.company ?? ''} ${i.location ?? ''}`.toLowerCase().includes(nq)) return false
    return true
  })
  const shown = sort === 'score' ? [...filtered].sort((a, b) => rank(b) - rank(a)) : filtered

  useEffect(() => setSelected(new Set()), [filter, alert, q, terms])
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
    markMany(sel, st)
    toast.ok(`${sel.length} annonce${sel.length > 1 ? 's' : ''} ${msg}`)
    setSelected(new Set())
  }
  const removeAll = (ids: string[]) => {
    if (!ids.length || !window.confirm(`Supprimer définitivement ${ids.length} annonce${ids.length > 1 ? 's' : ''} ? Elles ne reviendront pas, même si une alerte les renvoie.`)) return
    markMany(ids, 'deleted')
    toast.ok(`${ids.length} annonce${ids.length > 1 ? 's' : ''} supprimée${ids.length > 1 ? 's' : ''}`)
    setSelected(new Set())
  }

  const apply = (i: FeedItem) => {
    const o = offerFromItem(i)
    saveOffer(o)
    setMark(i.id, 'applied')
    toast.ok('Candidature créée : rattachez-y un CV et une lettre depuis l\'onglet Offres')
    onShowOffers()
  }

  const noAlerts = !watch.alerts.length
  return (
    <>
      <div className="dash-filter">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'new', label: `À trier (${counts.new})` },
            { value: 'fav', label: `Favoris (${counts.fav})` },
            { value: 'applied', label: `Candidatures (${counts.applied})` },
            { value: 'hidden', label: `Masquées (${counts.hidden})` },
          ]}
        />
        <div className="row-gap">
          <button className="btn" onClick={() => runSync()} disabled={syncStatus === 'syncing' || syncStatus === 'off'} title="Récupérer la dernière veille">
            <RefreshCw size={16} className={syncStatus === 'syncing' ? 'spin' : ''} />
          </button>
          <button className="btn" onClick={() => setSettings(true)}>
            <Settings2 size={16} /> Alertes et veille
          </button>
        </div>
      </div>

      {noAlerts ? (
        <div className="empty-state">
          <BellRing size={28} className="muted" />
          <h2>Créez votre première alerte</h2>
          <p>Indiquez le métier recherché et la ville. Resume récupère gratuitement les offres de la fonction publique (Choisir le Service Public), et celles de Jooble si vous avez une clé, puis vous donne des liens de recherche vers France Travail, LinkedIn, Hellowork, Indeed et APEC.</p>
          <button className="btn primary" onClick={() => setSettings(true)}>
            <BellRing size={16} /> Créer une alerte
          </button>
        </div>
      ) : (
        <>
          <div className="jobs-toolbar">
            <div className="rome-search small">
              <Search size={15} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer (poste, entreprise, ville)" />
            </div>
            <select className="input select alert-select" value={alert} onChange={(e) => setAlert(e.target.value)}>
              <option value="all">Toutes les alertes</option>
              {items.some((i) => i.alerts.includes('email')) && <option value="email">Alertes email</option>}
              {watch.alerts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.keywords || 'Sans titre'}
                </option>
              ))}
            </select>
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
                { value: 'date', label: 'Plus récentes' },
                { value: 'score', label: <><ArrowDownWideNarrow size={13} /> Correspondance</>, title: 'Trier par indice de correspondance (avis de Claude en priorité)' },
              ]}
            />
            <button className="btn sm" onClick={() => setProfileOpen(true)} title="CV de référence, métiers visés, diplôme, domicile">
              <Target size={14} /> Profil
            </button>
            <button className="btn sm claude" onClick={() => setClaudeOpen(true)} title="Faire évaluer les meilleures annonces par Claude">
              <Sparkles size={14} /> Affiner avec Claude
            </button>
            <span className="muted small">{feed ? `Veille du ${new Date(feed.updatedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Veille automatique non configurée'}</span>
          </div>
          <ExcludeBar terms={terms} onChange={setExcludes} count={excludedCount} />
          {shown.length > 0 && (
            <div className={`bulk-bar${sel.length ? ' active' : ''}`}>
              <label className="bulk-all">
                <input type="checkbox" checked={allSel} ref={(el) => { if (el) el.indeterminate = sel.length > 0 && !allSel }} onChange={(e) => setSelected(e.target.checked ? new Set(shownIds) : new Set())} />
                {sel.length ? `${sel.length} sélectionnée${sel.length > 1 ? 's' : ''}` : `Tout sélectionner (${shownIds.length})`}
              </label>
              {sel.length > 0 && (
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
              )}
              {!sel.length && filter === 'hidden' && (
                <button className="btn sm ghost danger" onClick={() => removeAll(shownIds)}>
                  <Trash2 size={13} /> Supprimer toutes les annonces masquées
                </button>
              )}
            </div>
          )}
          {feed?.status === 'error' && (
            <div className="notice warn">
              La dernière veille a échoué : {feed.errors?.join(' ')}{' '}
              <button className="link" onClick={() => setSettings(true)}>
                Vérifier la configuration
              </button>
            </div>
          )}
          <div className="quick-links">
            <span className="muted small">Chercher aussi sur :</span>
            {(watch.alerts.find((a) => a.id === alert) ?? watch.alerts[0]) &&
              searchLinks(watch.alerts.find((a) => a.id === alert) ?? watch.alerts[0]).map((l) => (
                <a key={l.site} href={l.url} target="_blank" rel="noreferrer">
                  {l.site} <ExternalLink size={11} />
                </a>
              ))}
          </div>
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
                <JobCard key={i.id} item={i} mark={markOf(i.id)} selected={selected.has(i.id)} onSelect={(v) => toggle(i.id, v)} alertNames={i.alerts.map((a) => names[a]).filter(Boolean)} match={matches[i.id]} review={reviews[i.id]} onApply={() => apply(i)} isNew={!!i.firstSeen && new Date(i.firstSeen).getTime() > lastSeen && lastSeen > 0} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>{filter === 'new' ? 'Toutes les annonces ont été triées.' : 'Rien ici pour le moment.'}</p>
            </div>
          )}
        </>
      )}
      <AlertsModal open={settings} onClose={() => setSettings(false)} />
      <MatchProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <ClaudeRankModal open={claudeOpen} onClose={() => setClaudeOpen(false)} items={[...filtered].sort((a, b) => (matches[b.id]?.score ?? 0) - (matches[a.id]?.score ?? 0)).map((i) => ({ ...i, score: matches[i.id]?.score }))} />
    </>
  )
}
