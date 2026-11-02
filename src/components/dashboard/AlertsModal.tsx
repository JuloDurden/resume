import { useEffect, useState } from 'react'
import { CheckCircle2, CircleDashed, ExternalLink, KeyRound, MapPin, Play, Plus, Trash2, Wrench } from 'lucide-react'
import type { Alert } from '../../types'
import { useDocs } from '../../store/documents'
import { useFeed } from '../../store/feed'
import { useSync } from '../../store/sync'
import { uid } from '../../lib/ids'
import { loadConfig, GitHubError } from '../../lib/github'
import { CONTRACTS, actionsUrl, findCommunes, installWatch, runWatchNow, searchLinks, secretsUrl, watchInstalled, type Commune } from '../../lib/watch'
import { Field, Modal, Select, TextInput, Toggle, toast } from '../ui'

function CommuneInput({ alert, onChange }: { alert: Alert; onChange: (p: Partial<Alert>) => void }) {
  const [q, setQ] = useState(alert.commune ?? '')
  const [list, setList] = useState<Commune[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open || q === alert.commune) return
    const t = setTimeout(() => findCommunes(q).then(setList).catch(() => setList([])), 250)
    return () => clearTimeout(t)
  }, [q, open, alert.commune])
  return (
    <div className="commune-input">
      <TextInput
        value={q}
        onChange={(v) => {
          setQ(v)
          setOpen(true)
          onChange({ commune: v || undefined, communeCode: undefined })
        }}
        placeholder="Ville ou code postal"
      />
      {open && list.length > 0 && (
        <div className="commune-list">
          {list.map((c) => (
            <button
              key={c.code}
              onClick={() => {
                setQ(c.nom)
                setOpen(false)
                onChange({ commune: c.nom, communeCode: c.code, departement: c.departement })
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

function AlertCard({ alert, onChange, onDelete }: { alert: Alert; onChange: (p: Partial<Alert>) => void; onDelete: () => void }) {
  return (
    <div className={`alert-card${alert.active === false ? ' off' : ''}`}>
      <div className="grid-2">
        <Field label="Métier ou mots-clés">
          <TextInput value={alert.keywords} onChange={(v) => onChange({ keywords: v })} placeholder="ex. chef de projet digital" />
        </Field>
        <Field label="Lieu">
          <CommuneInput alert={alert} onChange={onChange} />
        </Field>
        <Field label="Rayon">
          <Select value={alert.distance ?? 30} onChange={(v) => onChange({ distance: v })} options={[10, 20, 30, 50, 100].map((d) => ({ value: d, label: `${d} km` }))} />
        </Field>
        <Field label="Contrats">
          <div className="contract-checks">
            {CONTRACTS.map((c) => (
              <label key={c.value}>
                <input
                  type="checkbox"
                  checked={!alert.contracts?.length || alert.contracts.includes(c.value)}
                  onChange={(e) => {
                    const all = alert.contracts?.length ? alert.contracts : CONTRACTS.map((x) => x.value)
                    const next = e.target.checked ? [...all, c.value] : all.filter((x) => x !== c.value)
                    onChange({ contracts: next.length === CONTRACTS.length ? [] : next })
                  }}
                />
                {c.label}
              </label>
            ))}
          </div>
        </Field>
      </div>
      <div className="alert-foot">
        <Toggle label="Active" checked={alert.active !== false} onChange={(v) => onChange({ active: v })} />
        <div className="alert-links">
          {alert.keywords.trim() &&
            searchLinks(alert).map((l) => (
              <a key={l.site} href={l.url} target="_blank" rel="noreferrer">
                {l.site}
              </a>
            ))}
        </div>
        <button className="icon-btn xs" onClick={onDelete} title="Supprimer l'alerte">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

function Step({ done, n, title, children }: { done?: boolean; n: number; title: string; children: React.ReactNode }) {
  return (
    <div className={`step${done ? ' done' : ''}`}>
      <span className="step-n">{done ? <CheckCircle2 size={14} /> : n}</span>
      <div className="step-body">
        <strong>{title}</strong>
        {children}
      </div>
    </div>
  )
}

function Setup() {
  const cfg = loadConfig()
  const feed = useFeed((s) => s.feed)
  const runSync = useSync((s) => s.run)
  const [installed, setInstalled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (cfg) watchInstalled(cfg).then(setInstalled)
  }, [cfg?.repo]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!cfg)
    return (
      <div className="notice warn">
        La veille automatique s'appuie sur la <strong>sauvegarde GitHub</strong> (accueil, bouton « Sauvegarde GitHub »). Activez-la d'abord. En attendant, vos alertes servent déjà de recherches enregistrées vers chaque site.
      </div>
    )

  const ok = feed?.status === 'ok'
  return (
    <div className="form-stack">
      <Step n={1} title="Créez un accès gratuit à l'API France Travail" done={ok}>
        <span className="muted small">
          Sur francetravail.io : créez un compte, puis « Mes applications » &gt; « Créer une application ». Abonnez-la à l'API <strong>Offres d'emploi v2</strong>. Notez l'identifiant client et la clé secrète.
        </span>
        <a className="btn sm self-start" href="https://francetravail.io/" target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> Ouvrir francetravail.io
        </a>
      </Step>
      <Step n={2} title="Enregistrez-les comme secrets du dépôt privé" done={ok}>
        <span className="muted small">
          Deux secrets dans <strong>{cfg.repo}</strong> : <code>FT_CLIENT_ID</code> (identifiant) et <code>FT_CLIENT_SECRET</code> (clé secrète). Ils restent chiffrés chez GitHub : ni Resume ni le navigateur n'y ont accès.
        </span>
        <a className="btn sm self-start" href={secretsUrl(cfg)} target="_blank" rel="noreferrer">
          <KeyRound size={14} /> Ajouter un secret
        </a>
      </Step>
      <Step n={3} title="Installez la tâche programmée" done={!!installed}>
        <span className="muted small">
          Resume ajoute à {cfg.repo} un petit script et une tâche GitHub Actions qui récupère les nouvelles annonces <strong>toutes les 3 heures</strong> (de 5 h à 20 h). Le token doit avoir la permission <strong>Workflows : Read and write</strong> en plus de Contents.
        </span>
        <div className="row-gap">
          <button
            className="btn sm primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await runSync()
                const changed = await installWatch(cfg)
                setInstalled(true)
                toast.ok(changed ? 'Veille installée' : 'Veille déjà à jour')
              } catch (e) {
                toast.error(e instanceof GitHubError && (e.status === 403 || e.status === 404) ? 'Permission refusée : ajoutez « Workflows : Read and write » au token (sur GitHub), puis réessayez.' : `Installation impossible : ${e instanceof Error ? e.message : ''}`)
              } finally {
                setBusy(false)
              }
            }}
          >
            <Wrench size={14} /> {installed ? 'Mettre à jour la tâche' : 'Installer la veille'}
          </button>
          {installed && (
            <button
              className="btn sm"
              onClick={async () => {
                try {
                  await runSync()
                  await runWatchNow(cfg)
                  toast.ok('Veille lancée : les annonces arrivent dans 1 à 2 minutes')
                  setTimeout(() => runSync(), 90000)
                } catch {
                  toast.info('Lancement manuel refusé (permission « Actions : Read and write » absente). Lancez-la depuis GitHub, ou attendez le prochain passage.')
                  window.open(actionsUrl(cfg), '_blank', 'noopener')
                }
              }}
            >
              <Play size={14} /> Lancer maintenant
            </button>
          )}
          {installed && (
            <a className="btn sm ghost" href={actionsUrl(cfg)} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Historique
            </a>
          )}
        </div>
      </Step>
      <div className={`watch-status ${feed?.status ?? 'none'}`}>
        {feed ? (
          feed.status === 'ok' ? (
            <>
              <CheckCircle2 size={16} /> Dernière veille le {new Date(feed.updatedAt).toLocaleString('fr-FR')} : {feed.items.length} annonce(s).
            </>
          ) : (
            <>
              <CircleDashed size={16} /> Dernière veille en erreur : {feed.errors?.join(' ') || 'erreur inconnue'}
            </>
          )
        ) : (
          <>
            <CircleDashed size={16} /> Aucune veille reçue pour l'instant.
          </>
        )}
      </div>
    </div>
  )
}

export function AlertsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const alerts = useDocs((s) => s.watch.alerts)
  const setAlerts = useDocs((s) => s.setAlerts)
  const set = (id: string, p: Partial<Alert>) => setAlerts(alerts.map((a) => (a.id === id ? { ...a, ...p } : a)))
  return (
    <Modal open={open} onClose={onClose} wide title="Alertes et veille d'annonces">
      <div className="form-stack">
        <section className="form-stack">
          <h3 className="modal-h3">Mes alertes</h3>
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} onChange={(p) => set(a.id, p)} onDelete={() => setAlerts(alerts.filter((x) => x.id !== a.id))} />
          ))}
          <button className="btn sm self-start" onClick={() => setAlerts([...alerts, { id: uid(), keywords: '', distance: 30, active: true, commune: alerts[0]?.commune, communeCode: alerts[0]?.communeCode }])}>
            <Plus size={14} /> Ajouter une alerte
          </button>
          <p className="muted small">LinkedIn, Hellowork, Indeed, APEC et Welcome to the Jungle n'offrent pas d'accès automatisé : les liens ouvrent votre recherche sur chaque site, triée par date. Une annonce intéressante s'ajoute ensuite avec « Offre depuis un lien ». L'API France Travail inclut aussi des offres de nombreux sites partenaires.</p>
        </section>
        <section className="form-stack">
          <h3 className="modal-h3">Veille automatique France Travail</h3>
          <Setup />
        </section>
      </div>
    </Modal>
  )
}
