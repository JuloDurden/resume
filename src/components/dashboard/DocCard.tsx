import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bookmark, BookmarkMinus, Briefcase, Copy, FileJson, FilePlus2, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import type { AnyDoc } from '../../types'
import { useDocs } from '../../store/documents'
import { docTitle } from '../../lib/offers'
import { download, offersOf, safeFileName, toJson } from '../../lib/export'
import { DocThumb } from '../DocThumb'
import { OfferLogo } from '../editor/AtsPanel'
import { Menu, MenuItem, Modal, Select, confirmAction, toast } from '../ui'

const fmt = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export const openPath = (d: AnyDoc) => (d.kind === 'resume' ? `/cv/${d.id}` : `/lettre/${d.id}`)

/** Choix de l'offre à laquelle rattacher un document. */
export function LinkOfferModal({ doc, onClose }: { doc: AnyDoc; onClose: () => void }) {
  const offers = useDocs((s) => s.offers)
  const update = useDocs((s) => s.update)
  const [value, setValue] = useState(doc.offerId ?? '')
  const list = Object.values(offers).sort((a, b) => b.createdAt - a.createdAt)
  return (
    <Modal
      open
      onClose={onClose}
      title="Rattacher à une offre"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn primary"
            onClick={() => {
              update(doc.id, (d) => ({ ...d, offerId: value || undefined }))
              onClose()
            }}
          >
            Enregistrer
          </button>
        </>
      }
    >
      {list.length ? (
        <Select value={value} onChange={setValue} options={[{ value: '', label: 'Aucune offre' }, ...list.map((o) => ({ value: o.id, label: [o.title || 'Sans titre', o.company].filter(Boolean).join(' - ') }))]} />
      ) : (
        <p className="muted">Aucune offre pour l'instant : créez-en une depuis la vue « Offres ».</p>
      )}
    </Modal>
  )
}

export function DocCard({ doc, width = 210, compact }: { doc: AnyDoc; width?: number; compact?: boolean }) {
  const navigate = useNavigate()
  const offer = useDocs((s) => (doc.offerId ? s.offers[doc.offerId] : undefined))
  const { remove, duplicate, update } = useDocs.getState()
  const [linking, setLinking] = useState(false)
  const { title, company } = docTitle(doc, offer)
  return (
    <div className={`doc-card${compact ? ' compact' : ''}${doc.kind === 'resume' && doc.reference ? ' reference' : ''}`}>
      <button className="doc-thumb" onClick={() => navigate(openPath(doc))} aria-label={`Ouvrir ${doc.name}`}>
        <DocThumb doc={doc} width={width} />
      </button>
      <div className="doc-meta">
        <div>
          <div className="doc-badges">
            <span className={`kind-badge ${doc.kind}`}>{doc.kind === 'resume' ? 'CV' : 'Lettre'}</span>
            {doc.kind === 'resume' && doc.reference && (
              <span className="ref-badge" title="CV de référence : à dupliquer pour chaque candidature">
                <Bookmark size={11} /> Référence
              </span>
            )}
            {company && (
              <span className="company-badge" title={company}>
                {offer && <OfferLogo offer={offer} size={14} />}
                {company}
              </span>
            )}
          </div>
          <strong title={doc.name}>{title}</strong>
          {!compact && <span className="muted small">Modifié le {fmt(doc.updatedAt)}</span>}
        </div>
        <Menu
          align="right"
          trigger={(t) => (
            <button className="icon-btn" onClick={t} title="Actions">
              <MoreVertical size={16} />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                icon={<Pencil size={14} />}
                onClick={() => {
                  close()
                  const n = window.prompt('Nouveau nom (conseil : « Poste souhaité - Entreprise »)', doc.name)
                  if (n?.trim()) update(doc.id, (x) => ({ ...x, name: n.trim() }))
                }}
              >
                Renommer
              </MenuItem>
              <MenuItem
                icon={<Briefcase size={14} />}
                onClick={() => {
                  close()
                  setLinking(true)
                }}
              >
                Rattacher à une offre
              </MenuItem>
              {doc.kind === 'resume' && doc.reference && (
                <MenuItem
                  icon={<FilePlus2 size={14} />}
                  onClick={() => {
                    close()
                    const id = duplicate(doc.id)
                    if (!id) return
                    update(id, (d) => ({ ...d, name: `${doc.name.replace(/\s*\(référence\)$/i, '')} - candidature` }))
                    navigate(`/cv/${id}`)
                  }}
                >
                  Nouveau CV depuis cette référence
                </MenuItem>
              )}
              <MenuItem
                icon={<Copy size={14} />}
                onClick={() => {
                  close()
                  duplicate(doc.id)
                  toast.ok('Document dupliqué')
                }}
              >
                Dupliquer
              </MenuItem>
              {doc.kind === 'resume' && (
                <MenuItem
                  icon={doc.reference ? <BookmarkMinus size={14} /> : <Bookmark size={14} />}
                  onClick={() => {
                    close()
                    update(doc.id, (d) => ({ ...d, reference: !doc.reference }))
                    toast.ok(doc.reference ? 'Retiré des CV de référence' : 'CV de référence : dupliquez-le pour chaque candidature')
                  }}
                >
                  {doc.reference ? 'Retirer des CV de référence' : 'Définir comme CV de référence'}
                </MenuItem>
              )}
              <MenuItem
                icon={<FileJson size={14} />}
                onClick={() => {
                  close()
                  download(`${safeFileName(doc.name)}.json`, toJson([doc], offersOf([doc], useDocs.getState().offers)))
                }}
              >
                Exporter en JSON
              </MenuItem>
              <MenuItem
                danger
                icon={<Trash2 size={14} />}
                onClick={() => {
                  close()
                  if (confirmAction(`Supprimer définitivement « ${doc.name} » ?`)) remove(doc.id)
                }}
              >
                Supprimer
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
      {linking && <LinkOfferModal doc={doc} onClose={() => setLinking(false)} />}
    </div>
  )
}
