// Réglages : sauvegarde GitHub, données, relances, interface.
import { useRef, useState } from 'react'
import { BellRing, Cloud, Database, Download, Monitor, Moon, Palette, Sun, Upload } from 'lucide-react'
import { useDocs } from '../store/documents'
import { download, parseBackup, toJson } from '../lib/export'
import { FOLLOW_UP_CHOICES } from '../lib/followup'
import { setTheme, themeChoice, type ThemeChoice } from '../lib/theme'
import { SyncPanel } from './SyncModal'
import { Field, Modal, Segmented, toast } from './ui'

export type SettingsTab = 'sync' | 'data' | 'followup' | 'ui'

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'sync', label: 'Sauvegarde GitHub', icon: <Cloud size={16} /> },
  { id: 'data', label: 'Données', icon: <Database size={16} /> },
  { id: 'followup', label: 'Relances', icon: <BellRing size={16} /> },
  { id: 'ui', label: 'Interface', icon: <Palette size={16} /> },
]

/** Sauvegarde JSON complète (documents et candidatures). */
export function downloadBackup() {
  const { docs, offers, markBackup } = useDocs.getState()
  const list = Object.values(docs)
  download(`resume-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, toJson(list, Object.values(offers)))
  markBackup()
  toast.ok(`${list.length} document(s) sauvegardé(s)`)
}

/** Restaure un fichier JSON exporté par Resume (un CV ou une sauvegarde complète). */
export async function importBackupFile(f: File) {
  try {
    const b = parseBackup(await f.text())
    const n = useDocs.getState().importDocs(b.docs, b.offers)
    toast.ok(n ? `${n} document(s) importé(s)` : 'Ces documents sont déjà présents')
  } catch (e) {
    toast.error(`Import impossible : ${e instanceof Error ? e.message : 'fichier invalide'}`)
  }
}

function DataPanel() {
  const docs = useDocs((s) => Object.keys(s.docs).length)
  const offers = useDocs((s) => Object.keys(s.offers).length)
  const lastBackup = useDocs((s) => s.lastBackup)
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="form-stack">
      <div className="set-row">
        <div>
          <strong>Télécharger une sauvegarde complète</strong>
          <p className="muted small">
            {docs} document(s) et {offers} candidature(s), dans un fichier JSON à garder en lieu sûr.
            {lastBackup ? ` Dernière sauvegarde téléchargée le ${new Date(lastBackup).toLocaleDateString('fr-FR')}.` : ''}
          </p>
        </div>
        <button className="btn" onClick={downloadBackup} disabled={!docs}>
          <Download size={15} /> Télécharger
        </button>
      </div>
      <div className="set-row">
        <div>
          <strong>Restaurer une sauvegarde</strong>
          <p className="muted small">Les documents absents sont ajoutés ; ceux déjà présents ne sont pas dupliqués.</p>
        </div>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <Upload size={15} /> Choisir un fichier
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && importBackupFile(e.target.files[0]).finally(() => (e.target.value = ''))} />
      </div>
    </div>
  )
}

function FollowUpPanel() {
  const profile = useDocs((s) => s.watch.profile)
  const setProfile = useDocs((s) => s.setProfile)
  const v = profile?.followUpDays ?? 15
  return (
    <div className="form-stack">
      <Field label="Délai avant une relance" hint="Proposé par défaut pour chaque nouvelle candidature, et après une réponse sans délai annoncé. Modifiable candidature par candidature.">
        <Segmented value={v} onChange={(d) => profile && setProfile({ ...profile, followUpDays: d })} options={FOLLOW_UP_CHOICES.map((d) => ({ value: d, label: `${d} jours` }))} />
      </Field>
      {!profile && <p className="notice small">Créez d'abord votre profil de recherche dans l'onglet Annonces.</p>}
    </div>
  )
}

function UiPanel() {
  const [theme, set] = useState<ThemeChoice>(themeChoice())
  const [density, setDensity] = useState(() => {
    try {
      return localStorage.getItem('resume-jobs-density') === 'detailed' ? 'detailed' : 'compact'
    } catch {
      return 'compact'
    }
  })
  return (
    <div className="form-stack">
      <Field label="Thème" hint="Les CV et lettres restent sur une page blanche, comme à l'impression.">
        <Segmented
          value={theme}
          onChange={(t) => {
            set(t)
            setTheme(t)
          }}
          options={[
            { value: 'system', label: <><Monitor size={14} /> Système</> },
            { value: 'light', label: <><Sun size={14} /> Clair</> },
            { value: 'dark', label: <><Moon size={14} /> Sombre</> },
          ]}
        />
      </Field>
      <Field label="Cartes des annonces" hint="Compactes : une ligne par annonce, détails au clic.">
        <Segmented
          value={density}
          onChange={(d) => {
            setDensity(d)
            try {
              localStorage.setItem('resume-jobs-density', d)
              window.dispatchEvent(new CustomEvent('resume-density', { detail: d }))
            } catch {
              /* non mémorisé */
            }
          }}
          options={[
            { value: 'compact', label: 'Compactes' },
            { value: 'detailed', label: 'Détaillées' },
          ]}
        />
      </Field>
    </div>
  )
}

export function SettingsModal({ open, onClose, tab: initial = 'sync' }: { open: boolean; onClose: () => void; tab?: SettingsTab }) {
  const [tab, setTab] = useState<SettingsTab>(initial)
  const [shownFor, setShownFor] = useState(initial)
  if (shownFor !== initial) {
    setShownFor(initial)
    setTab(initial)
  }
  return (
    <Modal open={open} onClose={onClose} wide title="Réglages">
      <div className="settings">
        <nav className="settings-nav">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
        <div className="settings-body">{tab === 'sync' ? <SyncPanel /> : tab === 'data' ? <DataPanel /> : tab === 'followup' ? <FollowUpPanel /> : <UiPanel />}</div>
      </div>
    </Modal>
  )
}
