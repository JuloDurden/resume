// Relances des candidatures envoyées.
import type { Offer, ResumeDoc } from '../types'

/** Délais proposés avant une relance, en jours. */
export const FOLLOW_UP_CHOICES = [7, 10, 15, 21]
/** Nombre de relances proposées (une relance, puis une seconde). */
const MAX_FOLLOW_UPS = 2
let defaultDays = 15
/** Délai par défaut (réglage du profil), 15 jours sinon. */
export const setDefaultFollowUpDays = (n?: number) => {
  defaultDays = n && n > 0 ? n : 15
}
export const followUpDays = (o: Offer) => o.followUpDays ?? defaultDays

export const appliedAt = (o: Offer) => o.statusAt?.applied ?? (o.status === 'applied' ? o.updatedAt : undefined)

/** Début du jour (minuit, heure locale) : une relance est due le jour prévu, quelle que soit l'heure de la candidature. */
export const startOfDay = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const addDays = (t: number, n: number) => {
  const d = new Date(startOfDay(t))
  d.setDate(d.getDate() + n)
  return d.getTime()
}

/**
 * Jour de la prochaine relance, ou undefined si aucune n'est prévue : délai compté en jours à partir du jour de la candidature
 * (ou de la relance précédente), ou date précise choisie pour la première relance.
 */
export function nextFollowUp(o: Offer): number | undefined {
  if (o.status !== 'applied' || o.noFollowUp) return undefined
  const sent = o.followUps ?? []
  if (sent.length >= MAX_FOLLOW_UPS) return undefined
  if (!sent.length && o.followUpDate) return startOfDay(o.followUpDate)
  const from = sent.length ? Math.max(...sent) : appliedAt(o)
  return from ? addDays(from, followUpDays(o)) : undefined
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
