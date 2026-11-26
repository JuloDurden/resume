// Réponses des employeurs lues dans Gmail par la veille : rattachement à une candidature, suite à donner.
// Accusés de réception et relances envoyées : notés tout seuls. Refus, convocations, autres réponses : à confirmer.
import type { MailKind, MailReply, Offer, OfferMail, RecruiterUpdate, WatchState } from '../types'
import { uid } from './ids'
import { startOfDay } from './followup'

const DAY = 86400000
/** Au-delà, une réponse non traitée n'est plus proposée (moins longtemps sans candidature trouvée). */
const SHOWN_DAYS = 60
const LOOSE_DAYS = 30

export const MAIL_LABEL: Record<MailKind, string> = {
  ack: 'Accusé de réception',
  refus: 'Refus',
  convoc: 'Convocation',
  other: 'Autre réponse',
  followup: 'Relance envoyée',
}
/** Repère court sur la carte d'une candidature. */
export const MAIL_MARK: Partial<Record<MailKind, string>> = { refus: 'Refus ?', convoc: 'Convocation ?', other: 'À lire' }

const fold = (s?: string) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const LEGAL = new Set(['sa', 'sas', 'sasu', 'sarl', 'eurl', 'scop', 'groupe', 'group', 'france', 'the', 'le', 'la', 'les', 'de', 'des', 'du', 'et', 'l', 'd', 'rh'])
const TITLE_STOP = new Set(['h', 'f', 'x', 'nb', 'hf', 'fh', 'de', 'des', 'du', 'la', 'le', 'les', 'et', 'en', 'au', 'aux', 'un', 'une', 'pour', 'cdi', 'cdd', 'junior', 'senior', 'confirme'])
const GENERIC = /(^|\.)(gmail|googlemail|hotmail|outlook|live|yahoo|orange|free|sfr|laposte|wanadoo|icloud|proton)\./

const domain = (email?: string) => (email ?? '').split('@')[1]?.toLowerCase() ?? ''

/** Formes du nom de l'entreprise à chercher dans l'email : nom sans forme juridique, et nom collé (CA-TS → cats). */
function companyKeys(company?: string): { phrase: string; compact: string; tokens: string[] } | undefined {
  // « SIMAX (NOUT SAS) » : le nom d'usage, sans la raison sociale entre parenthèses
  const tokens = fold((company ?? '').replace(/\(.*?\)/g, ' '))
    .split(' ')
    .filter((t) => t && !LEGAL.has(t))
  if (!tokens.length) return
  return { phrase: tokens.join(' '), compact: tokens.join(''), tokens }
}

export interface Match {
  offer?: Offer
  score: number
  /** rattachement sans ambiguïté (assez pour noter tout seul un accusé de réception ou une relance) */
  sure: boolean
}

/** Score d'un email pour une candidature : fil déjà connu, contact, entreprise, intitulé du poste, date. */
export function scoreFor(r: MailReply, o: Offer): number {
  const at = new Date(r.at).getTime()
  if (r.thread && o.mails?.some((m) => m.thread === r.thread)) return 100
  const party = r.out ? (r.to ?? []) : [r.from]
  const contacts = (o.contacts ?? []).map((c) => (c.email ?? '').trim().toLowerCase()).filter(Boolean)
  let score = 0
  if (party.some((p) => contacts.includes(p))) score = 90
  else if (party.some((p) => !GENERIC.test(domain(p)) && contacts.some((c) => domain(c) === domain(p)))) score = 60
  const hay = ` ${fold(`${r.fromName ?? ''} ${r.subject} ${r.excerpt ?? ''} ${party.map((p) => domain(p).replace(/\./g, ' ')).join(' ')}`)} `
  const compactHay = hay.replace(/ /g, '')
  const k = companyKeys(o.company)
  if (k) {
    if (k.compact.length >= 3 && hay.includes(` ${k.phrase} `)) score = Math.max(score, 55)
    else if (k.compact.length >= 4 && compactHay.includes(k.compact)) score = Math.max(score, 45)
    else if (k.tokens.length >= 2 && k.tokens.every((t) => hay.includes(` ${t} `))) score = Math.max(score, 45)
    // adresse de l'entreprise : recrutement@ediser.com pour « ENPC-EDISER »
    const labels = party.flatMap((p) => domain(p).split('.'))
    if (k.tokens.some((t) => t.length >= 4 && labels.includes(t))) score = Math.max(score, 55)
  }
  const words = fold(o.title)
    .split(' ')
    .filter((w) => w.length > 1 && !TITLE_STOP.has(w))
  if (words.length) {
    const share = words.filter((w) => hay.includes(` ${w} `)).length / words.length
    if (score > 0 && share >= 0.5) score += Math.round(25 * share)
    // intitulé repris presque mot pour mot dans l'objet (expéditeur anonyme : plateforme de recrutement)
    else if (!score && words.length >= 2 && share >= 0.75) score = 45 + Math.round(10 * share)
  }
  // un email antérieur à la candidature ne la concerne pas (sauf le jour même ou la veille)
  const start = o.statusAt?.applied ?? o.createdAt
  if (at < startOfDay(start) - DAY) score -= 60
  if ((o.status ?? 'todo') === 'todo') score -= 10
  return score
}

/** Candidature d'un email : rattachement fait à la main, sinon la mieux notée (45 points au moins). */
export function matchReply(r: MailReply, offers: Offer[], marks?: WatchState['mailMarks']): Match {
  const linked = marks?.[r.id]
  if (linked?.s === 'linked' && linked.offer) {
    const o = offers.find((x) => x.id === linked.offer)
    if (o) return { offer: o, score: 100, sure: true }
  }
  const ranked = offers.map((o) => ({ o, s: scoreFor(r, o) })).sort((a, b) => b.s - a.s)
  const [best, second] = ranked
  if (!best || best.s < 45) return { score: best?.s ?? 0, sure: false }
  // nom de l'entreprise retrouvé (55) et aucune autre candidature proche : assez pour un accusé de réception
  return { offer: best.o, score: best.s, sure: best.s >= 55 && (!second || second.s < best.s - 15) }
}

export interface InboxItem {
  r: MailReply
  at: number
  offer?: Offer
  sure: boolean
}

export interface Inbox {
  /** réponses rattachées à une candidature, à confirmer */
  pending: InboxItem[]
  /** refus, convocations et autres réponses sans candidature trouvée */
  unmatched: InboxItem[]
  /** accusés de réception sans candidature trouvée (repliés) */
  unmatchedAcks: InboxItem[]
  /** à noter tout seuls : accusés de réception, relances envoyées, réponses déjà prises en compte */
  auto: InboxItem[]
}

/** Répartit les emails lus par la veille selon la suite à leur donner. */
export function inboxOf(replies: MailReply[] | undefined, offers: Offer[], marks?: WatchState['mailMarks'], now = Date.now()): Inbox {
  const done = new Set(offers.flatMap((o) => (o.mails ?? []).map((m) => m.id)))
  const box: Inbox = { pending: [], unmatched: [], unmatchedAcks: [], auto: [] }
  for (const raw of replies ?? []) {
    // type corrigé à la main
    const r = marks?.[raw.id]?.kind ? { ...raw, kind: marks[raw.id].kind! } : raw
    const at = new Date(r.at).getTime()
    if (done.has(r.id) || marks?.[r.id]?.s === 'ignored' || now - at > SHOWN_DAYS * DAY) continue
    const m = matchReply(r, offers, marks)
    const item: InboxItem = { r, at, offer: m.offer, sure: m.sure }
    if (!m.offer) {
      if (r.out || now - at > LOOSE_DAYS * DAY) continue
      if (r.kind === 'ack') box.unmatchedAcks.push(item)
      else if (r.kind !== 'followup') box.unmatched.push(item)
      continue
    }
    const st = m.offer.status ?? 'todo'
    if (r.kind === 'ack' || r.kind === 'followup') {
      if (m.sure) box.auto.push(item)
      continue
    }
    // déjà pris en compte à la main (statut changé avant la lecture de l'email)
    // candidature déjà terminée après cet email (refus, proposition) : l'email n'est plus que de l'historique
    const endAt = st === 'rejected' ? m.offer.statusAt?.rejected : st === 'offer' ? m.offer.statusAt?.offer : undefined
    const past = endAt !== undefined && startOfDay(at) <= startOfDay(endAt)
    if (past || (r.kind === 'refus' && st === 'rejected') || (r.kind === 'convoc' && (st === 'interview' || st === 'offer'))) {
      box.auto.push(item)
      continue
    }
    box.pending.push(item)
  }
  const recent = (a: InboxItem, b: InboxItem) => b.at - a.at
  box.pending.sort(recent)
  box.unmatched.sort(recent)
  box.unmatchedAcks.sort(recent)
  return box
}

/**
 * Emails notés tout seuls dont la veille a changé le classement (ou qu'elle a écartés : alerte, rappel) :
 * retirés des échanges, pour être notés à nouveau selon le nouveau classement.
 */
export function staleAuto(o: Offer, replies: MailReply[] | undefined, marks?: WatchState['mailMarks'], now = Date.now()): Offer | undefined {
  if (!replies || !o.mails?.some((m) => m.decision === 'auto')) return
  const byId = new Map(replies.map((r) => [r.id, r]))
  const keep = o.mails.filter((m) => {
    if (m.decision !== 'auto') return true
    const r = byId.get(m.id)
    // au-delà de 110 jours, la veille ne garde plus l'email : la note reste
    if (!r) return now - m.at > 110 * DAY
    return (marks?.[m.id]?.kind ?? r.kind) === m.kind
  })
  return keep.length === o.mails.length ? undefined : { ...o, mails: keep }
}

const mailOf = (r: MailReply, decision: OfferMail['decision']): OfferMail => ({
  id: r.id,
  at: new Date(r.at).getTime(),
  kind: r.kind,
  decision,
  thread: r.thread,
  from: r.from,
  fromName: r.fromName,
  subject: r.subject,
  excerpt: r.excerpt,
  url: r.url,
})

const short = (s?: string, n = 180) => (s && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** Réponse ajoutée au suivi : réponse à la dernière relance envoyée avant elle, sinon message reçu. */
function updateOf(o: Offer, r: MailReply): RecruiterUpdate {
  const at = new Date(r.at).getTime()
  const last = Math.max(0, ...(o.updates ?? []).map((u) => u.at))
  const fu = [...(o.followUps ?? [])].filter((t) => t <= at && t > last).sort((a, b) => b - a)[0]
  return { id: uid(), at, kind: fu ? 'reply' : 'news', text: short(r.excerpt) ?? r.subject, afterFollowUp: fu, mailUrl: r.url }
}

/** Note un email tout seul : accusé de réception dans l'historique, relance envoyée cochée. */
export function applyAuto(o: Offer, r: MailReply): Offer {
  const at = new Date(r.at).getTime()
  const next: Offer = { ...o, mails: [...(o.mails ?? []), mailOf(r, 'auto')] }
  if (r.kind === 'followup' && !(o.followUps ?? []).some((t) => startOfDay(t) === startOfDay(at))) next.followUps = [...(o.followUps ?? []), at].sort((a, b) => a - b)
  return next
}

export type MailAction = 'accept' | 'note' | 'reject' | 'ignore'

/**
 * Suite donnée à une réponse : accept (refus → Refusée, convocation → Entretien), note (dans les échanges,
 * statut inchangé), reject (passer en Refusée, pour une autre réponse), ignore (gardée, sans effet).
 */
export function decide(o: Offer, r: MailReply, action: MailAction): Offer {
  const at = new Date(r.at).getTime()
  if (action === 'ignore') return { ...o, mails: [...(o.mails ?? []), mailOf(r, 'ignored')] }
  const next: Offer = { ...o, updates: [...(o.updates ?? []), updateOf(o, r)], followUpDate: undefined, mails: [...(o.mails ?? []), mailOf(r, action === 'note' ? 'noted' : 'applied')] }
  const toReject = action === 'reject' || (action === 'accept' && r.kind === 'refus')
  if (toReject) return { ...next, status: 'rejected', statusAt: { ...o.statusAt, rejected: at }, noFollowUp: true }
  if (action === 'accept' && r.kind === 'convoc') return { ...next, status: 'interview', statusAt: { ...o.statusAt, interview: at } }
  return next
}

/** Candidature créée depuis un email sans offre : intitulé et entreprise lus dans l'objet et l'expéditeur. */
export function offerFromMail(r: MailReply): Partial<Offer> {
  const subject = r.subject.replace(/^(re|tr|fwd?)\s*:\s*/i, '')
  const company =
    /\bchez\s+([^,.!:;()]+?)(?:\s+pour\b|\s+au\b|\s*[-–]|$)/i.exec(subject)?.[1] ??
    (r.fromName && !/no.?reply|ne.?pas.?r[ée]pondre|recrutement|notification|indeed|hellowork|apec|linkedin/i.test(r.fromName) ? r.fromName.split(/\s+[-–|]\s+/).pop() : undefined)
  const title =
    /\b(?:poste|offre)\s+(?:de\s+|d['’]\s*)?(.+?)(?:\s+chez\b|\s+[-–]\s+|$)/i.exec(subject)?.[1] ??
    /:\s*(.+)$/.exec(subject)?.[1] ??
    subject
  const at = new Date(r.at).getTime()
  return {
    title: title.replace(/^(le|la|l['’])\s+/i, '').trim(),
    company: company?.replace(/^\[rh\]\s*/i, '').trim(),
    status: 'applied',
    statusAt: { applied: at },
    contacts: r.from && !/no.?reply|notification|noreply|mail\.|reply\./i.test(r.from) ? [{ name: r.fromName, email: r.from }] : undefined,
  }
}
