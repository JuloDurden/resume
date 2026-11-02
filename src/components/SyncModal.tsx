import { useMemo, useState } from 'react'
import { CheckCircle2, CloudOff, ExternalLink, Globe, KeyRound, LogOut, RefreshCw } from 'lucide-react'
import { useDocs } from '../store/documents'
import { useSync } from '../store/sync'
import { appRepoFromLocation, checkRepo, createRepo, loadConfig, publishShowcase, saveConfig, whoAmI, type SyncConfig } from '../lib/github'
import { sanitizeForShowcase, type Showcase } from '../lib/showcase'
import { docTitle } from '../lib/offers'
import { Field, Modal, TextInput, Toggle, toast } from './ui'

const ago = (t?: number) => {
  if (!t) return 'jamais'
  const s = Math.round((Date.now() - t) / 1000)
  return s < 60 ? 'à l\'instant' : s < 3600 ? `il y a ${Math.round(s / 60)} min` : new Date(t).toLocaleString('fr-FR')
}

function Setup({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState('')
  const [repo, setRepo] = useState('resume-data')
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState<SyncConfig | null>(null)
  const run = useSync((s) => s.run)

  const connect = async () => {
    setBusy(true)
    try {
      const owner = await whoAmI(token.trim())
      const cfg: SyncConfig = { token: token.trim(), owner, repo: repo.trim() || 'resume-data', branch: 'main' }
      const r = await checkRepo(cfg)
      if (r === 'missing') {
        setMissing(cfg)
        return
      }
      saveConfig(cfg)
      toast.ok(`Connecté en tant que ${owner}`)
      await run()
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Connexion impossible')
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    if (!missing) return
    setBusy(true)
    try {
      await createRepo(missing)
      saveConfig(missing)
      toast.ok('Dépôt privé créé')
      await run()
      onDone()
    } catch {
      toast.error('Le token ne peut pas créer de dépôt : créez-le vous-même (lien ci-dessus), puis réessayez.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="form-stack">
      <p className="muted small">
        Vos documents et offres sont enregistrés automatiquement dans un <strong>dépôt GitHub privé</strong> qui vous appartient. Sur un autre navigateur, il suffit de coller le même token pour tout retrouver. Le token reste dans ce navigateur et n'est envoyé qu'à GitHub.
      </p>
      <div className="step">
        <span className="step-n">1</span>
        <div className="step-body">
          <strong>Créez le dépôt privé de sauvegarde</strong>
          <a className="btn sm self-start" href={`https://github.com/new?name=${encodeURIComponent(repo)}&visibility=private&description=${encodeURIComponent('Sauvegarde privée de Resume')}`} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Créer « {repo} » sur GitHub
          </a>
          <span className="muted small">Laissez-le <strong>privé</strong> et cochez « Add a README file ».</span>
        </div>
      </div>
      <div className="step">
        <span className="step-n">2</span>
        <div className="step-body">
          <strong>Créez un token à accès limité</strong>
          <a className="btn sm self-start" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
            <KeyRound size={14} /> Nouveau token « fine-grained »
          </a>
          <ul className="small muted steps-list">
            <li>Expiration : 1 an (vous pourrez le renouveler).</li>
            <li>Repository access : « Only select repositories » et choisissez <strong>{repo}</strong> (ajoutez aussi <strong>resume</strong> pour publier la vitrine).</li>
            <li>Permissions : <strong>Contents : Read and write</strong>.</li>
            <li>Pour la veille d'annonces (facultatif) : <strong>Workflows : Read and write</strong> et <strong>Actions : Read and write</strong>.</li>
          </ul>
        </div>
      </div>
      <div className="step">
        <span className="step-n">3</span>
        <div className="step-body">
          <strong>Collez le token</strong>
          <div className="grid-2">
            <Field label="Token">
              <TextInput type="password" value={token} onChange={setToken} placeholder="github_pat_..." />
            </Field>
            <Field label="Dépôt de sauvegarde">
              <TextInput value={repo} onChange={setRepo} />
            </Field>
          </div>
          <button className="btn primary self-start" disabled={!token.trim() || busy} onClick={connect}>
            {busy ? 'Connexion...' : 'Connecter et synchroniser'}
          </button>
          {missing && (
            <div className="notice warn">
              Le dépôt « {missing.owner}/{missing.repo} » est introuvable (ou le token n'y a pas accès).{' '}
              <button className="link" onClick={create}>
                Essayer de le créer automatiquement
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ShowcasePublisher({ cfg }: { cfg: SyncConfig }) {
  const docsMap = useDocs((s) => s.docs)
  const offers = useDocs((s) => s.offers)
  const docs = useMemo(() => Object.values(docsMap).sort((a, b) => b.updatedAt - a.updatedAt), [docsMap])
  const [picked, setPicked] = useState<string[]>([])
  const [hide, setHide] = useState(true)
  const [busy, setBusy] = useState(false)
  const target = appRepoFromLocation() ?? { owner: cfg.owner, repo: 'resume', branch: 'main' }

  const publish = async () => {
    if (!window.confirm(`Les ${picked.length} documents choisis seront visibles par tous sur ${target.owner}.github.io/${target.repo}. Continuer ?`)) return
    setBusy(true)
    try {
      const sc: Showcase = {
        publishedAt: new Date().toISOString(),
        author: docs.find((d) => picked.includes(d.id))?.header.name,
        documents: docs.filter((d) => picked.includes(d.id)).map((d) => sanitizeForShowcase(d, hide)),
      }
      await publishShowcase(cfg.token, target, JSON.stringify(sc))
      toast.ok('Vitrine publiée : elle sera en ligne dans une minute environ')
    } catch (e) {
      toast.error(e instanceof Error ? `Publication impossible : ${e.message}. Le token a-t-il accès au dépôt ${target.repo} ?` : 'Publication impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="form-stack showcase-pub">
      <h3>
        <Globe size={16} /> Vitrine publique
      </h3>
      <p className="muted small">
        Les visiteurs de l'application (recruteurs, par exemple) voient les documents choisis ici, en lecture seule. Votre sauvegarde privée, vos offres et vos autres documents restent invisibles.
      </p>
      <div className="pick-list">
        {docs.map((d) => {
          const { title, company } = docTitle(d, d.offerId ? offers[d.offerId] : undefined)
          return (
            <label key={d.id} className="pick">
              <input type="checkbox" checked={picked.includes(d.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, d.id] : p.filter((x) => x !== d.id)))} />
              <span className={`kind-badge ${d.kind}`}>{d.kind === 'resume' ? 'CV' : 'Lettre'}</span>
              <span className="pick-name">{title}</span>
              {company && <span className="company-badge">{company}</span>}
            </label>
          )
        })}
      </div>
      <Toggle label="Masquer téléphone, email et informations personnelles" checked={hide} onChange={setHide} />
      <p className="muted small">Les signatures manuscrites ne sont jamais publiées. La photo l'est si elle figure sur le document.</p>
      <button className="btn self-start" disabled={!picked.length || busy} onClick={publish}>
        <Globe size={15} /> {busy ? 'Publication...' : `Publier ${picked.length || ''} document${picked.length > 1 ? 's' : ''}`}
      </button>
    </section>
  )
}

/** Remplace le token (permissions modifiées, token expiré) sans toucher aux données. */
function ReplaceToken({ cfg, onDone }: { cfg: SyncConfig; onDone: () => void }) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const run = useSync((s) => s.run)
  const save = async () => {
    setBusy(true)
    try {
      const owner = await whoAmI(token.trim())
      const next: SyncConfig = { ...cfg, token: token.trim(), owner }
      if ((await checkRepo(next)) === 'missing') throw new Error(`Ce token n'a pas accès au dépôt ${cfg.repo}.`)
      saveConfig(next)
      toast.ok('Token remplacé')
      await run()
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Token refusé')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="step">
      <span className="step-n">
        <KeyRound size={13} />
      </span>
      <div className="step-body">
        <strong>Nouveau token</strong>
        <span className="muted small">
          Inutile si vous avez seulement ajouté des permissions à votre token existant sur GitHub : il garde la même valeur. Pour un nouveau token, créez-le sur{' '}
          <a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noreferrer">
            github.com/settings/personal-access-tokens
          </a>
          .
        </span>
        <div className="row-gap">
          <TextInput type="password" value={token} onChange={setToken} placeholder="github_pat_..." />
          <button className="btn primary" disabled={!token.trim() || busy} onClick={save}>
            {busy ? 'Vérification...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function SyncModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { status, message, lastSync, run } = useSync()
  const [, force] = useState(0)
  const [replacing, setReplacing] = useState(false)
  const cfg = loadConfig()
  return (
    <Modal open={open} onClose={onClose} title="Sauvegarde automatique sur GitHub" wide>
      {!cfg ? (
        <Setup onDone={() => force((x) => x + 1)} />
      ) : (
        <div className="form-stack">
          <div className={`sync-status ${status}`}>
            {status === 'error' ? <CloudOff size={20} /> : <CheckCircle2 size={20} />}
            <div>
              <strong>
                {cfg.owner}/{cfg.repo}
              </strong>
              <span>
                {status === 'syncing' ? 'Synchronisation en cours...' : status === 'error' ? `Erreur : ${message}` : `Synchronisé ${ago(lastSync)}`}
              </span>
            </div>
            <button className="btn sm" onClick={() => run()} disabled={status === 'syncing'}>
              <RefreshCw size={14} /> Synchroniser
            </button>
            <button className="btn sm" onClick={() => setReplacing((v) => !v)}>
              <KeyRound size={14} /> Changer le token
            </button>
            <button
              className="btn sm ghost"
              onClick={() => {
                if (!window.confirm('Déconnecter ce navigateur ? Le token y sera effacé. Vos documents restent ici et dans le dépôt.')) return
                saveConfig(null)
                useSync.setState({ status: 'off' })
                force((x) => x + 1)
              }}
            >
              <LogOut size={14} /> Déconnecter
            </button>
          </div>
          {replacing && <ReplaceToken cfg={cfg} onDone={() => setReplacing(false)} />}
          <p className="muted small">Chaque modification est envoyée quelques secondes après la saisie. Les autres navigateurs connectés la récupèrent à leur prochaine ouverture ou toutes les 3 minutes. En cas de modification au même moment sur deux navigateurs, la plus récente l'emporte.</p>
          <ShowcasePublisher cfg={cfg} />
        </div>
      )}
    </Modal>
  )
}

export function SyncButton({ onClick }: { onClick: () => void }) {
  const status = useSync((s) => s.status)
  const label = { off: 'Sauvegarde GitHub', idle: 'Synchronisé', syncing: 'Synchronisation...', error: 'Erreur de synchro' }[status]
  return (
    <button className={`btn sync-btn ${status}`} onClick={onClick} title="Sauvegarde automatique sur GitHub">
      {status === 'error' || status === 'off' ? <CloudOff size={16} /> : <RefreshCw size={16} className={status === 'syncing' ? 'spin' : ''} />}
      {label}
    </button>
  )
}
