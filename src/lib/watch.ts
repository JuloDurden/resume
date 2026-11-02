import type { Alert, FeedItem, Offer } from '../types'
import { GitHubError, type SyncConfig } from './github'
import { newOffer } from './offers'
import fetchScript from '../../veille/fetch.mjs?raw'
import workflow from '../../veille/veille.yml?raw'

/** Types de contrat de l'API France Travail. */
export const CONTRACTS: { value: string; label: string }[] = [
  { value: 'CDI', label: 'CDI' },
  { value: 'CDD', label: 'CDD' },
  { value: 'MIS', label: 'Intérim' },
  { value: 'SAI', label: 'Saisonnier' },
  { value: 'LIB', label: 'Indépendant' },
]

/* ---------- Liens de recherche vers les autres sites ---------- */

export interface SearchLink {
  site: string
  url: string
}

export function searchLinks(a: Alert): SearchLink[] {
  const q = encodeURIComponent(a.keywords.trim())
  const place = encodeURIComponent(a.commune ?? '')
  const radius = a.distance ?? 30
  return [
    { site: 'France Travail', url: `https://candidat.francetravail.fr/offres/recherche?motsCles=${q}${a.communeCode ? `&lieux=${a.communeCode}&rayon=${radius}` : ''}&tri=1` },
    { site: 'Hellowork', url: `https://www.hellowork.com/fr-fr/emploi/recherche.html?k=${q}${place ? `&l=${place}` : ''}&ray=${radius}` },
    { site: 'LinkedIn', url: `https://www.linkedin.com/jobs/search/?keywords=${q}${place ? `&location=${place}` : ''}&sortBy=DD` },
    { site: 'Indeed', url: `https://fr.indeed.com/jobs?q=${q}${place ? `&l=${place}&radius=${radius}` : ''}&sort=date` },
    { site: 'APEC', url: `https://www.apec.fr/candidat/recherche-emploi.html/emploi?motsCles=${q}` },
    { site: 'Welcome to the Jungle', url: `https://www.welcometothejungle.com/fr/jobs?query=${q}${place ? `&aroundQuery=${place}` : ''}` },
  ]
}

/* ---------- Communes (API publique geo.api.gouv.fr) ---------- */

export interface Commune {
  nom: string
  code: string
  departement: string
}

export async function findCommunes(q: string): Promise<Commune[]> {
  if (q.trim().length < 2) return []
  const isCp = /^\d{5}$/.test(q.trim())
  const url = isCp
    ? `https://geo.api.gouv.fr/communes?codePostal=${q.trim()}&fields=nom,code,codeDepartement&limit=8`
    : `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q.trim())}&fields=nom,code,codeDepartement&boost=population&limit=8`
  const r = await fetch(url)
  if (!r.ok) return []
  const list = (await r.json()) as { nom: string; code: string; codeDepartement: string }[]
  return list.map((c) => ({ nom: c.nom, code: c.code, departement: c.codeDepartement }))
}

/* ---------- Installation de la tâche programmée dans le dépôt privé ---------- */

function b64(s: string) {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const x of bytes) bin += String.fromCharCode(x)
  return btoa(bin)
}

async function api<T>(c: SyncConfig, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}${path}`, {
    ...init,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${c.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...init.headers },
  })
  if (!r.ok) {
    let msg = r.statusText
    try {
      msg = (await r.json()).message ?? msg
    } catch {
      /* vide */
    }
    throw new GitHubError(r.status, msg)
  }
  return (r.status === 204 ? undefined : await r.json()) as T
}

async function putFile(c: SyncConfig, path: string, content: string, message: string) {
  let sha: string | undefined
  try {
    const cur = await api<{ sha: string; content: string }>(c, `/contents/${path}?ref=${c.branch}`)
    if (atob(cur.content.replace(/\n/g, '')) === atob(b64(content))) return false
    sha = cur.sha
  } catch (e) {
    if (!(e instanceof GitHubError && e.status === 404)) throw e
  }
  await api(c, `/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, content: b64(content), branch: c.branch, sha }) })
  return true
}

/** Installe (ou met à jour) le script et la tâche programmée dans le dépôt de sauvegarde. */
export async function installWatch(c: SyncConfig): Promise<boolean> {
  const a = await putFile(c, 'veille/fetch.mjs', fetchScript, 'Veille : script de récupération des annonces')
  const b = await putFile(c, '.github/workflows/veille.yml', workflow, 'Veille : tâche programmée')
  return a || b
}

export async function watchInstalled(c: SyncConfig): Promise<boolean> {
  try {
    await api(c, `/contents/.github/workflows/veille.yml?ref=${c.branch}`)
    return true
  } catch {
    return false
  }
}

/** Lance la veille tout de suite (nécessite la permission « Actions : lecture et écriture » du token). */
export async function runWatchNow(c: SyncConfig) {
  await api(c, '/actions/workflows/veille.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: c.branch }) })
}

export const secretsUrl = (c: SyncConfig) => `https://github.com/${c.owner}/${c.repo}/settings/secrets/actions/new`
export const actionsUrl = (c: SyncConfig) => `https://github.com/${c.owner}/${c.repo}/actions/workflows/veille.yml`

/* ---------- Annonce → candidature ---------- */

export function offerFromItem(i: FeedItem): Offer {
  return newOffer({
    title: i.title,
    company: i.company,
    location: i.location,
    contract: i.contract,
    salary: i.salary,
    url: i.url,
    website: i.companyUrl,
    logo: i.logo,
    description: i.description,
    romeCode: i.rome,
    sourceId: i.id,
    snapshotAt: Date.now(),
    contacts: i.contact?.name ? [{ name: i.contact.name, email: i.contact.email }] : [],
  })
}

export function ago(iso?: string): string {
  if (!iso) return ''
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d <= 0) return "aujourd'hui"
  if (d === 1) return 'hier'
  if (d < 7) return `il y a ${d} jours`
  if (d < 31) return `il y a ${Math.round(d / 7)} sem.`
  return `il y a ${Math.round(d / 30)} mois`
}
