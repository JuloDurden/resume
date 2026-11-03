// Relances des candidatures envoyées.
import type { Offer, ResumeDoc } from '../types'

const DAY = 86400000
/** Délai avant chaque relance (après l'envoi, puis après la relance précédente). */
export const FOLLOW_UP_DAYS = [7, 10]

export const appliedAt = (o: Offer) => o.statusAt?.applied ?? (o.status === 'applied' ? o.updatedAt : undefined)

/** Date de la prochaine relance, ou undefined si aucune n'est prévue. */
export function nextFollowUp(o: Offer): number | undefined {
  if (o.status !== 'applied' || o.noFollowUp) return undefined
  const sent = o.followUps ?? []
  if (sent.length >= FOLLOW_UP_DAYS.length) return undefined
  const from = sent.length ? Math.max(...sent) : appliedAt(o)
  return from ? from + FOLLOW_UP_DAYS[sent.length] * DAY : undefined
}

export const isDue = (o: Offer, now = Date.now()) => {
  const n = nextFollowUp(o)
  return n !== undefined && n <= now
}

const frDate = (t?: number) => (t ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '')

export function followUpEmail(o: Offer, cv?: ResumeDoc): { subject: string; body: string } {
  const first = !(o.followUps?.length)
  const raw = cv?.header.name || ''
  // nom saisi en capitales : « JULIEN CLAVEL » devient « Julien Clavel »
  const name = raw === raw.toUpperCase() ? raw.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase()) : raw
  const contact = o.contacts?.find((c) => c.email)?.name
  const hello = contact ? `Bonjour ${contact},` : 'Bonjour,'
  const poste = o.title ? `au poste de ${o.title}` : 'à votre offre'
  const subject = `${first ? 'Relance' : 'Seconde relance'} : candidature ${poste}${o.company ? ` chez ${o.company}` : ''}`
  const body = first
    ? `${hello}

Je me permets de revenir vers vous au sujet de ma candidature ${poste}, envoyée le ${frDate(appliedAt(o))}.

Ce poste m'intéresse toujours vivement et je reste très motivé à l'idée de rejoindre ${o.company || 'votre équipe'}. Je serais ravi d'échanger avec vous pour vous présenter mon parcours et ce que je pourrais apporter.

Pourriez-vous m'indiquer où en est le processus de recrutement ?

Je vous remercie par avance pour votre retour.

Bien cordialement,
${name}`
    : `${hello}

Je reviens une dernière fois vers vous concernant ma candidature ${poste}, envoyée le ${frDate(appliedAt(o))} et relancée le ${frDate(Math.max(...(o.followUps ?? [0])))}.

Si le poste est toujours ouvert, je reste pleinement disponible pour un échange, même court. Dans le cas contraire, un simple retour me permettrait de clore ma démarche.

Merci pour votre attention.

Bien cordialement,
${name}`
  return { subject, body }
}
