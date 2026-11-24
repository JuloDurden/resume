import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from 'lucide-react'
import { useDocs } from '../../store/documents'
import { identityValue } from '../../lib/identity'
import { openSettings } from '../SettingsModal'
import { Toggle } from '../ui'
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

/** Valeur venant des Réglages : affichée, modifiable seulement là-bas. */
function Locked({ value, title }: { value: string; title?: string }) {
  return (
    <button type="button" className="locked-value" onClick={() => openSettings('identity')} title={title ?? 'Modifiable dans Réglages > Identité'}>
      <Lock size={12} /> <span>{value}</span>
    </button>
  )
}

export function HeaderForm({ header, onChange, showPhoto = true }: { header: Header; onChange: (h: Header) => void; showPhoto?: boolean }) {
  const identity = useDocs((s) => s.watch.identity)
  const setContact = (id: string, patch: Partial<ContactLink>) => onChange({ ...header, contacts: header.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  const setContacts = (contacts: ContactLink[]) => onChange({ ...header, contacts })
  const rows = toRows(header.contacts)
  const addTo = (ri: number) => {
    const r = rows.map((x) => [...x])
    const kind: ContactLink['kind'] = ri > 0 && ri >= rows.length ? 'website' : 'info'
    const c: ContactLink = { id: uid(), kind, value: identityValue(identity, kind) ?? '' }
    if (ri >= r.length) r.push([c])
    else r[ri].push(c)
    setContacts(fromRows(r))
  }
  return (
    <div className="form-stack">
      <div className="grid-2">
        <Field label="Nom complet">
          {identity?.name ? <Locked value={identity.name} /> : <TextInput value={header.name} onChange={(v) => onChange({ ...header, name: v })} />}
        </Field>
        <Field label="Titre / poste visé">
          <TextInput value={header.title} onChange={(v) => onChange({ ...header, title: v })} />
        </Field>
      </div>
      {showPhoto && (
        <Field label="Photo">
          {identity?.photo ? (
            <div className="photo-toggle">
              <img src={identity.photo} alt="" />
              <Toggle checked={!!header.photo} onChange={(on) => onChange({ ...header, photo: on ? identity.photo : undefined })} label="Afficher la photo sur ce document" />
            </div>
          ) : (
            <PhotoInput value={header.photo} onChange={(v) => onChange({ ...header, photo: v })} />
          )}
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
                    <Select value={c.kind} onChange={(v) => setContact(c.id, { kind: v, value: identityValue(identity, v) ?? c.value })} options={KINDS} />
                    {identityValue(identity, c.kind) ? (
                      <Locked value={identityValue(identity, c.kind)!} />
                    ) : (
                      <TextInput value={c.value} onChange={(v) => setContact(c.id, { value: v })} placeholder={identity ? 'Valeur (ou à renseigner dans Réglages > Identité)' : 'Valeur'} />
                    )}
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
