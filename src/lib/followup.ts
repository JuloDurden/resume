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
  // une réponse du recruteur relance le compteur : on repart de son message (ou du délai qu'il annonce)
  const upd = lastUpdate(o)
  const sent = (o.followUps ?? []).filter((t) => !upd || t > upd.at)
  if (sent.length >= MAX_FOLLOW_UPS) return undefined
  // date choisie à la main (après la dernière réponse), sinon lendemain du délai annoncé
  if (!sent.length && o.followUpDate && (!upd || o.followUpDate >= startOfDay(upd.at))) return startOfDay(o.followUpDate)
  if (!sent.length && upd?.waitUntil) return addDays(upd.waitUntil, 1)
  const from = sent.length ? Math.max(...sent) : upd ? upd.at : appliedAt(o)
  return from ? addDays(from, followUpDays(o)) : undefined
}

/** Relances envoyées depuis la dernière réponse du recruteur. */
export const followUpsSinceUpdate = (o: Offer) => {
  const u = lastUpdate(o)
  return (o.followUps ?? []).filter((t) => !u || t > u.at)
}

/** Dernière réponse ou nouvelle du recruteur. */
export const lastUpdate = (o: Offer) =>
  (o.updates ?? [])
    .map((u) => {
      // une réponse vient après la relance à laquelle elle répond, même saisie à une heure antérieure le même jour
      if (u.kind !== 'reply') return u
      const fu = u.afterFollowUp ?? [...(o.followUps ?? [])].filter((t) => startOfDay(t) <= startOfDay(u.at)).sort((a, b) => b - a)[0]
      return fu && fu >= u.at ? { ...u, at: fu + 60000 } : u
    })
    .sort((a, b) => b.at - a.at)[0]

/** Retour annoncé par le recruteur et pas encore passé. */
export const announcedBy = (o: Offer, now = Date.now()) => {
  const u = lastUpdate(o)
  return u?.waitUntil && startOfDay(u.waitUntil) >= startOfDay(now) ? u.waitUntil : undefined
}

export const isDue = (o: Offer, now = Date.now()) => {
  const n = nextFollowUp(o)
  return n !== undefined && n <= now
}

const frDate = (t?: number) => (t ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '')

export function followUpEmail(o: Offer, cv?: ResumeDoc): { subject: string; body: string } {
  const upd = lastUpdate(o)
  const first = !(o.followUps ?? []).some((t) => !upd || t > upd.at)
  const raw = cv?.header.name || ''
  // nom saisi en capitales : « JULIEN CLAVEL » devient « Julien Clavel »
  const name = raw === raw.toUpperCase() ? raw.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase()) : raw
  const contact = o.contacts?.find((c) => c.email)?.name
  const hello = contact ? `Bonjour ${contact},` : 'Bonjour,'
  const poste = o.title ? `au poste de ${o.title}` : 'à votre offre'
  const subject = `${first ? 'Relance' : 'Seconde relance'} : candidature ${poste}${o.company ? ` chez ${o.company}` : ''}`
  // après un entretien sans retour à la date annoncée : relance sur l'entretien, pas sur l'envoi
  const met = (o.interviews ?? []).filter((s) => s.at && s.at < Date.now()).sort((a, b) => b.at! - a.at!)[0]
  if (o.status === 'interview' && met?.at) {
    const who = met.with?.split(/[,(]/)[0].trim()
    return {
      subject: `Suite à notre entretien : ${o.title ?? 'candidature'}${o.company ? ` chez ${o.company}` : ''}`,
      body: `${who ? `Bonjour ${who},` : hello}

Je me permets de revenir vers vous suite à notre entretien du ${frDate(met.at)} pour le poste ${o.title ? `de ${o.title}` : ''}.

Notre échange a renforcé mon intérêt pour ce poste et pour ${o.company || 'votre équipe'}. Auriez-vous des nouvelles sur la suite du processus ?

Je reste disponible si vous avez besoin d'éléments complémentaires.

Bien cordialement,
${name}`,
    }
  }
  // relance après une réponse : on rappelle leur message et le délai qu'ils avaient donné
  if (upd && o.status === 'applied') {
    return {
      subject: `Suivi de ma candidature ${poste}${o.company ? ` chez ${o.company}` : ''}`,
      body: `${hello}

Je me permets de revenir vers vous suite à votre message du ${frDate(upd.at)}${upd.waitUntil ? `, qui annonçait un retour vers le ${frDate(upd.waitUntil)}` : ''}, au sujet de ma candidature ${poste}.

Je reste très intéressé par ce poste. Avez-vous pu avancer dans le processus de recrutement ? Je suis disponible pour un échange si cela peut vous être utile.

Bien cordialement,
${name}`,
    }
  }
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
