import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { ContactLink, Header } from '../../types'
import { uid } from '../../lib/ids'
import { fromRows, moveContact, moveRow, toRows } from '../../lib/contactRows'
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
  const setContacts = (contacts: ContactLink[]) => onChange({ ...header, contacts })
  const rows = toRows(header.contacts)
  const addTo = (ri: number) => {
    const r = rows.map((x) => [...x])
    const c: ContactLink = { id: uid(), kind: ri > 0 && ri >= rows.length ? 'website' : 'info', value: '' }
    if (ri >= r.length) r.push([c])
    else r[ri].push(c)
    setContacts(fromRows(r))
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
        <span className="field-hint">Répartissez-les sur plusieurs lignes (par exemple : coordonnées, puis informations, puis liens). Les flèches font passer une coordonnée d'une ligne à l'autre.</span>
        <div className="contact-rows">
          {rows.map((row, ri) => (
            <div className="contact-line" key={ri}>
              <div className="contact-line-head">
                <span>Ligne {ri + 1}</span>
                <div className="row-actions">
                  <button className="icon-btn xs" onClick={() => setContacts(moveRow(header.contacts, ri, -1))} disabled={ri === 0} title="Monter la ligne">
                    <ArrowUp size={13} />
                  </button>
                  <button className="icon-btn xs" onClick={() => setContacts(moveRow(header.contacts, ri, 1))} disabled={ri === rows.length - 1} title="Descendre la ligne">
                    <ArrowDown size={13} />
                  </button>
                </div>
              </div>
              {row.map((c, ci) => {
                const first = ri === 0 && ci === 0
                const last = ri === rows.length - 1 && ci === row.length - 1 && row.length === 1
                return (
                  <div className="contact-row" key={c.id}>
                    <Select value={c.kind} onChange={(v) => setContact(c.id, { kind: v })} options={KINDS} />
                    <TextInput value={c.value} onChange={(v) => setContact(c.id, { value: v })} placeholder="Valeur" />
                    <div className="row-actions">
                      <button className="icon-btn xs" onClick={() => setContacts(moveContact(header.contacts, c.id, -1))} disabled={first} title={ci === 0 ? 'Passer à la ligne précédente' : 'Monter'}>
                        <ArrowUp size={13} />
                      </button>
                      <button className="icon-btn xs" onClick={() => setContacts(moveContact(header.contacts, c.id, 1))} disabled={last} title={ci === row.length - 1 ? 'Passer à la ligne suivante' : 'Descendre'}>
                        <ArrowDown size={13} />
                      </button>
                      <button className="icon-btn xs" onClick={() => setContacts(header.contacts.filter((x) => x.id !== c.id))} title="Supprimer">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {['linkedin', 'website', 'github', 'other'].includes(c.kind) && (
                      <TextInput value={c.label} onChange={(v) => setContact(c.id, { label: v || undefined })} placeholder="Texte affiché à la place du lien (optionnel)" className="label-input" />
                    )}
                  </div>
                )
              })}
              <button className="btn ghost sm self-start" onClick={() => addTo(ri)}>
                <Plus size={14} /> Ajouter sur cette ligne
              </button>
            </div>
          ))}
        </div>
        <button className="btn sm self-start" onClick={() => addTo(rows.length)}>
          <Plus size={14} /> Nouvelle ligne
        </button>
      </div>
    </div>
  )
}
