// Veille d'annonces de Resume : pour chaque alerte de data/watch.json, interroge les sources
// configurées et écrit les annonces dans data/feed.json.
//  - Adzuna (agrégateur, clé gratuite) : secrets ADZUNA_APP_ID et ADZUNA_APP_KEY
//  - France Travail « Offres d'emploi v2 » (accès sur demande) : secrets FT_CLIENT_ID et FT_CLIENT_SECRET
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

const hasFT = !!(process.env.FT_CLIENT_ID && process.env.FT_CLIENT_SECRET)
const hasAZ = !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY)
if (!hasFT && !hasAZ) {
  errors.push('Aucune source configurée : ajoutez les secrets ADZUNA_APP_ID et ADZUNA_APP_KEY (ou FT_CLIENT_ID et FT_CLIENT_SECRET) au dépôt.')
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
  if (!r.ok) throw new Error(`Authentification France Travail refusée (${r.status}) : vérifiez l'identifiant, la clé secrète et l'accès à l'API « Offres d'emploi v2 ».`)
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

/* ---------- Adzuna ---------- */

const AZ_URL = 'https://api.adzuna.com/v1/api/jobs/fr/search/1'
const strip = (h) => (h ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

async function adzuna(a, firstRun, add) {
  const p = new URLSearchParams({
    app_id: process.env.ADZUNA_APP_ID,
    app_key: process.env.ADZUNA_APP_KEY,
    what: a.keywords.trim(),
    results_per_page: '50',
    sort_by: 'date',
    max_days_old: firstRun ? '31' : '14',
    'content-type': 'application/json',
  })
  if (a.commune) {
    p.set('where', a.commune)
    p.set('distance', String(a.distance ?? 30))
  }
  // contrats : Adzuna ne distingue que CDI (permanent) et contrat à durée limitée
  const c = a.contracts ?? []
  if (c.length && c.every((x) => x === 'CDI')) p.set('permanent', '1')
  else if (c.length && !c.includes('CDI')) p.set('contract', '1')
  const r = await fetch(`${AZ_URL}?${p}`)
  if (!r.ok) {
    errors.push(`Adzuna, alerte « ${a.keywords} » : erreur ${r.status} ${(await r.text()).slice(0, 160)}`)
    return
  }
  for (const o of (await r.json()).results ?? []) {
    const sal = o.salary_min ? `${Math.round(o.salary_min)}${o.salary_max && o.salary_max !== o.salary_min ? ` à ${Math.round(o.salary_max)}` : ''} € par an${o.salary_is_predicted === '1' ? ' (estimation)' : ''}` : undefined
    add(
      {
        id: `az-${o.id}`,
        title: strip(o.title),
        company: o.company?.display_name,
        location: o.location?.display_name,
        contract: o.contract_type === 'permanent' ? 'CDI' : o.contract_type === 'contract' ? 'CDD / contrat' : undefined,
        worktime: o.contract_time === 'full_time' ? 'Temps plein' : o.contract_time === 'part_time' ? 'Temps partiel' : undefined,
        salary: sal,
        date: o.created,
        url: o.redirect_url,
        source: 'Adzuna',
        description: strip(o.description),
      },
      a.id,
    )
  }
}

try {
  const tk = hasFT ? await token() : null
  const known = new Map((prev.items ?? []).map((i) => [i.id, i]))
  const firstRun = !prev.updatedAt
  let fetched = 0
  const add = (item, alertId) => {
    fetched++
    const cur = known.get(item.id)
    if (cur) cur.alerts = [...new Set([...(cur.alerts ?? []), alertId])]
    else known.set(item.id, { ...item, alerts: [alertId], firstSeen: new Date().toISOString() })
  }
  for (const a of alerts) {
    if (hasAZ) {
      await adzuna(a, firstRun, add)
      await sleep(400)
    }
    if (!tk) continue
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
    for (const o of (await r.json()).resultats ?? []) add(toItem(o, a.id), a.id)
    await sleep(250) // limite : 10 appels par seconde
  }
  const limit = Date.now() - KEEP_DAYS * 86400000
  const items = [...known.values()]
    .filter((i) => new Date(i.date ?? i.firstSeen).getTime() >= limit)
    .sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''))
    .slice(0, MAX_ITEMS)
  // en erreur seulement si aucune source n'a répondu
  await save(errors.length && !fetched ? 'error' : 'ok', items)
} catch (e) {
  errors.push(e.message)
  await save('error', prev.items ?? [])
}
