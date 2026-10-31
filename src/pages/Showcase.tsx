import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Copy, Download } from 'lucide-react'
import { GithubIcon } from '../lib/icons'
import type { AnyDoc } from '../types'
import { loadShowcase, type Showcase } from '../lib/showcase'
import { docTitle } from '../lib/offers'
import { uid } from '../lib/ids'
import { useDocs } from '../store/documents'
import { DocThumb } from '../components/DocThumb'
import { Preview, usePrint } from '../components/editor/Preview'
import { toast } from '../components/ui'

const REPO_URL = 'https://github.com/JuloDurden/resume'

function useShowcase() {
  const [sc, setSc] = useState<Showcase | null | undefined>(undefined)
  useEffect(() => {
    loadShowcase().then(setSc)
  }, [])
  return sc
}

/** Grille de la vitrine, réutilisée sur l'accueil d'un visiteur. */
export function ShowcaseGrid({ sc }: { sc: Showcase }) {
  return (
    <div className="doc-grid">
      {sc.documents.map((d) => {
        const { title, company } = docTitle(d)
        return (
          <Link key={d.id} to={`/vitrine/${d.id}`} className="doc-card showcase-card">
            <span className="doc-thumb">
              <DocThumb doc={d} width={210} />
            </span>
            <div className="doc-meta">
              <div>
                <div className="doc-badges">
                  <span className={`kind-badge ${d.kind}`}>{d.kind === 'resume' ? 'CV' : 'Lettre'}</span>
                  {company && <span className="company-badge">{company}</span>}
                </div>
                <strong>{title}</strong>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

export function ShowcaseIntro({ sc }: { sc: Showcase }) {
  return (
    <div className="showcase-intro">
      <h2>Vitrine</h2>
      <p>
        <strong>Resume</strong> est un éditeur de CV et de lettres de motivation{sc.author ? ` conçu par ${sc.author}` : ''} : modèles personnalisables, aperçu paginé, export PDF lisible par les ATS, analyse des mots-clés d'une offre et suivi des candidatures. Voici des documents réalisés avec l'application. Ouvrez-en un pour le voir en détail, ou créez votre propre CV : tout reste dans votre navigateur.
      </p>
      <a className="btn sm" href={REPO_URL} target="_blank" rel="noreferrer">
        <GithubIcon size={14} /> Code source
      </a>
    </div>
  )
}

export function ShowcaseDoc() {
  const { id } = useParams()
  const sc = useShowcase()
  const doc = sc?.documents.find((d) => d.id === id)
  const { print, portal } = usePrint(doc)
  const add = useDocs((s) => s.add)
  const navigate = useNavigate()
  if (sc === undefined) return <div className="loading">Chargement...</div>
  if (!doc) return <div className="loading">Document introuvable.</div>
  const copy = () => {
    const c: AnyDoc = { ...structuredClone(doc), id: uid(), name: `${doc.name} (copie)`, createdAt: Date.now(), updatedAt: Date.now() }
    add(c)
    toast.ok('Copie créée dans vos documents')
    navigate(c.kind === 'resume' ? `/cv/${c.id}` : `/lettre/${c.id}`)
  }
  return (
    <div className="editor">
      <header className="topbar">
        <Link to="/" className="icon-btn" title="Accueil">
          <ChevronLeft size={18} />
        </Link>
        <span className="kind-badge">Vitrine</span>
        <strong className="doc-name static">{docTitle(doc).title}</strong>
        <div className="topbar-spacer" />
        <button className="btn" onClick={copy}>
          <Copy size={16} /> Créer une copie modifiable
        </button>
        <button className="btn primary" onClick={print}>
          <Download size={16} /> PDF
        </button>
      </header>
      <div className="editor-body">
        <main className="preview-area">
          <Preview doc={doc} />
        </main>
      </div>
      {portal}
    </div>
  )
}

export function ShowcasePage() {
  const sc = useShowcase()
  return (
    <div className="dashboard">
      <header className="dash-head">
        <Link to="/" className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={30} height={30} />
          <span>Resume</span>
        </Link>
      </header>
      {sc === undefined ? <div className="loading">Chargement...</div> : sc ? (
        <>
          <ShowcaseIntro sc={sc} />
          <ShowcaseGrid sc={sc} />
        </>
      ) : (
        <div className="empty-state">
          <p>Aucune vitrine publiée pour le moment.</p>
        </div>
      )}
    </div>
  )
}

export { useShowcase }
