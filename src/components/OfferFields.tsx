import { BookOpen, ExternalLink, Plus, Search, Trash2 } from 'lucide-react'
import { useRomeDrawer } from './RomeDrawer'
import type { JobStatus, Offer, OfferContact } from '../types'
import { JOB_STATUS, linkedinSearch } from '../lib/offers'
import { Field, Select, TextArea, TextInput } from './ui'

const href = (u: string) => (/^https?:/i.test(u) ? u : `https://${u}`)

function LinkInput({ value, onChange, placeholder }: { value?: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="row-gap">
      <TextInput value={value} onChange={onChange} placeholder={placeholder ?? 'https://'} />
      {value && (
        <a className="icon-btn bordered" href={href(value)} target="_blank" rel="noreferrer" title="Ouvrir">
          <ExternalLink size={15} />
        </a>
      )}
    </div>
  )
}

/** Formulaire complet d'une offre d'emploi. */
export function OfferFields({ offer, onChange, compact }: { offer: Offer; onChange: (o: Offer) => void; compact?: boolean }) {
  const set = (p: Partial<Offer>) => onChange({ ...offer, ...p })
  const openRome = useRomeDrawer((s) => s.open)
  const contacts = offer.contacts ?? []
  const setContact = (i: number, p: Partial<OfferContact>) => set({ contacts: contacts.map((c, j) => (j === i ? { ...c, ...p } : c)) })
  return (
    <section className={compact ? 'form-stack' : 'style-group'}>
      {!compact && <h3>Offre analysée</h3>}
      <div className="form-stack">
        <div className="grid-2">
          <Field label="Intitulé du poste">
            <div className="row-gap">
              <TextInput value={offer.title} onChange={(v) => set({ title: v })} />
              <button
                className="icon-btn bordered"
                title="Fiche métier (ROME)"
                onClick={() => openRome({ query: offer.title, code: offer.romeCode, context: offer.description, label: 'Fiche métier du poste visé' })}
              >
                <BookOpen size={15} />
              </button>
            </div>
          </Field>
          <Field label="Entreprise">
            <TextInput value={offer.company} onChange={(v) => set({ company: v })} />
          </Field>
          <Field label="Lieu">
            <TextInput value={offer.location} onChange={(v) => set({ location: v })} />
          </Field>
          <Field label="Suivi">
            <Select value={offer.status ?? 'todo'} onChange={(v) => set({ status: v })} options={(Object.keys(JOB_STATUS) as JobStatus[]).map((k) => ({ value: k, label: JOB_STATUS[k] }))} />
          </Field>
        </div>
        <Field label="Lien de l'annonce">
          <LinkInput value={offer.url} onChange={(v) => set({ url: v })} />
        </Field>
        <Field label="Site de l'entreprise" hint="Sert à afficher le logo de l'entreprise.">
          <LinkInput value={offer.website} onChange={(v) => set({ website: v })} placeholder="entreprise.fr" />
        </Field>
        <Field label="Texte de l'annonce" hint={offer.snapshotAt ? `Instantané du ${new Date(offer.snapshotAt).toLocaleDateString('fr-FR')}. Copiez-collez l'annonce complète si besoin.` : "Copiez-collez l'annonce complète : missions, profil, compétences."}>
          <TextArea value={offer.description} minRows={compact ? 5 : 6} onChange={(v) => set({ description: v })} placeholder="Collez ici le texte de l'offre..." />
        </Field>

        <div className="field">
          <span className="field-label">Contacts</span>
          {contacts.map((c, i) => (
            <div className="offer-contact" key={i}>
              <div className="grid-2">
                <TextInput value={c.name} onChange={(v) => setContact(i, { name: v })} placeholder="Nom" />
                <TextInput value={c.role} onChange={(v) => setContact(i, { role: v })} placeholder="Fonction" />
                <TextInput value={c.email} onChange={(v) => setContact(i, { email: v })} placeholder="Email" />
                <TextInput value={c.linkedin} onChange={(v) => setContact(i, { linkedin: v })} placeholder="Profil LinkedIn" />
              </div>
              <div className="row-gap">
                {c.name && (
                  <a className="btn ghost sm" href={linkedinSearch(`${c.name} ${offer.company ?? ''}`)} target="_blank" rel="noreferrer">
                    <Search size={14} /> Chercher sur LinkedIn
                  </a>
                )}
                {c.linkedin && (
                  <a className="btn ghost sm" href={href(c.linkedin)} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} /> Ouvrir le profil
                  </a>
                )}
                <button className="icon-btn xs" title="Retirer" onClick={() => set({ contacts: contacts.filter((_, j) => j !== i) })}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
          <div className="row-gap">
            <button className="btn ghost sm" onClick={() => set({ contacts: [...contacts, {}] })}>
              <Plus size={14} /> Ajouter un contact
            </button>
            {offer.company && (
              <a className="btn ghost sm" href={linkedinSearch(`recrutement ${offer.company}`)} target="_blank" rel="noreferrer" title="Ouvre une recherche LinkedIn">
                <Search size={14} /> Recruteurs de {offer.company} sur LinkedIn
              </a>
            )}
          </div>
        </div>

        <Field label="Notes">
          <TextArea value={offer.notes} minRows={2} onChange={(v) => set({ notes: v })} placeholder="Date d'envoi, relance, échanges..." />
        </Field>
      </div>
    </section>
  )
}
