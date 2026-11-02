// Veille d'annonces de Resume : pour chaque alerte de data/watch.json, interroge les sources
// gratuites et écrit les annonces dans data/feed.json.
//  - Choisir le Service Public (données ouvertes data.gouv.fr, sans clé) : offres de la fonction publique
//  - Jooble (agrégateur, clé gratuite sur demande) : secret JOOBLE_KEY
//  - France Travail « Offres d'emploi v2 » (accès sur demande) : secrets FT_CLIENT_ID et FT_CLIENT_SECRET
// Lancé par GitHub Actions (.github/workflows/veille.yml) dans le dépôt privé de sauvegarde.
// Aucune dépendance : Node 20 ou plus.
import { createReadStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'

const KEEP_DAYS = 45
const MAX_ITEMS = 1500
const PER_ALERT_CSP = 200

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
const notes = []
const sources = { ...(prev.sources ?? {}) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function save(status, items) {
  const feed = { updatedAt: new Date().toISOString(), status, errors, notes, alerts: alerts.length, sources, items }
  await writeFile('data/feed.json', JSON.stringify(feed, null, 1) + '\n')
  console.log(`${status} : ${items.length} annonce(s), ${errors.length} erreur(s)`)
  for (const e of [...notes, ...errors]) console.log(' -', e)
}

/* ---------- outils ---------- */

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'au', 'aux', 'un', 'une', 'pour', 'hf', 'fh', 'h', 'f', 'l', 'd', 'a', 'ou', 'sur', 'par'])
const norm = (s) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
const words = (s) => norm(s).split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w))
/** Racine tolérante : « chargée », « chargés », « chargé » donnent « charg ». */
const stem = (w) => (w.length <= 4 ? w : w.replace(/(euses|euse|eurs|eur|rices|rice|ees|ee|es|e|s|x)$/, '').slice(0, Math.max(4, w.length - 3)))
const cleanKeywords = (s) => words(s).filter((w) => w.length >= 2).join(',')

/** Code INSEE et département d'une commune à partir de son nom, si l'application ne les a pas fournis. */
async function commune(name) {
  try {
    const r = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(name)}&fields=code,codeDepartement&boost=population&limit=1`)
    const c = (await r.json())[0]
    return c ? { code: c.code, departement: c.codeDepartement } : {}
  } catch {
    return {}
  }
}

/** jj/mm/aaaa vers aaaa-mm-jj */
const isoDate = (d) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(d ?? '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined
}

/* ---------- Choisir le Service Public (data.gouv.fr) ---------- */

const CSP_DATASET = 'https://www.data.gouv.fr/api/1/datasets/6322e99e12175f7eb26ff465/'

async function fetchRetry(url, init, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, init)
      if (r.ok || i >= tries || r.status < 500) return r
    } catch (e) {
      if (i >= tries) throw e
    }
    await sleep(3000 * i)
  }
}

/** Lecture en flux d'un CSV séparé par « ; » (champs entre guillemets, retours à la ligne inclus). */
async function* csvRows(chunks) {
  let field = ''
  let row = []
  let quoted = false
  let pendingQuote = false
  for await (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i]
      if (pendingQuote) {
        pendingQuote = false
        if (c === '"') {
          field += '"'
          continue
        }
        quoted = false
      }
      if (quoted) {
        if (c === '"') pendingQuote = true
        else field += c
      } else if (c === '"' && field === '') quoted = true
      else if (c === ';') {
        row.push(field)
        field = ''
      } else if (c === '\n') {
        row.push(field.endsWith('\r') ? field.slice(0, -1) : field)
        yield row
        row = []
        field = ''
      } else field += c
    }
  }
  if (field || row.length) yield [...row, field]
}

async function* textChunks() {
  const dec = new TextDecoder('utf-8')
  if (process.env.CSP_FILE) {
    for await (const b of createReadStream(process.env.CSP_FILE)) yield dec.decode(b, { stream: true })
    return
  }
  const r = await fetchRetry(sources.csp.url)
  if (!r.ok) throw new Error(`téléchargement refusé (${r.status})`)
  for await (const b of r.body) yield dec.decode(b, { stream: true })
}

async function latestCsp() {
  if (process.env.CSP_FILE) return { url: `file:${process.env.CSP_FILE}`, modified: new Date().toISOString() }
  const r = await fetchRetry(CSP_DATASET, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`catalogue data.gouv.fr indisponible (${r.status})`)
  const res = ((await r.json()).resources ?? []).filter((x) => /csv/i.test(x.format ?? '') && (x.filesize ?? 0) > 5e6)
  res.sort((a, b) => (b.last_modified ?? '').localeCompare(a.last_modified ?? ''))
  if (!res[0]) throw new Error('aucun fichier CSV trouvé')
  return { url: res[0].url, modified: res[0].last_modified }
}

async function csp(add) {
  const cur = await latestCsp()
  const sig = JSON.stringify(alerts.map((a) => [a.keywords, a.departement, a.commune]))
  // fichier publié une fois par semaine : inutile de le relire s'il n'a pas changé ni les alertes
  if (!process.env.CSP_FILE && sources.csp?.url === cur.url && sources.csp?.sig === sig) {
    notes.push(`Choisir le Service Public : fichier du ${cur.modified?.slice(0, 10)} déjà lu.`)
    return
  }
  sources.csp = { ...cur, sig, readAt: new Date().toISOString() }

  const matchers = []
  for (const a of alerts) {
    let dep = a.departement
    if (!dep && a.commune) dep = (await commune(a.commune)).departement
    matchers.push({ a, stems: [...new Set(words(a.keywords).map(stem))], dep, found: [] })
  }
  const today = new Date().toISOString().slice(0, 10)
  let head = null
  let rows = 0
  const hay = (s) => ` ${words(s).join(' ')}`
  for await (const row of csvRows(textChunks())) {
    if (!head) {
      head = Object.fromEntries(row.map((h, i) => [h.replace(/^﻿/, '').trim(), i]))
      if (head['Intitulé du poste'] === undefined) throw new Error('format du fichier inattendu')
      continue
    }
    rows++
    const g = (k) => (row[head[k]] ?? '').trim()
    const end = isoDate(g('Date de fin de publication par défaut'))
    if (end && end < today) continue
    const text = hay(`${g('Intitulé du poste')} ${g('Métier')} ${g('Spécialisation')}`)
    const loc = g('Localisation du poste')
    for (const m of matchers) {
      if (m.dep && !loc.includes(`(${m.dep})`)) continue
      if (!m.stems.every((s) => text.includes(` ${s}`))) continue
      m.found.push({ row: [...row], end })
    }
  }
  if (!head) throw new Error('fichier vide')
  let n = 0
  for (const m of matchers) {
    const pick = (row, k) => (row[head[k]] ?? '').trim()
    m.found.sort((x, y) => (isoDate(pick(y.row, 'Date de première publication')) ?? '').localeCompare(isoDate(pick(x.row, 'Date de première publication')) ?? ''))
    for (const { row, end } of m.found.slice(0, PER_ALERT_CSP)) {
      const g = (k) => pick(row, k)
      const ref = g('Référence')
      if (!ref) continue
      const place = g("Lieu d'affectation (sans géolocalisation)") || g("Lieu d'affectation")
      const loc = g('Localisation du poste')
      const details = [
        [g('Versant'), g('Catégorie')].filter(Boolean).join(', '),
        g('Métier') && `Métier : ${g('Métier')}`,
        g('Nature de l\'emploi'),
        g('Télétravail') && `Télétravail : ${g('Télétravail')}`,
        g('Management') && `Management : ${g('Management')}`,
        g('Compétences attendues') && `Compétences attendues : ${g('Compétences attendues')}`,
        end && `Candidature jusqu'au ${end.split('-').reverse().join('/')}`,
      ].filter(Boolean)
      n++
      add(
        {
          id: `csp-${ref}`,
          title: g('Intitulé du poste'),
          company: (g('Employeur') || g('Organisme de rattachement')).split('\n')[0].trim() || undefined,
          location: place && loc && !loc.includes(place) ? `${place}, ${loc}` : loc || place || undefined,
          contract: g('Nature de contrat') || (g('Durée du contrat') ? `Contrat ${g('Durée du contrat')}` : /contractuels/i.test(g("Nature de l'emploi")) ? 'Titulaire ou contractuel' : 'Fonction publique'),
          worktime: /oui/i.test(g('Temps Plein')) ? 'Temps plein' : /non/i.test(g('Temps Plein')) ? 'Temps partiel' : undefined,
          experience: g("Niveau d'expérience min. requis") || undefined,
          date: isoDate(g('Date de première publication')) ?? isoDate(g('Date de début de publication par défaut')),
          until: end,
          url: `https://choisirleservicepublic.gouv.fr/offre-emploi/${encodeURIComponent(ref)}/`,
          source: 'Choisir le Service Public',
          description: details.join('\n'),
        },
        m.a.id,
      )
    }
  }
  notes.push(`Choisir le Service Public : ${rows} offres lues, ${n} correspondent à vos alertes.`)
}

/* ---------- Jooble (clé gratuite sur demande) ---------- */

const strip = (h) => (h ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

async function jooble(a, add) {
  const body = JSON.stringify({ keywords: a.keywords.trim(), location: a.commune ?? '', radius: String(a.distance ?? 30), page: '1', ResultOnPage: '50' })
  let r
  for (const host of [process.env.JOOBLE_HOST || 'fr.jooble.org', 'jooble.org']) {
    r = await fetch(`https://${host}/api/${process.env.JOOBLE_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    if (r.ok) break
  }
  if (!r.ok) {
    errors.push(`Jooble, alerte « ${a.keywords} » : erreur ${r.status} ${strip(await r.text()).slice(0, 120)}`)
    return
  }
  for (const o of (await r.json()).jobs ?? []) {
    add(
      {
        id: `jb-${o.id ?? o.link}`,
        title: strip(o.title),
        company: o.company || undefined,
        location: o.location || undefined,
        contract: o.type || undefined,
        salary: o.salary || undefined,
        date: o.updated,
        url: o.link,
        source: o.source ? `${strip(o.source)} (Jooble)` : 'Jooble',
        description: strip(o.snippet),
      },
      a.id,
    )
  }
}

/* ---------- France Travail (accès sur demande) ---------- */

const FT_TOKEN = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire'
const FT_SEARCH = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search'

async function ftToken() {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.FT_CLIENT_ID, client_secret: process.env.FT_CLIENT_SECRET, scope: 'api_offresdemploiv2 o2dsoffre' })
  const r = await fetch(FT_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  if (!r.ok) throw new Error(`Authentification France Travail refusée (${r.status}) : vérifiez l'identifiant, la clé secrète et l'accès à l'API « Offres d'emploi v2 ».`)
  return (await r.json()).access_token
}

function ftItem(o) {
  const partner = o.origineOffre?.partenaires?.[0]
  return {
    id: o.id,
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

async function franceTravail(tk, a, firstRun, add) {
  const params = new URLSearchParams({ motsCles: cleanKeywords(a.keywords), sort: '1', range: '0-149', publieeDepuis: firstRun ? '31' : '14' })
  let code = a.communeCode
  if (!code && a.commune) code = (await commune(a.commune)).code
  if (code) {
    params.set('commune', code)
    params.set('distance', String(a.distance ?? 30))
  } else if (a.departement) params.set('departement', a.departement)
  if (a.contracts?.length) params.set('typeContrat', a.contracts.join(','))
  const r = await fetch(`${FT_SEARCH}?${params}`, { headers: { Authorization: `Bearer ${tk}`, Accept: 'application/json' } })
  if (r.status === 204) return
  if (!r.ok && r.status !== 206) {
    errors.push(`France Travail, alerte « ${a.keywords} » : erreur ${r.status} ${(await r.text()).slice(0, 200)}`)
    return
  }
  for (const o of (await r.json()).resultats ?? []) add(ftItem(o), a.id)
}

/* ---------- assemblage ---------- */

const known = new Map((prev.items ?? []).map((i) => [i.id, i]))
const firstRun = !prev.updatedAt
let fetched = 0
const add = (item, alertId) => {
  fetched++
  const cur = known.get(item.id)
  if (cur) Object.assign(cur, item, { alerts: [...new Set([...(cur.alerts ?? []), alertId])], firstSeen: cur.firstSeen })
  else known.set(item.id, { ...item, alerts: [alertId], firstSeen: new Date().toISOString() })
}

if (!alerts.length) notes.push('Aucune alerte active.')
else {
  try {
    await csp(add)
  } catch (e) {
    errors.push(`Choisir le Service Public : ${e.message}`)
  }
  if (process.env.JOOBLE_KEY)
    for (const a of alerts) {
      try {
        await jooble(a, add)
      } catch (e) {
        errors.push(`Jooble : ${e.message}`)
      }
      await sleep(400)
    }
  if (process.env.FT_CLIENT_ID && process.env.FT_CLIENT_SECRET) {
    try {
      const tk = await ftToken()
      for (const a of alerts) {
        await franceTravail(tk, a, firstRun, add)
        await sleep(250)
      }
    } catch (e) {
      errors.push(e.message)
    }
  }
}

const now = new Date().toISOString().slice(0, 10)
const limit = Date.now() - KEEP_DAYS * 86400000
const active = new Set(alerts.map((a) => a.id))
// les annonces en favori ou en candidature restent, même si leur alerte a été supprimée
const marked = (id) => ['fav', 'applied'].includes(watch.marks?.[id]?.s)
const items = [...known.values()]
  .map((i) => ({ ...i, alerts: (i.alerts ?? []).filter((x) => active.has(x)) }))
  .filter((i) => (i.alerts.length || marked(i.id)) && (i.until ? i.until >= now : new Date(i.date ?? i.firstSeen).getTime() >= limit))
  .sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''))
  .slice(0, MAX_ITEMS)
// en erreur seulement si aucune source n'a répondu
await save(errors.length && !fetched && !notes.some((n) => n.includes('déjà lu')) ? 'error' : 'ok', items)
