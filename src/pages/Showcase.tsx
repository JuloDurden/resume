import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Copy, Download } from 'lucide-react'
import { GithubIcon } from '../lib/icons'
import type { AnyDoc } from '../types'
import { loadShowcase, type Showcase } from '../lib/showcase'
import { loadShared, type SharedApplication } from '../lib/share'
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

/** Dossier d'une candidature (lien /c/<identifiant> donné au recruteur), présenté comme la vitrine. */
export function useSharedShowcase(slug?: string) {
  const [sc, setSc] = useState<(Showcase & { offer: SharedApplication['offer'] }) | null | undefined>(undefined)
  useEffect(() => {
    if (!slug) return setSc(null)
    loadShared(slug).then((d) =>
      setSc(d ? { publishedAt: d.publishedAt, author: d.author, offer: d.offer, documents: [d.resume, d.letter].filter((x): x is AnyDoc => !!x) } : null),
    )
  }, [slug])
  return sc
}

const niceName = (raw?: string) => (raw && raw === raw.toUpperCase() ? raw.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase()) : raw)

/** Grille de la vitrine, réutilisée sur l'accueil d'un visiteur. */
export function ShowcaseGrid({ sc, base = '/vitrine' }: { sc: Showcase; base?: string }) {
  return (
    <div className="doc-grid">
      {sc.documents.map((d) => {
        const { title, company } = docTitle(d)
        return (
          <Link key={d.id} to={`${base}/${d.id}`} className="doc-card showcase-card">
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

/** En-tête du dossier d'une candidature : à qui il s'adresse, et ce qu'est Resume. */
export function SharedIntro({ sc }: { sc: Showcase & { offer: SharedApplication['offer'] } }) {
  const poste = [sc.offer.title, sc.offer.company].filter(Boolean).join(' chez ')
  return (
    <div className="showcase-intro">
      <h2>Candidature de {niceName(sc.author) ?? 'Julien Clavel'}{poste ? ` : ${poste}` : ''}</h2>
      <p>
        Voici le CV et la lettre de motivation de cette candidature, réalisés avec <strong>Resume</strong>, l'application que j'ai conçue et développée : modèles personnalisables, aperçu paginé, export PDF lisible par les ATS, analyse des mots-clés d'une offre, veille des annonces et suivi des candidatures. Ouvrez un document pour le voir en détail ou le télécharger en PDF ; vous pouvez aussi essayer l'application : tout reste dans votre navigateur.
      </p>
      <a className="btn sm" href={REPO_URL} target="_blank" rel="noreferrer">
        <GithubIcon size={14} /> Code source
      </a>
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
  const { id, slug } = useParams()
  const vitrine = useShowcase()
  const shared = useSharedShowcase(slug)
  const sc = slug ? shared : vitrine
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
        <Link to={slug ? `/c/${slug}` : '/'} className="icon-btn" title="Retour">
          <ChevronLeft size={18} />
        </Link>
        <span className="kind-badge">{slug ? 'Candidature' : 'Vitrine'}</span>
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
