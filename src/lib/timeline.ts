// Étapes d'une candidature (onglet « Échanges ») : une ligne verticale porte les étapes, du plus ancien
// au plus récent ; chaque relance est suivie de sa réponse, ou marquée « sans réponse ».
import type { InterviewMode } from '../types'
import type { Offer, RecruiterUpdate } from '../types'
import { appliedAt, nextFollowUp, startOfDay } from './followup'
import { FEELING, OUTCOME_LABEL, datedInterviews } from './interviews'

export type Tone = 'main' | 'news' | 'iv' | 'end-ok' | 'end-ko' | 'fu' | 'reply' | 'ack'
export interface Station {
  at: number
  label: string
  sub?: string
  tone: Tone
  future?: boolean
  /** email d'origine (Gmail) */
  url?: string
  /** noté automatiquement depuis Gmail */
  auto?: boolean
  /** entretien dont le type (sur place, téléphone, visio) reste à préciser */
  ivId?: string
}
export type Slot = { kind: 'main'; st: Station } | { kind: 'branch'; fu: Station; reply?: Station }

const DAY = 86400000

/** Réponse rattachée à chaque relance : celle qui la suit (même jour compris), avant la relance suivante. */
export function pairReplies(o: Offer): { fu: number; reply?: RecruiterUpdate }[] {
  const fus = [...(o.followUps ?? [])].sort((a, b) => a - b)
  const replies = (o.updates ?? []).filter((u) => u.kind === 'reply').sort((a, b) => a.at - b.at)
  const used = new Set<string>()
  return fus.map((fu, i) => {
    const next = fus[i + 1] ?? Infinity
    const r = replies.find((u) => !used.has(u.id) && (u.afterFollowUp === fu || (u.afterFollowUp === undefined && startOfDay(u.at) >= startOfDay(fu) && u.at < next)))
    if (r) used.add(r.id)
    return { fu, reply: r }
  })
}

const fmt = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const waitText = (u: RecruiterUpdate) => (u.waitUntil ? `retour annoncé le ${fmt(u.waitUntil)}` : '')

const CHANNEL = { mail: 'par email', phone: 'par téléphone', linkedin: 'sur LinkedIn', other: '' } as const
const IV_MODE: Record<InterviewMode, string> = { site: 'sur place', phone: 'téléphonique', video: 'en visio' }

export function slotsOf(o: Offer, now = Date.now()): Slot[] {
  const slots: { at: number; slot: Slot }[] = []
  /** order : rang dans la frise, si différent de la date affichée */
  const main = (st: Station, order = st.at) => slots.push({ at: order, slot: { kind: 'main', st } })
  main({ at: o.createdAt, label: 'Ajoutée', tone: 'main' })
  // l'envoi est souvent noté dans l'application après coup : un accusé de réception plus ancien prouve qu'il a eu lieu avant
  const acks = (o.mails ?? []).filter((m) => m.kind === 'ack' && m.decision !== 'ignored').map((m) => m.at)
  const firstAck = acks.length ? Math.min(...acks) : undefined
  const noted = appliedAt(o)
  const sent = noted !== undefined && firstAck !== undefined && firstAck <= noted ? firstAck - 60000 : noted
  if (sent) main({ at: Math.max(sent, o.createdAt + 1), label: 'Envoyée', tone: 'main' })
  for (const u of o.updates ?? []) if (u.kind === 'news') main({ at: u.at, label: 'Message', sub: [u.text, waitText(u)].filter(Boolean).join(' · '), tone: 'news', url: u.mailUrl })
  // accusés de réception lus dans Gmail
  // un accusé de réception vient toujours après l'envoi (date d'envoi saisie après coup, ou au jour près) ; sa vraie date reste affichée
  for (const m of o.mails ?? []) if (m.kind === 'ack' && m.decision !== 'ignored') main({ at: m.at, label: 'Accusé de réception', sub: m.fromName, tone: 'ack', url: m.url, auto: m.decision === 'auto' }, Math.max(m.at, (sent ?? o.createdAt) + 1.5))
  pairReplies(o).forEach(({ fu, reply }, i) => {
    const info = (o.followUpInfo ?? []).find((x) => x.at === fu)
    const fuSt: Station = { at: fu, label: `Relance ${i + 1}${info && info.channel !== 'mail' ? ` ${CHANNEL[info.channel]}` : ''}`, sub: info ? [info.with, info.note].filter(Boolean).join(' · ') || undefined : undefined, tone: 'fu' }
    const rSt: Station | undefined = reply ? { at: Math.max(reply.at, fu + 1), label: 'Réponse', sub: [reply.text, waitText(reply)].filter(Boolean).join(' · '), tone: 'reply', url: reply.mailUrl } : undefined
    const fuMail = (o.mails ?? []).find((m) => m.kind === 'followup' && startOfDay(m.at) === startOfDay(fu))
    if (fuMail) Object.assign(fuSt, { url: fuMail.url, auto: true })
    // une relance part toujours après l'envoi
    slots.push({ at: Math.max(fu, (sent ?? o.createdAt) + 2), slot: { kind: 'branch', fu: fuSt, reply: rSt } })
  })
  // réponses sans relance retrouvée : elles restent sur la ligne
  const paired = new Set(pairReplies(o).map((p) => p.reply?.id))
  for (const u of o.updates ?? []) if (u.kind === 'reply' && !paired.has(u.id)) main({ at: u.at, label: 'Réponse', sub: u.text, tone: 'reply', url: u.mailUrl })
  for (const s of datedInterviews(o))
    main({
      at: s.at,
      label: s.mode ? `Entretien ${IV_MODE[s.mode]}` : 'Entretien',
      ivId: s.mode ? undefined : s.id,
      sub: [s.feeling ? FEELING[s.feeling].label : s.at > now ? undefined : s.done ? 'passé' : undefined, s.outcome && s.outcome !== 'rejected' && s.outcome !== 'offer' ? OUTCOME_LABEL[s.outcome].toLowerCase() : undefined].filter(Boolean).join(' · ') || undefined,
      tone: 'iv',
      future: s.at > now,
    })
  // fin du parcours rattachée à l'entretien qui l'a précédée (refus ou proposition annoncés à son issue)
  const endAt = o.status === 'rejected' ? o.statusAt?.rejected : o.status === 'offer' ? o.statusAt?.offer : undefined
  // même jour compris : une date de refus saisie sans heure tombe à minuit
  const ivBefore = datedInterviews(o).filter((s) => startOfDay(s.at) <= startOfDay(endAt ?? now) && s.at <= now).pop()
  const ivNote = ivBefore ? `${ivBefore.outcome === o.status ? "à l'issue de" : 'après'} l'entretien du ${fmt(ivBefore.at)}` : undefined
  if (o.status === 'rejected') main({ at: o.statusAt?.rejected ?? o.updatedAt, label: 'Refusée', sub: ivNote, tone: 'end-ko' })
  if (o.status === 'offer') main({ at: o.statusAt?.offer ?? o.updatedAt, label: 'Proposition', sub: ivNote, tone: 'end-ok' })
  // à venir : retour annoncé, prochaine relance
  const lastWait = [...(o.updates ?? [])].sort((a, b) => b.at - a.at)[0]?.waitUntil ?? o.answerBy
  if (lastWait && startOfDay(lastWait) >= startOfDay(now) && o.status !== 'rejected') main({ at: lastWait, label: 'Retour annoncé', tone: 'main', future: true })
  const n = nextFollowUp(o)
  if (n && n >= startOfDay(now)) main({ at: n + DAY / 2, label: 'Relance prévue', tone: 'fu', future: true })
  // les données anciennes datent une réponse saisie sans heure à minuit : elle passe après l'entretien du même jour,
  // et la fin du parcours (refus, proposition) passe après tout ce qui a déjà eu lieu
  const ivs = datedInterviews(o).filter((s) => s.at <= now)
  for (const s of slots) {
    if (s.slot.kind !== 'main' || s.slot.st.future || !['news', 'reply'].includes(s.slot.st.tone)) continue
    const iv = ivs.filter((v) => startOfDay(v.at) === startOfDay(s.at) && v.at > s.at).pop()
    if (iv) s.at = iv.at + 1
  }
  for (const s of slots) {
    if (s.slot.kind !== 'main' || !s.slot.st.tone.startsWith('end-')) continue
    const before = slots.filter((x) => x !== s && !(x.slot.kind === 'main' && x.slot.st.future))
    s.at = Math.max(s.at, ...before.map((x) => x.at + 1))
  }
  return slots.sort((a, b) => a.at - b.at).map((s) => s.slot)
}

