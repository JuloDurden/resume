import { useMemo, useState } from 'react'
import { BellOff, Check, ClipboardCopy, ExternalLink, Mail, MessagesSquare, RotateCcw } from 'lucide-react'
import type { InterviewPrep, Offer, ResumeDoc } from '../../types'
import { useDocs } from '../../store/documents'
import { appliedAt, followUpEmail, nextFollowUp } from '../../lib/followup'
import { resumeToText } from '../../lib/export'
import { CLAUDE_URL, copyText, extractJson, interviewPrepPrompt } from '../../lib/prompts'
import { Field, Modal, TextArea, TextInput, toast } from '../ui'

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
  const n = (offer.followUps?.length ?? 0) + 1

  const done = () => {
    let contacts = offer.contacts ?? []
    // adresse saisie à la main : enregistrée comme contact de l'offre
    if (to && !contacts.some((c) => c.email === to)) contacts = [...contacts, { email: to, role: 'Recrutement' }]
    saveOffer({ ...offer, contacts, followUps: [...(offer.followUps ?? []), Date.now()] })
    toast.ok(n === 1 ? 'Relance enregistrée : seconde relance proposée dans 10 jours' : 'Seconde relance enregistrée')
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
          <button className="btn primary" onClick={done}>
            <Check size={15} /> J'ai envoyé la relance
          </button>
        </>
      }
    >
      <div className="form-stack">
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
      </div>
    </Modal>
  )
}

export function followUpLabel(o: Offer): { due: boolean; label: string } | undefined {
  const n = nextFollowUp(o)
  if (!n) return undefined
  const days = Math.ceil((n - Date.now()) / 86400000)
  if (days <= 0) return { due: true, label: (o.followUps?.length ?? 0) ? 'Seconde relance' : 'À relancer' }
  return { due: false, label: `Relance dans ${days} j` }
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
