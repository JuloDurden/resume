import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardCopy, ExternalLink, FileUp } from 'lucide-react'
import { useDocs } from '../store/documents'
import { TEMPLATES, applyTemplate } from '../data/templates'
import { newResume } from '../data/factory'
import { CLAUDE_URL, copyText, extractJson, pdfImportPrompt, resumeFromClaude } from '../lib/prompts'
import { Field, Modal, Select, TextArea, TextInput, toast } from './ui'

/** Import d'un CV PDF : Claude lit le PDF et renvoie le JSON de l'application. */
export function PdfImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [answer, setAnswer] = useState('')
  const [name, setName] = useState('CV importé')
  const [tpl, setTpl] = useState('epure')
  const add = useDocs((s) => s.add)
  const navigate = useNavigate()
  const prompt = pdfImportPrompt()

  const copy = async (openClaude: boolean) => {
    if (!(await copyText(prompt))) return toast.error('Copie impossible : sélectionnez le prompt manuellement.')
    toast.ok('Prompt copié. Joignez votre PDF dans Claude.')
    if (openClaude) window.open(CLAUDE_URL, '_blank', 'noopener')
  }

  const create = () => {
    try {
      const data = extractJson(answer)
      const base = newResume('epure', false)
      const doc = applyTemplate(resumeFromClaude(base, data as never, name.trim() || 'CV importé'), tpl)
      if (!doc.sections.length) throw new Error('aucune section trouvée.')
      add(doc)
      toast.ok(`CV importé : ${doc.sections.length} sections`)
      setAnswer('')
      onClose()
      navigate(`/cv/${doc.id}`)
    } catch (e) {
      toast.error(`Réponse non reconnue : ${e instanceof Error ? e.message : ''}`)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importer un CV PDF"
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" disabled={!answer.trim()} onClick={create}>
            <FileUp size={16} /> Créer le CV
          </button>
        </>
      }
    >
      <div className="form-stack">
        <div className="claude-intro">
          <FileUp size={18} />
          <p>Claude lit votre PDF et le convertit au format de Resume, sans reformuler le contenu. Vous choisissez ensuite le modèle et retravaillez le CV comme les autres.</p>
        </div>
        <div className="step">
          <span className="step-n">1</span>
          <div className="step-body">
            <strong>Copiez le prompt, ouvrez Claude et joignez votre PDF</strong>
            <div className="row-gap">
              <button className="btn primary sm" onClick={() => copy(true)}>
                <ExternalLink size={14} /> Copier et ouvrir Claude
              </button>
              <button className="btn sm" onClick={() => copy(false)}>
                <ClipboardCopy size={14} /> Copier
              </button>
            </div>
            <span className="muted small">Dans Claude : collez le prompt, ajoutez le PDF avec le bouton « + » (ou glissez-le), puis envoyez.</span>
            <details>
              <summary>Voir le prompt</summary>
              <pre className="prompt-preview">{prompt}</pre>
            </details>
          </div>
        </div>
        <div className="step">
          <span className="step-n">2</span>
          <div className="step-body">
            <strong>Collez la réponse de Claude</strong>
            <TextArea value={answer} onChange={setAnswer} minRows={6} placeholder="Collez ici la réponse complète (le bloc JSON suffit)..." />
            <div className="grid-2">
              <Field label="Nom du document">
                <TextInput value={name} onChange={setName} />
              </Field>
              <Field label="Modèle">
                <Select value={tpl} onChange={setTpl} options={TEMPLATES.map((t) => ({ value: t.id, label: `${t.name} : ${t.description}` }))} />
              </Field>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
