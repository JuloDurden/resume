// Veille de Resume : lecture des réponses des employeurs dans Gmail (accusés de réception, refus,
// convocations, autres réponses) et des relances envoyées. Même accès que les alertes : IMAP en lecture
// seule avec un mot de passe d'application. Aucun email n'est modifié.
// L'application rattache chaque réponse à sa candidature et propose le changement de statut.

/** Change à chaque évolution du classement : les réponses déjà lues sont alors reclassées. */
export const REPLIES_VERSION = 1

/** Dossier Gmail par défaut (filtre « candidature » dans l'objet). */
export const DEFAULT_LABEL = 'Emploi/Candidatures Emploi'

const KEEP_DAYS = 120
const MAX_ITEMS = 600

const fold = (s) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .toLowerCase()

const clean = (s) =>
  (s ?? '')
    .replace(/[ ͏​-‍﻿]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Garde le message lui-même : coupe la citation du message précédent et la signature automatique. */
export function ownPart(text) {
  const lines = (text ?? '').split(/\r?\n/)
  const out = []
  for (const l of lines) {
    const t = l.trim()
    if (/^>/.test(t)) break
    if (/^(le|on)\s.{4,120}(a\s+[ée]crit|wrote)\s*:?\s*$/i.test(t)) break
    if (/^-{2,}\s*(original message|message d'origine|message original)/i.test(t)) break
    if (/^(de|from)\s*:\s*\S+/i.test(t) && out.length > 2) break
    out.push(l)
  }
  return out.join('\n')
}

const REMINDER = /finalis(ez|er) (votre|ta) candidature|complet(ez|er) (votre|ta) candidature|candidature (incomplete|non finalisee|en cours de saisie)|terminez (votre|ta) candidature|reprenez (votre|ta) candidature/
const REFUS = [
  /ne (pas |pouvons pas |pourrons pas |sommes pas en mesure de )?(donner|reserver) (une )?suite (favorable )?a (votre|ta|cette) candidature/,
  /ne pas donner (une )?suite/,
  /(n'a|n'ont) pas (ete )?retenue?s?/,
  /(n'est|ne sera|n'etait) pas retenue?/,
  /pas ete (selectionnee?|retenue?)/,
  /nous avons (pris la decision|decide) de (ne pas|poursuivre avec d'autres|privilegier)/,
  /(d'autres|un autre|une autre) (candidat|candidate|profil|candidature)s?\s(dont|plus|qui|correspond|mieux)/,
  /profils? (plus|mieux) (en adequation|proches?|adaptes?)/,
  /ne correspond(ait)? pas (a nos|aux|exactement)/,
  /regret(tons|te|tons de)? (de )?(vous informer|vous annoncer|ne pas)/,
  /ne pouvons (malheureusement )?pas (y )?(repondre|donner) (favorablement|une suite)/,
  /(suite|reponse) (negative|defavorable)/,
  /pas en mesure de (donner suite|retenir|poursuivre)/,
  /n'avons pas retenu/,
]
const CONVOC = /\b(entretien|rendez-vous|rdv|echange telephonique|echanger (avec vous )?par telephone|appel telephonique|vous rencontrer|rencontrons-nous|convocation|convie|disponibilites|creneaux?|visioconference|teams\.microsoft|meet\.google|zoom\.us|calendly|test technique|cas pratique|jury)\b/g
const CONDITIONAL = /\b(si|s'il|s'ils|lorsque|des que|au cas ou|dans le cas ou|le cas echeant|eventuel(le)?|eventuellement|pourrait|pourrions|prochaine etape sera|sans (retour|reponse|nouvelles)|considere[rz]?|faute de)\b/

/** Vrai si la phrase qui contient la position est au conditionnel (« si votre profil est retenu… »). */
function conditionalAt(f, index) {
  const before = f.slice(Math.max(0, index - 160), index)
  const start = Math.max(before.lastIndexOf('. '), before.lastIndexOf('\n')) + 1
  const rest = f.slice(index, index + 160)
  const stop = rest.search(/[.!?](\s|$)|\n/)
  return CONDITIONAL.test(before.slice(start) + ' ' + (stop < 0 ? rest : rest.slice(0, stop)))
}
const ACK = [
  /bien (ete )?recue?/,
  /accuse (de )?reception/,
  /confirm\w* (de )?(la )?reception/,
  /nous avons (bien )?recu/,
  /(merci|remercions?) (pour|de) (votre|ta) candidature/,
  /(votre|ta) candidature (a (bien )?ete|est) (bien )?(enregistree|transmise|recue|arrivee|prise en compte|envoyee)/,
  /est arrivee chez/,
  /candidatures? via indeed/,
  /(reviendra|reviendrons|reviendront) vers (vous|toi)/,
  /etude de (votre|ta) (dossier|candidature|profil)/,
  /bienvenue (a bord )?(au|dans le|du) processus/,
]
const FOLLOWUP = /relance|revenir vers vous|suivi de (ma )?candidature|sans nouvelles|toujours (vivement |tres )?interesse|ou en est|point sur (ma|la) candidature|reste (a votre )?disposition.{0,60}(candidature|poste)/
const RELEVANT = /candidat|postul|recrut|entretien|poste|offre d'emploi|processus|dossier|profil/

/** Phrase autour d'une position, pour l'extrait montré dans l'application. */
function sentenceAt(text, index, max = 220) {
  const head = text.slice(0, index)
  const after = (sep) => {
    const i = head.lastIndexOf(sep)
    return i < 0 ? 0 : i + sep.length
  }
  const start = Math.max(after('. '), after('! '), after('? '), after('\n'))
  let end = text.slice(index).search(/[.!?](\s|$)|\n/)
  end = end < 0 ? text.length : index + end + 1
  let s = clean(text.slice(start, end)).replace(/^(bonjour|bonsoir|madame|monsieur|hello)[^,]{0,40},\s*/i, '')
  if (s.length > max) s = `${s.slice(0, max - 1).trimEnd()}…`
  return s
}

/** Premières phrases utiles (sans la formule de politesse d'ouverture). */
function opening(text, max = 220) {
  const body = clean(text.replace(/^\s*(bonjour|bonsoir|madame|monsieur|cher|chere|hello)[^\n,]*[,\n]/i, ''))
  return body.length > max ? `${body.slice(0, max - 1).trimEnd()}…` : body
}

/**
 * Classe un email lié à une candidature.
 * kind : ack (accusé de réception), refus, convoc (convocation), other (autre réponse), followup (relance
 * envoyée), ou undefined (rappel « finalisez votre candidature », email sans rapport).
 * sure : le classement ne laisse pas de doute (sinon la réponse est à confirmer dans tous les cas).
 */
export function classifyMail({ subject, text, out, reply }) {
  // texte coupé à 72 colonnes : les lignes d'un même paragraphe sont recollées
  const own = ownPart(text ?? '').replace(/([^\n])\n(?!\n)/g, '$1 ')
  // dans une réponse, l'objet est celui du premier message (« Bienvenue au processus… ») : seul le texte compte
  const isReply = reply || /^(re|tr|fwd?)\s*:/i.test(subject ?? '')
  const raw = isReply ? own : `${subject ?? ''}\n${own}`
  const f = fold(raw)
  const fOwn = fold(own)
  if (REMINDER.test(f)) return { kind: undefined }
  if (out) {
    if (isReply && FOLLOWUP.test(f)) return { kind: 'followup', sure: true, excerpt: opening(own) }
    return { kind: undefined }
  }
  for (const re of REFUS) {
    const m = re.exec(f)
    // « sans réponse de notre part sous 3 semaines, votre candidature n'aura pas été retenue » : un accusé de réception
    if (m && !conditionalAt(f, m.index)) return { kind: 'refus', sure: true, excerpt: sentenceAt(raw, m.index) }
  }
  // convocation : un mot du rendez-vous qui n'est pas au conditionnel (« si votre profil est retenu, un entretien… »)
  CONVOC.lastIndex = 0
  let m
  while ((m = CONVOC.exec(fOwn))) {
    if (conditionalAt(fOwn, m.index)) continue
    return { kind: 'convoc', sure: false, excerpt: sentenceAt(own, m.index) }
  }
  for (const re of ACK) {
    const a = re.exec(f)
    if (a) return { kind: 'ack', sure: true, excerpt: sentenceAt(raw, a.index) }
  }
  if (isReply || RELEVANT.test(f)) return { kind: 'other', sure: false, excerpt: opening(own) }
  return { kind: undefined }
}

/** Nom d'un dossier Gmail dans une recherche (« Emploi/Candidatures Emploi » → label:emploi-candidatures-emploi). */
export const labelQuery = (name) => `label:${fold(name.trim()).replace(/[\s/]+/g, '-')}`

const GENERIC = /(gmail|googlemail|hotmail|outlook|live|yahoo|orange|free|sfr|laposte|wanadoo|icloud|proton)\./

/** Recherche Gmail : dossier des candidatures, plus les échanges avec les contacts et entreprises des candidatures en cours. */
export function repliesQuery({ label, days, offers }) {
  const since = Date.now() - 150 * 86400000
  const live = (offers ?? []).filter((o) => o && o.status !== 'todo' && (o.statusAt?.applied ?? o.createdAt ?? 0) > since)
  const emails = [...new Set(live.flatMap((o) => (o.contacts ?? []).map((c) => (c.email ?? '').trim().toLowerCase())).filter((e) => /^[^@\s]+@[^@\s]+\.\w+$/.test(e)))].slice(0, 40)
  const domains = [...new Set(emails.map((e) => e.split('@')[1]).filter((d) => !GENERIC.test(d)))].slice(0, 30)
  const companies = [...new Set(live.map((o) => clean(o.company).replace(/["()]/g, '')).filter((c) => c.length >= 3))].slice(0, 40)
  const parts = [labelQuery(label || DEFAULT_LABEL), 'subject:candidature']
  if (emails.length) parts.push(`from:(${emails.join(' OR ')})`, `to:(${emails.join(' OR ')})`)
  if (domains.length) parts.push(`from:(${domains.map((d) => `@${d}`).join(' OR ')})`)
  if (companies.length) parts.push(`subject:(${companies.map((c) => `"${c}"`).join(' OR ')})`)
  return `newer_than:${days}d {${parts.join(' ')}} -label:spam`
}

const threadUrl = (user, thread) => (thread ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(user)}#all/${BigInt(thread).toString(16)}` : undefined)

/**
 * Lit les réponses récentes et renvoie la liste à écrire dans data/feed.json (replies), anciennes comprises.
 * prev : réponses du passage précédent (gardées KEEP_DAYS jours), offers : candidatures (data/offers).
 */
export async function readReplies({ user, password, label, offers, prev, version, notes }) {
  const { ImapFlow } = await import('imapflow')
  const { simpleParser } = await import('mailparser')
  const { htmlToText } = await import('./mail.mjs')
  const reclassify = version !== REPLIES_VERSION
  const known = new Map((prev ?? []).map((r) => [r.id, r]))
  const days = !prev?.length || reclassify ? 60 : 7
  const me = user.toLowerCase()
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass: password }, logger: false })
  await client.connect()
  let read = 0
  let kept = 0
  try {
    const boxes = await client.list()
    const all = boxes.find((b) => b.specialUse === '\\All')?.path ?? 'INBOX'
    const lock = await client.getMailboxLock(all, { readOnly: true })
    try {
      const uids = (await client.search({ gmraw: repliesQuery({ label, days, offers }) }, { uid: true })) || []
      // fils déjà connus : une réponse dans le fil d'une candidature compte même si son objet ne dit rien
      const threads = new Set((prev ?? []).map((r) => r.thread).filter(Boolean))
      for await (const msg of client.fetch(uids.slice(-400), { source: true, envelope: true, internalDate: true, threadId: true }, { uid: true })) {
        const id = `m${msg.emailId ?? msg.uid}`
        if (known.has(id) && !reclassify) continue
        read++
        const mail = await simpleParser(msg.source)
        const from = mail.from?.value?.[0] ?? {}
        const addr = (from.address ?? '').toLowerCase()
        const out = addr === me
        const text = mail.text || (typeof mail.html === 'string' ? htmlToText(mail.html) : '')
        const thread = msg.threadId ? String(msg.threadId) : undefined
        const reply = !!mail.inReplyTo || (thread ? threads.has(thread) : false)
        const c = classifyMail({ subject: mail.subject, text, out, reply })
        if (!c.kind) {
          known.delete(id)
          continue
        }
        if (thread) threads.add(thread)
        kept++
        known.set(id, {
          id,
          thread,
          at: (mail.date ?? msg.internalDate ?? new Date()).toISOString(),
          kind: c.kind,
          sure: c.sure || undefined,
          out: out || undefined,
          from: addr,
          fromName: clean(from.name) || undefined,
          to: (mail.to?.value ?? []).map((t) => (t.address ?? '').toLowerCase()).filter(Boolean).slice(0, 4),
          subject: clean(mail.subject).slice(0, 200),
          excerpt: c.excerpt,
          url: threadUrl(user, thread),
        })
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
  const limit = Date.now() - KEEP_DAYS * 86400000
  const list = [...known.values()].filter((r) => new Date(r.at).getTime() >= limit).sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_ITEMS)
  notes.push(`Gmail : ${kept} réponse(s) ou relance(s) lue(s) sur ${read} email(s) de candidature des ${days} derniers jours.`)
  return list
}
