import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { ContactLink, Header } from '../../types'
import { uid } from '../../lib/ids'
import { Field, Select, TextInput } from '../ui'
import { PhotoInput } from './fields'

const KINDS: { value: ContactLink['kind']; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Téléphone' },
  { value: 'location', label: 'Localisation' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'website', label: 'Site web' },
  { value: 'github', label: 'GitHub' },
  { value: 'other', label: 'Autre lien' },
  { value: 'info', label: 'Information (sans lien)' },
]

export function HeaderForm({ header, onChange, showPhoto = true }: { header: Header; onChange: (h: Header) => void; showPhoto?: boolean }) {
  const setContact = (id: string, patch: Partial<ContactLink>) => onChange({ ...header, contacts: header.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= header.contacts.length) return
    const next = [...header.contacts]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange({ ...header, contacts: next })
  }
  return (
    <div className="form-stack">
      <div className="grid-2">
        <Field label="Nom complet">
          <TextInput value={header.name} onChange={(v) => onChange({ ...header, name: v })} />
        </Field>
        <Field label="Titre / poste visé">
          <TextInput value={header.title} onChange={(v) => onChange({ ...header, title: v })} />
        </Field>
      </div>
      {showPhoto && (
        <Field label="Photo">
          <PhotoInput value={header.photo} onChange={(v) => onChange({ ...header, photo: v })} />
        </Field>
      )}
      <div className="field">
        <span className="field-label">Coordonnées et liens</span>
        <div className="contact-list">
          {header.contacts.map((c, i) => (
            <div className="contact-row" key={c.id}>
              <Select value={c.kind} onChange={(v) => setContact(c.id, { kind: v })} options={KINDS} />
              <TextInput value={c.value} onChange={(v) => setContact(c.id, { value: v })} placeholder="Valeur" />
              <div className="row-actions">
                <button className="icon-btn xs" onClick={() => move(i, -1)} disabled={i === 0} title="Monter">
                  <ArrowUp size={13} />
                </button>
                <button className="icon-btn xs" onClick={() => move(i, 1)} disabled={i === header.contacts.length - 1} title="Descendre">
                  <ArrowDown size={13} />
                </button>
                <button className="icon-btn xs" onClick={() => onChange({ ...header, contacts: header.contacts.filter((x) => x.id !== c.id) })} title="Supprimer">
                  <Trash2 size={13} />
                </button>
              </div>
              {['linkedin', 'website', 'github', 'other'].includes(c.kind) && (
                <TextInput value={c.label} onChange={(v) => setContact(c.id, { label: v || undefined })} placeholder="Texte affiché à la place du lien (optionnel)" className="label-input" />
              )}
            </div>
          ))}
        </div>
        <button className="btn ghost sm" onClick={() => onChange({ ...header, contacts: [...header.contacts, { id: uid(), kind: 'website', value: '' }] })}>
          <Plus size={14} /> Ajouter une coordonnée
        </button>
      </div>
    </div>
  )
}
