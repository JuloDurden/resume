import type { LetterDoc, LetterOptions } from '../../types'
import { letterOptions } from '../../data/letterTemplates'
import { Field, Segmented, Toggle } from '../ui'
import { Block, Picto, Steps } from './StylePanel'

const Page = ({ side, lines }: { side?: 'left' | 'right'; lines?: boolean }) => (
  <span className="art-page">
    {side === 'left' && <span className="art-col fill" style={{ flex: 0.5 }} />}
    <span className="art-col" style={{ flex: 1, opacity: lines ? 1 : 0.9 }} />
    {side === 'right' && <span className="art-col fill" style={{ flex: 0.5 }} />}
  </span>
)

const Subject = ({ kind }: { kind: LetterOptions['subjectStyle'] }) => (
  <span className={`art-heading ${kind === 'heading' ? 'ah-rule' : ''}`}>
    <b style={{ fontWeight: kind === 'heading' ? 400 : 700 }}>{kind === 'label' ? 'Objet : …' : kind === 'heading' ? 'CANDIDATURE' : 'Candidature…'}</b>
  </span>
)

/** Réglages propres aux lettres : disposition, destinataire, date, objet, signature. */
export function LetterLayoutPanel({ doc, onChange }: { doc: LetterDoc; onChange: (p: Partial<LetterOptions>) => void }) {
  const o = letterOptions(doc)
  const layoutKey = o.layout === 'single' ? 'single' : o.sidebarPosition
  return (
    <div className="style-panel">
      <Block title="Disposition de la lettre">
        <Picto
          value={layoutKey}
          onChange={(k) => onChange(k === 'single' ? { layout: 'single' } : { layout: 'sidebar', sidebarPosition: k as 'left' | 'right' })}
          options={[
            { value: 'single', label: 'Une colonne', art: <Page /> },
            { value: 'left', label: 'Latérale à gauche', art: <Page side="left" /> },
            { value: 'right', label: 'Latérale à droite', art: <Page side="right" /> },
          ]}
        />
      </Block>
      <Block title="Destinataire et date">
        <div className="row-wrap">
          <Field label="Bloc destinataire">
            <Segmented
              value={o.showRecipient ? o.recipientAlign : 'none'}
              onChange={(v) => onChange(v === 'none' ? { showRecipient: false } : { showRecipient: true, recipientAlign: v })}
              options={[
                { value: 'none', label: 'Masqué' },
                { value: 'left', label: 'À gauche' },
                { value: 'right', label: 'À droite' },
              ]}
            />
          </Field>
          <Field label="Lieu et date">
            <Segmented
              value={o.showDate ? o.dateAlign : 'none'}
              onChange={(v) => onChange(v === 'none' ? { showDate: false } : { showDate: true, dateAlign: v })}
              options={[
                { value: 'none', label: 'Masqués' },
                { value: 'left', label: 'À gauche' },
                { value: 'right', label: 'À droite' },
              ]}
            />
          </Field>
        </div>
      </Block>
      <Block title="Objet">
        <Picto
          value={o.subjectStyle}
          onChange={(v) => onChange({ subjectStyle: v })}
          options={[
            { value: 'label', label: '« Objet : » en gras', art: <Subject kind="label" /> },
            { value: 'heading', label: 'Capitales et filet', art: <Subject kind="heading" /> },
            { value: 'bold', label: 'Gras seul', art: <Subject kind="bold" /> },
          ]}
        />
      </Block>
      <Block title="Paragraphes et signature">
        <Steps label="Espace entre paragraphes" values={[0.5, 0.75, 1, 1.25, 1.6]} labels={['serré', 'réduit', 'normal', 'aéré', 'très aéré']} value={o.paragraphSpacing} onChange={(v) => onChange({ paragraphSpacing: v })} />
        <div className="row-wrap">
          <Field label="Signature">
            <Segmented
              value={o.signatureAlign}
              onChange={(v) => onChange({ signatureAlign: v })}
              options={[
                { value: 'left', label: 'À gauche' },
                { value: 'right', label: 'À droite' },
              ]}
            />
          </Field>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <Toggle label="En gras" checked={o.signatureBold} onChange={(v) => onChange({ signatureBold: v })} />
          </div>
        </div>
        {doc.signatureImage && <Steps label="Taille de la signature" values={[10, 13, 16, 20, 25]} labels={['très petite', 'petite', 'moyenne', 'grande', 'très grande']} value={o.signatureHeight} onChange={(v) => onChange({ signatureHeight: v })} />}
      </Block>
    </div>
  )
}
