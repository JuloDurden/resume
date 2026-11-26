// Historique d'une candidature (onglet « Échanges ») : une ligne verticale porte les étapes, du plus ancien
// au plus récent ; chaque relance est suivie de sa réponse, ou marquée « sans réponse ».
import { ExternalLink } from 'lucide-react'
import type { Offer, RecruiterUpdate } from '../../types'
import { appliedAt, nextFollowUp, startOfDay } from '../../lib/followup'
import { FEELING, datedInterviews } from '../../lib/interviews'

type Tone = 'main' | 'news' | 'iv' | 'end-ok' | 'end-ko' | 'fu' | 'reply' | 'ack'
interface Station {
  at: number
  label: string
  sub?: string
  tone: Tone
  future?: boolean
  /** email d'origine (Gmail) */
  url?: string
  /** noté automatiquement depuis Gmail */
  auto?: boolean
}
type Slot = { kind: 'main'; st: Station } | { kind: 'branch'; fu: Station; reply?: Station }

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

export function slotsOf(o: Offer, now = Date.now()): Slot[] {
  const slots: { at: number; slot: Slot }[] = []
  const main = (st: Station) => slots.push({ at: st.at, slot: { kind: 'main', st } })
  main({ at: o.createdAt, label: 'Ajoutée', tone: 'main' })
  const sent = appliedAt(o)
  if (sent) main({ at: Math.max(sent, o.createdAt + 1), label: 'Envoyée', tone: 'main' })
  for (const u of o.updates ?? []) if (u.kind === 'news') main({ at: u.at, label: 'Message', sub: [u.text, waitText(u)].filter(Boolean).join(' · '), tone: 'news', url: u.mailUrl })
  // accusés de réception lus dans Gmail
  for (const m of o.mails ?? []) if (m.kind === 'ack' && m.decision !== 'ignored') main({ at: m.at, label: 'Accusé de réception', sub: m.fromName, tone: 'ack', url: m.url, auto: m.decision === 'auto' })
  pairReplies(o).forEach(({ fu, reply }, i) => {
    const fuSt: Station = { at: fu, label: `Relance ${i + 1}`, tone: 'fu' }
    const rSt: Station | undefined = reply ? { at: Math.max(reply.at, fu + 1), label: 'Réponse', sub: [reply.text, waitText(reply)].filter(Boolean).join(' · '), tone: 'reply', url: reply.mailUrl } : undefined
    const fuMail = (o.mails ?? []).find((m) => m.kind === 'followup' && startOfDay(m.at) === startOfDay(fu))
    if (fuMail) Object.assign(fuSt, { url: fuMail.url, auto: true })
    // une relance part toujours après l'envoi
    slots.push({ at: Math.max(fu, (sent ?? o.createdAt) + 2), slot: { kind: 'branch', fu: fuSt, reply: rSt } })
  })
  // réponses sans relance retrouvée : elles restent sur la ligne
  const paired = new Set(pairReplies(o).map((p) => p.reply?.id))
  for (const u of o.updates ?? []) if (u.kind === 'reply' && !paired.has(u.id)) main({ at: u.at, label: 'Réponse', sub: u.text, tone: 'reply', url: u.mailUrl })
  for (const s of datedInterviews(o)) main({ at: s.at, label: 'Entretien', sub: s.feeling ? FEELING[s.feeling].label : s.at > now ? undefined : s.done ? 'passé' : undefined, tone: 'iv', future: s.at > now })
  if (o.status === 'rejected') main({ at: o.statusAt?.rejected ?? o.updatedAt, label: 'Refusée', tone: 'end-ko' })
  if (o.status === 'offer') main({ at: o.statusAt?.offer ?? o.updatedAt, label: 'Proposition', tone: 'end-ok' })
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

const fmtDay = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: new Date(t).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })

/** Nombre d'étapes déjà passées (titre de l'onglet). */
export const pastSteps = (o: Offer) => slotsOf(o).reduce((n, s) => n + (s.kind === 'branch' ? (s.reply ? 2 : 1) : s.st.future ? 0 : 1), 0)

function Step({ st, child, note }: { st: Station; child?: boolean; note?: string }) {
  return (
    <li className={`tl-step t-${st.tone}${st.future ? ' future' : ''}${child ? ' child' : ''}`}>
      <span className="tl-date">{fmtDay(st.at)}</span>
      <span className="tl-dot" aria-hidden="true" />
      <div className="tl-body">
        <strong>{st.label}</strong>
        {st.auto && <span className="tl-src"> · lu dans Gmail</span>}
        {st.future && <span className="tl-src"> · à venir</span>}
        {st.sub && <p>{st.sub}</p>}
        {note && <p className="muted">{note}</p>}
        {st.url && (
          <a className="tl-link" href={st.url} target="_blank" rel="noreferrer">
            <ExternalLink size={12} /> Ouvrir dans Gmail
          </a>
        )}
      </div>
    </li>
  )
}

/** Chronologie verticale de la candidature. */
export function Timeline({ offer }: { offer: Offer }) {
  const slots = slotsOf(offer)
  return (
    <ol className="timeline">
      {slots.map((s, i) =>
        s.kind === 'main' ? (
          <Step key={i} st={s.st} />
        ) : (
          [<Step key={`${i}f`} st={s.fu} note={s.reply ? undefined : 'sans réponse'} />, s.reply ? <Step key={`${i}r`} st={s.reply} child /> : null]
        ),
      )}
    </ol>
  )
}
