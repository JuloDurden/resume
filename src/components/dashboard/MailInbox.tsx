// Réponses des employeurs lues dans Gmail : pastille du nombre de réponses à confirmer, panneau des réponses,
// et carte de réponse (aussi affichée dans la candidature ouverte).
import { useEffect, useMemo, useState } from 'react'
import { Check, ExternalLink, Mail, Plus } from 'lucide-react'
import type { MailReply, Offer } from '../../types'
import { useDocs } from '../../store/documents'
import { useFeed } from '../../store/feed'
import { MAIL_LABEL, applyAuto, decide, inboxOf, offerFromMail, type InboxItem, type MailAction } from '../../lib/replies'
import { newOffer } from '../../lib/offers'
import { Modal, toast } from '../ui'

const fmt = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const fmtFull = (t: number) => `${fmt(t)}, ${new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`

/** Réponses lues par la veille, réparties selon la suite à leur donner. */
export function useMailInbox() {
  const replies = useFeed((s) => s.feed?.replies)
  const offersMap = useDocs((s) => s.offers)
  const marks = useDocs((s) => s.watch.mailMarks)
  return useMemo(() => inboxOf(replies, Object.values(offersMap), marks), [replies, offersMap, marks])
}

/** Note tout seuls les accusés de réception et les relances envoyées (une seule fois par email). */
export function useMailAuto() {
  const { auto } = useMailInbox()
  const saveOffer = useDocs((s) => s.saveOffer)
  useEffect(() => {
    if (!auto.length) return
    const byOffer = new Map<string, InboxItem[]>()
    for (const it of auto) if (it.offer) byOffer.set(it.offer.id, [...(byOffer.get(it.offer.id) ?? []), it])
    for (const [id, items] of byOffer) {
      const cur = useDocs.getState().offers[id]
      if (!cur) continue
      saveOffer(items.reduce((o, it) => (o.mails?.some((m) => m.id === it.r.id) ? o : applyAuto(o, it.r)), cur))
    }
  }, [auto, saveOffer])
}

const openOffer = (id: string) => window.dispatchEvent(new CustomEvent('resume-open-offer', { detail: id }))

const TONE: Record<string, string> = { refus: 'refus', convoc: 'convoc', other: 'other', ack: 'ack', followup: 'ack' }

/** Boutons d'une réponse rattachée : le libellé du bouton principal dépend du classement. */
function actionsFor(kind: MailReply['kind']): { action: MailAction; label: string; primary?: boolean }[] {
  if (kind === 'refus')
    return [
      { action: 'accept', label: 'Passer en Refusée', primary: true },
      { action: 'note', label: 'Garder le statut et noter' },
    ]
  if (kind === 'convoc')
    return [
      { action: 'accept', label: 'Passer en Entretien', primary: true },
      { action: 'note', label: 'Noter seulement' },
    ]
  return [
    { action: 'note', label: 'Noter dans les échanges', primary: true },
    { action: 'reject', label: 'Passer en Refusée' },
  ]
}

const DONE_TEXT: Record<MailAction, string> = {
  accept: 'Statut mis à jour, email ajouté aux échanges',
  reject: 'Passée en Refusée, email ajouté aux échanges',
  note: 'Noté dans les échanges, statut inchangé',
  ignore: 'Ignorée',
}

/** Une réponse : classement, extrait, candidature rattachée et suite à donner. */
// décisions de la session, gardées si la candidature change de groupe (refusée) et que sa carte est recréée
const decided = new Map<string, { text: string; undo: () => void }>()

export function ReplyCard({ item, compact, offers }: { item: InboxItem; compact?: boolean; offers?: Offer[] }) {
  const saveOffer = useDocs((s) => s.saveOffer)
  const markMail = useDocs((s) => s.markMail)
  const [done, setDoneState] = useState<{ text: string; undo: () => void } | null>(() => decided.get(item.r.id) ?? null)
  const setDone = (d: { text: string; undo: () => void } | null) => {
    if (d) decided.set(item.r.id, d)
    else decided.delete(item.r.id)
    setDoneState(d)
  }
  const [linking, setLinking] = useState(false)
  const { r, offer } = item
  const act = (action: MailAction) => {
    if (!offer) return
    const before = useDocs.getState().offers[offer.id] ?? offer
    saveOffer(decide(before, r, action))
    if (action === 'accept' && r.kind === 'convoc') toast.info("Précise la date de l'entretien dans la candidature")
    setDone({ text: DONE_TEXT[action], undo: () => saveOffer(before) })
  }
  const ignoreLoose = () => {
    markMail(r.id, { s: 'ignored' })
    setDone({ text: 'Ignorée', undo: () => markMail(r.id) })
  }
  const create = () => {
    const o = newOffer(offerFromMail(r))
    saveOffer(o)
    markMail(r.id, { s: 'linked', offer: o.id })
    toast.ok('Candidature créée : complète-la si besoin')
    openOffer(o.id)
  }
  if (done)
    return (
      <div className={`reply-card done${compact ? ' compact' : ''}`}>
        <Check size={15} /> <span>{done.text}</span>
        <button
          className="link"
          onClick={() => {
            done.undo()
            setDone(null)
          }}
        >
          Annuler
        </button>
      </div>
    )
  return (
    <div className={`reply-card t-${TONE[r.kind]}${compact ? ' compact' : ''}`}>
      <div className="rc-head">
        <span className={`rc-tag t-${TONE[r.kind]}`}>{MAIL_LABEL[r.kind]}</span>
        {!compact && <strong className="rc-subject">{r.subject}</strong>}
        <span className="rc-date">{fmtFull(item.at)}</span>
      </div>
      {!compact && <div className="rc-from">{r.fromName ? `${r.fromName} · ${r.from}` : r.from}</div>}
      {r.excerpt && <p className="rc-excerpt">{r.excerpt}</p>}
      {!compact && (
        <div className="rc-offer">
          {offer ? (
            <>
              Candidature :{' '}
              <button className="link" onClick={() => openOffer(offer.id)}>
                {[offer.title, offer.company].filter(Boolean).join(' · ') || 'Offre sans titre'}
              </button>
            </>
          ) : (
            <span className="muted">Aucune candidature trouvée pour cet email.</span>
          )}{' '}
          {offers && (
            <button className="link muted" onClick={() => setLinking((v) => !v)}>
              {offer ? 'changer' : 'rattacher'}
            </button>
          )}
          {linking && offers && (
            <select
              className="input select rc-link"
              aria-label="Candidature de cet email"
              value={offer?.id ?? ''}
              onChange={(e) => {
                markMail(r.id, e.target.value ? { s: 'linked', offer: e.target.value } : undefined)
                setLinking(false)
              }}
            >
              <option value="">Choisir une candidature…</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {[o.title, o.company].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <div className="rc-actions">
        {offer ? (
          actionsFor(r.kind).map((a) => (
            <button key={a.action} className={`btn sm${a.primary ? ' primary' : ''}`} onClick={() => act(a.action)}>
              {a.label}
            </button>
          ))
        ) : (
          <button className="btn sm primary" onClick={create}>
            <Plus size={13} /> Créer la candidature
          </button>
        )}
        {r.url && (
          <a className="btn sm" href={r.url} target="_blank" rel="noreferrer">
            <ExternalLink size={13} /> Gmail
          </a>
        )}
        <button className="btn sm ghost" onClick={() => (offer ? act('ignore') : ignoreLoose())}>
          Ignorer
        </button>
      </div>
    </div>
  )
}

/** Panneau des réponses : à confirmer, sans candidature, notées automatiquement. */
function InboxModal({ onClose }: { onClose: () => void }) {
  const box = useMailInbox()
  const offersMap = useDocs((s) => s.offers)
  const offers = useMemo(() => Object.values(offersMap).sort((a, b) => (b.statusAt?.applied ?? b.createdAt) - (a.statusAt?.applied ?? a.createdAt)), [offersMap])
  // gardées le temps du panneau, pour l'annulation
  const [shown] = useState(() => ({ pending: box.pending, unmatched: box.unmatched }))
  const recentAuto = useMemo(() => offers.reduce((n, o) => n + (o.mails ?? []).filter((m) => m.decision === 'auto' && Date.now() - m.at < 21 * 86400000).length, 0), [offers])
  const fresh = (list: InboxItem[]) => list.map((it) => box.pending.find((x) => x.r.id === it.r.id) ?? box.unmatched.find((x) => x.r.id === it.r.id) ?? it)
  return (
    <Modal open onClose={onClose} wide title="Réponses lues dans Gmail" footer={<button className="btn" onClick={onClose}>Fermer</button>}>
      <div className="inbox">
        <p className="muted small">Rien ne change sans ton accord. Les accusés de réception, les alertes d'offres et les rappels « finalisez votre candidature » ne sont pas listés ici.</p>
        <section>
          <h4>À confirmer ({box.pending.length})</h4>
          {shown.pending.length ? fresh(shown.pending).map((it) => <ReplyCard key={it.r.id} item={it} offers={offers} />) : <p className="muted small">Aucune réponse en attente.</p>}
        </section>
        {shown.unmatched.length > 0 && (
          <section>
            <h4>Sans candidature correspondante ({box.unmatched.length})</h4>
            {fresh(shown.unmatched).map((it) => (
              <ReplyCard key={it.r.id} item={it} offers={offers} />
            ))}
          </section>
        )}
        {recentAuto > 0 && <p className="muted small">{recentAuto} accusé{recentAuto > 1 ? 's' : ''} de réception et relance{recentAuto > 1 ? 's' : ''} notés ces 3 dernières semaines, visibles dans l'onglet Échanges de chaque candidature.</p>}
      </div>
    </Modal>
  )
}

/** Enveloppe de la barre du haut, avec le nombre de réponses à confirmer (comme l'icône de Mail dans le Dock). */
export function MailBell() {
  useMailAuto()
  const hasFeed = useFeed((s) => !!s.feed)
  const hasReplies = useFeed((s) => !!s.feed?.replies)
  const box = useMailInbox()
  const [open, setOpen] = useState(false)
  // pas de veille (pas de sauvegarde GitHub) : rien à lire
  if (!hasFeed) return null
  const n = box.pending.length + box.unmatched.length
  const label = !hasReplies ? 'Réponses Gmail : en attente du prochain passage de la veille' : n ? `${n} réponse${n > 1 ? 's' : ''} Gmail à confirmer` : 'Aucune réponse Gmail à confirmer'
  return (
    <>
      <button className={`icon-btn mail-bell${n ? ' on' : ''}`} onClick={() => setOpen(true)} title={label} aria-label={label}>
        <Mail size={19} />
        {n > 0 && <span className="mail-count">{n > 99 ? '99+' : n}</span>}
      </button>
      {open && hasReplies && <InboxModal onClose={() => setOpen(false)} />}
      {open && !hasReplies && (
        <Modal open onClose={() => setOpen(false)} title="Réponses lues dans Gmail" footer={<button className="btn" onClick={() => setOpen(false)}>Fermer</button>}>
          <p>La veille n'a pas encore lu tes réponses. Elle le fera à son prochain passage (toutes les heures), ou tout de suite si tu la lances depuis l'onglet Annonces.</p>
          <p className="muted small">Il faut que les secrets GMAIL_USER et GMAIL_APP_PASSWORD soient définis dans le dépôt de sauvegarde (ce sont les mêmes que pour les alertes email).</p>
        </Modal>
      )}
    </>
  )
}
