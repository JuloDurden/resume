// Veille de Resume : lecture des alertes emploi reçues dans Gmail (LinkedIn, Hellowork, Indeed, APEC,
// France Travail, Welcome to the Jungle, Cadremploi, Meteojob...). Connexion IMAP en lecture seule avec
// un mot de passe d'application (secrets GMAIL_USER et GMAIL_APP_PASSWORD). Aucun email n'est modifié.

/** Expéditeurs d'alertes emploi. */
export const SENDERS = [
  'linkedin.com',
  'hellowork.com',
  'indeed.com',
  'apec.fr',
  'francetravail.fr',
  'welcometothejungle.com',
  'cadremploi.fr',
  'meteojob.com',
  'jobteaser.com',
  'monster.fr',
  'jobijoba.com',
  'jooble.org',
]

/** Liens d'annonce reconnus : site, identifiant, lien propre. */
const PATTERNS = [
  { site: 'LinkedIn', re: /linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/, url: (id) => `https://www.linkedin.com/jobs/view/${id}/` },
  { site: 'Hellowork', re: /hellowork\.com\/fr-fr\/emplois\/(\d+)\.html/, url: (id) => `https://www.hellowork.com/fr-fr/emplois/${id}.html` },
  { site: 'Indeed', re: /indeed\.(?:com|fr)\/[^\s"'<>]*?[?&](?:jk|vjk)=([0-9a-f]{12,20})/, url: (id) => `https://fr.indeed.com/viewjob?jk=${id}` },
  { site: 'APEC', re: /apec\.fr\/[^\s"'<>]*?detail-offre\/([\w-]+)/, url: (id) => `https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/${id}` },
  { site: 'France Travail', re: /francetravail\.fr\/offres\/recherche\/detail\/(\w+)/, url: (id) => `https://candidat.francetravail.fr/offres/recherche/detail/${id}` },
  { site: 'Welcome to the Jungle', re: /welcometothejungle\.com\/(?:fr|en)\/companies\/([\w-]+\/jobs\/[\w-]+)/, url: (id) => `https://www.welcometothejungle.com/fr/companies/${id}` },
  { site: 'Cadremploi', re: /cadremploi\.fr\/emploi\/detail_offre\?offreId=(\d+)/, url: (id) => `https://www.cadremploi.fr/emploi/detail_offre?offreId=${id}` },
  { site: 'Meteojob', re: /meteojob\.com\/[^\s"'<>]*?-(\d{6,})(?:[?#"'\s]|$)/, url: (id) => `https://www.meteojob.com/candidat/offres/offre-d-emploi-${id}` },
]

const NOISE =
  /^(votre alerte|vos alertes|bonjour|nouvelles? offres?|\d+ nouvelles?|offres? (similaires|recommandées|pour vous)|voir|postuler|postulez|découvr|cliquez|gérez|gérer|se désabonner|désabonnement|aide|nouveau|nouvelle|recrute activement|\d+ (anciens?|relations?|candidat)|candidature simplifiée|il y a|publiée?|offre sponsoris|sponsoris|premium|cet e-mail|vous recevez|ne pas répondre|©|https?:|\[|-{3,}|•|·)/i

/** Décode les liens de suivi (redirections encodées en paramètre) pour retrouver le lien d'annonce. */
function unwrap(url) {
  let u = url
  for (let i = 0; i < 3; i++) {
    try {
      const d = decodeURIComponent(u)
      if (d === u) break
      u = d
    } catch {
      break
    }
  }
  return u
}

function matchJob(url) {
  const u = unwrap(url)
  for (const p of PATTERNS) {
    const m = p.re.exec(u)
    if (m) return { site: p.site, id: m[1], url: p.url(m[1]) }
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

/** Garde la lecture (texte brut ou HTML) qui donne les annonces les plus complètes. */
export function parseMail({ text, html }, date) {
  const score = (list) => list.reduce((n, j) => n + 1 + (j.company ? 1 : 0) + (j.location ? 1 : 0), 0)
  const a = text ? parseAlertText(text, date) : []
  const b = html ? parseAlertText(htmlToText(html), date) : []
  return score(b) > score(a) ? b : a
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
            date: j.date,
            url: j.url,
            source: `${j.site} (alerte email)`,
            description: mail.subject ? `Alerte : ${clean(mail.subject)}` : undefined,
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
