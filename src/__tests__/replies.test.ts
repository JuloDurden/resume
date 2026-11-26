import { describe, expect, it } from 'vitest'
// @ts-expect-error module JavaScript de la veille, sans types
import { classifyMail, labelQuery, repliesQuery } from '../../veille/replies.mjs'
import { applyAuto, decide, inboxOf, matchReply, offerFromMail, staleAuto } from '../lib/replies'
import { silentSince, setSilentDays } from '../lib/followup'
import type { MailReply, Offer } from '../types'

const at = (d: number, h = 10) => new Date(2026, 10, d, h).getTime()
const iso = (d: number, h = 10) => new Date(at(d, h)).toISOString()

describe('classement des emails de candidature (veille)', () => {
  const c = (subject: string, text: string, more: Record<string, unknown> = {}) => classifyMail({ subject, text, ...more })
  it('refus', () => {
    expect(c('Suite à votre candidature chez Acme', 'Bonjour,\n\nAprès étude de votre profil, nous avons pris la décision de ne pas donner suite à votre candidature.').kind).toBe('refus')
    expect(c('Votre candidature', 'Nous sommes au regret de vous\ninformer que nous ne pourrons pas donner une suite favorable à cette\ncandidature.').kind).toBe('refus')
    expect(c("Votre candidature de Chef de projet n'est pas retenue", 'Bonjour').kind).toBe('refus')
  })
  it('un accusé de réception qui parle d’un éventuel refus ou entretien reste un accusé de réception', () => {
    const r = c('Accusé de réception', 'Nous avons bien reçu votre candidature. Si votre profil correspond, nous vous contacterons pour un entretien. Sans réponse de notre part sous 4 semaines, considérez que votre candidature n’a pas été retenue.')
    expect(r.kind).toBe('ack')
    expect(c('Votre candidature', 'Nous vous contacterons pour un entretien si votre profil est retenu. Merci pour votre candidature.').kind).toBe('ack')
  })
  it('convocation, à confirmer', () => {
    const r = c('RE: Rendez-vous', 'Bonjour,\nJe vous propose un entretien téléphonique jeudi à 10 h.', { reply: true })
    expect(r).toMatchObject({ kind: 'convoc', sure: false })
    expect(r.excerpt).toBe('Je vous propose un entretien téléphonique jeudi à 10 h.')
  })
  it("réponse dans un fil : l'objet du premier message ne compte pas", () => {
    const r = c('Re: Bienvenue dans notre processus de recrutement', 'Bonjour,\nMerci pour votre message. Nos recrutements sont suspendus pour le moment.\n\nLe 3 nov. 2026, Julien a écrit :\n> Bonjour', { reply: true })
    expect(r.kind).toBe('other')
  })
  it('relance envoyée, rappel « finalisez », envoi initial', () => {
    expect(c('Re: Votre candidature', 'Je me permets de revenir vers vous au sujet de ma candidature.', { out: true, reply: true }).kind).toBe('followup')
    expect(c('Finalisez votre candidature', 'Il ne reste qu’une étape').kind).toBeUndefined()
    expect(c('Candidature Business Analyst', 'Veuillez trouver ci-joint ma candidature.', { out: true }).kind).toBeUndefined()
  })
  it('alertes d’offres, HTML, convocation sans rendez-vous proposé', () => {
    expect(c('Acme recrute : Business Analyst (F/H)', 'Votre alerte Emploi', { from: 'jobalerts-noreply@linkedin.com' }).kind).toBeUndefined()
    expect(c("Nouvelles offres d'emploi chez Acme", 'x', { from: 'alert@indeed.com' }).kind).toBeUndefined()
    expect(c('Votre candidature', 'Apr&egrave;s examen, nous sommes au regret de ne pouvoir y donner une suite favorable.').kind).toBe('refus')
    expect(c('Votre candidature', '<p>Bonjour,</p><p>Nous accusons r&eacute;ception de votre candidature.</p>').excerpt).toBe('Nous accusons réception de votre candidature.')
    expect(c('Bienvenue dans notre processus', 'Merci pour votre candidature. Voici les étapes : un entretien avec le recruteur sur Teams.').kind).toBe('ack')
    expect(c('Votre candidature', 'Elle est toujours en cours d’étude. Pour nos conseils, rendez-vous sur le blog.').kind).toBe('ack')
    expect(c('RDV', 'Comme convenu, je vous confirme notre rendez-vous le jeudi 19/11 à 14h.').kind).toBe('convoc')
    expect(c('Acme recrute au poste de Formateur', 'Votre alerte Emploi', { reply: true, from: 'jobalerts-noreply@linkedin.com' }).kind).toBeUndefined()
    expect(c("Nouvelles offres d'emploi chez Acme", 'x', { from: 'donotreply@jobalert.indeed.com' }).kind).toBeUndefined()
    expect(c('Votre candidature - offre 12', "Nous vous remercions d'avoir répondu à notre annonce.").kind).toBe('ack')
  })
  it('recherche Gmail : dossier, contacts et entreprises des candidatures en cours', () => {
    expect(labelQuery('Emploi/Candidatures Emploi ')).toBe('label:emploi-candidatures-emploi')
    const q = repliesQuery({ label: '', days: 7, offers: [{ status: 'applied', company: 'Acme Sud', createdAt: Date.now(), contacts: [{ email: 'rh@acme.fr' }] }, { status: 'todo', company: 'Autre' }] })
    expect(q).toContain('from:(rh@acme.fr)')
    expect(q).toContain('from:(@acme.fr)')
    expect(q).toContain('subject:("Acme Sud")')
    expect(q).not.toContain('Autre')
  })
})

const offer = (p: Partial<Offer>): Offer => ({ id: p.id ?? 'o', createdAt: at(1), updatedAt: at(1), status: 'applied', statusAt: { applied: at(4) }, ...p }) as Offer
const mail = (p: Partial<MailReply>): MailReply => ({ id: 'm1', at: iso(10), kind: 'refus', from: 'jobs@ats-mail.com', subject: 'Suite à votre candidature', ...p })

describe('rattachement des réponses aux candidatures', () => {
  const acme = offer({ id: 'acme', title: 'Business Analyst (F/H)', company: 'Acme Technologies' })
  const beta = offer({ id: 'beta', title: 'Chef de projet IT', company: 'Beta Conseil', contacts: [{ email: 'claire@beta-conseil.fr' }] })
  it("par le nom de l'entreprise, l'intitulé, le contact", () => {
    expect(matchReply(mail({ fromName: 'Lisa - Acme Technologies', subject: 'Votre candidature au poste de Business Analyst' }), [acme, beta])).toMatchObject({ offer: acme, sure: true })
    expect(matchReply(mail({ from: 'claire@beta-conseil.fr', subject: 'Re: point' }), [acme, beta]).offer?.id).toBe('beta')
    expect(matchReply(mail({ from: 'paul@beta-conseil.fr', subject: 'Échange' }), [acme, beta]).offer?.id).toBe('beta')
    expect(matchReply(mail({ subject: 'Suite à votre candidature chez Gamma' }), [acme, beta]).offer).toBeUndefined()
  })
  it('raison sociale entre parenthèses, adresse de l’entreprise, intitulé seul', () => {
    const simax = offer({ id: 's', title: 'Support fonctionnel', company: 'SIMAX (NOUT SAS)' })
    expect(matchReply(mail({ from: 'noreply@simax.fr', subject: 'Votre candidature' }), [simax]).offer?.id).toBe('s')
    const ediser = offer({ id: 'e', title: 'Technicien Support', company: 'ENPC-EDISER' })
    expect(matchReply(mail({ from: 'recrutement@ediser.com', subject: 'Accusé réception' }), [ediser]).offer?.id).toBe('e')
    const amdm = offer({ id: 'm', title: 'Responsable de Bureau Motard', company: 'Mutuelle des Motards' })
    expect(matchReply(mail({ from: 'noreply@talent-soft.com', subject: 'Votre candidature - offre 2026-424 – Responsable de Bureau Motard H/F' }), [amdm, ediser]).offer?.id).toBe('m')
  })
  it('nom collé (sigle avec tiret)', () => {
    const cats = offer({ id: 'cats', title: 'Business Analyst', company: 'CA-TS' })
    expect(matchReply(mail({ from: 'lisa@cats.teamtailor-mail.com', subject: 'Suite à votre candidature' }), [cats]).offer?.id).toBe('cats')
  })
  it('un email antérieur à la candidature ne la concerne pas', () => {
    expect(matchReply(mail({ at: iso(1), fromName: 'Acme Technologies' }), [offer({ ...acme, statusAt: { applied: at(20) } })]).offer).toBeUndefined()
  })
  it('répartition : accusés notés seuls, refus à confirmer, refus déjà noté à la main', () => {
    const replies = [mail({ id: 'a', kind: 'ack', fromName: 'Acme Technologies', subject: 'Candidature Business Analyst reçue' }), mail({ id: 'r', kind: 'refus', fromName: 'Acme Technologies' }), mail({ id: 'x', kind: 'convoc', subject: 'Entretien chez Gamma' }), mail({ id: 'y', kind: 'ack', subject: 'Merci pour votre candidature chez Gamma' })]
    const box = inboxOf(replies, [acme], undefined, at(12))
    expect(box.auto.map((i) => i.r.id)).toEqual(['a'])
    expect(box.pending.map((i) => i.r.id)).toEqual(['r'])
    expect(box.unmatched.map((i) => i.r.id)).toEqual(['x'])
    expect(box.unmatchedAcks.map((i) => i.r.id)).toEqual(['y'])
    const rejected = inboxOf(replies, [{ ...acme, status: 'rejected', statusAt: { applied: at(4), rejected: at(11) } }], undefined, at(12))
    expect(rejected.auto.map((i) => i.r.id)).toEqual(['a', 'r'])
    // une fois noté, l'email ne revient plus
    expect(inboxOf(replies, [applyAuto(acme, replies[0])], undefined, at(12)).auto).toEqual([])
    // rattaché à la main
    expect(inboxOf(replies, [acme], { x: { s: 'linked', offer: 'acme', at: 1 } }, at(12)).pending.map((i) => i.r.id)).toContain('x')
    expect(inboxOf(replies, [acme], { x: { s: 'ignored', at: 1 } }, at(12)).unmatched).toEqual([])
  })
  it('type corrigé à la main, note automatique refaite quand le classement change', () => {
    const r = mail({ id: 'k', kind: 'refus', fromName: 'Acme Technologies' })
    expect(inboxOf([r], [acme], { k: { s: 'linked', offer: '', kind: 'ack', at: 1 } }, at(12)).auto.map((i) => i.r.kind)).toEqual(['ack'])
    const noted = applyAuto(acme, { ...r, kind: 'convoc' })
    expect(staleAuto(noted, [r], undefined, at(12))?.mails).toEqual([])
    expect(staleAuto(noted, [], undefined, at(12))?.mails).toEqual([])
    expect(staleAuto(noted, [{ ...r, kind: 'convoc' }], undefined, at(12))).toBeUndefined()
  })
  it('suite donnée : refus, convocation, note, relance repérée', () => {
    const fu = applyAuto(acme, mail({ id: 'f', kind: 'followup', out: true, at: iso(8) }))
    expect(fu.followUps).toEqual([at(8)])
    const refused = decide(fu, mail({ excerpt: 'Nous ne donnerons pas suite.', url: 'https://mail.google.com/x' }), 'accept')
    expect(refused).toMatchObject({ status: 'rejected', statusAt: { applied: at(4), rejected: at(10) }, noFollowUp: true })
    expect(refused.updates?.[0]).toMatchObject({ kind: 'reply', afterFollowUp: at(8), text: 'Nous ne donnerons pas suite.', mailUrl: 'https://mail.google.com/x' })
    expect(decide(acme, mail({ kind: 'convoc' }), 'accept')).toMatchObject({ status: 'interview' })
    const noted = decide(acme, mail({ kind: 'other' }), 'note')
    expect(noted.status).toBe('applied')
    expect(noted.mails?.[0].decision).toBe('noted')
    expect(decide(acme, mail({}), 'ignore').updates).toBeUndefined()
  })
  it("candidature créée depuis l'email", () => {
    expect(offerFromMail(mail({ subject: 'Candidatures via Indeed : Formateur Logiciel H/F', fromName: 'Indeed' }))).toMatchObject({ title: 'Formateur Logiciel H/F', status: 'applied' })
    expect(offerFromMail(mail({ subject: 'Votre candidature au poste de Responsable Exploitation chez Acme' }))).toMatchObject({ title: 'Responsable Exploitation', company: 'Acme' })
  })
})

describe('« Sans réponse »', () => {
  it('30 jours après la dernière relance, sans relance prévue', () => {
    setSilentDays(30)
    const o = offer({ followUps: [at(5), at(12)] })
    expect(silentSince(o, at(12) + 20 * 86400000)).toBeUndefined()
    expect(silentSince(o, at(12) + 31 * 86400000)).toBe(at(12))
    expect(silentSince({ ...o, status: 'rejected' }, at(12) + 31 * 86400000)).toBeUndefined()
  })
})
