import { lazy, Suspense, useState } from 'react'
import { Pencil, Send, AlertTriangle, Building2, CheckCircle2, Clock, ExternalLink, Globe, Map as MapIcon, MapPinOff, Plus, Search, Trash2 } from 'lucide-react'
import type { Alert, Company } from '../../types'
import { useDocs } from '../../store/documents'
import { useFeed } from '../../store/feed'
import { uid } from '../../lib/ids'
import { searchLinks } from '../../lib/watch'
import { guessBoard } from '../../lib/places'
import { Field, Segmented, TextInput, Toggle, toast } from '../ui'

import { CompanyEditModal } from './CompanyEdit'

const CompanyMap = lazy(() => import('./CompanyMap').then((m) => ({ default: m.CompanyMap })))
import { CompanyAnalysisModal, SpontaneousModal } from './SpontaneousTools'
import type { Offer } from '../../types'

/** Une ligne de liens par métier : chaque alerte, et chaque intitulé d'une alerte à plusieurs intitulés. */
function linkLines(alerts: Alert[]) {
  return alerts
    .filter((a) => a.active !== false)
    .flatMap((a) =>
      a.keywords
        .split(/,|;|\||\s+ou\s+/i)
        .map((k) => k.trim())
        .filter(Boolean)
        .map((k) => ({ key: `${a.id}-${k}`, label: k, alert: { ...a, keywords: k } })),
    )
    .filter((l, i, arr) => arr.findIndex((x) => x.label.toLowerCase() === l.label.toLowerCase()) === i)
}

const NONE: Company[] = []
const ATS_HINT = /lever\.co|greenhouse\.io|smartrecruiters\.com|recruitee\.com|apply\.workable\.com|teamtailor\.com/

function CompanyRow({ c, onChange, onDelete, onApply, board }: { c: Company; onChange: (p: Partial<Company>) => void; onDelete: () => void; onApply: () => void; board?: boolean }) {
  const [edit, setEdit] = useState(false)
  const st = useFeed((s) => s.feed?.sources?.companies?.[c.id])
  const n = useFeed((s) => (s.feed?.items ?? []).filter((i) => i.id.startsWith(`co-${c.id}-`)).length)
  return (
    <div className={`company-row${c.active === false ? ' off' : ''}`}>
      <Building2 size={18} className="muted" />
      <div className="cr-main">
        <strong>{c.name}</strong>
        <a href={c.url} target="_blank" rel="noreferrer" className="small">
          {c.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70)} <ExternalLink size={10} />
        </a>
        <span className={`small cr-status${st?.error ? ' err' : ''}`}>
          {!st ? (
            <>
              <Clock size={12} /> Sera lue au prochain passage de la veille
            </>
          ) : st.error ? (
            <>
              <AlertTriangle size={12} /> {st.error}
            </>
          ) : (
            <>
              <CheckCircle2 size={12} /> {n} offre{n > 1 ? 's' : ''} dans vos annonces · {st.jobs} publiée{st.jobs > 1 ? 's' : ''} · lue le {new Date(st.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} ({st.method})
              {st.jobs === 0 && ' : aucune offre détectée sur cette page'}
            </>
          )}
        </span>
      </div>
      {board ? (
        <button className="btn sm ghost" onClick={() => onChange({ board: false })} title="La placer sur la carte des entreprises">
          <Building2 size={13} /> C'est une entreprise
        </button>
      ) : (
        <>
          <button className="btn sm ghost" onClick={() => onChange({ board: true })} title="La ranger avec les sites d'emploi">
            <Globe size={13} /> Site d'emploi
          </button>
          <button className="btn sm" onClick={onApply} title="Candidature spontanée chez cette entreprise, avec analyse de ses besoins par Claude">
            <Send size={13} /> Candidature spontanée
          </button>
        </>
      )}
      <Toggle label="Toutes les offres" checked={!!c.all} onChange={(v) => onChange({ all: v })} />
      <Toggle label="Active" checked={c.active !== false} onChange={(v) => onChange({ active: v })} />
      <button className="icon-btn xs" title="Modifier (nom, page, adresse, entreprise officielle)" onClick={() => setEdit(true)}>
        <Pencil size={14} />
      </button>
      {edit && <CompanyEditModal company={c} onClose={() => setEdit(false)} />}
      <button className="icon-btn xs" title="Retirer cette entreprise" onClick={onDelete}>
        <Trash2 size={14} />
      </button>
    </div>
  )
}

export function SitesView() {
  const [tab, setTab] = useState<'map' | 'boards'>(() => (localStorage.getItem('resume-sites-tab') === 'boards' ? 'boards' : 'map'))
  const pick = (t: 'map' | 'boards') => {
    setTab(t)
    localStorage.setItem('resume-sites-tab', t)
  }
  return (
    <div className="sites-wrap">
      <Segmented
        value={tab}
        onChange={pick}
        options={[
          { value: 'map', label: <><MapIcon size={14} /> Carte des entreprises</> },
          { value: 'boards', label: <><Globe size={14} /> Sites d'emploi</> },
        ]}
      />
      {tab === 'map' ? (
        <Suspense fallback={<div className="cmap cmap-loading muted">Chargement de la carte…</div>}>
          <CompanyMap />
        </Suspense>
      ) : (
        <BoardsView />
      )}
    </div>
  )
}

function BoardsView() {
  const alerts = useDocs((s) => s.watch.alerts)
  const saved = useDocs((s) => s.watch.companies)
  const all = saved ?? NONE
  const companies = all.filter((c) => (c.board ?? guessBoard(c)) && c.state !== 'no')
  const lost = all.filter((c) => !(c.board ?? guessBoard(c)) && c.noGeo && c.state !== 'no')
  const setCompanies = useDocs((s) => s.setCompanies)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [applyTo, setApplyTo] = useState<Company | null>(null)
  const [analyse, setAnalyse] = useState<Offer | null>(null)
  const lines = linkLines(alerts)
  const add = () => {
    let u = url.trim()
    if (!/^https?:\/\//.test(u)) u = `https://${u}`
    try {
      new URL(u)
    } catch {
      return toast.error('Adresse invalide')
    }
    const n = name.trim() || new URL(u).hostname.replace(/^(www|careers?|jobs|recrutement)\./, '').split('.')[0]
    setCompanies([...all, { id: uid().replace(/[^a-zA-Z0-9]/g, ''), name: n.charAt(0).toUpperCase() + n.slice(1), url: u, board: true }])
    setName('')
    setUrl('')
    toast.ok('Site ajouté : ses offres arriveront au prochain passage de la veille')
  }
  return (
    <div className="sites-view">
      <section className="sites-card">
        <h3>
          <Globe size={17} /> Sites d'emploi lus par la veille
        </h3>
        <p className="muted small">
          La veille lit ces sites toutes les 6 heures. Seules les offres dont l'intitulé correspond à une de vos recherches sont retenues, sauf si vous cochez « Toutes les offres ». Les pages carrières des entreprises se gèrent depuis la carte : cliquez sur une entreprise, puis « Suivre ».
        </p>
        <div className="company-add">
          <Field label="Site">
            <TextInput value={name} onChange={setName} placeholder="ex. Emploi Territorial" />
          </Field>
          <Field label="Page de résultats (liste des offres)">
            <TextInput value={url} onChange={setUrl} placeholder="https://..." />
          </Field>
          <button className="btn primary" disabled={!url.trim()} onClick={add}>
            <Plus size={15} /> Ajouter
          </button>
        </div>
        {url && ATS_HINT.test(url) && <p className="small ok-text">Logiciel de recrutement reconnu : lecture directe et fiable.</p>}
        {companies.length ? (
          <div className="company-list">
            {companies.map((c) => (
              <CompanyRow
                key={c.id}
                c={c}
                onChange={(p) => setCompanies(all.map((x) => (x.id === c.id ? { ...x, ...p } : x)))}
                onDelete={() => {
                  if (window.confirm(`Retirer ${c.name} ? Ses offres disparaîtront de vos annonces au prochain passage.`)) setCompanies(all.filter((x) => x.id !== c.id))
                }}
                onApply={() => setApplyTo(c)}
                board
              />
            ))}
          </div>
        ) : (
          <p className="muted small">Aucun site pour le moment.</p>
        )}
        {lost.length > 0 && (
          <>
            <h4 className="small">
              <MapPinOff size={14} /> Entreprises suivies introuvables sur la carte
            </h4>
            <p className="muted small">Leur nom n'a pas été trouvé dans la base des entreprises. Modifiez-les (crayon) pour saisir leur adresse ou les rattacher à l'entreprise officielle. Si c'est un site d'emploi, rangez-le ici.</p>
            <div className="company-list">
              {lost.map((c) => (
                <CompanyRow
                  key={c.id}
                  c={c}
                  onChange={(p) => setCompanies(all.map((x) => (x.id === c.id ? { ...x, ...p } : x)))}
                  onDelete={() => {
                    if (window.confirm(`Retirer ${c.name} ?`)) setCompanies(all.filter((x) => x.id !== c.id))
                  }}
                  onApply={() => setApplyTo(c)}
                />
              ))}
            </div>
          </>
        )}
        <details className="small">
          <summary>Quelle adresse donner ?</summary>
          <p className="muted">
            Celle de la page qui <strong>liste les offres</strong>. Lecture la plus fiable : les pages hébergées par un logiciel de recrutement (jobs.lever.co/…, boards.greenhouse.io/…, careers.smartrecruiters.com/…, …recruitee.com, apply.workable.com/…, …teamtailor.com), souvent accessibles par le bouton « Voir les offres » du site. Pour les autres sites, la veille repère les liens d'offres et lit chaque annonce ; si une entreprise affiche « aucune offre détectée » alors qu'elle en publie, ce site a besoin d'une lecture sur mesure.
          </p>
        </details>
      </section>

      <section className="sites-card">
        <h3>
          <Search size={17} /> Chercher sur les autres sites
        </h3>
        <p className="muted small">Une ligne par métier de vos recherches, triée par date sur chaque site.</p>
        {lines.length ? (
          lines.map(({ key, alert: a, label }) => (
            <div key={key} className="quick-links">
              <span className="ql-name">{label}</span>
              {searchLinks(a).map((l) => (
                <a key={l.site} href={l.url} target="_blank" rel="noreferrer">
                  {l.site} <ExternalLink size={11} />
                </a>
              ))}
            </div>
          ))
        ) : (
          <p className="muted small">Créez une recherche dans l'onglet Annonces, bouton « Alertes et veille ».</p>
        )}
      </section>
      {applyTo && <SpontaneousModal preset={{ name: applyTo.name, careers: applyTo.url }} onClose={() => setApplyTo(null)} onCreated={(o) => setAnalyse(o)} />}
      {analyse && <CompanyAnalysisModal offer={useDocs.getState().offers[analyse.id] ?? analyse} onClose={() => setAnalyse(null)} />}
    </div>
  )
}
