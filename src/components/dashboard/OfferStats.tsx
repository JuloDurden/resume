import type { Offer } from '../../types'
import { domainOf } from '../../lib/offers'
import { appliedAt, isDue } from '../../lib/followup'

const DAY = 86400000
const SENT = new Set(['applied', 'interview', 'rejected', 'offer'])

const SITES: [RegExp, string][] = [
  [/linkedin/, 'LinkedIn'],
  [/francetravail|pole-emploi/, 'France Travail'],
  [/glassdoor/, 'Glassdoor'],
  [/jobijoba/, 'Jobijoba'],
  [/hellowork/, 'Hellowork'],
  [/indeed/, 'Indeed'],
  [/apec/, 'APEC'],
  [/welcometothejungle/, 'Welcome to the Jungle'],
  [/choisirleservicepublic/, 'Service public'],
]
const siteOf = (o: Offer) => {
  const d = domainOf(o.url) ?? ''
  return SITES.find(([re]) => re.test(d))?.[1] ?? (d ? 'Site de l\'employeur' : 'Candidature directe')
}

/** Lundi de la semaine d'une date. */
const weekStart = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

function Kpi({ value, label, sub, tone }: { value: string | number; label: string; sub?: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`kpi${tone ? ` ${tone}` : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
      {sub && <em>{sub}</em>}
    </div>
  )
}

export function OfferStats({ offers }: { offers: Offer[] }) {
  const now = Date.now()
  const sent = offers.filter((o) => SENT.has(o.status ?? 'todo'))
  const sentAt = (o: Offer) => appliedAt(o) ?? o.statusAt?.interview ?? o.statusAt?.rejected ?? o.createdAt
  const answered = sent.filter((o) => o.status !== 'applied')
  const interviews = sent.filter((o) => o.status === 'interview' || o.status === 'offer')
  const thisWeek = sent.filter((o) => sentAt(o) >= weekStart(now)).length
  const silent = sent.filter((o) => o.status === 'applied' && now - sentAt(o) > 21 * DAY).length
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : 'n/a')

  // délai moyen de première réponse
  const delays = answered
    .map((o) => {
      const a = appliedAt(o)
      const r = o.statusAt?.interview ?? o.statusAt?.rejected ?? o.statusAt?.offer
      return a && r && r > a ? (r - a) / DAY : undefined
    })
    .filter((x): x is number => x !== undefined)
  const delay = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : undefined

  // candidatures par semaine, sur 10 semaines
  const weeks = Array.from({ length: 10 }, (_, i) => weekStart(now) - (9 - i) * 7 * DAY)
  const perWeek = weeks.map((w) => sent.filter((o) => sentAt(o) >= w && sentAt(o) < w + 7 * DAY).length)
  const maxWeek = Math.max(1, ...perWeek)

  // efficacité par site
  const bySite = new Map<string, { sent: number; answers: number; interviews: number }>()
  for (const o of sent) {
    const k = siteOf(o)
    const e = bySite.get(k) ?? { sent: 0, answers: 0, interviews: 0 }
    e.sent++
    if (o.status !== 'applied') e.answers++
    if (o.status === 'interview' || o.status === 'offer') e.interviews++
    bySite.set(k, e)
  }
  const sites = [...bySite.entries()].sort((a, b) => b[1].sent - a[1].sent)

  const funnel = [
    { label: 'Offres retenues', n: offers.length },
    { label: 'Candidatures envoyées', n: sent.length },
    { label: 'Réponses', n: answered.length },
    { label: 'Entretiens', n: interviews.length },
    { label: 'Propositions', n: offers.filter((o) => o.status === 'offer').length },
  ]

  if (!sent.length)
    return (
      <div className="empty-state">
        <p>Les statistiques apparaîtront dès votre première candidature envoyée (statut « Candidature envoyée »).</p>
      </div>
    )

  return (
    <div className="stats">
      <div className="kpis">
        <Kpi value={sent.length} label="Candidatures envoyées" sub={`${thisWeek} cette semaine`} />
        <Kpi value={pct(answered.length, sent.length)} label="Taux de réponse" sub={`${answered.length} réponse${answered.length > 1 ? 's' : ''}`} />
        <Kpi value={pct(interviews.length, sent.length)} label="Taux d'entretien" sub={`${interviews.length} entretien${interviews.length > 1 ? 's' : ''}`} tone={interviews.length ? 'ok' : undefined} />
        <Kpi value={delay !== undefined ? `${delay} j` : 'n/a'} label="Délai moyen de réponse" />
        <Kpi value={offers.filter((o) => isDue(o)).length} label="Relances à faire" sub={`${silent} sans réponse depuis 3 semaines`} tone={offers.some((o) => isDue(o)) ? 'warn' : undefined} />
      </div>

      <div className="stats-grid">
        <section className="stats-card">
          <h4>Candidatures par semaine</h4>
          <div className="week-bars">
            {perWeek.map((n, i) => (
              <div key={weeks[i]} className="week-bar" title={`Semaine du ${new Date(weeks[i]).toLocaleDateString('fr-FR')} : ${n}`}>
                <span className="bar" style={{ height: `${(n / maxWeek) * 100}%` }}>
                  {n > 0 && <b>{n}</b>}
                </span>
                <em>{new Date(weeks[i]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="stats-card">
          <h4>Entonnoir</h4>
          <div className="funnel">
            {funnel.map((f) => (
              <div key={f.label} className="funnel-row">
                <span>{f.label}</span>
                <span className="funnel-bar">
                  <span style={{ width: `${(f.n / Math.max(1, funnel[0].n)) * 100}%` }} />
                </span>
                <b>{f.n}</b>
              </div>
            ))}
          </div>
        </section>

        <section className="stats-card wide">
          <h4>Efficacité par source</h4>
          <table className="stats-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Envoyées</th>
                <th>Réponses</th>
                <th>Entretiens</th>
              </tr>
            </thead>
            <tbody>
              {sites.map(([k, e]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{e.sent}</td>
                  <td>
                    {e.answers} <em>({pct(e.answers, e.sent)})</em>
                  </td>
                  <td>
                    {e.interviews} <em>({pct(e.interviews, e.sent)})</em>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
