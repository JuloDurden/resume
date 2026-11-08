import { useState } from 'react'
import { AlertTriangle, Building2, CheckCircle2, Clock, ExternalLink, Plus, Search, Trash2 } from 'lucide-react'
import type { Alert, Company } from '../../types'
import { useDocs } from '../../store/documents'
import { useFeed } from '../../store/feed'
import { uid } from '../../lib/ids'
import { searchLinks } from '../../lib/watch'
import { Field, TextInput, Toggle, toast } from '../ui'

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

function CompanyRow({ c, onChange, onDelete }: { c: Company; onChange: (p: Partial<Company>) => void; onDelete: () => void }) {
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
      <Toggle label="Toutes les offres" checked={!!c.all} onChange={(v) => onChange({ all: v })} />
      <Toggle label="Active" checked={c.active !== false} onChange={(v) => onChange({ active: v })} />
      <button className="icon-btn xs" title="Retirer cette entreprise" onClick={onDelete}>
        <Trash2 size={14} />
      </button>
    </div>
  )
}

export function SitesView() {
  const alerts = useDocs((s) => s.watch.alerts)
  const saved = useDocs((s) => s.watch.companies)
  const companies = saved ?? NONE
  const setCompanies = useDocs((s) => s.setCompanies)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
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
    setCompanies([...companies, { id: uid().replace(/[^a-zA-Z0-9]/g, ''), name: n.charAt(0).toUpperCase() + n.slice(1), url: u }])
    setName('')
    setUrl('')
    toast.ok('Entreprise ajoutée : ses offres arriveront au prochain passage de la veille')
  }
  return (
    <div className="sites-view">
      <section className="sites-card">
        <h3>
          <Building2 size={17} /> Pages carrières des entreprises
        </h3>
        <p className="muted small">
          La veille lit directement les offres publiées par ces entreprises, toutes les 6 heures : les annonces y sont plus fraîches et complètes que sur les agrégateurs. Seules les offres dont l'intitulé correspond à une de vos recherches sont retenues, sauf si vous cochez « Toutes les offres ». Une offre publiée aussi sur LinkedIn ou ailleurs est regroupée, et c'est la version du site de l'entreprise qui est affichée.
        </p>
        <div className="company-add">
          <Field label="Entreprise">
            <TextInput value={name} onChange={setName} placeholder="ex. Capgemini" />
          </Field>
          <Field label="Page carrières (liste des offres)">
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
                onChange={(p) => setCompanies(companies.map((x) => (x.id === c.id ? { ...x, ...p } : x)))}
                onDelete={() => {
                  if (window.confirm(`Retirer ${c.name} ? Ses offres disparaîtront de vos annonces au prochain passage.`)) setCompanies(companies.filter((x) => x.id !== c.id))
                }}
              />
            ))}
          </div>
        ) : (
          <p className="muted small">Aucune entreprise pour le moment.</p>
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
    </div>
  )
}
