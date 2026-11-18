import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download, FileText, Mail } from 'lucide-react'
import { GithubIcon } from '../lib/icons'
import { loadShared, type SharedApplication } from '../lib/share'
import { Preview, usePrint } from '../components/editor/Preview'
import { Segmented } from '../components/ui'

const REPO_URL = 'https://github.com/JuloDurden/resume'

/** Page publique d'une candidature : le recruteur voit le CV et la lettre qu'il a reçus, réalisés avec Resume. */
export function SharedApplicationPage() {
  const { slug = '' } = useParams()
  const [data, setData] = useState<SharedApplication | null | undefined>(undefined)
  const [tab, setTab] = useState<'resume' | 'letter'>('resume')
  useEffect(() => {
    loadShared(slug).then((d) => {
      setData(d)
      if (d && !d.resume && d.letter) setTab('letter')
    })
  }, [slug])
  const doc = data ? (tab === 'letter' ? data.letter : data.resume) ?? data.resume ?? data.letter : undefined
  const { print, portal } = usePrint(doc)
  if (data === undefined) return <div className="loading">Chargement...</div>
  if (!data || !doc)
    return (
      <div className="dashboard">
        <div className="empty-state">
          <p>Ce dossier de candidature n'existe pas ou n'est plus en ligne.</p>
          <Link className="btn" to="/">
            Découvrir Resume
          </Link>
        </div>
      </div>
    )
  const poste = [data.offer.title, data.offer.company].filter(Boolean).join(' chez ')
  // nom saisi en capitales : « JULIEN CLAVEL » devient « Julien Clavel »
  const raw = data.author ?? ''
  const author = raw && raw === raw.toUpperCase() ? raw.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase()) : raw
  return (
    <div className="editor shared-app">
      <header className="topbar">
        <Link to="/" className="brand small" title="Découvrir Resume">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={26} height={26} />
          <span>Resume</span>
        </Link>
        <div className="shared-title">
          <strong>{author ? `Candidature de ${author}` : 'Candidature'}</strong>
          {poste && <span className="muted small">{poste}</span>}
        </div>
        <div className="topbar-spacer" />
        {data.resume && data.letter && (
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'resume', label: <><FileText size={14} /> CV</> },
              { value: 'letter', label: <><Mail size={14} /> Lettre</> },
            ]}
          />
        )}
        <button className="btn primary" onClick={print}>
          <Download size={16} /> PDF
        </button>
      </header>
      <div className="shared-intro">
        <p>
          Ce CV et cette lettre ont été réalisés avec <strong>Resume</strong>, une application que j'ai conçue, spécifiée et développée seul : éditeur de CV et de lettres, modèles, export PDF lisible par les logiciels de recrutement, analyse des mots-clés d'une offre, veille des annonces et suivi des candidatures. Tout fonctionne dans le navigateur, sans compte ni serveur.
        </p>
        <div className="row-gap">
          <Link className="btn sm" to="/">
            Essayer l'application
          </Link>
          <a className="btn sm ghost" href={REPO_URL} target="_blank" rel="noreferrer">
            <GithubIcon size={14} /> Code source
          </a>
        </div>
      </div>
      <div className="editor-body">
        <main className="preview-area">
          <Preview doc={doc} />
        </main>
      </div>
      {portal}
    </div>
  )
}
