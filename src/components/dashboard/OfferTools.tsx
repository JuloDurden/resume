import { useMemo, useState } from 'react'
import { BellOff, CalendarPlus, Check, ClipboardCopy, ExternalLink, Globe, Mail, MessagesSquare, Plus, Printer, RotateCcw, Trash2 } from 'lucide-react'
import type { FollowUpInfo, InterviewOutcome, InterviewFeeling, InterviewMode, InterviewPrep, InterviewSlot, Offer, ResumeDoc } from '../../types'
import { FEELING, MODE_LABEL, OUTCOME_LABEL, withOutcome, datedInterviews, downloadIcs, fmtIn, fmtLong, printPrep, slotWhere } from '../../lib/interviews'
import { uid } from '../../lib/ids'
import { useDocs } from '../../store/documents'
import { FOLLOW_UP_CHOICES, appliedAt, placeInDay, followUpDays, followUpEmail, nextFollowUp, startOfDay, followUpsSinceUpdate, lastUpdate } from '../../lib/followup'
import { resumeToText } from '../../lib/export'
import { CLAUDE_URL, copyText, extractJson, interviewPrepPrompt } from '../../lib/prompts'
import { Field, Modal, Segmented, Select, TextArea, TextInput, Toggle, toast } from '../ui'
import { appRepoFromLocation, deletePublicFile, loadConfig, publishPublicFile } from '../../lib/github'
import { buildShared, newSlug, shareFile, shareUrl, withShareLink } from '../../lib/share'

const frDate = (t?: number) => (t ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '')

/** CV rattaché à l'offre, sinon CV de référence du profil, sinon le plus récent. */
export function useOfferCv(offer: Offer): ResumeDoc | undefined {
  const docs = useDocs((s) => s.docs)
  const profileCv = useDocs((s) => s.watch.profile?.cvId)
  return useMemo(() => {
    const cvs = Object.values(docs).filter((d): d is ResumeDoc => d.kind === 'resume')
    return cvs.find((d) => d.offerId === offer.id) ?? cvs.find((d) => d.id === profileCv) ?? cvs.sort((a, b) => b.updatedAt - a.updatedAt)[0]
  }, [docs, profileCv, offer.id])
}

/* ---------- Relance ---------- */

export function FollowUpModal({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const saveOffer = useDocs((s) => s.saveOffer)
  const cv = useOfferCv(offer)
  const draft = followUpEmail(offer, cv)
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const withEmail = (offer.contacts ?? []).filter((c) => c.email)
  const [to, setTo] = useState(withEmail[0]?.email ?? '')
  const copy = async (t: string, msg: string) => toast[(await copyText(t)) ? 'ok' : 'error'](msg)
  const n = followUpsSinceUpdate(offer).length + 1
  const [channel, setChannel] = useState<FollowUpInfo['channel']>('mail')
  const [day, setDay] = useState(toInput(Date.now()))
  const named = (offer.contacts ?? []).filter((c) => c.name)
  const [who, setWho] = useState(named[0]?.name ?? '')
  const [note, setNote] = useState('')

  /** Relance par téléphone, LinkedIn ou sur place : date choisie, interlocuteur et résultat. */
  const logged = () => {
    const picked = fromInput(day)
    const at = picked === undefined ? Date.now() : placeInDay(offer, startOfDay(picked))
    // une relance déjà notée ce jour-là reçoit ces détails au lieu d'en compter une seconde
    const same = (offer.followUps ?? []).find((t) => startOfDay(t) === startOfDay(at))
    const when = same ?? at
    const info: FollowUpInfo = { at: when, channel, with: who.trim() || undefined, note: note.trim() || undefined }
    saveOffer({
      ...offer,
      followUps: same ? offer.followUps : [...(offer.followUps ?? []), at].sort((a, b) => a - b),
      followUpInfo: [...(offer.followUpInfo ?? []).filter((x) => x.at !== when), info],
    })
    toast.ok(same ? 'Relance complétée' : 'Relance enregistrée')
    onClose()
  }

  const done = () => {
    let contacts = offer.contacts ?? []
    // adresse saisie à la main : enregistrée comme contact de l'offre
    if (to && !contacts.some((c) => c.email === to)) contacts = [...contacts, { email: to, role: 'Recrutement' }]
    saveOffer({ ...offer, contacts, followUps: [...(offer.followUps ?? []), Date.now()] })
    toast.ok(n === 1 ? `Relance enregistrée : seconde relance proposée dans ${followUpDays(offer)} jours` : 'Seconde relance enregistrée')
    onClose()
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`${n === 1 ? 'Relancer' : 'Relancer une seconde fois'} : ${offer.title ?? 'candidature'}`}
      footer={
        <>
          <button
            className="btn ghost"
            onClick={() => {
              saveOffer({ ...offer, noFollowUp: true })
              toast.info('Plus de relance proposée pour cette offre')
              onClose()
            }}
          >
            <BellOff size={15} /> Ne plus relancer
          </button>
          {channel === 'mail' ? (
            <button className="btn primary" onClick={done}>
              <Check size={15} /> J'ai envoyé la relance
            </button>
          ) : (
            <button className="btn primary" onClick={logged}>
              <Check size={15} /> Enregistrer la relance
            </button>
          )}
        </>
      }
    >
      <div className="form-stack">
        <Field label="Moyen">
          <Segmented
            value={channel}
            onChange={setChannel}
            options={[
              { value: 'mail', label: 'Email' },
              { value: 'phone', label: 'Téléphone' },
              { value: 'linkedin', label: 'LinkedIn' },
              { value: 'other', label: 'Autre' },
            ]}
          />
        </Field>
        {channel !== 'mail' ? (
          <>
            <Field label="Jour">
              <input className="input" type="date" value={day} max={toInput(Date.now())} onChange={(e) => setDay(e.target.value)} />
            </Field>
            <Field label="Personne contactée">
              <TextInput value={who} onChange={setWho} placeholder="Nom, fonction" />
            </Field>
            <Field label="Résultat">
              <div className="pick-row">
                {(channel === 'phone' ? ['Répondeur, message laissé', 'Pas joignable', 'Échange avec la personne'] : channel === 'linkedin' ? ['Message envoyé', 'Invitation envoyée', 'Échange avec la personne'] : ['Échange avec la personne', 'Message laissé']).map((p) => (
                  <button key={p} type="button" className={`pick-chip${note === p ? ' on' : ''}`} onClick={() => setNote(p)}>
                    {p}
                  </button>
                ))}
              </div>
              <TextArea value={note} onChange={setNote} minRows={2} placeholder="Ce qui s'est dit, ce qui est convenu" />
            </Field>
            <p className="muted small">Si une réponse arrive ensuite, note-la avec « Noter une réponse » : la relance passera de « sans réponse » à « réponse reçue ».</p>
          </>
        ) : (
          <>
        <p className="muted small">
          Candidature envoyée le {frDate(appliedAt(offer))}
          {offer.followUps?.length ? `, relancée le ${offer.followUps.map((t) => frDate(t)).join(' et le ')}` : ''}. Le message est modifiable avant envoi.
        </p>
        <Field label="Adresse de relance" hint={withEmail.length ? undefined : "Aucun email de contact dans l'offre : saisissez l'adresse du recruteur (elle sera enregistrée dans l'offre)."}>
          <div className="row-gap">
            {withEmail.length > 1 ? (
              <select className="input select" value={to} onChange={(e) => setTo(e.target.value)}>
                {withEmail.map((c) => (
                  <option key={c.email} value={c.email}>
                    {c.name ? `${c.name} <${c.email}>` : c.email}
                  </option>
                ))}
              </select>
            ) : (
              <TextInput value={to} onChange={setTo} placeholder="recrutement@entreprise.fr" />
            )}
            <button className="btn sm" disabled={!to} onClick={() => copy(to, 'Adresse copiée')}>
              <ClipboardCopy size={14} /> Copier
            </button>
          </div>
        </Field>
        <Field label="Objet">
          <div className="row-gap">
            <TextInput value={subject} onChange={setSubject} />
            <button className="btn sm" onClick={() => copy(subject, 'Objet copié')}>
              <ClipboardCopy size={14} /> Copier
            </button>
          </div>
        </Field>
        <Field label="Message">
          <TextArea value={body} onChange={setBody} minRows={12} />
        </Field>
        <div className="row-gap">
          <button className="btn" onClick={() => copy(body, 'Message copié')}>
            <ClipboardCopy size={15} /> Copier le message
          </button>
          <a className="btn" href={`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
            <Mail size={15} /> Ouvrir dans ma messagerie
          </a>
        </div>
          </>
        )}
      </div>
    </Modal>
  )
}

export function followUpLabel(o: Offer): { due: boolean; label: string; title: string } | undefined {
  const n = nextFollowUp(o)
  if (!n) return undefined
  const days = Math.round((n - startOfDay(Date.now())) / 86400000)
  const when = `Relance prévue le ${new Date(n).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`
  if (days <= 0) return { due: true, label: followUpsSinceUpdate(o).length ? 'Seconde relance' : 'À relancer', title: `${when}. Cliquez pour préparer l'email.` }
  return { due: false, label: days === 1 ? 'Relance demain' : days <= 21 ? `Relance dans ${days} j` : `Relance le ${new Date(n).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`, title: `${when}. Cliquez pour changer le délai ou la date.` }
}

const toInput = (t?: number) => {
  if (!t) return ''
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const fromInput = (v: string) => {
  const [y, m, d] = v.split('-').map(Number)
  return y ? new Date(y, m - 1, d, 12).getTime() : undefined
}

/** Jour de la candidature et délai de relance (7, 10, 15, 21 jours ou date précise). */
export function FollowUpPlanner({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const saveOffer = useDocs((s) => s.saveOffer)
  const profile = useDocs((s) => s.watch.profile)
  const setProfile = useDocs((s) => s.setProfile)
  const [applied, setApplied] = useState(toInput(appliedAt(offer) ?? Date.now()))
  const [mode, setMode] = useState<number | 'date'>(offer.followUpDate && !followUpsSinceUpdate(offer).length ? 'date' : followUpDays(offer))
  const [date, setDate] = useState(toInput(offer.followUpDate))
  const [asDefault, setAsDefault] = useState(false)
  const draft: Offer = { ...offer, statusAt: { ...offer.statusAt, applied: fromInput(applied) }, followUpDays: mode === 'date' ? offer.followUpDays : mode, followUpDate: mode === 'date' ? fromInput(date) : undefined }
  const next = nextFollowUp(draft)
  const save = () => {
    saveOffer({ ...draft, noFollowUp: false })
    if (asDefault && mode !== 'date' && profile) setProfile({ ...profile, followUpDays: mode })
    toast.ok(next ? `Relance prévue le ${new Date(next).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : 'Relance enregistrée')
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Relance : ${offer.title ?? 'candidature'}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={save} disabled={mode === 'date' && !date}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="form-stack">
        <Field label="Jour de la candidature" hint="Le délai se compte en jours à partir de ce jour, quelle que soit l'heure d'envoi.">
          <input className="input" type="date" value={applied} max={toInput(Date.now())} onChange={(e) => setApplied(e.target.value)} />
        </Field>
        <Field label={followUpsSinceUpdate(offer).length ? 'Délai avant la seconde relance' : 'Relancer'}>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[...FOLLOW_UP_CHOICES.map((d) => ({ value: d as number | 'date', label: `${d} jours` })), ...(followUpsSinceUpdate(offer).length ? [] : [{ value: 'date' as const, label: 'Date précise', title: "Quand l'employeur indique la fin de sa période de recrutement" }])]}
          />
        </Field>
        {mode === 'date' ? (
          <Field label="Date de la relance" hint="Par exemple le lendemain de la fin de la période de recrutement annoncée.">
            <input className="input" type="date" value={date} min={applied} onChange={(e) => setDate(e.target.value)} />
          </Field>
        ) : (
          <label className="check-line small">
            <input type="checkbox" checked={asDefault} onChange={(e) => setAsDefault(e.target.checked)} /> Utiliser {mode} jours par défaut pour mes prochaines candidatures
            {profile?.followUpDays ? '' : ' (15 jours actuellement)'}
          </label>
        )}
        {next && (
          <p className="muted small">
            Relance prévue le <strong>{new Date(next).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
            {followUpsSinceUpdate(offer).length === 0 ? `, puis une seconde relance ${mode === 'date' ? followUpDays(offer) : mode} jours plus tard si besoin.` : '.'}
          </p>
        )}
      </div>
    </Modal>
  )
}

/* ---------- Réponses du recruteur ---------- */

const WAITS: { value: string; label: string; days?: number }[] = [
  { value: 'none', label: 'Aucun délai' },
  { value: '7', label: '1 semaine', days: 7 },
  { value: '14', label: '2 semaines', days: 14 },
  { value: '21', label: '3 semaines', days: 21 },
  { value: '30', label: '1 mois', days: 30 },
  { value: 'date', label: 'Date précise' },
]
const OUTCOMES = [
  { value: 'pending', label: 'Toujours en lice' },
  { value: 'interview', label: 'Entretien proposé' },
  { value: 'rejected', label: 'Refus' },
  { value: 'offer', label: 'Proposition' },
] as const
const PHRASES = ['Candidature toujours à l\'étude', 'Processus plus long que prévu', 'Candidature transmise au manager', 'Réponse après les entretiens en cours']

/** Noter une réponse à une relance, ou des nouvelles reçues sans relance. */
export function RecruiterUpdateModal({ offer, onClose, onInterview }: { offer: Offer; onClose: () => void; onInterview?: () => void }) {
  const saveOffer = useDocs((s) => s.saveOffer)
  const last = lastUpdate(offer)
  // une relance sans réponse depuis : c'est probablement sa réponse
  const relanced = (offer.followUps ?? []).some((t) => !last || t > last.at)
  const [kind, setKind] = useState<'reply' | 'news'>(relanced ? 'reply' : 'news')
  const [day, setDay] = useState(toInput(Date.now()))
  const [text, setText] = useState('')
  const [wait, setWait] = useState('none')
  const [waitDate, setWaitDate] = useState('')
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number]['value']>('pending')
  const picked = fromInput(day)
  const at = picked === undefined ? Date.now() : placeInDay(offer, startOfDay(picked))
  const w = WAITS.find((x) => x.value === wait)
  const waitUntil = wait === 'date' ? fromInput(waitDate) : w?.days ? at + w.days * 86400000 : undefined
  const fmt = (t: number) => new Date(t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const save = () => {
    // une réponse se rattache à la dernière relance envoyée avant elle (le jour même compris)
    const fu = kind === 'reply' ? [...(offer.followUps ?? [])].filter((t) => startOfDay(t) <= startOfDay(at)).sort((a, b) => b - a)[0] : undefined
    const u = { id: uid(), at: fu ? Math.max(at, fu + 60000) : at, kind, text: text.trim() || undefined, waitUntil, afterFollowUp: fu }
    const status = outcome === 'interview' ? 'interview' : outcome === 'rejected' ? 'rejected' : outcome === 'offer' ? 'offer' : offer.status === 'todo' ? 'applied' : offer.status
    // après un entretien, le délai annoncé devient la date de retour attendue
    const answerBy = waitUntil && (status === 'interview' || offer.status === 'interview') ? waitUntil : offer.answerBy
    // refus ou proposition : à la date de la réponse (pas à celle de la saisie)
    const statusAt = (status === 'rejected' || status === 'offer') && status !== offer.status ? { ...offer.statusAt, [status]: u.at } : offer.statusAt
    saveOffer({ ...offer, status, statusAt, ...(status === 'rejected' ? { noFollowUp: true } : {}), answerBy, followUpDate: undefined, updates: [...(offer.updates ?? []), u] })
    toast.ok(outcome === 'rejected' ? 'Réponse notée, candidature passée en refusée' : waitUntil ? `Réponse notée : retour annoncé le ${fmt(waitUntil)}` : 'Réponse notée')
    onClose()
    if (outcome === 'interview') onInterview?.()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Réponse de ${offer.company || 'l\'employeur'}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={save}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="form-stack">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'reply', label: 'Réponse à ma relance' },
            { value: 'news', label: 'Message reçu sans relance' },
          ]}
        />
        <div className="grid-2">
          <Field label="Reçu le">
            <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label="Résultat">
            <Segmented value={outcome} onChange={setOutcome} options={OUTCOMES.map((o) => ({ value: o.value, label: o.label }))} />
          </Field>
        </div>
        <Field label="En substance">
          <TextArea value={text} minRows={2} onChange={setText} placeholder="Ce que dit le message, en une ou deux phrases" />
          <div className="post-sugg">
            {PHRASES.map((p) => (
              <button key={p} type="button" className="sugg-chip" onClick={() => setText((t) => (t.trim() ? `${t.trim()} ${p.toLowerCase()}.` : `${p}.`))}>
                {p}
              </button>
            ))}
          </div>
        </Field>
        {outcome !== 'rejected' && (
          <Field label="Délai de réponse annoncé" hint="Compté à partir du jour du message.">
            <Segmented value={wait} onChange={setWait} options={WAITS.map((x) => ({ value: x.value, label: x.label }))} />
            {wait === 'date' && <input className="input" type="date" value={waitDate} onChange={(e) => setWaitDate(e.target.value)} style={{ maxWidth: 200, marginTop: 8 }} />}
          </Field>
        )}
        {outcome === 'pending' && (
          <p className="notice small">
            {waitUntil
              ? `Retour annoncé le ${fmt(waitUntil)}. Sans nouvelles, une relance vous sera proposée le lendemain.`
              : `Sans délai annoncé, la prochaine relance est proposée ${followUpDays(offer)} jours après ce message.`}
          </p>
        )}
      </div>
    </Modal>
  )
}

/* ---------- Entretiens : date, heure, lieu ---------- */

const timeInput = (t?: number) => (t ? `${String(new Date(t).getHours()).padStart(2, '0')}:${String(new Date(t).getMinutes()).padStart(2, '0')}` : '')
const withTime = (day: string, time: string) => {
  const d = fromInput(day)
  if (!d) return undefined
  const [h, m] = (time || '09:00').split(':').map(Number)
  const x = new Date(d)
  x.setHours(h || 0, m || 0, 0, 0)
  return x.getTime()
}
const PLACE_HINT: Record<InterviewMode, string> = { site: 'Adresse', phone: 'Numéro (si c\'est vous qui appelez)', video: 'Lien de la visio (Teams, Meet, Zoom…)' }

/** Entretiens de la candidature (un par étape) et date de retour annoncée. */
export function InterviewPlanner({ offer, onClose, addNext }: { offer: Offer; onClose: () => void; addNext?: boolean }) {
  const saveOffer = useDocs((s) => s.saveOffer)
  const blank = (): InterviewSlot => ({ id: uid(), mode: 'site', place: offer.location })
  const [slots, setSlots] = useState<InterviewSlot[]>(offer.interviews?.length ? [...offer.interviews, ...(addNext ? [blank()] : [])] : [blank()])
  // jour et heure saisis à part : la date n'est enregistrée que si le jour est rempli
  const [days, setDays] = useState<Record<string, { day: string; time: string }>>(() => Object.fromEntries((offer.interviews ?? []).map((s) => [s.id, { day: toInput(s.at), time: timeInput(s.at) }])))
  const [answer, setAnswer] = useState(toInput(offer.answerBy))
  const set = (id: string, p: Partial<InterviewSlot>) => setSlots((l) => l.map((s) => (s.id === id ? { ...s, ...p } : s)))
  const dt = (id: string) => days[id] ?? { day: '', time: '' }
  const setDt = (id: string, p: Partial<{ day: string; time: string }>) => setDays((d) => ({ ...d, [id]: { ...dt(id), ...p } }))
  const result = (): InterviewSlot[] => slots.map((s) => ({ ...s, at: withTime(dt(s.id).day, dt(s.id).time), place: s.place?.trim() || undefined, with: s.with?.trim() || undefined, notes: s.notes?.trim() || undefined }))
  const save = () => {
    const list = result().filter((s) => s.at || s.place || s.with || s.notes)
    const now = Date.now()
    saveOffer({ ...offer, interviews: list, answerBy: fromInput(answer), status: offer.status === 'rejected' || offer.status === 'offer' ? offer.status : 'interview' })
    const next = list.filter((s) => s.at && s.at > now).sort((a, b) => a.at! - b.at!)[0]
    toast.ok(next ? `Entretien le ${fmtLong(next.at!)} (${fmtIn(next.at!)})` : 'Entretien enregistré')
    onClose()
  }
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Entretien : ${[offer.title, offer.company].filter(Boolean).join(', ')}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={save}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="form-stack">
        {slots.map((s, i) => {
          const at = withTime(dt(s.id).day, dt(s.id).time)
          const mode = s.mode ?? 'site'
          return (
            <fieldset key={s.id} className="iv-slot">
              <legend>
                {slots.length > 1 ? `Entretien ${i + 1}` : 'Entretien'}
                {at && <span className="muted small"> · {fmtIn(at)}</span>}
              </legend>
              <div className="iv-grid">
                <Field label="Jour">
                  <input className="input" type="date" value={dt(s.id).day} onChange={(e) => setDt(s.id, { day: e.target.value })} />
                </Field>
                <Field label="Heure">
                  <input className="input" type="time" step={300} value={dt(s.id).time} onChange={(e) => setDt(s.id, { time: e.target.value })} />
                </Field>
                <Field label="Format">
                  <Segmented value={mode} onChange={(m) => set(s.id, { mode: m })} options={(Object.keys(MODE_LABEL) as InterviewMode[]).map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
                </Field>
              </div>
              <div className="grid-2">
                <Field label={PLACE_HINT[mode]}>
                  <TextInput value={s.place} onChange={(v) => set(s.id, { place: v })} placeholder={mode === 'site' ? '12 rue…, Montpellier' : mode === 'video' ? 'https://…' : ''} />
                </Field>
                <Field label="Avec">
                  <TextInput value={s.with} onChange={(v) => set(s.id, { with: v })} placeholder="Nom et fonction (DRH, manager…)" />
                </Field>
              </div>
              <Field label="Notes">
                <TextArea value={s.notes} minRows={2} onChange={(v) => set(s.id, { notes: v })} placeholder="Durée, test technique, documents à apporter, code d'accès…" />
              </Field>
              <div className="row-gap">
                {at && (
                  <button className="btn sm" onClick={() => downloadIcs(offer, { ...s, at, place: s.place })} title="Fichier .ics à ouvrir dans Google Agenda, Outlook ou Calendrier">
                    <CalendarPlus size={14} /> Ajouter à mon agenda
                  </button>
                )}
                {slots.length > 1 && (
                  <button className="btn sm ghost" onClick={() => setSlots((l) => l.filter((x) => x.id !== s.id))}>
                    <Trash2 size={14} /> Retirer
                  </button>
                )}
              </div>
            </fieldset>
          )
        })}
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSlots((l) => [...l, blank()])}>
          <Plus size={14} /> Ajouter l'étape suivante (autre entretien)
        </button>
        <Field label="Retour attendu le" hint="Date annoncée par le recruteur après l'entretien : passé ce jour sans nouvelles, une relance est proposée.">
          <input className="input" type="date" value={answer} onChange={(e) => setAnswer(e.target.value)} style={{ maxWidth: 200 }} />
        </Field>
      </div>
    </Modal>
  )
}

const REPORT_HINT = `Déroulé : durée, interlocuteurs, ambiance
Questions posées et mes réponses
Ce qui a bien marché
Ce que je dirais autrement
Ce que j'ai appris sur le poste (missions, équipe, salaire, télétravail)
Suite annoncée`

/** Compte rendu d'un entretien : passé ou non, impression, notes libres, retour attendu. */
export function InterviewReport({ offer, slotId, onClose, onNext }: { offer: Offer; slotId: string; onClose: () => void; onNext: () => void }) {
  const saveOffer = useDocs((s) => s.saveOffer)
  const slot = offer.interviews?.find((s) => s.id === slotId)
  const [done, setDone] = useState(slot?.done ?? true)
  const [feeling, setFeeling] = useState<InterviewFeeling | undefined>(slot?.feeling)
  const [report, setReport] = useState(slot?.report ?? '')
  const [answer, setAnswer] = useState(toInput(offer.answerBy))
  const [mode, setMode] = useState<InterviewMode | undefined>(slot?.mode)
  const [outcome, setOutcome] = useState<InterviewOutcome | undefined>(slot?.outcome)
  const [told, setTold] = useState(toInput(slot?.outcomeAt ?? slot?.at ?? Date.now()))
  if (!slot) return null
  const n = datedInterviews(offer).findIndex((s) => s.id === slotId)
  const final = outcome === 'rejected' || outcome === 'offer'
  const save = (next?: boolean) => {
    let o: Offer = { ...offer, answerBy: final ? offer.answerBy : fromInput(answer), interviews: (offer.interviews ?? []).map((s) => (s.id === slotId ? { ...s, done, mode, feeling: done ? feeling : undefined, report: report.trim() || undefined } : s)) }
    if (done) o = withOutcome(o, slotId, outcome, fromInput(told))
    saveOffer(o)
    toast.ok(!done ? 'Entretien enregistré comme non passé' : outcome === 'rejected' ? 'Compte rendu enregistré, candidature passée en refusée' : outcome === 'offer' ? 'Compte rendu enregistré : proposition reçue' : 'Compte rendu enregistré')
    onClose()
    if (next || (done && outcome === 'next')) onNext()
  }
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Compte rendu${(offer.interviews?.length ?? 0) > 1 ? ` de l'entretien ${n + 1}` : " d'entretien"} : ${[offer.title, offer.company].filter(Boolean).join(', ')}`}
      footer={
        <>
          <button className="btn" onClick={() => save(true)} disabled={!done || final}>
            <Plus size={15} /> Enregistrer et prévoir l'étape suivante
          </button>
          <button className="btn primary" onClick={() => save()}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="form-stack">
        <p className="muted small">
          {slot.at ? fmtLong(slot.at).replace(/^./, (c) => c.toUpperCase()) : 'Date non précisée'}
          {slotWhere(slot) ? `, ${slotWhere(slot)}` : ''}
        </p>
        <Toggle checked={done} onChange={setDone} label="J'ai passé cet entretien" />
        {done ? (
          <>
            <Field label="Type d'entretien">
              <Segmented value={mode ?? ('' as InterviewMode)} onChange={setMode} options={(Object.keys(MODE_LABEL) as InterviewMode[]).map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
            </Field>
            <Field label="Issue" hint={outcome === 'next' ? "À l'enregistrement, tu pourras planifier l'étape suivante." : final ? 'Le statut de la candidature est mis à jour.' : undefined}>
              <Segmented value={outcome ?? ('' as InterviewOutcome)} onChange={(v) => setOutcome(v === outcome ? undefined : v)} options={(Object.keys(OUTCOME_LABEL) as InterviewOutcome[]).map((k) => ({ value: k, label: OUTCOME_LABEL[k] }))} />
            </Field>
            {final && (
              <Field label="Annoncé le" hint="Le jour de l'entretien si on te l'a dit pendant l'échange.">
                <input className="input" type="date" value={told} onChange={(e) => setTold(e.target.value)} style={{ maxWidth: 200 }} />
              </Field>
            )}
            <Field label="Mon impression">
              <div className="feel-pick" role="radiogroup" aria-label="Mon impression">
                {(Object.keys(FEELING) as InterviewFeeling[]).map((f) => (
                  <button key={f} role="radio" aria-checked={feeling === f} className={`feel f-${f}${feeling === f ? ' on' : ''}`} onClick={() => setFeeling(feeling === f ? undefined : f)}>
                    <span className="feel-dot" /> {FEELING[f].label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Compte rendu" hint="À écrire à chaud : il nourrit la préparation de l'étape suivante.">
              <TextArea value={report} minRows={9} onChange={setReport} placeholder={REPORT_HINT} />
            </Field>
            {!final && (
              <Field label="Retour attendu le" hint="Passé ce jour sans nouvelles, une relance « suite à notre entretien » est proposée.">
                <input className="input" type="date" value={answer} onChange={(e) => setAnswer(e.target.value)} style={{ maxWidth: 200 }} />
              </Field>
            )}
          </>
        ) : (
          <p className="muted small">Entretien reporté ou annulé ? Changez sa date dans « Entretien : date, heure et lieu ».</p>
        )}
      </div>
    </Modal>
  )
}

/* ---------- Préparation d'entretien ---------- */

function PrepView({ prep }: { prep: InterviewPrep }) {
  return (
    <div className="prep">
      {prep.company && (
        <section>
          <h4>L'employeur</h4>
          <p>{prep.company}</p>
        </section>
      )}
      {prep.pitch && (
        <section>
          <h4>Ma présentation (1 minute)</h4>
          <p className="prep-pitch">{prep.pitch}</p>
        </section>
      )}
      {!!prep.questions?.length && (
        <section>
          <h4>Questions probables ({prep.questions.length})</h4>
          {prep.questions.map((q, i) => (
            <details key={i} className="prep-q">
              <summary>{q.q}</summary>
              {q.why && <p className="muted small">Ce qui est vérifié : {q.why}</p>}
              {q.answer && <p>{q.answer}</p>}
            </details>
          ))}
        </section>
      )}
      {!!prep.weaknesses?.length && (
        <section>
          <h4>Points de vigilance</h4>
          <ul>
            {prep.weaknesses.map((w, i) => (
              <li key={i}>
                <strong>{w.point}</strong>
                {w.how ? ` : ${w.how}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
      {!!prep.ask?.length && (
        <section>
          <h4>Questions à poser</h4>
          <ul>
            {prep.ask.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </section>
      )}
      {!!prep.checklist?.length && (
        <section>
          <h4>À préparer</h4>
          <ul className="prep-check">
            {prep.checklist.map((a, i) => (
              <li key={i}>
                <label>
                  <input type="checkbox" /> {a}
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

const prepText = (p: InterviewPrep) =>
  [
    p.company && `EMPLOYEUR\n${p.company}`,
    p.pitch && `PRÉSENTATION\n${p.pitch}`,
    p.questions?.length && `QUESTIONS PROBABLES\n${p.questions.map((q) => `- ${q.q}\n  ${q.answer ?? ''}`).join('\n')}`,
    p.weaknesses?.length && `POINTS DE VIGILANCE\n${p.weaknesses.map((w) => `- ${w.point} : ${w.how ?? ''}`).join('\n')}`,
    p.ask?.length && `QUESTIONS À POSER\n${p.ask.map((a) => `- ${a}`).join('\n')}`,
    p.checklist?.length && `À PRÉPARER\n${p.checklist.map((a) => `- ${a}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n')

export function InterviewModal({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const saveOffer = useDocs((s) => s.saveOffer)
  const cv = useOfferCv(offer)
  const [redo, setRedo] = useState(!offer.interview)
  const [answer, setAnswer] = useState('')
  const copy = async (go: boolean) => {
    if (!(await copyText(interviewPrepPrompt(cv ? resumeToText(cv) : '', offer)))) return toast.error('Copie impossible')
    toast.ok('Prompt copié')
    if (go) window.open(CLAUDE_URL, '_blank', 'noopener')
  }
  const apply = () => {
    try {
      const d = extractJson<Omit<InterviewPrep, 'at'>>(answer)
      const arr = <T,>(x: unknown) => (Array.isArray(x) ? (x as T[]) : [])
      const prep: InterviewPrep = {
        at: Date.now(),
        company: typeof d.company === 'string' ? d.company : undefined,
        pitch: typeof d.pitch === 'string' ? d.pitch : undefined,
        questions: arr<{ q?: string; why?: string; answer?: string }>(d.questions).filter((q) => q?.q).map((q) => ({ q: q.q!, why: q.why, answer: q.answer })),
        weaknesses: arr<{ point?: string; how?: string }>(d.weaknesses).filter((w) => w?.point).map((w) => ({ point: w.point!, how: w.how })),
        ask: arr<string>(d.ask).filter((x) => typeof x === 'string'),
        checklist: arr<string>(d.checklist).filter((x) => typeof x === 'string'),
      }
      if (!prep.questions?.length && !prep.pitch) throw new Error('aucune question trouvée')
      saveOffer({ ...offer, interview: prep })
      setAnswer('')
      setRedo(false)
      toast.ok('Préparation enregistrée dans l\'offre')
    } catch (e) {
      toast.error(`Réponse non reconnue : ${e instanceof Error ? e.message : ''}`)
    }
  }
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Préparer l'entretien : ${offer.title ?? ''}${offer.company ? `, ${offer.company}` : ''}`}
      footer={
        redo ? (
          <button className="btn primary" disabled={!answer.trim()} onClick={apply}>
            <MessagesSquare size={15} /> Enregistrer la préparation
          </button>
        ) : (
          <>
            <button className="btn" onClick={() => setRedo(true)}>
              <RotateCcw size={15} /> Refaire avec Claude
            </button>
            <button className="btn" onClick={async () => toast[(await copyText(prepText(offer.interview!))) ? 'ok' : 'error']('Préparation copiée')}>
              <ClipboardCopy size={15} /> Copier en texte
            </button>
            <button className="btn primary" onClick={() => printPrep(offer, offer.interview!) || toast.error("Fenêtre bloquée : autorisez les fenêtres pop-up pour imprimer")}>
              <Printer size={15} /> Imprimer
            </button>
          </>
        )
      }
    >
      {!redo && offer.interview ? (
        <PrepView prep={offer.interview} />
      ) : (
        <div className="form-stack">
          <div className="step">
            <span className="step-n">1</span>
            <div className="step-body">
              <strong>Envoyez votre CV et l'annonce à Claude</strong>
              <span className="muted small">
                CV utilisé : <strong>{cv?.name ?? 'aucun'}</strong>. {offer.description ? "Le texte de l'annonce est inclus." : "L'offre n'a pas de texte : Claude s'appuiera sur l'intitulé (ajoutez le texte dans « Modifier l'offre » pour une préparation plus précise)."}
              </span>
              <div className="row-gap">
                <button className="btn primary sm" onClick={() => copy(true)}>
                  <ExternalLink size={14} /> Copier et ouvrir Claude
                </button>
                <button className="btn sm" onClick={() => copy(false)}>
                  <ClipboardCopy size={14} /> Copier
                </button>
              </div>
            </div>
          </div>
          <div className="step">
            <span className="step-n">2</span>
            <div className="step-body">
              <strong>Collez la réponse de Claude</strong>
              <TextArea value={answer} onChange={setAnswer} minRows={6} placeholder="Collez ici la réponse (le bloc JSON suffit)..." />
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ---------- Dossier de candidature partagé ---------- */

/** Publie pour le recruteur une page avec l'offre, le CV et la lettre (lecture seule, PDF), et met le lien dans le CV. */
export function ShareModal({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const docsMap = useDocs((s) => s.docs)
  const saveOffer = useDocs((s) => s.saveOffer)
  const update = useDocs((s) => s.update)
  const docs = useMemo(() => Object.values(docsMap).filter((d) => d.offerId === offer.id).sort((a, b) => b.updatedAt - a.updatedAt), [docsMap, offer.id])
  const resumes = docs.filter((d) => d.kind === 'resume')
  const letters = docs.filter((d) => d.kind === 'letter')
  const [resumeId, setResumeId] = useState(offer.share?.resumeId ?? resumes[0]?.id ?? '')
  const [letterId, setLetterId] = useState(offer.share?.letterId ?? letters[0]?.id ?? '')
  const [hide, setHide] = useState(true)
  const [relink, setRelink] = useState(true)
  const [busy, setBusy] = useState(false)
  const cfg = loadConfig()
  const target = appRepoFromLocation() ?? (cfg ? { owner: cfg.owner, repo: 'resume', branch: 'main' } : null)
  const url = offer.share ? shareUrl(offer.share.slug, target) : undefined
  const resume = resumes.find((d) => d.id === resumeId)
  const hasAppLink = !!resume && withShareLink(resume, 'https://x.invalid/') !== resume

  const publish = async () => {
    if (!cfg || !target) return toast.error('Activez la sauvegarde GitHub pour publier')
    setBusy(true)
    try {
      const slug = offer.share?.slug ?? newSlug()
      const link = shareUrl(slug, target)
      let r = resume
      if (r && relink) {
        const next = withShareLink(r, link)
        if (next !== r) {
          update(r.id, () => next)
          r = next
        }
      }
      const content = buildShared(offer, r, letters.find((d) => d.id === letterId), hide)
      await publishPublicFile(cfg.token, target, shareFile(slug), JSON.stringify(content), 'Dossier de candidature partagé')
      saveOffer({ ...offer, share: { slug, publishedAt: Date.now(), resumeId: r?.id, letterId: letterId || undefined } })
      toast.ok('Dossier publié : le lien fonctionnera dans une à deux minutes')
    } catch (e) {
      toast.error(e instanceof Error ? `Publication impossible : ${e.message}` : 'Publication impossible')
    } finally {
      setBusy(false)
    }
  }
  const unpublish = async () => {
    if (!cfg || !target || !offer.share) return
    if (!window.confirm('Retirer le dossier ? Le lien ouvrira Resume sans ces documents.')) return
    setBusy(true)
    try {
      await deletePublicFile(cfg.token, target, shareFile(offer.share.slug), 'Dossier de candidature retiré')
      const { share: _, ...rest } = offer
      void _
      saveOffer(rest)
      toast.ok('Page retirée')
    } catch (e) {
      toast.error(e instanceof Error ? `Retrait impossible : ${e.message}` : 'Retrait impossible')
    } finally {
      setBusy(false)
    }
  }
  const opt = (d: { id: string; name: string; updatedAt: number }) => ({ value: d.id, label: `${d.name} (modifié le ${new Date(d.updatedAt).toLocaleDateString('fr-FR')})` })

  return (
    <Modal
      open
      onClose={onClose}
      title={`Dossier pour le recruteur : ${offer.title ?? 'candidature'}`}
      footer={
        <>
          {offer.share && (
            <button className="btn ghost danger" onClick={unpublish} disabled={busy}>
              Retirer le dossier
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Fermer
          </button>
          <button className="btn primary" onClick={publish} disabled={busy || (!resumeId && !letterId) || !cfg}>
            <Globe size={15} /> {busy ? 'Publication...' : offer.share ? 'Mettre à jour le dossier' : 'Publier le dossier'}
          </button>
        </>
      }
    >
      <div className="form-stack">
        <p className="muted small">
          Le lien ouvre Resume comme d'habitude, mais la vitrine n'y montre que le CV et la lettre de cette candidature (lecture seule, téléchargement en PDF). Le lien vers Resume dans votre CV devient ce lien.
        </p>
        {!cfg && <p className="notice warn">Activez la sauvegarde GitHub (bouton en haut de l'accueil) : la page est publiée avec l'application.</p>}
        {!docs.length && <p className="notice warn">Aucun CV ni lettre n'est rattaché à cette offre : créez-les depuis la carte de l'offre.</p>}
        {resumes.length > 0 && (
          <Field label="CV">
            <Select value={resumeId} onChange={setResumeId} options={resumes.map(opt)} />
          </Field>
        )}
        <Field label="Lettre de motivation">
          <Select value={letterId} onChange={setLetterId} options={[{ value: '', label: 'Aucune' }, ...letters.map(opt)]} />
        </Field>
        <Toggle label="Masquer téléphone et e-mail (le recruteur les a déjà)" checked={hide} onChange={setHide} />
        {hasAppLink ? (
          <Toggle label="Remplacer, dans le CV, le lien vers Resume par celui de cette page" checked={relink} onChange={setRelink} />
        ) : (
          resume && <p className="muted small">Votre CV ne contient pas de lien vers Resume : ajoutez-le dans le projet « Resume » ou donnez le lien de la page dans votre lettre ou votre e-mail.</p>
        )}
        <p className="muted small">
          ⚠ Le dossier n'est trouvé que par qui a le lien, mais son fichier est stocké dans le dépôt public de l'application sur GitHub. La signature manuscrite n'est jamais publiée. Pensez à réexporter le PDF du CV après publication pour qu'il contienne le nouveau lien.
        </p>
        {url && (
          <Field label="Lien à donner au recruteur" hint={`Publié le ${new Date(offer.share!.publishedAt).toLocaleDateString('fr-FR')}.`}>
            <div className="row-gap">
              <TextInput value={url} onChange={() => undefined} />
              <button className="btn sm" onClick={async () => toast[(await copyText(url)) ? 'ok' : 'error']('Lien copié')}>
                <ClipboardCopy size={14} /> Copier
              </button>
              <a className="btn sm ghost" href={url} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> Ouvrir
              </a>
            </div>
          </Field>
        )}
      </div>
    </Modal>
  )
}
