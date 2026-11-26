// Réglages : sauvegarde GitHub, données, relances, interface.
import { useRef, useState } from 'react'
import { BellRing, Cloud, Database, Download, Monitor, Moon, Palette, Sun, Target, Upload, UserRound } from 'lucide-react'
import { useEffect } from 'react'
import type { Identity } from '../types'
import { identityFromDocs } from '../lib/identity'
import { MatchProfileModal } from './dashboard/MatchTools'
import { PhotoInput, SignatureInput } from './editor/fields'
import { useDocs } from '../store/documents'
import { download, parseBackup, toJson } from '../lib/export'
import { FOLLOW_UP_CHOICES } from '../lib/followup'
import { setTheme, setWidth, themeChoice, widthChoice, type ThemeChoice } from '../lib/theme'
import { SyncPanel } from './SyncModal'
import { Field, Modal, Segmented, TextInput, toast } from './ui'

export type SettingsTab = 'identity' | 'profile' | 'sync' | 'data' | 'followup' | 'ui'

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'identity', label: 'Identité', icon: <UserRound size={16} /> },
  { id: 'profile', label: 'Profil de recherche', icon: <Target size={16} /> },
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
      <Field label="« Sans réponse » après" hint="Une candidature envoyée sans nouvelles ce délai après la dernière relance passe en « Sans réponse ».">
        <Segmented value={profile?.silentDays ?? 30} onChange={(d) => profile && setProfile({ ...profile, silentDays: d })} options={[21, 30, 45, 60].map((d) => ({ value: d, label: `${d} jours` }))} />
      </Field>
      <Field label="Dossier Gmail des candidatures" hint="La veille y lit les accusés de réception, refus et convocations (en plus des échanges avec les entreprises de vos candidatures). Lecture seule, avec le même accès que les alertes email.">
        <TextInput value={profile?.mailLabel ?? ''} placeholder="Emploi/Candidatures Emploi" onChange={(v) => profile && setProfile({ ...profile, mailLabel: v || undefined })} />
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
  const [width, setW] = useState(widthChoice)
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
      <Field label="Largeur des pages" hint="La carte des entreprises occupe toujours toute la largeur.">
        <Segmented
          value={width}
          onChange={(w) => {
            setW(w)
            setWidth(w)
          }}
          options={[
            { value: 'desktop', label: 'Standard' },
            { value: 'wide', label: 'Intermédiaire' },
            { value: 'full', label: 'Toute la largeur' },
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
        <div className="settings-body">
          {tab === 'identity' ? <IdentityPanel /> : tab === 'profile' ? <MatchProfileModal open embedded onClose={onClose} /> : tab === 'sync' ? <SyncPanel /> : tab === 'data' ? <DataPanel /> : tab === 'followup' ? <FollowUpPanel /> : <UiPanel />}
        </div>
      </div>
    </Modal>
  )
}

/** Bascule clair / sombre de l'en-tête (le choix « Système » reste dans les réglages). */
export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark')
  const label = dark ? 'Passer en thème clair' : 'Passer en thème sombre'
  return (
    <button
      className="icon-btn"
      title={label}
      aria-label={label}
      onClick={() => {
        setTheme(dark ? 'light' : 'dark')
        setDark(!dark)
      }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}

/** Identité : saisie une fois, reportée dans l'en-tête de tous les CV et lettres. */
function IdentityPanel() {
  const saved = useDocs((s) => s.watch.identity)
  const docs = useDocs((s) => s.docs)
  const setIdentity = useDocs((s) => s.setIdentity)
  const [v, setV] = useState<Identity>(() => saved ?? identityFromDocs(Object.values(useDocs.getState().docs)))
  const set = (p: Partial<Identity>) => setV((x) => ({ ...x, ...p }))
  const n = Object.keys(docs).length
  const dirty = JSON.stringify(v) !== JSON.stringify(saved ?? null)
  const save = () => {
    const clean = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' ? x.trim() || undefined : x])) as Identity
    setIdentity(clean)
    toast.ok(`Identité enregistrée et reportée dans ${n} document(s)`)
  }
  const f = (k: keyof Identity, label: string, ph = '') => (
    <Field label={label}>
      <TextInput value={(v[k] as string) ?? ''} onChange={(x) => set({ [k]: x })} placeholder={ph} />
    </Field>
  )
  return (
    <div className="form-stack">
      <p className="muted small">
        Saisies une seule fois, ces informations remplissent l'en-tête de tous vos CV et lettres. La place de chaque élément (ligne, ordre, photo affichée ou non) et le titre visé se règlent dans chaque document.
        {!saved && ' Pré-rempli depuis votre CV le plus récent : vérifiez puis enregistrez.'}
      </p>
      <div className="grid-2">
        {f('name', 'Nom et prénom', 'Julien CLAVEL')}
        {f('email', 'Email')}
        {f('phone', 'Téléphone')}
        {f('location', 'Localisation', 'Montpellier et ses alentours')}
        {f('info', 'Information (sans lien)', 'Permis B, véhiculé')}
        {f('linkedin', 'LinkedIn', 'linkedin.com/in/…')}
        {f('github', 'GitHub', 'github.com/…')}
        {f('website', 'Site web', 'https://…')}
        {f('other', 'Autre lien', 'https://…')}
        {f('otherLabel', 'Texte affiché pour l\'autre lien', 'Portfolio')}
      </div>
      <div className="grid-2">
        <Field label="Photo">
          <PhotoInput value={v.photo} onChange={(x) => set({ photo: x })} />
        </Field>
        <Field label="Signature (lettres)">
          <SignatureInput value={v.signature} onChange={(x) => set({ signature: x })} />
        </Field>
      </div>
      <div className="set-foot">
        <button className="btn primary" onClick={save} disabled={!dirty && !!saved}>
          Enregistrer et mettre à jour les {n} documents
        </button>
      </div>
    </div>
  )
}

/** Ouvre les réglages depuis n'importe quel écran. */
export const openSettings = (tab: SettingsTab = 'ui') => window.dispatchEvent(new CustomEvent('resume-open-settings', { detail: tab }))

/** Fenêtre des réglages, montée une seule fois pour toute l'application. */
export function SettingsHost() {
  const [tab, setTab] = useState<SettingsTab | null>(null)
  useEffect(() => {
    const on = (e: Event) => setTab((e as CustomEvent<SettingsTab>).detail)
    window.addEventListener('resume-open-settings', on)
    return () => window.removeEventListener('resume-open-settings', on)
  }, [])
  return <SettingsModal open={tab !== null} tab={tab ?? 'ui'} onClose={() => setTab(null)} />
}
