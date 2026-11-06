import { useState } from 'react'
import { Link2 } from 'lucide-react'
import type { FeedItem } from '../../types'
import { useDocs } from '../../store/documents'
import { uid } from '../../lib/ids'
import { Field, Modal, TextArea, TextInput, toast } from '../ui'

const SITES: [RegExp, string][] = [
  [/linkedin/, 'LinkedIn'],
  [/francetravail|pole-emploi/, 'France Travail'],
  [/glassdoor/, 'Glassdoor'],
  [/jobijoba/, 'Jobijoba'],
  [/hellowork/, 'Hellowork'],
  [/indeed/, 'Indeed'],
  [/apec/, 'APEC'],
  [/welcometothejungle/, 'Welcome to the Jungle'],
  [/choisirleservicepublic/, 'Choisir le Service Public'],
]

/** Identifiant identique à celui des alertes email quand le site est reconnu : pas de doublon si l'annonce arrive aussi par email. */
function idFor(url: string): { id: string; url: string; site: string } {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return ''
    }
  })()
  const site = SITES.find(([re]) => re.test(host))?.[1] ?? host
  let m = /linkedin\.com\/(?:comm\/)?jobs\/view\/(?:[^/?]*-)?(\d{6,})/.exec(url) ?? /currentJobId=(\d{6,})/.exec(url)
  if (m) return { id: `mail-linkedin-${m[1]}`, url: `https://www.linkedin.com/jobs/view/${m[1]}/`, site }
  m = /francetravail\.fr\/offres\/recherche\/detail\/(\w+)/.exec(url)
  if (m) return { id: `mail-francetravail-${m[1]}`, url, site }
  m = /hellowork\.com\/fr-fr\/emplois\/(\d+)\.html/.exec(url)
  if (m) return { id: `mail-hellowork-${m[1]}`, url, site }
  m = /choisirleservicepublic\.gouv\.fr\/offre-emploi\/(?:.*reference-)?([\w-]+?)\/?$/i.exec(url)
  if (m) return { id: `csp-${m[1].toUpperCase()}`, url, site }
  return { id: `manual-${uid()}`, url, site }
}

/** Titre deviné depuis l'adresse (« .../jobs/product-owner-h-f » donne « Product Owner H F »). */
function guessTitle(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    const slug = [...parts].reverse().find((p) => /[a-z]-[a-z]/i.test(p) && !/^\d+$/.test(p))
    if (!slug) return ''
    const t = decodeURIComponent(slug.replace(/\.html?$/, '').split('_')[0])
      .replace(/-+/g, ' ')
      .replace(/\b\d{5,}\b/g, '')
      .replace(/\b([hf]) ([hf])\b/gi, (_, a: string, b: string) => `${a.toUpperCase()}/${b.toUpperCase()}`)
      .trim()
    return t.charAt(0).toUpperCase() + t.slice(1)
  } catch {
    return ''
  }
}

export function AddJobModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (id: string) => void }) {
  const addManual = useDocs((s) => s.addManual)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [location, setLocation] = useState('')
  const [text, setText] = useState('')
  const valid = /^https?:\/\/\S+\.\S+/.test(url.trim()) && title.trim().length > 2
  const reset = () => {
    setUrl('')
    setTitle('')
    setCompany('')
    setLocation('')
    setText('')
  }
  const save = () => {
    const k = idFor(url.trim())
    const now = new Date().toISOString()
    const item: FeedItem = {
      id: k.id,
      title: title.trim(),
      company: company.trim() || undefined,
      location: location.trim() || undefined,
      url: k.url,
      source: `${k.site} (ajout manuel)`,
      date: now,
      firstSeen: now,
      alerts: ['manual'],
      ...(text.trim() ? { fullText: text.trim().slice(0, 7000) } : {}),
    }
    addManual(item)
    toast.ok(text.trim() ? 'Annonce ajoutée' : 'Annonce ajoutée : son texte sera récupéré au prochain passage de la veille, si le site le permet')
    reset()
    onAdded(item.id)
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Ajouter une annonce"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" disabled={!valid} onClick={save}>
            <Link2 size={15} /> Ajouter à la liste
          </button>
        </>
      }
    >
      <div className="form-stack">
        <p className="muted small">
          L'annonce rejoint la liste avec son indice de correspondance, ses points à surveiller et le bouton « CV adapté ». Si vous ne collez pas son texte, la veille essaiera de le récupérer à son prochain passage (LinkedIn, Hellowork, Service public, Welcome to the Jungle...).
        </p>
        <Field label="Lien de l'annonce">
          <TextInput
            value={url}
            onChange={(v) => {
              setUrl(v)
              if (!title) setTitle(guessTitle(v.trim()))
            }}
            placeholder="https://..."
          />
        </Field>
        <div className="grid-2">
          <Field label="Intitulé du poste">
            <TextInput value={title} onChange={setTitle} placeholder="ex. Product Owner H/F" />
          </Field>
          <Field label="Entreprise">
            <TextInput value={company} onChange={setCompany} />
          </Field>
        </div>
        <Field label="Lieu" hint="Ville ou « Ville (34) » : sert au calcul de la distance.">
          <TextInput value={location} onChange={setLocation} placeholder="ex. Montpellier" />
        </Field>
        <Field label="Texte de l'annonce (facultatif)" hint="Collez-le pour un indice plus précis (compétences, expérience, diplôme, salaire, red flags).">
          <TextArea value={text} onChange={setText} minRows={6} />
        </Field>
      </div>
    </Modal>
  )
}
