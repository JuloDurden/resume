import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import type { LetterDoc, ResumeDoc } from '../../types'
import { TEMPLATES, applyTemplate } from '../../data/templates'
import { LETTER_TEMPLATES, applyLetterTemplate } from '../../data/letterTemplates'
import { DocThumb } from '../DocThumb'
import { Toggle } from '../ui'

const ATS_LABEL = { excellent: 'ATS excellent', bon: 'ATS bon', moyen: 'ATS moyen' }

export function TemplatesPanel({ doc, onApply }: { doc: ResumeDoc | LetterDoc; onApply: (templateId: string, keepColors: boolean) => void }) {
  const [keep, setKeep] = useState(false)
  const previews = useMemo(
    () =>
      doc.kind === 'resume'
        ? TEMPLATES.map((t) => ({ t: t as { id: string; name: string; description: string; ats?: 'excellent' | 'bon' | 'moyen' }, doc: applyTemplate(doc, t.id, keep) as ResumeDoc | LetterDoc }))
        : LETTER_TEMPLATES.map((t) => ({ t: t as { id: string; name: string; description: string; ats?: 'excellent' | 'bon' | 'moyen' }, doc: applyLetterTemplate(doc, t.id, keep) as ResumeDoc | LetterDoc })),
    [doc, keep],
  )
  return (
    <div className="panel-content">
      <p className="muted small">Le contenu est conservé. Le modèle définit la disposition, les polices et les couleurs, que vous pourrez ensuite ajuster dans Style.</p>
      <Toggle label="Conserver mes couleurs actuelles" checked={keep} onChange={setKeep} />
      <div className="template-grid">
        {previews.map(({ t, doc: d }) => (
          <button key={t.id} className={`template-card${doc.templateId === t.id ? ' on' : ''}`} onClick={() => onApply(t.id, keep)}>
            <DocThumb doc={d} width={168} />
            <div className="tc-meta">
              <strong>
                {t.name} {doc.templateId === t.id && <Check size={14} />}
              </strong>
              <span>{t.description}</span>
              {t.ats && <em className={`ats-${t.ats}`}>{ATS_LABEL[t.ats]}</em>}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
