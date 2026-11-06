import { useEffect, useState } from 'react'
import { CheckCircle2, CircleDashed, Clock, ExternalLink, KeyRound, Mail, MapPin, Play, Plus, Search, Trash2, Wrench } from 'lucide-react'
import type { Alert } from '../../types'
import { useDocs } from '../../store/documents'
import { useFeed } from '../../store/feed'
import { useSync } from '../../store/sync'
import { uid } from '../../lib/ids'
import { loadConfig, GitHubError } from '../../lib/github'
import { CONTRACTS, actionsUrl, findCommunes, installWatch, runWatchNow, searchLinks, secretsUrl, watchStatus, type Commune } from '../../lib/watch'
import { Field, Modal, Segmented, Select, TextInput, Toggle, toast } from '../ui'

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
        <Field label="Métier ou mots-clés" hint="Plusieurs intitulés possibles, séparés par des virgules">
          <TextInput value={alert.keywords} onChange={(v) => onChange({ keywords: v })} placeholder="ex. product owner, chef de projet SI, product manager" />
        </Field>
        <Field label="Lieu">
          <CommuneInput alert={alert} onChange={onChange} />
        </Field>
        <Field label="Niveau visé" hint="Sert à noter les annonces de ce métier.">
          <Select
            value={alert.level ?? 'any'}
            onChange={(v) => onChange({ level: v })}
            options={[
              { value: 'junior', label: 'Junior ou débutant (2 ans max.)' },
              { value: 'any', label: 'Tous niveaux' },
              { value: 'senior', label: 'Confirmé ou management (pas de junior)' },
            ]}
          />
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

type WatchState = 'missing' | 'outdated' | 'ok' | null

/** Tâche automatique : installée une fois, mise à jour automatiquement ensuite. */
function TaskTab() {
  const cfg = loadConfig()
  const feed = useFeed((s) => s.feed)
  const runSync = useSync((s) => s.run)
  const [state, setState] = useState<WatchState>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (cfg) watchStatus(cfg).then(setState).catch(() => setState(null))
  }, [cfg?.repo]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!cfg)
    return (
      <div className="notice warn">
        La tâche automatique s'appuie sur la <strong>sauvegarde GitHub</strong> (accueil, bouton « Sauvegarde GitHub »). Activez-la d'abord. En attendant, vos recherches servent déjà de liens enregistrés vers chaque site.
      </div>
    )

  const install = async () => {
    setBusy(true)
    try {
      await runSync()
      await installWatch(cfg)
      setState('ok')
      toast.ok('Tâche installée et à jour')
    } catch (e) {
      toast.error(e instanceof GitHubError && (e.status === 403 || e.status === 404) ? 'Permission refusée : ajoutez « Workflows : Read and write » au token (sur GitHub), puis réessayez.' : `Installation impossible : ${e instanceof Error ? e.message : ''}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="form-stack">
      <div className="explain">
        <p>
          Une <strong>tâche GitHub Actions</strong>, installée une seule fois dans votre dépôt privé <strong>{cfg.repo}</strong>, passe <strong>toutes les heures de 5 h à 21 h</strong>. À chaque passage, elle relit vos recherches et vos emails d'alerte, récupère les nouvelles annonces et vérifie que les anciennes sont toujours en ligne.
        </p>
        <p>
          Vous n'avez <strong>rien à relancer</strong> quand vous ajoutez ou modifiez une recherche : elle est prise en compte au passage suivant. Quand Resume évolue, la tâche est mise à jour automatiquement à l'ouverture de l'application.
        </p>
      </div>

      <div className={`watch-status ${state === 'ok' ? 'ok' : 'none'}`}>
        {state === 'ok' ? <CheckCircle2 size={16} /> : <CircleDashed size={16} />}
        <span>{state === null ? 'Vérification...' : state === 'ok' ? 'Tâche installée et à jour.' : state === 'outdated' ? 'Une nouvelle version de la tâche est disponible.' : "La tâche n'est pas encore installée."}</span>
        {state !== 'ok' && state !== null && (
          <button className="btn sm primary" disabled={busy} onClick={install}>
            <Wrench size={14} /> {state === 'missing' ? 'Installer' : 'Mettre à jour'}
          </button>
        )}
      </div>

      <div className="watch-status none">
        <Clock size={16} />
        <span>
          {feed ? (
            <>
              Dernier passage le {new Date(feed.updatedAt).toLocaleString('fr-FR')} : {feed.items.length} annonce(s) en cours.
              {feed.notes?.length ? <span className="small muted"> {feed.notes.join(' ')}</span> : null}
              {feed.errors?.length ? <span className="small"> Avertissement : {feed.errors.join(' ')}</span> : null}
            </>
          ) : (
            'Aucun passage pour le moment.'
          )}
        </span>
        {state === 'ok' && (
          <button
            className="btn sm"
            onClick={async () => {
              try {
                await runSync()
                await runWatchNow(cfg)
                toast.ok('Passage lancé : les annonces arrivent dans 1 à 2 minutes')
                setTimeout(() => runSync(), 100000)
              } catch {
                toast.info('Lancement refusé (permission « Actions : Read and write » absente du token). Le prochain passage automatique prendra le relais.')
                window.open(actionsUrl(cfg), '_blank', 'noopener')
              }
            }}
          >
            <Play size={14} /> Lancer maintenant
          </button>
        )}
      </div>

      <details className="small">
        <summary>Permissions du token et historique</summary>
        <p className="muted">
          Le token GitHub doit avoir, sur le dépôt {cfg.repo} : <strong>Contents</strong> (sauvegarde), <strong>Workflows</strong> (installer et mettre à jour la tâche) et <strong>Actions</strong> (« Lancer maintenant » et relance automatique quand GitHub prend du retard), en « Read and write ».
        </p>
        <a className="btn sm" href={actionsUrl(cfg)} target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> Historique des passages sur GitHub
        </a>
      </details>

      <details className="small">
        <summary>Sources facultatives : Jooble et France Travail</summary>
        <p className="muted">
          <strong>Jooble</strong> (agrégateur, clé gratuite sur demande) : ajoutez le secret <code>JOOBLE_KEY</code> au dépôt ; il est interrogé une fois par jour pour ménager le quota.{' '}
          <a href="https://jooble.org/api/about" target="_blank" rel="noreferrer">
            Demander une clé
          </a>
          . <strong>France Travail</strong> : l'API « Offres d'emploi » n'est accessible que sur demande ; si elle vous est accordée, ajoutez <code>FT_CLIENT_ID</code> et <code>FT_CLIENT_SECRET</code>.{' '}
          <a href={secretsUrl(cfg)} target="_blank" rel="noreferrer">
            Ajouter un secret
          </a>
        </p>
      </details>
    </div>
  )
}

/** Alertes email créées sur les sites d'emploi, lues par la tâche dans Gmail. */
function MailTab() {
  const cfg = loadConfig()
  const feed = useFeed((s) => s.feed)
  const alerts = useDocs((s) => s.watch.alerts)
  const connected = !!feed?.notes?.some((n) => n.startsWith('Gmail'))
  const failing = feed?.errors?.find((e) => e.startsWith('Gmail'))
  const first = alerts.find((a) => a.keywords.trim())
  return (
    <div className="form-stack">
      <div className="explain">
        <p>
          C'est la source principale d'annonces. Les alertes se créent <strong>directement sur chaque site</strong> (LinkedIn, France Travail, Glassdoor, Jobijoba, Hellowork, Indeed, APEC...), avec votre adresse Gmail. La tâche automatique lit ensuite ces emails, <strong>en lecture seule</strong>, et en extrait chaque annonce.
        </p>
        <p className="muted small">Ces alertes vivent sur les sites, pas dans Resume : pour en changer les critères, modifiez-les sur le site concerné. Vous pouvez supprimer les emails une fois leurs annonces apparues dans Resume.</p>
      </div>
      <div className={`watch-status ${connected && !failing ? 'ok' : 'none'}`}>
        {connected && !failing ? <CheckCircle2 size={16} /> : <CircleDashed size={16} />}
        <span>{failing ?? (connected ? feed?.notes?.find((n) => n.startsWith('Gmail')) : 'Lecture de Gmail non configurée.')}</span>
      </div>
      {first && (
        <div className="quick-links">
          <span className="muted small">Créer une alerte « {first.keywords.split(',')[0].trim()} » sur :</span>
          {searchLinks({ ...first, keywords: first.keywords.split(',')[0].trim() }).map((l) => (
            <a key={l.site} href={l.url} target="_blank" rel="noreferrer">
              {l.site} <ExternalLink size={11} />
            </a>
          ))}
        </div>
      )}
      {!connected && cfg && (
        <ol className="small muted steps-list">
          <li>Activez la validation en deux étapes de votre compte Google, puis créez un mot de passe d'application nommé « Resume veille » (16 lettres).</li>
          <li>
            Ajoutez deux secrets au dépôt <strong>{cfg.repo}</strong> : <code>GMAIL_USER</code> (votre adresse Gmail) et <code>GMAIL_APP_PASSWORD</code> (les 16 lettres).
          </li>
          <li>Les emails d'alerte seront lus au prochain passage de la tâche.</li>
        </ol>
      )}
      {cfg && (
        <div className="row-gap">
          <a className="btn sm" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Mot de passe d'application Google
          </a>
          <a className="btn sm" href={secretsUrl(cfg)} target="_blank" rel="noreferrer">
            <KeyRound size={14} /> Secrets du dépôt
          </a>
        </div>
      )}
    </div>
  )
}

export function AlertsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const alerts = useDocs((s) => s.watch.alerts)
  const setAlerts = useDocs((s) => s.setAlerts)
  const [tab, setTab] = useState<'search' | 'mail' | 'task'>('search')
  const set = (id: string, p: Partial<Alert>) => setAlerts(alerts.map((a) => (a.id === id ? { ...a, ...p } : a)))
  return (
    <Modal open={open} onClose={onClose} wide title="Alertes et veille d'annonces">
      <div className="form-stack">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'search', label: <><Search size={14} /> Mes recherches ({alerts.length})</> },
            { value: 'mail', label: <><Mail size={14} /> Alertes email des sites</> },
            { value: 'task', label: <><Clock size={14} /> Tâche automatique</> },
          ]}
        />
        {tab === 'search' && (
          <section className="form-stack">
            <div className="explain">
              <p>
                Une recherche = un métier (ou plusieurs intitulés séparés par des virgules) et un lieu. Elle sert à <strong>trouver les offres de la fonction publique</strong> (Choisir le Service Public), à <strong>créer les liens de recherche</strong> vers les autres sites en bas de la liste, et à <strong>étiqueter les annonces</strong>.
              </p>
              <p className="muted small">Enregistrée automatiquement et prise en compte au prochain passage de la tâche (toutes les heures) : rien à installer ni à relancer.</p>
            </div>
            {alerts.map((a) => (
              <AlertCard key={a.id} alert={a} onChange={(p) => set(a.id, p)} onDelete={() => setAlerts(alerts.filter((x) => x.id !== a.id))} />
            ))}
            <button className="btn sm self-start" onClick={() => setAlerts([...alerts, { id: uid(), keywords: '', distance: 30, active: true, commune: alerts[0]?.commune, communeCode: alerts[0]?.communeCode, departement: alerts[0]?.departement }])}>
              <Plus size={14} /> Ajouter une recherche
            </button>
          </section>
        )}
        {tab === 'mail' && <MailTab />}
        {tab === 'task' && <TaskTab />}
      </div>
    </Modal>
  )
}
