import { useState } from 'react'
import { ClipboardCopy, ExternalLink, Link2 } from 'lucide-react'
import type { Offer } from '../types'
import { useDocs } from '../store/documents'
import { CLAUDE_URL, copyText, extractJson, offerImportPrompt, type ClaudeOffer } from '../lib/prompts'
import { newOffer } from '../lib/offers'
import { Field, Modal, TextArea, TextInput, toast } from './ui'

const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** Crée une offre à partir de son lien : Claude lit l'annonce, l'application récupère les champs et le logo. */
export function OfferImportModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (o: Offer) => void }) {
  const [url, setUrl] = useState('')
  const [answer, setAnswer] = useState('')
  const saveOffer = useDocs((s) => s.saveOffer)
  const valid = /^https?:\/\/\S+\.\S+/i.test(url.trim())

  const copy = async (openClaude: boolean) => {
    if (!(await copyText(offerImportPrompt(url.trim())))) return toast.error('Copie impossible')
    toast.ok('Prompt copié')
    if (openClaude) window.open(CLAUDE_URL, '_blank', 'noopener')
  }

  const create = (withAnswer: boolean) => {
    try {
      const d: ClaudeOffer = withAnswer ? extractJson<ClaudeOffer>(answer) : {}
      const contacts = (Array.isArray(d.contacts) ? d.contacts : [])
        .map((c) => ({ name: clean(c?.name), role: clean(c?.role), email: clean(c?.email), phone: clean(c?.phone) }))
        .filter((c) => c.name || c.email)
      const o = newOffer({
        url: url.trim() || undefined,
        title: clean(d.title),
        company: clean(d.company),
        location: clean(d.location),
        contract: clean(d.contract),
        website: clean(d.website),
        description: clean(d.description),
        contacts,
        snapshotAt: withAnswer ? Date.now() : undefined,
      })
      saveOffer(o)
      toast.ok(withAnswer ? `Offre « ${o.title ?? 'sans titre'} » créée` : 'Offre créée')
      setUrl('')
      setAnswer('')
      onCreated?.(o)
      onClose()
    } catch (e) {
      toast.error(`Réponse non reconnue : ${e instanceof Error ? e.message : ''}`)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajouter une offre depuis son lien"
      wide
      footer={
        <>
          <button className="btn" onClick={() => create(false)} disabled={!valid}>
            Créer avec le lien seul
          </button>
          <button className="btn primary" onClick={() => create(true)} disabled={!answer.trim()}>
            <Link2 size={16} /> Créer l'offre
          </button>
        </>
      }
    >
      <div className="form-stack">
        <Field label="Lien de l'annonce">
          <TextInput value={url} onChange={setUrl} placeholder="https://www.welcometothejungle.com/..." autoFocus />
        </Field>
        <div className="step">
          <span className="step-n">1</span>
          <div className="step-body">
            <strong>Demandez à Claude de lire l'annonce</strong>
            <span className="muted small">Votre navigateur ne peut pas lire les sites d'annonces directement (ils le bloquent). Claude, lui, peut ouvrir la page et en extraire le poste, l'employeur, le texte complet et les contacts cités.</span>
            <div className="row-gap">
              <button className="btn primary sm" disabled={!valid} onClick={() => copy(true)}>
                <ExternalLink size={14} /> Copier et ouvrir Claude
              </button>
              <button className="btn sm" disabled={!valid} onClick={() => copy(false)}>
                <ClipboardCopy size={14} /> Copier
              </button>
            </div>
          </div>
        </div>
        <div className="step">
          <span className="step-n">2</span>
          <div className="step-body">
            <strong>Collez la réponse de Claude</strong>
            <TextArea value={answer} onChange={setAnswer} minRows={5} placeholder="Collez ici la réponse (le bloc JSON suffit)..." />
          </div>
        </div>
      </div>
    </Modal>
  )
}
