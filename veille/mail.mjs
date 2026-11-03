// Veille de Resume : lecture des alertes emploi reçues dans Gmail (LinkedIn, France Travail, Glassdoor,
// Jobijoba, Hellowork, Indeed, APEC, Welcome to the Jungle...). Connexion IMAP en lecture seule avec
// un mot de passe d'application (secrets GMAIL_USER et GMAIL_APP_PASSWORD). Aucun email n'est modifié.
// Modules : imapflow, mailparser, node-html-parser (installés par la tâche GitHub Actions).
import { createHash } from 'node:crypto'
import { parse } from 'node-html-parser'

/** Change à chaque évolution de la lecture : les annonces des emails sont alors relues. */
export const PARSER_VERSION = 2

/** Expéditeurs d'alertes emploi. */
export const SENDERS = [
  'jobalerts-noreply@linkedin.com',
  'jobs-noreply@linkedin.com',
  'offre.francetravail.fr',
  'glassdoor.com',
  'jobijoba.com',
  'hellowork.com',
  'indeed.com',
  'apec.fr',
  'welcometothejungle.com',
  'cadremploi.fr',
  'meteojob.com',
  'jobteaser.com',
  'monster.fr',
  'jooble.org',
]

const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12)
const keyText = (s) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\((?:h|f|x|nb|ng|cdi|cdd)(?:\s*\/\s*(?:h|f|x|nb|ng))*\)|\b[hf]\s*\/\s*[hf](?:\s*\/\s*(?:x|nb))?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Liens d'annonce reconnus : site, identifiant, lien propre. */
const PATTERNS = [
  { site: 'LinkedIn', re: /linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/, url: (id) => `https://www.linkedin.com/jobs/view/${id}/` },
  { site: 'France Travail', re: /francetravail\.fr\/offres\/recherche\/detail\/(\w+)/, url: (id) => `https://candidat.francetravail.fr/offres/recherche/detail/${id}` },
  { site: 'Glassdoor', re: /glassdoor\.\w+\/[^\s"'<>]*?[?&]jobListingId=(\d+)/, url: (id) => `https://www.glassdoor.fr/job-listing/j?jl=${id}` },
  { site: 'Jobijoba', re: /jobijoba\.com\/(?:clic\/[\w-]+\/(\d+)\/|fr\/mail_redirect\/([\w+/=-]{20,}))/, url: null },
  { site: 'Hellowork', re: /hellowork\.com\/fr-fr\/emplois\/(\d+)\.html/, url: (id) => `https://www.hellowork.com/fr-fr/emplois/${id}.html` },
  { site: 'Indeed', re: /indeed\.(?:com|fr)\/[^\s"'<>]*?[?&](?:jk|vjk)=([0-9a-f]{12,20})/, url: (id) => `https://fr.indeed.com/viewjob?jk=${id}` },
  { site: 'APEC', re: /apec\.fr\/[^\s"'<>]*?detail-offre\/([\w-]+)/, url: (id) => `https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/${id}` },
  { site: 'Welcome to the Jungle', re: /welcometothejungle\.com\/(?:fr|en)\/companies\/([\w-]+\/jobs\/[\w-]+)/, url: (id) => `https://www.welcometothejungle.com/fr/companies/${id}` },
  { site: 'Cadremploi', re: /cadremploi\.fr\/emploi\/detail_offre\?offreId=(\d+)/, url: (id) => `https://www.cadremploi.fr/emploi/detail_offre?offreId=${id}` },
  { site: 'Meteojob', re: /meteojob\.com\/[^\s"'<>]*?-(\d{6,})(?:[?#"'\s]|$)/, url: (id) => `https://www.meteojob.com/candidat/offres/offre-d-emploi-${id}` },
]

const NOISE =
  /^(votre alerte|vos alertes|bonjour|nouvelles? offres?|\d+ nouvelles?|offres? (similaires|recommandées|pour vous)|voir|postuler|postulez|découvr|cliquez|gérez|gérer|se désabonner|désabonnement|aide|nouveau|nouvelle|recrute activement|\d+ (anciens?|relations?|candidat)|candidature simplifiée|il y a|publiée?|offre sponsoris|sponsoris|premium|cet e-mail|vous recevez|ne pas répondre|©|https?:|\[|-{3,}|•|·)/i

/** Décode les liens de suivi (redirections encodées en paramètre) pour retrouver le lien d'annonce. */
function unwrap(url) {
  let u = url.replace(/&amp;/g, '&')
  for (let i = 0; i < 3; i++) {
    try {
      const d = decodeURIComponent(u)
      if (d === u) break
      u = d
    } catch {
      break
    }
  }
  // lien cible encodé en base64 dans le chemin (Jobijoba, certains routeurs d'emails)
  for (const seg of u.split(/[/?&=]/)) {
    const i = seg.indexOf('aHR0c')
    if (i < 0 || seg.length < 24) continue
    try {
      const d = Buffer.from(seg.slice(i).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
      const m = /https?:\/\/[^\s\u0000-\u001f]+/.exec(d)
      if (m) return `${u} ${m[0]}`
    } catch {
      /* ignore */
    }
  }
  return u
}

function matchJob(url) {
  const u = unwrap(url)
  for (const p of PATTERNS) {
    const m = p.re.exec(u)
    if (!m) continue
    const id = m[1] ?? m[2]
    // lien sans identifiant stable (Jobijoba) : on garde le lien de redirection du site, sans le suivi de l'email
    const direct = /https:\/\/www\.jobijoba\.com\/fr\/mail_redirect\/\S+/.exec(u)?.[0]
    return { site: p.site, id, url: p.url ? p.url(id) : (direct ?? url), stable: !!p.url }
  }
  return null
}

const clean = (s) =>
  s
    .replace(/ |͏|​|‌|‍|﻿/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Extrait les annonces d'un email en texte brut (ou du texte généré depuis le HTML).
 * Chaque lien d'annonce est rattaché aux lignes de texte qui le précèdent : intitulé, entreprise, lieu.
 */
export function parseAlertText(text, date) {
  const lines = text.split(/\r?\n/)
  const out = new Map()
  let block = []
  let pending = null // annonce dont l'intitulé est le texte du lien : l'entreprise et le lieu suivent
  for (const raw of lines) {
    const urls = raw.match(/https?:\/\/[^\s<>"'\])]+/g) ?? []
    const job = urls.map(matchJob).find(Boolean)
    const label = clean(raw.replace(/https?:\/\/\S+/g, '').replace(/[[\]<>]|\(\s*\)/g, ' ').replace(/:\s*$/, ''))
    if (job) {
      const prev = out.get(`${job.site}:${job.id}`)
      // le texte du lien lui-même (HTML converti) peut être l'intitulé
      const own = label && !NOISE.test(label) && label.length > 3 ? [label] : []
      const ctx = [...block, ...own].filter((l) => !NOISE.test(l) && l.length > 1 && l.length < 140)
      if (!prev) {
        const [title, company, location] = ctx
        const item = { ...job, title, company, location, date }
        out.set(`${job.site}:${job.id}`, item)
        pending = own.length && ctx.length === 1 ? item : null
      } else {
        // même annonce répétée (bouton « Voir l'offre ») : complète l'entreprise et le lieu
        const rest = ctx.filter((l) => l !== prev.title)
        prev.company ??= rest[0]
        prev.location ??= rest[1]
      }
      block = []
      continue
    }
    if (/^-{3,}|^_{3,}|^={3,}/.test(raw.trim())) {
      block = []
      continue
    }
    if (label && pending && !NOISE.test(label) && label.length < 140) {
      if (!pending.company) {
        pending.company = label
        continue
      }
      if (!pending.location) {
        pending.location = label
        continue
      }
      pending = null
    }
    if (label) block.push(label)
    if (block.length > 8) block.shift()
  }
  return [...out.values()].filter((j) => j.title)
}


/* ---------- lecture des cartes d'annonce (HTML) ---------- */

const CONTRACT = /^(CDI|CDD|Intérim|Interim|Stage|Alternance|Apprentissage|Freelance|Indépendant|Temps (plein|partiel)|Saisonnier|Contrat .*)$/i
const AGE = /^(\d+)\s*(j|h|jours?|heures?)$/i

const lineList = (el) =>
  el.structuredText
    .split('\n')
    .map((x) => clean(x))
    .filter((x) => x && !/[{}]/.test(x) && !/^\[.*\]$/.test(x))

/** Interprète les lignes d'une carte selon le site. */
function readCard(site, L, mailDate) {
  const r = {}
  if (site === 'LinkedIn') {
    if (/similaires|recommand|vous pourriez|consultée/i.test(L[0] ?? '')) return null
    r.title = L[0]
    const [company, loc] = (L[1] ?? '').split(/\s+·\s+/)
    r.company = company
    if (loc) {
      const m = /^(.*?)\s*\((Sur site|À distance|Hybride|On-site|Remote|Hybrid)\)$/.exec(loc)
      r.location = m ? m[1] : loc
      if (m) r.worktime = m[2]
    } else r.location = L[2] && !NOISE.test(L[2]) ? L[2] : undefined
  } else if (site === 'France Travail') {
    r.title = L[0]
    const m = /^(?:(.*?)\s+-\s+)?(\d{2,3}|2A|2B)\s+-\s+(.+)$/.exec(L[1] ?? '')
    if (m) {
      r.company = m[1]
      r.location = `${m[3]} (${m[2]})`
    } else r.location = L[1]
    if (L[2] && CONTRACT.test(L[2])) r.contract = L[2]
    if (L[3] && !/non renseign/i.test(L[3]) && /€|euro|salaire|brut|annuel|mensuel/i.test(L[3])) r.salary = L[3]
    const desc = L.slice(4).filter((l) => !/^Offre n°/i.test(l))
    if (desc.length) r.description = desc.join(' ')
  } else if (site === 'Glassdoor') {
    const av = L.map((l) => /^avatar$/i.test(l)).lastIndexOf(true)
    if (av >= 0) L = L.slice(av + 1)
    const rest = L.filter((l) => !/^candidature facile$/i.test(l))
    r.company = rest[0]?.replace(/\s+\d[.,]\d\s*★$/, '')
    r.title = rest[1]
    r.location = rest[2] && !/€|^\d+\s*[jh]$/i.test(rest[2]) ? rest[2] : undefined
    r.salary = rest.find((l) => /€/.test(l))?.replace(/\s*\(Estimation de l'employeur\)/i, ' (estimation)')
    const age = rest.map((l) => AGE.exec(l)).find(Boolean)
    const t = new Date(mailDate).getTime()
    if (age && !Number.isNaN(t)) r.date = new Date(t - Number(age[1]) * (age[2].startsWith('h') ? 3600000 : 86400000)).toISOString()
  } else if (site === 'Jobijoba') {
    if (L.length < 2 || !/\s-\s/.test(L[1])) return null
    r.title = L[0]
    const parts = (L[1] ?? '').split(/\s+-\s+/)
    r.company = parts[0]
    r.location = parts[1]
    r.contract = parts.slice(2).find((x) => CONTRACT.test(x))
    const desc = L.slice(2).filter((l) => !/^sponsoris/i.test(l))
    if (desc.length) r.description = desc.join(' ')
    if (L.some((l) => /^sponsoris/i.test(l))) r.sponsored = true
  } else {
    const useful = L.filter((l) => !NOISE.test(l) && l.length < 160)
    ;[r.title, r.company, r.location] = useful
  }
  if (!r.title || r.title.length < 3 || NOISE.test(r.title)) return null
  if (r.title) r.title = r.title.replace(/\s+\(CDI\)$/i, '')
  return r
}

/** Repère chaque carte d'annonce (le plus grand bloc ne contenant qu'une seule annonce) et la lit. */
export function parseAlertHtml(html, date) {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } })
  root.querySelectorAll('style,script,head').forEach((e) => e.remove())
  const jobOf = new Map()
  const anchors = root.querySelectorAll('a').filter((a) => {
    const j = matchJob(a.getAttribute('href') ?? '')
    if (j) jobOf.set(a, j)
    return !!j
  })
  const keysIn = (el) => new Set(el.querySelectorAll('a').map((a) => jobOf.get(a)).filter(Boolean).map((j) => `${j.site}:${j.id}`))
  const out = new Map()
  const done = new Set()
  for (const a of anchors) {
    const job = jobOf.get(a)
    const k = `${job.site}:${job.id}`
    if (done.has(k)) continue
    done.add(k)
    let card = a
    while (card.parentNode?.tagName && keysIn(card.parentNode).size <= 1) card = card.parentNode
    const r = readCard(job.site, lineList(card), date)
    if (!r) continue
    const id = job.stable ? job.id : hash(`${keyText(r.title)}|${keyText(r.company)}`)
    // même offre relayée plusieurs fois (Jobijoba) : une seule carte
    const dup = `${job.site}:${keyText(r.title)}|${keyText(r.company)}`
    if (out.has(dup)) continue
    out.set(dup, { ...r, site: job.site, id, url: job.url, date: r.date ?? date })
  }
  return [...out.values()]
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', icirc: 'î', rsquo: '’', laquo: '«', raquo: '»', euro: '€' }
const decode = (s) =>
  s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e.toLowerCase()] ?? m)))

/** HTML d'email vers texte : un lien devient « texte [url] » sur sa ligne, chaque bloc va à la ligne. */
export function htmlToText(html) {
  return decode(
    html
      .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, u, t) => `\n${t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()} [${u.replace(/&amp;/g, '&')}]\n`)
      .replace(/<br\s*\/?>|<\/(p|div|td|tr|li|h\d|table|span)>|<(p|div|tr|li|h\d|table)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

/** Lit un email d'alerte : cartes HTML d'abord, texte brut en secours. */
export function parseMail({ text, html }, date) {
  let a = []
  try {
    a = html ? parseAlertHtml(html, date) : []
  } catch {
    a = []
  }
  if (a.length) return a
  return text ? parseAlertText(text, date) : []
}

/** Parcourt les alertes emploi récentes de Gmail et appelle add() pour chaque annonce. */
export async function readMailAlerts({ user, password, days, add, notes }) {
  const { ImapFlow } = await import('imapflow')
  const { simpleParser } = await import('mailparser')
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass: password }, logger: false })
  await client.connect()
  let mails = 0
  let jobs = 0
  try {
    const boxes = await client.list()
    const all = boxes.find((b) => b.specialUse === '\\All')?.path ?? 'INBOX'
    const lock = await client.getMailboxLock(all, { readOnly: true })
    try {
      const query = `{${SENDERS.map((s) => `from:${s}`).join(' ')}} newer_than:${days}d`
      const uids = (await client.search({ gmraw: query }, { uid: true })) || []
      for await (const msg of client.fetch(uids.slice(-300), { source: true, envelope: true, internalDate: true }, { uid: true })) {
        const mail = await simpleParser(msg.source)
        const date = (mail.date ?? msg.internalDate ?? new Date()).toISOString()
        const found = parseMail({ text: mail.text, html: typeof mail.html === 'string' ? mail.html : '' }, date)
        if (!found.length) continue
        mails++
        for (const j of found) {
          jobs++
          add({
            id: `mail-${j.site.toLowerCase().replace(/\W+/g, '')}-${j.id}`,
            title: j.title,
            company: j.company,
            location: j.location,
            contract: j.contract,
            worktime: j.worktime,
            salary: j.salary,
            date: j.date,
            url: j.url,
            source: `${j.site} (alerte email)`,
            description: j.description ?? (mail.subject ? `Alerte : ${clean(mail.subject)}` : undefined),
          })
        }
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
  notes.push(`Gmail : ${jobs} annonce(s) trouvée(s) dans ${mails} email(s) d'alerte des ${days} derniers jours.`)
}
