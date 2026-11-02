import { useEffect, useMemo, useState } from 'react'
import { BellRing, BookOpen, CalendarClock, Briefcase, ChevronDown, ChevronUp, Clock, Euro, ExternalLink, Eye, EyeOff, MapPin, RefreshCw, Search, Settings2, Star } from 'lucide-react'
import type { FeedItem, MarkState } from '../../types'
import { useDocs } from '../../store/documents'
import { useFeed } from '../../store/feed'
import { useSync } from '../../store/sync'
import { ago, offerFromItem, searchLinks } from '../../lib/watch'
import { useRomeDrawer } from '../RomeDrawer'
import { AlertsModal } from './AlertsModal'
import { Segmented, toast } from '../ui'

type Filter = 'new' | 'fav' | 'applied' | 'hidden'

function JobCard({ item, mark, alertNames, onApply, isNew }: { item: FeedItem; mark: MarkState; alertNames: string[]; onApply: () => void; isNew: boolean }) {
  const setMark = useDocs((s) => s.mark)
  const openRome = useRomeDrawer((s) => s.open)
  const [open, setOpen] = useState(false)
  return (
    <article className={`job-card${mark === 'hidden' ? ' hidden' : ''}`}>
      <div className="jc-head">
        {item.logo ? <img className="offer-logo" src={item.logo} alt="" width={36} height={36} /> : <span className="offer-logo fallback" style={{ width: 36, height: 36, fontSize: 16 }}>{(item.company ?? item.title).charAt(0).toUpperCase()}</span>}
        <div className="jc-title">
          <strong>
            {isNew && <span className="new-dot" title="Nouvelle depuis votre dernière visite" />}
            {item.closed && <span className="jc-closed">Expirée</span>}
            {item.title}
          </strong>
          <span>{item.company ?? 'Entreprise non communiquée'}</span>
        </div>
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
      {open && item.description && <p className="jc-desc" style={{ whiteSpace: 'pre-line' }}>{item.description}</p>}
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
        {item.description && (
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
          <button className="btn sm ghost" onClick={() => setMark(item.id, 'none')}>
            <Eye size={13} /> Restaurer
          </button>
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
  const syncStatus = useSync((s) => s.status)
  const runSync = useSync((s) => s.run)
  const [filter, setFilter] = useState<Filter>('new')
  const [alert, setAlert] = useState<string>('all')
  const [q, setQ] = useState('')
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

  const items = feed?.items ?? []
  const markOf = (id: string): MarkState => watch.marks[id]?.s ?? 'none'
  const names = useMemo<Record<string, string>>(() => ({ email: 'Alerte email', ...Object.fromEntries(watch.alerts.map((a) => [a.id, a.keywords])) }), [watch.alerts])
  const counts = useMemo(() => {
    const c = { new: 0, fav: 0, applied: 0, hidden: 0 }
    for (const i of items) {
      const m = markOf(i.id)
      if (m === 'none') c.new++
      else c[m]++
    }
    return c
  }, [items, watch.marks]) // eslint-disable-line react-hooks/exhaustive-deps
  const nq = q.trim().toLowerCase()
  const shown = items.filter((i) => {
    const m = markOf(i.id)
    if (filter === 'new' ? m !== 'none' : m !== filter) return false
    if (alert !== 'all' && !i.alerts.includes(alert)) return false
    if (nq && !`${i.title} ${i.company ?? ''} ${i.location ?? ''}`.toLowerCase().includes(nq)) return false
    return true
  })

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
            <span className="muted small">{feed ? `Veille du ${new Date(feed.updatedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Veille automatique non configurée'}</span>
          </div>
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
                <JobCard key={i.id} item={i} mark={markOf(i.id)} alertNames={i.alerts.map((a) => names[a]).filter(Boolean)} onApply={() => apply(i)} isNew={!!i.firstSeen && new Date(i.firstSeen).getTime() > lastSeen && lastSeen > 0} />
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
    </>
  )
}
