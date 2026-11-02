// Veille d'annonces de Resume : interroge l'API « Offres d'emploi v2 » de France Travail
// pour chaque alerte de data/watch.json et écrit les annonces dans data/feed.json.
// Lancé par GitHub Actions (.github/workflows/veille.yml) dans le dépôt privé de sauvegarde.
// Aucune dépendance : Node 20 ou plus.
import { readFile, writeFile } from 'node:fs/promises'

const TOKEN_URL = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire'
const SEARCH_URL = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search'
const KEEP_DAYS = 45
const MAX_ITEMS = 1200

const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

const watch = await readJson('data/watch.json', {})
const prev = await readJson('data/feed.json', { items: [] })
const alerts = (watch.alerts ?? []).filter((a) => a.active !== false && (a.keywords ?? '').trim())
const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function save(status, items) {
  const feed = { updatedAt: new Date().toISOString(), status, errors, alerts: alerts.length, items }
  await writeFile('data/feed.json', JSON.stringify(feed, null, 1) + '\n')
  console.log(`${status} : ${items.length} annonce(s), ${errors.length} erreur(s)`)
  for (const e of errors) console.log(' -', e)
}

if (!process.env.FT_CLIENT_ID || !process.env.FT_CLIENT_SECRET) {
  errors.push('Secrets FT_CLIENT_ID et FT_CLIENT_SECRET absents du dépôt (Settings > Secrets and variables > Actions).')
  await save('error', prev.items ?? [])
  process.exit(0)
}

async function token() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.FT_CLIENT_ID,
    client_secret: process.env.FT_CLIENT_SECRET,
    scope: 'api_offresdemploiv2 o2dsoffre',
  })
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  if (!r.ok) throw new Error(`Authentification France Travail refusée (${r.status}) : vérifiez l'identifiant, la clé secrète et l'abonnement à l'API « Offres d'emploi v2 ».`)
  return (await r.json()).access_token
}

/** Code INSEE d'une commune à partir de son nom, si l'application ne l'a pas fourni. */
async function communeCode(name) {
  try {
    const r = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(name)}&fields=code&boost=population&limit=1`)
    return (await r.json())[0]?.code
  } catch {
    return undefined
  }
}

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'au', 'aux', 'un', 'une', 'pour', 'hf', 'fh'])
const cleanKeywords = (s) =>
  s
    .replace(/[^\p{L}\p{N}' -]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP.has(w.toLowerCase()))
    .join(',')

function toItem(o, alertId) {
  const partner = o.origineOffre?.partenaires?.[0]
  return {
    id: o.id,
    alerts: [alertId],
    title: o.intitule,
    company: o.entreprise?.nom,
    companyUrl: o.entreprise?.url,
    logo: o.entreprise?.logo,
    location: o.lieuTravail?.libelle,
    contract: o.typeContratLibelle,
    contractCode: o.typeContrat,
    worktime: o.dureeTravailLibelleConverti ?? o.dureeTravailLibelle,
    salary: o.salaire?.libelle ?? o.salaire?.commentaire,
    experience: o.experienceLibelle,
    rome: o.romeCode,
    romeLabel: o.romeLibelle,
    date: o.dateCreation,
    updated: o.dateActualisation,
    url: o.origineOffre?.urlOrigine ?? o.contact?.urlPostulation ?? `https://candidat.francetravail.fr/offres/recherche/detail/${o.id}`,
    source: partner?.nom ?? 'France Travail',
    contact: o.contact?.nom ? { name: o.contact.nom, email: o.contact.courriel } : undefined,
    description: o.description,
  }
}

try {
  const tk = await token()
  const known = new Map((prev.items ?? []).map((i) => [i.id, i]))
  const firstRun = !prev.updatedAt
  for (const a of alerts) {
    const params = new URLSearchParams({ motsCles: cleanKeywords(a.keywords), sort: '1', range: '0-149', publieeDepuis: firstRun ? '31' : '14' })
    let code = a.communeCode
    if (!code && a.commune) code = await communeCode(a.commune)
    if (code) {
      params.set('commune', code)
      params.set('distance', String(a.distance ?? 30))
    } else if (a.departement) params.set('departement', a.departement)
    if (a.contracts?.length) params.set('typeContrat', a.contracts.join(','))
    if (a.experience) params.set('experience', a.experience)
    const r = await fetch(`${SEARCH_URL}?${params}`, { headers: { Authorization: `Bearer ${tk}`, Accept: 'application/json' } })
    if (r.status === 204) continue
    if (!r.ok && r.status !== 206) {
      errors.push(`Alerte « ${a.keywords} » : erreur ${r.status} ${(await r.text()).slice(0, 200)}`)
      continue
    }
    for (const o of (await r.json()).resultats ?? []) {
      const cur = known.get(o.id)
      if (cur) cur.alerts = [...new Set([...(cur.alerts ?? []), a.id])]
      else known.set(o.id, { ...toItem(o, a.id), firstSeen: new Date().toISOString() })
    }
    await sleep(250) // limite : 10 appels par seconde
  }
  const limit = Date.now() - KEEP_DAYS * 86400000
  const items = [...known.values()]
    .filter((i) => new Date(i.date ?? i.firstSeen).getTime() >= limit)
    .sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''))
    .slice(0, MAX_ITEMS)
  await save(errors.length && !items.length ? 'error' : 'ok', items)
} catch (e) {
  errors.push(e.message)
  await save('error', prev.items ?? [])
}
