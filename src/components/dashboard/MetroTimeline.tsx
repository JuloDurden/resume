// Historique d'une candidature dessiné comme une ligne de métro : la ligne principale porte les étapes,
// chaque relance part en embranchement, passe par la réponse s'il y en a une et rejoint la ligne.
import { Fragment } from 'react'
import type { Offer, RecruiterUpdate } from '../../types'
import { appliedAt, nextFollowUp, startOfDay } from '../../lib/followup'
import { FEELING, datedInterviews } from '../../lib/interviews'

type Tone = 'main' | 'news' | 'iv' | 'end-ok' | 'end-ko' | 'fu' | 'reply'
interface Station {
  at: number
  label: string
  sub?: string
  tone: Tone
  future?: boolean
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

const short = (s: string, n = 34) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
const fmt = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const waitText = (u: RecruiterUpdate) => (u.waitUntil ? `retour annoncé le ${fmt(u.waitUntil)}` : '')

export function slotsOf(o: Offer, now = Date.now()): Slot[] {
  const slots: { at: number; slot: Slot }[] = []
  const main = (st: Station) => slots.push({ at: st.at, slot: { kind: 'main', st } })
  main({ at: o.createdAt, label: 'Ajoutée', tone: 'main' })
  const sent = appliedAt(o)
  if (sent) main({ at: Math.max(sent, o.createdAt + 1), label: 'Envoyée', tone: 'main' })
  for (const u of o.updates ?? []) if (u.kind === 'news') main({ at: u.at, label: 'Message', sub: [u.text, waitText(u)].filter(Boolean).join(' · '), tone: 'news' })
  pairReplies(o).forEach(({ fu, reply }, i) => {
    const fuSt: Station = { at: fu, label: `Relance ${i + 1}`, tone: 'fu' }
    const rSt: Station | undefined = reply ? { at: Math.max(reply.at, fu + 1), label: 'Réponse', sub: [reply.text, waitText(reply)].filter(Boolean).join(' · '), tone: 'reply' } : undefined
    // une relance part toujours après l'envoi
    slots.push({ at: Math.max(fu, (sent ?? o.createdAt) + 2), slot: { kind: 'branch', fu: fuSt, reply: rSt } })
  })
  // réponses sans relance retrouvée : elles restent sur la ligne
  const paired = new Set(pairReplies(o).map((p) => p.reply?.id))
  for (const u of o.updates ?? []) if (u.kind === 'reply' && !paired.has(u.id)) main({ at: u.at, label: 'Réponse', sub: u.text, tone: 'reply' })
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

const COLOR: Record<Tone, string> = {
  main: '#2f6fb3',
  news: '#3b6d11',
  iv: '#534ab7',
  'end-ok': '#15803d',
  'end-ko': '#a32d2d',
  fu: '#ba7517',
  reply: '#3b6d11',
}

export function MetroTimeline({ offer }: { offer: Offer }) {
  const slots = slotsOf(offer)
  // largeur : une case par station, branches comprises
  const cells = slots.reduce((n, s) => n + (s.kind === 'branch' ? (s.reply ? 2 : 1) : 1), 0)
  const step = 104
  const pad = 46
  const width = Math.max(560, pad * 2 + cells * step)
  const Y = 34
  const Y2 = 96
  const hasBranch = slots.some((s) => s.kind === 'branch')
  const height = hasBranch ? 160 : 92
  let x = slots[0]?.kind === 'branch' ? pad + step / 2 : pad
  const nodes: React.ReactNode[] = []
  const lines: React.ReactNode[] = []
  let lastX = pad
  let firstFuture: number | undefined
  const station = (st: Station, cx: number, cy: number, below: boolean, key: string) => (
    <g key={key} className="metro-st">
      <title>{[fmt(st.at), st.label, st.sub].filter(Boolean).join(' · ')}</title>
      <circle cx={cx} cy={cy} r={st.tone === 'news' || st.tone.startsWith('end') ? 7 : 7} fill={st.tone === 'news' || st.tone.startsWith('end') ? COLOR[st.tone] : 'var(--panel)'} stroke={COLOR[st.tone]} strokeWidth={3.5} strokeDasharray={st.future ? '3 2.5' : undefined} />
      <text x={cx} y={below ? cy + 22 : cy - 14} textAnchor="middle" className="metro-date">
        {fmt(st.at)}
      </text>
      <text x={cx} y={below ? cy + 37 : cy + 24} textAnchor="middle" className={`metro-label${st.future ? ' future' : ''}`}>
        {st.label}
      </text>
      {st.sub && (
        <text x={cx} y={below ? cy + 51 : cy + 38} textAnchor="middle" className="metro-sub">
          {short(st.sub, 22)}
        </text>
      )}
    </g>
  )
  slots.forEach((s, i) => {
    if (s.kind === 'main') {
      if (s.st.future && firstFuture === undefined) firstFuture = x
      nodes.push(station(s.st, x, Y, false, `m${i}`))
      lastX = x
      x += step
      return
    }
    // embranchement : départ de la ligne, station relance, éventuelle réponse, retour sur la ligne
    const fx = x
    const rx = s.reply ? x + step : undefined
    const startX = fx - step / 2
    const endX = (rx ?? fx) + step / 2
    const d = s.reply
      ? `M${startX} ${Y} C ${startX + 26} ${Y}, ${fx - 30} ${Y2}, ${fx} ${Y2} H ${rx} C ${rx! + 30} ${Y2}, ${endX - 26} ${Y}, ${endX} ${Y}`
      : `M${startX} ${Y} C ${startX + 26} ${Y}, ${fx - 30} ${Y2}, ${fx} ${Y2} H ${fx + 34}`
    lines.push(<path key={`b${i}`} d={d} fill="none" stroke={COLOR.fu} strokeWidth={4} strokeLinecap="round" />)
    if (!s.reply) lines.push(<path key={`bx${i}`} d={`M${fx + 34} ${Y2} H ${fx + 52}`} stroke={COLOR.fu} strokeWidth={4} strokeDasharray="2 5" strokeLinecap="round" />)
    nodes.push(<circle key={`j${i}`} cx={startX} cy={Y} r={4} fill={COLOR.main} />)
    if (s.reply) nodes.push(<circle key={`k${i}`} cx={endX} cy={Y} r={4} fill={COLOR.main} />)
    nodes.push(station(s.fu, fx, Y2, true, `f${i}`))
    if (s.reply && rx) nodes.push(station(s.reply, rx, Y2, true, `r${i}`))
    else nodes.push(<text key={`n${i}`} x={fx} y={Y2 + 51} textAnchor="middle" className="metro-sub">sans réponse</text>)
    lastX = endX
    x = (rx ?? fx) + step
  })
  const solidEnd = firstFuture !== undefined ? firstFuture : lastX
  return (
    <div className="metro" role="img" aria-label="Historique de la candidature">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path d={`M${pad} ${Y} H ${solidEnd}`} stroke={COLOR.main} strokeWidth={5} strokeLinecap="round" />
        {firstFuture !== undefined && <path d={`M${firstFuture} ${Y} H ${lastX}`} stroke={COLOR.main} strokeWidth={5} strokeDasharray="2 7" strokeLinecap="round" />}
        {lines.map((l, i) => (
          <Fragment key={i}>{l}</Fragment>
        ))}
        {nodes}
      </svg>
    </div>
  )
}
