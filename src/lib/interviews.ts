// Entretiens d'une candidature : dates, lieux, agenda (.ics) et impression de la préparation.
import type { InterviewMode, InterviewPrep, InterviewSlot, Offer } from '../types'
import { fmtSalary, parseSalary } from './salary'

export const MODE_LABEL: Record<InterviewMode, string> = { site: 'Sur place', phone: 'Téléphone', video: 'Visio' }

const DAY = 86400000
const startOfDay = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Entretiens datés, du plus ancien au plus récent. */
export const datedInterviews = (o: Offer) => (o.interviews ?? []).filter((s): s is InterviewSlot & { at: number } => !!s.at).sort((a, b) => a.at - b.at)

/** Prochain entretien (un entretien reste « à venir » jusqu'à 2 h après son début). */
export const upcomingInterview = (o: Offer, now = Date.now()) => datedInterviews(o).find((s) => s.at > now - 2 * 3600000)

/** Jours restants avant une date (0 = aujourd'hui). */
export const daysUntil = (t: number, now = Date.now()) => Math.round((startOfDay(t) - startOfDay(now)) / DAY)

const hour = (t: number) => {
  const d = new Date(t)
  return `${d.getHours()} h${d.getMinutes() ? ` ${String(d.getMinutes()).padStart(2, '0')}` : ''}`
}
/** « jeu. 21 nov., 14 h 30 » */
export const fmtShort = (t: number) => `${new Date(t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}, ${hour(t)}`
/** « jeudi 21 novembre à 14 h 30 » */
export const fmtLong = (t: number) => `${new Date(t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à ${hour(t)}`
/** « dans 3 j », « demain », « aujourd'hui » */
export const fmtIn = (t: number) => {
  const d = daysUntil(t)
  return d <= 0 ? "aujourd'hui" : d === 1 ? 'demain' : `dans ${d} j`
}

/** Une ligne de description : « Visio, avec Mme Durand (DRH) : https://… » */
export const slotWhere = (s: InterviewSlot) =>
  [s.mode ? MODE_LABEL[s.mode] : '', s.place, s.with ? `avec ${s.with}` : ''].filter(Boolean).join(', ')

/** Salaire de l'offre : champ « salaire », sinon lu dans le texte de l'annonce. */
export function offerSalary(o: Offer): { text: string; max?: number } | undefined {
  const s = parseSalary(o.salary) ?? parseSalary(o.description)
  if (s) return { text: fmtSalary(s), max: s.max }
  return o.salary?.trim() ? { text: o.salary.trim() } : undefined
}

/* ---------- agenda ---------- */

const icsDate = (t: number) => {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`
}
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`)

/** Fichier agenda (.ics) d'un entretien, à ouvrir dans Google Agenda, Outlook ou Calendrier. */
export function downloadIcs(o: Offer, s: InterviewSlot & { at: number }) {
  const title = `Entretien : ${[o.title, o.company].filter(Boolean).join(' - ')}`
  const desc = [s.mode ? MODE_LABEL[s.mode] : '', s.with ? `Avec ${s.with}` : '', s.notes ?? '', o.url ?? ''].filter(Boolean).join('\n')
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Resume//Entretiens//FR',
    'BEGIN:VEVENT',
    `UID:${s.id}@resume`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(s.at)}`,
    `DTEND:${icsDate(s.at + 3600000)}`,
    `SUMMARY:${icsText(title)}`,
    s.place ? `LOCATION:${icsText(s.place)}` : '',
    desc ? `DESCRIPTION:${icsText(desc)}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  a.download = `entretien-${(o.company || 'offre').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/* ---------- impression de la préparation ---------- */

const esc = (s = '') => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const para = (s?: string) => (s ? s.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') : '')

/** Ouvre la préparation dans une page sobre et lance l'impression (ou l'enregistrement en PDF). */
export function printPrep(o: Offer, p: InterviewPrep): boolean {
  const w = window.open('', '_blank')
  if (!w) return false
  const next = upcomingInterview(o) ?? datedInterviews(o).at(-1)
  const sal = offerSalary(o)
  const facts = [
    next ? `<li><strong>Entretien :</strong> ${esc(fmtLong(next.at))}${slotWhere(next) ? `, ${esc(slotWhere(next))}` : ''}</li>` : '',
    o.location ? `<li><strong>Lieu du poste :</strong> ${esc(o.location)}${o.contract ? `, ${esc(o.contract)}` : ''}</li>` : '',
    sal ? `<li><strong>Salaire annoncé :</strong> ${esc(sal.text)}</li>` : '',
    next?.notes ? `<li><strong>Notes :</strong> ${esc(next.notes)}</li>` : '',
  ].join('')
  const sec = (title: string, body: string) => (body ? `<section><h2>${title}</h2>${body}</section>` : '')
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Préparation : ${esc([o.title, o.company].filter(Boolean).join(', '))}</title>
<style>
@page{margin:16mm 15mm}
*{box-sizing:border-box}
body{font:10.5pt/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1f2937;margin:0 auto;max-width:720px;padding:24px}
h1{font-size:17pt;margin:0 0 2px}
.sub{color:#4b5563;margin:0 0 10px}
ul.facts{list-style:none;padding:10px 12px;margin:0 0 6px;background:#f3f5f8;border-radius:6px}
ul.facts li{margin:2px 0}
h2{font-size:12pt;margin:18px 0 6px;padding-bottom:3px;border-bottom:1.5px solid #1e3a5f;color:#1e3a5f;break-after:avoid}
p{margin:0 0 6px}
.pitch{border-left:3px solid #1e3a5f;padding-left:10px;font-style:italic}
.q{margin:0 0 10px;break-inside:avoid}
.q h3{font-size:10.5pt;margin:0 0 2px}
.why{color:#6b7280;font-size:9.5pt;margin:0 0 2px}
ul{margin:0 0 6px;padding-left:18px}
li{margin:2px 0}
ul.check{list-style:none;padding-left:0}
ul.check li::before{content:"\\2610  ";font-size:12pt}
.bar{display:flex;gap:8px;justify-content:flex-end;margin-bottom:12px}
.bar button{font:inherit;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer}
@media print{.bar{display:none}body{padding:0}}
</style></head><body>
<div class="bar"><button onclick="window.print()">Imprimer</button><button onclick="window.close()">Fermer</button></div>
<h1>${esc(o.title || 'Préparation d\'entretien')}</h1>
<p class="sub">${esc(o.company ?? '')}</p>
${facts ? `<ul class="facts">${facts}</ul>` : ''}
${sec("L'employeur", para(p.company))}
${sec('Ma présentation (1 minute)', p.pitch ? `<div class="pitch">${para(p.pitch)}</div>` : '')}
${sec(`Questions probables`, (p.questions ?? []).map((q, i) => `<div class="q"><h3>${i + 1}. ${esc(q.q)}</h3>${q.why ? `<p class="why">Ce qui est vérifié : ${esc(q.why)}</p>` : ''}${para(q.answer)}</div>`).join(''))}
${sec('Points de vigilance', p.weaknesses?.length ? `<ul>${p.weaknesses.map((x) => `<li><strong>${esc(x.point)}</strong>${x.how ? ` : ${esc(x.how)}` : ''}</li>`).join('')}</ul>` : '')}
${sec('Questions à poser', p.ask?.length ? `<ul>${p.ask.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '')}
${sec('À préparer', p.checklist?.length ? `<ul class="check">${p.checklist.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '')}
<script>setTimeout(function(){window.print()},300)</script>
</body></html>`
  w.document.open()
  w.document.write(html)
  w.document.close()
  return true
}
