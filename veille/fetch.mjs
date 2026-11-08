// Veille d'annonces de Resume : pour chaque alerte de data/watch.json, interroge les sources
// gratuites et écrit les annonces dans data/feed.json.
//  - Choisir le Service Public (données ouvertes data.gouv.fr, sans clé) : offres de la fonction publique
//  - Jooble (agrégateur, clé gratuite sur demande) : secret JOOBLE_KEY
//  - France Travail « Offres d'emploi v2 » (accès sur demande) : secrets FT_CLIENT_ID et FT_CLIENT_SECRET
//  - Alertes emploi reçues dans Gmail (LinkedIn, Hellowork, Indeed, APEC...) : secrets GMAIL_USER et
//    GMAIL_APP_PASSWORD, lecture seule (veille/mail.mjs, modules imapflow et mailparser)
// Puis vérifie que les annonces existent toujours et retire celles qui ont été supprimées.
// Lancé par GitHub Actions (.github/workflows/veille.yml) dans le dépôt privé de sauvegarde. Node 20 ou plus.
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
// sites constatés en mode dégradé lors de ce passage
if (prev.sources?.degraded) delete prev.sources.degraded
const notes = []
const sources = { ...(prev.sources ?? {}) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Historique des salaires vus dans les annonces (un an), pour donner un repère par métier et par région
 * même après la suppression des annonces. L'application lit et interprète ces extraits.
 */
function salaryLog(items) {
  const year = Date.now() - 365 * 86400000
  const log = new Map((prev.salaryLog ?? []).filter((e) => new Date(e.at).getTime() >= year).map((e) => [e.id, e]))
  for (const i of items) {
    const snippet = i.salary || /(?:salaire|r[ée]mun[ée]ration|package)[^\n]{0,140}/i.exec(i.fullText ?? '')?.[0]
    if (!snippet || !/\d/.test(snippet) || log.has(i.id)) continue
    log.set(i.id, { id: i.id, at: i.date ?? new Date().toISOString(), title: i.title, location: i.location, salary: snippet.slice(0, 160) })
  }
  return [...log.values()].slice(-3000)
}

async function save(status, items) {
  const feed = { updatedAt: new Date().toISOString(), status, errors, notes, alerts: alerts.length, sources, salaryLog: salaryLog(items), items }
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
/** Variantes d'une alerte : « product owner, chef de projet SI » ou « product owner OU chef de projet ». */
const variants = (s) =>
  (s ?? '')
    .split(/,|;|\||\s+ou\s+|\s+or\s+/i)
    .map((x) => x.trim())
    .filter(Boolean)
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
    const groups = variants(a.keywords)
      .map((v) => [...new Set(words(v).map((w) => (w.length <= 3 ? `${w} ` : stem(w))))])
      .filter((g) => g.length)
    matchers.push({ a, groups, dep, found: [] })
  }
  const today = new Date().toISOString().slice(0, 10)
  let head = null
  let rows = 0
  const hay = (s) => ` ${words(s).join(' ')} `
  for await (const row of csvRows(textChunks())) {
    if (!head) {
      head = Object.fromEntries(row.map((h, i) => [h.replace(/^﻿/, '').trim(), i]))
      if (head['Intitulé du poste'] === undefined) throw new Error('format du fichier inattendu')
      continue
    }
    rows++
    const g = (k) => (row[head[k]] ?? '').trim()
    let end = isoDate(g('Date de fin de publication par défaut'))
    if (end && end < today) continue
    if (end && end > '2100') end = undefined
    const text = hay(`${g('Intitulé du poste')} ${g('Métier')} ${g('Spécialisation')}`)
    const loc = g('Localisation du poste')
    for (const m of matchers) {
      if (m.dep && !loc.includes(`(${m.dep})`)) continue
      if (!m.groups.some((g) => g.every((s) => text.includes(` ${s}`)))) continue
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
  const body = JSON.stringify({ keywords: variants(a.keywords)[0], location: a.commune ?? '', radius: String(a.distance ?? 30), page: '1', ResultOnPage: '50' })
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
  const params = new URLSearchParams({ motsCles: cleanKeywords(variants(a.keywords)[0]), sort: '1', range: '0-149', publieeDepuis: firstRun ? '31' : '14' })
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
const MAIL_ALERT = 'email'
const add = (item, alertId) => {
  fetched++
  const ids = [alertId].flat()
  const cur = known.get(item.id)
  if (cur) Object.assign(cur, item, { alerts: [...new Set([...(cur.alerts ?? []), ...ids])], firstSeen: cur.firstSeen })
  else known.set(item.id, { ...item, alerts: ids, firstSeen: new Date().toISOString() })
}

const hasMail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
if (hasMail) {
  try {
    const { readMailAlerts, PARSER_VERSION } = await import('./mail.mjs')
    // nouvelle version de la lecture des emails : on relit 14 jours, les annonces retrouvées sont mises à jour
    // (celles dont l'email a été supprimé entre-temps sont conservées telles quelles)
    const reparse = sources.mail?.v !== PARSER_VERSION
    await readMailAlerts({ user: process.env.GMAIL_USER.trim(), password: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, ''), days: firstRun || reparse ? 14 : 3, add: (i) => add(i, MAIL_ALERT), notes })
    sources.mail = { at: new Date().toISOString(), v: PARSER_VERSION }
  } catch (e) {
    errors.push(/auth|credentials|invalid/i.test(`${e.message} ${e.responseText ?? ''}`) ? 'Gmail : connexion refusée. Vérifiez GMAIL_USER (adresse complète) et le mot de passe d\'application (16 lettres).' : `Gmail : ${e.message}`)
  }
}

// annonces ajoutées à la main dans l'application : texte récupéré et lien vérifié comme les autres
const MANUAL = 'manual'
for (const m of watch.manual ?? []) if (m?.id && m.url) add({ ...m, alerts: undefined }, MANUAL)

// pages carrières des entreprises suivies
const companies = (watch.companies ?? []).filter((c) => c?.url && c.active !== false)
if (companies.length) {
  try {
    const { readCareers } = await import('./career.mjs')
    // une offre est retenue si son intitulé contient au moins 60 % des mots d'un des intitulés d'une alerte
    const groupsOf = alerts.map((a) => ({ id: a.id, groups: variants(a.keywords).map((v) => [...new Set(words(v).map((w) => (w.length <= 3 ? w : stem(w))))]).filter((g) => g.length) }))
    const keep = (title) => {
      const tw = words(title)
      const has = (s) => tw.some((w) => (s.length <= 3 ? w === s : w.startsWith(s)))
      return groupsOf.filter((a) => a.groups.some((g) => g.filter(has).length >= Math.max(1, Math.ceil(g.length * 0.6)))).map((a) => a.id)
    }
    await readCareers({ companies, keep, add, notes, sources, prevStatus: prev.sources?.companies })
  } catch (e) {
    errors.push(`Pages carrières : ${e.message}`)
  }
}

if (!alerts.length) notes.push('Aucune alerte active.')
else {
  try {
    await csp(add)
  } catch (e) {
    errors.push(`Choisir le Service Public : ${e.message}`)
  }
  // Jooble : quota limité (environ 500 requêtes), donc une seule interrogation par alerte et par jour par défaut
  const every = Number(process.env.JOOBLE_EVERY_HOURS || 24) * 3600000
  const joobleDue = process.env.JOOBLE_KEY && Date.now() - new Date(sources.jooble?.at ?? 0).getTime() >= every - 600000
  if (process.env.JOOBLE_KEY && !joobleDue) notes.push(`Jooble : prochain passage ${new Date(new Date(sources.jooble.at).getTime() + every).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.`)
  if (joobleDue) {
    sources.jooble = { at: new Date().toISOString(), requests: (sources.jooble?.requests ?? 0) + alerts.length }
    notes.push(`Jooble : ${sources.jooble.requests} requête(s) utilisée(s) depuis l'installation.`)
  }
  if (joobleDue)
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
const active = new Set([...alerts.map((a) => a.id), MANUAL, 'company', ...(hasMail ? [MAIL_ALERT] : [])])
const companyIds = new Set((watch.companies ?? []).map((c) => c.id))
// les annonces en favori ou en candidature restent, même si leur alerte a été supprimée
const marked = (id) => ['fav', 'applied'].includes(watch.marks?.[id]?.s)
// annonces supprimées depuis l'application : retirées définitivement de la liste
const removed = (id) => watch.marks?.[id]?.s === 'deleted'
const items = [...known.values()]
  .filter((i) => !removed(i.id))
  // entreprise retirée de la liste : ses offres disparaissent
  .filter((i) => !i.id.startsWith('co-') || [...companyIds].some((id) => i.id.startsWith(`co-${id}-`)))
  .map((i) => ({ ...i, alerts: (i.alerts ?? []).filter((x) => active.has(x)) }))
  .filter((i) => (i.alerts.length || marked(i.id)) && (i.until ? i.until >= now : new Date(i.date ?? i.firstSeen).getTime() >= limit))
  .sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''))
  .slice(0, MAX_ITEMS)

/* ---------- annonces supprimées ---------- */

// Signes qu'une annonce n'est plus en ligne, par site (vérification une fois par jour et par annonce).
const GONE = /n['’]est plus (disponible|en ligne|active|accessible)|n['’]existe plus|a été (pourvue|supprimée|retirée|clôturée)|offre (expirée|clôturée|pourvue|dépubliée)|plus d['’]acceptation de candidatures|n['’]accepte plus de candidatures|no longer accepting applications|this job is no longer available|page (introuvable|non trouvée)/i
const CHECKABLE = /choisirleservicepublic|francetravail|hellowork|linkedin|welcometothejungle|cadremploi|jobijoba|apec\.fr|^https:\/\/(?!.*glassdoor)/
// pages construites par script : affichées par un navigateur pour en lire le texte
const RENDERED = /francetravail|jobijoba|apec\.fr|welcometothejungle/

/* ---------- texte complet des annonces ---------- */

const decodeHtml = (s) =>
  (s ?? '')
    .replace(/<br\s*\/?>|<\/(p|li|div|h\d|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, '’')
    .replace(/&euro;/g, '€')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const MAX_TEXT = 7000

/** Texte de l'annonce : données structurées JobPosting, sinon zone de description propre au site. */
async function extractText(url, html) {
  const out = []
  const facts = {}
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data
    try {
      data = JSON.parse(m[1])
    } catch {
      continue
    }
    const list = [data, ...(Array.isArray(data) ? data : []), ...(data?.['@graph'] ?? [])].flat()
    const jp = list.find((x) => x && x['@type'] === 'JobPosting')
    if (!jp) continue
    const desc = jp.description ?? jp.Description
    if (desc) out.push(decodeHtml(desc))
    const val = (v) => (typeof v === 'string' ? decodeHtml(v) : v?.credentialCategory ?? v?.name ?? (v?.monthsOfExperience ? `${Math.round(v.monthsOfExperience / 12)} an(s)` : ''))
    if (jp.educationRequirements) facts.education = val(jp.educationRequirements)
    if (jp.experienceRequirements) facts.experience = val(jp.experienceRequirements)
    if (jp.skills) facts.skills = decodeHtml(Array.isArray(jp.skills) ? jp.skills.join(', ') : String(jp.skills))
    break
  }
  if (!out.length) {
    try {
      const { parse } = await import('node-html-parser')
      const root = parse(html)
      if (/linkedin/.test(url)) {
        const d = root.querySelector('.show-more-less-html__markup')
        if (d) out.push(decodeHtml(d.innerHTML))
        for (const li of root.querySelectorAll('.description__job-criteria-item')) {
          const k = li.querySelector('h3')?.text.trim()
          const v = li.querySelector('span')?.text.trim()
          if (k && v) out.push(`${k} : ${v}`)
          if (k && v && /niveau hi[ée]rarchique|seniority/i.test(k)) facts.level = v
        }
      } else {
        const d = root.querySelectorAll('[itemprop=description], .job-description, .description').find((e) => !e.closest('li') && !e.closest('.media-body') && e.text.trim().length > 200)
        if (d) out.push(decodeHtml(d.innerHTML))
      }
      // France Travail : le détail est chargé par script, seule la description courte (meta) est servie
      if (!out.length && /francetravail/.test(url)) {
        const meta = root.querySelector('meta[name=description]')?.getAttribute('content')
        if (meta) {
          out.push(decodeHtml(meta))
          facts.summaryOnly = true
        }
      }
    } catch {
      /* module absent : pas d'extraction */
    }
  }
  const text = out.filter(Boolean).join('\n\n').slice(0, MAX_TEXT)
  return { text: text.length > 60 ? text : undefined, facts }
}

/** Vérifie que l'annonce est en ligne et récupère son texte. online : true, false ou undefined (inconnu). */
/** Texte absent, ou simple résumé (France Travail) : on essaie encore, au plus 4 fois. */
const needsText = (i) => (!i.fullText || i.facts?.summaryOnly) && (i.textTries ?? 0) < 4

/** Vérification et lecture avec un navigateur (sites construits par script). undefined : navigateur indisponible. */
async function inspectRendered(i) {
  const { render } = await import('./browser.mjs')
  const r = await render(i.url)
  if (!r) return undefined
  if (r.status === 404 || r.status === 410) return { online: false }
  if (/secours|maintenance/i.test(r.url) || /service indisponible/i.test(r.text.slice(0, 3000))) {
    sources.degraded = { ...(sources.degraded ?? {}), [new URL(i.url).hostname]: new Date().toISOString() }
    return { online: undefined }
  }
  if (/francetravail/.test(i.url) && !/detail/.test(r.url)) return { online: false }
  const visible = r.html.slice(0, 800000).replace(/<(form|script|style|select|label|template|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
  const online = !GONE.test(visible)
  if (!online) return { online }
  const x = await extractText(r.url, r.html)
  return { online, ...x, rendered: true }
}

async function inspect(i) {
  if (RENDERED.test(i.url)) {
    const r = await inspectRendered(i).catch(() => undefined)
    if (r) return r
  }
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 12000)
  try {
    const r = await fetch(i.url, { redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (veille Resume)', 'Accept-Language': 'fr-FR,fr' } })
    if (r.status === 404 || r.status === 410) return { online: false }
    if (!r.ok) return { online: undefined } // bloqué ou indisponible : on ne conclut pas
    const final = r.url
    // site en mode dégradé (France Travail « secours ») : on ne conclut pas, l'offre existe peut-être encore
    if (/secours|maintenance|indisponib/i.test(final)) {
      sources.degraded = { ...(sources.degraded ?? {}), [new URL(i.url).hostname]: new Date().toISOString() }
      return { online: undefined }
    }
    // redirigé vers une page de recherche : l'annonce a disparu
    if (/choisirleservicepublic/.test(i.url) && !/offre-emploi/.test(final)) return { online: false }
    if (/hellowork/.test(i.url) && !/emplois\/\d+/.test(final)) return { online: false }
    if (/francetravail/.test(i.url) && !/detail/.test(final)) return { online: false }
    const raw = (await r.text()).slice(0, 1500000)
    // on ignore les formulaires (ex. « signaler une offre : l'offre n'existe plus »), scripts et styles
    const visible = raw.slice(0, 600000).replace(/<(form|script|style|select|label|template|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    const online = !GONE.test(visible)
    return { online, ...(online && needsText(i) ? await extractText(i.url, raw) : {}) }
  } catch {
    return { online: undefined }
  } finally {
    clearTimeout(t)
  }
}

{
  const day = Date.now() - 20 * 3600000
  // sonde : France Travail renvoie-t-il vers son site de secours en ce moment ?
  const ft = items.find((i) => /candidat\.francetravail\.fr\/offres/.test(i.url ?? ''))
  if (ft)
    try {
      const r = await fetch(ft.url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (veille Resume)' } })
      if (/secours|maintenance/i.test(r.headers.get('location') ?? '')) sources.degraded = { ...(sources.degraded ?? {}), 'candidat.francetravail.fr': new Date().toISOString() }
    } catch {
      /* réseau : sans conclusion */
    }
  // contrôle quotidien, et tout de suite pour les annonces dont on n'a pas encore le texte
  const todo = items
    .filter((i) => CHECKABLE.test(i.url ?? '') && !i.closed && (new Date(i.checkedAt ?? 0).getTime() < day || (needsText(i) && new Date(i.checkedAt ?? 0).getTime() < Date.now() - 2.5 * 3600000)))
    .slice(0, 150)
  let gone = 0
  let texts = 0
  for (let k = 0; k < todo.length; k += 4) {
    await Promise.all(
      todo.slice(k, k + 4).map(async (i) => {
        const r = await inspect(i)
        if (r.online === undefined) return
        i.checkedAt = new Date().toISOString()
        if (!r.online) {
          i.closed = true
          gone++
          return
        }
        if (needsText(i)) {
          i.textTried = true
          i.textTries = (i.textTries ?? 0) + 1
          // un texte complet remplace un résumé, jamais l'inverse
          if (r.text && (!i.fullText || !r.facts?.summaryOnly)) {
            i.fullText = r.text
            i.facts = r.facts && Object.values(r.facts).some(Boolean) ? r.facts : undefined
            texts++
          }
        }
      }),
    )
    if (/linkedin/.test(todo[k]?.url ?? '')) await sleep(300)
  }
  if (todo.length) notes.push(`Vérification : ${todo.length} lien(s) contrôlé(s), ${gone} annonce(s) retirée(s), ${texts} texte(s) complet(s) récupéré(s).`)
}
{
  const { closeBrowser, renders } = await import('./browser.mjs')
  if (renders()) notes.push(`Navigateur : ${renders()} page(s) affichée(s).`)
  await closeBrowser()
}
// les annonces retirées ne restent que si elles sont en favori ou en candidature (signalées « expirée »)
for (let k = items.length - 1; k >= 0; k--) if (items[k].closed && !marked(items[k].id)) items.splice(k, 1)

// en erreur seulement si aucune source n'a répondu
await save(errors.length && !fetched && !notes.some((n) => n.includes('déjà lu')) ? 'error' : 'ok', items)
