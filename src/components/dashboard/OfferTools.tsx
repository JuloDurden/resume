import { useMemo, useState } from 'react'
import { BellOff, Check, ClipboardCopy, ExternalLink, Globe, Mail, MessagesSquare, RotateCcw } from 'lucide-react'
import type { InterviewPrep, Offer, ResumeDoc } from '../../types'
import { useDocs } from '../../store/documents'
import { FOLLOW_UP_CHOICES, appliedAt, followUpDays, followUpEmail, nextFollowUp, startOfDay } from '../../lib/followup'
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
  const n = (offer.followUps?.length ?? 0) + 1

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

export function followUpLabel(o: Offer): { due: boolean; label: string; title: string } | undefined {
  const n = nextFollowUp(o)
  if (!n) return undefined
  const days = Math.round((n - startOfDay(Date.now())) / 86400000)
  const when = `Relance prévue le ${new Date(n).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`
  if (days <= 0) return { due: true, label: (o.followUps?.length ?? 0) ? 'Seconde relance' : 'À relancer', title: `${when}. Cliquez pour préparer l'email.` }
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
  const [mode, setMode] = useState<number | 'date'>(offer.followUpDate && !offer.followUps?.length ? 'date' : followUpDays(offer))
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
        <Field label={offer.followUps?.length ? 'Délai avant la seconde relance' : 'Relancer'}>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[...FOLLOW_UP_CHOICES.map((d) => ({ value: d as number | 'date', label: `${d} jours` })), ...(offer.followUps?.length ? [] : [{ value: 'date' as const, label: 'Date précise', title: "Quand l'employeur indique la fin de sa période de recrutement" }])]}
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
            {(offer.followUps?.length ?? 0) === 0 ? `, puis une seconde relance ${mode === 'date' ? followUpDays(offer) : mode} jours plus tard si besoin.` : '.'}
          </p>
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
      toast.ok('Dossier publié : la page sera en ligne dans une à deux minutes')
    } catch (e) {
      toast.error(e instanceof Error ? `Publication impossible : ${e.message}` : 'Publication impossible')
    } finally {
      setBusy(false)
    }
  }
  const unpublish = async () => {
    if (!cfg || !target || !offer.share) return
    if (!window.confirm('Retirer la page ? Le lien affichera « dossier introuvable ».')) return
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
              Retirer la page
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Fermer
          </button>
          <button className="btn primary" onClick={publish} disabled={busy || (!resumeId && !letterId) || !cfg}>
            <Globe size={15} /> {busy ? 'Publication...' : offer.share ? 'Mettre à jour la page' : 'Publier la page'}
          </button>
        </>
      }
    >
      <div className="form-stack">
        <p className="muted small">
          Une page en lecture seule présente au recruteur le CV et la lettre de cette candidature, réalisés avec Resume, avec un mot sur l'application et le téléchargement en PDF. Le lien vers Resume dans votre CV pointe alors vers cette page.
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
          ⚠ La page n'est trouvée que par qui a le lien, mais son fichier est stocké dans le dépôt public de l'application sur GitHub. La signature manuscrite n'est jamais publiée. Pensez à réexporter le PDF du CV après publication pour qu'il contienne le nouveau lien.
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
