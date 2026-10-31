import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ClipboardCopy, ExternalLink, Sparkles, Wand2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { LetterDoc, ResumeDoc } from '../../types'
import { ACTIONS, CLAUDE_URL, buildPrompt, copyText, extractJson, parseBullets, parseSummary, resumeFromClaude, type ClaudeAction } from '../../lib/prompts'
import { makeSection, newLetter } from '../../data/factory'
import { useDocs } from '../../store/documents'
import { Field, Select, TextArea, toast } from '../ui'

export interface ClaudeRequest {
  action: ClaudeAction
  itemId?: string
  keywords?: string[]
  nonce: number
}

interface Props {
  doc: ResumeDoc
  update: (fn: (d: ResumeDoc) => ResumeDoc) => void
  request: ClaudeRequest | null
  onGoAts: () => void
}

export function ClaudeIntro() {
  return (
    <div className="claude-intro">
      <Sparkles size={18} />
      <p>
        L'application prépare un prompt complet (votre CV, l'offre et des consignes). Vous le collez dans Claude, puis vous recollez la réponse ici pour l'appliquer. Aucune clé d'API n'est nécessaire.
      </p>
    </div>
  )
}

export function ClaudePanel({ doc, update, request, onGoAts }: Props) {
  const [action, setAction] = useState<ClaudeAction | null>(null)
  const [itemId, setItemId] = useState<string | undefined>()
  const [keywords, setKeywords] = useState<string[] | undefined>()
  const [answer, setAnswer] = useState('')
  const add = useDocs((s) => s.add)
  const navigate = useNavigate()

  useEffect(() => {
    if (!request) return
    setAction(request.action)
    setItemId(request.itemId)
    setKeywords(request.keywords)
    setAnswer('')
  }, [request])

  const experiences = useMemo(() => doc.sections.filter((s) => s.type === 'experience').flatMap((s) => s.items).filter((i) => !i.hidden), [doc.sections])
  const def = ACTIONS.find((a) => a.id === action)

  if (!action || !def) {
    return (
      <div className="panel-content">
        <ClaudeIntro />
        <div className="action-list">
          {ACTIONS.map((a) => (
            <button
              key={a.id}
              className="action-card"
              onClick={() => {
                setAction(a.id)
                setAnswer('')
                if (a.id === 'bullets') setItemId(experiences[0]?.id)
              }}
            >
              <Wand2 size={16} />
              <div>
                <strong>{a.label}</strong>
                <span>{a.description}</span>
                {a.needsJob && !doc.job?.description?.trim() && <em>Nécessite le texte de l'offre (onglet ATS)</em>}
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const missingJob = def.needsJob && !doc.job?.description?.trim()
  const prompt = missingJob ? '' : buildPrompt(action, doc, { itemId, keywords })

  const copy = async (open: boolean) => {
    const ok = await copyText(prompt)
    if (!ok) return toast.error('Copie impossible : sélectionnez le texte du prompt manuellement.')
    toast.ok('Prompt copié dans le presse-papiers')
    if (open) window.open(CLAUDE_URL, '_blank', 'noopener')
  }

  const apply = () => {
    try {
      switch (def.result) {
        case 'text': {
          const text = parseSummary(answer)
          if (!text) throw new Error('Réponse vide.')
          update((d) => {
            const s = d.sections.find((x) => x.type === 'summary')
            if (!s) {
              const ns = makeSection('summary', [{ description: text }])
              return { ...d, sections: [ns, ...d.sections], layout: { ...d.layout, main: [ns.id, ...d.layout.main] } }
            }
            return { ...d, sections: d.sections.map((x) => (x.id === s.id ? { ...x, items: [{ ...(x.items[0] ?? { id: 'sum' }), description: text }] } : x)) }
          })
          toast.ok('Résumé mis à jour (annulable avec Ctrl+Z)')
          break
        }
        case 'bullets': {
          const bullets = parseBullets(answer)
          if (!bullets.length) throw new Error('Aucune puce trouvée : chaque ligne doit commencer par "- ".')
          update((d) => ({ ...d, sections: d.sections.map((s) => ({ ...s, items: s.items.map((i) => (i.id === itemId ? { ...i, bullets } : i)) })) }))
          toast.ok(`${bullets.length} puces appliquées (annulable avec Ctrl+Z)`)
          break
        }
        case 'resume-json': {
          const data = extractJson(answer)
          const name = action === 'translate' ? `${doc.name} (EN)` : `${doc.name} ${doc.job?.company ? `- ${doc.job.company}` : '(adapté)'}`
          const created = resumeFromClaude(doc, data as never, name)
          if (action === 'translate') {
            created.style = { ...created.style, currentLabel: 'Present', dateFormat: created.style.dateFormat === 'MMMM YYYY' || created.style.dateFormat === 'MMM YYYY' ? 'MM/YYYY' : created.style.dateFormat }
          }
          add(created)
          toast.ok('Nouveau CV créé')
          navigate(`/cv/${created.id}`)
          break
        }
        case 'letter-json': {
          const data = extractJson<Partial<LetterDoc> & { recipient?: LetterDoc['recipient'] }>(answer)
          const letter = newLetter(doc.templateId, false, doc, doc.job?.company ? `Lettre - ${doc.job.company}` : `Lettre - ${doc.name}`)
          Object.assign(letter, {
            subject: data.subject ?? letter.subject,
            salutation: data.salutation ?? letter.salutation,
            body: data.body ?? '',
            closing: data.closing ?? letter.closing,
            job: doc.job,
          })
          if (data.recipient) letter.recipient = { ...letter.recipient, ...Object.fromEntries(Object.entries(data.recipient).filter(([, v]) => v)) }
          if (!letter.recipient.company && doc.job?.company) letter.recipient.company = doc.job.company
          add(letter)
          toast.ok('Lettre de motivation créée')
          navigate(`/lettre/${letter.id}`)
          break
        }
      }
      setAnswer('')
    } catch (e) {
      toast.error(e instanceof Error ? `Réponse non reconnue : ${e.message}` : 'Réponse non reconnue')
    }
  }

  return (
    <div className="panel-content">
      <button className="btn ghost sm self-start" onClick={() => setAction(null)}>
        <ArrowLeft size={14} /> Toutes les actions
      </button>
      <h3 className="action-title">{def.label}</h3>
      <p className="muted small">{def.description}</p>

      {missingJob ? (
        <div className="notice warn">
          Cette action a besoin du texte de l'offre.{' '}
          <button className="link" onClick={onGoAts}>
            Le coller dans l'onglet ATS
          </button>
        </div>
      ) : (
        <>
          {action === 'bullets' && (
            <Field label="Poste à retravailler">
              <Select value={itemId ?? ''} onChange={setItemId} options={experiences.map((e) => ({ value: e.id, label: `${e.title || 'Sans titre'}${e.subtitle ? `, ${e.subtitle}` : ''}` }))} />
            </Field>
          )}
          <div className="step">
            <span className="step-n">1</span>
            <div className="step-body">
              <strong>Copiez le prompt et ouvrez Claude</strong>
              <div className="row-gap">
                <button className="btn primary sm" onClick={() => copy(true)}>
                  <ExternalLink size={14} /> Copier et ouvrir Claude
                </button>
                <button className="btn sm" onClick={() => copy(false)}>
                  <ClipboardCopy size={14} /> Copier
                </button>
              </div>
              <details>
                <summary>Voir le prompt</summary>
                <pre className="prompt-preview">{prompt}</pre>
              </details>
            </div>
          </div>
          {def.result !== 'none' ? (
            <div className="step">
              <span className="step-n">2</span>
              <div className="step-body">
                <strong>Collez la réponse de Claude</strong>
                <TextArea value={answer} onChange={setAnswer} minRows={6} placeholder="Collez ici la réponse complète..." />
                <button className="btn primary sm self-start" disabled={!answer.trim()} onClick={apply}>
                  <Sparkles size={14} /> {def.result === 'resume-json' ? 'Créer le CV' : def.result === 'letter-json' ? 'Créer la lettre' : 'Appliquer'}
                </button>
              </div>
            </div>
          ) : (
            <div className="step">
              <span className="step-n">2</span>
              <div className="step-body">
                <strong>Lisez l'analyse dans Claude</strong>
                <span className="muted small">Revenez ensuite modifier votre CV ici, ou utilisez « Adapter le CV à l'offre ».</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
