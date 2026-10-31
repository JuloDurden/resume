import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Columns2, Copy, Eye, EyeOff, MoreVertical, Plus, Trash2 } from 'lucide-react'
import type { ResumeDoc, Section, SectionType } from '../../types'
import { SECTION_DEFS, SECTION_ORDER, emptyItem } from '../../data/sectionDefs'
import { makeSection } from '../../data/factory'
import { Icon } from '../../lib/icons'
import { uid } from '../../lib/ids'
import { Menu, MenuItem, Modal, confirmAction } from '../ui'
import { HeaderForm } from './HeaderForm'
import { SectionEditor } from './SectionEditor'

interface Props {
  doc: ResumeDoc
  update: (fn: (d: ResumeDoc) => ResumeDoc) => void
  active: string | null
  setActive: (id: string | null) => void
  onAskClaude: (action: 'summary' | 'bullets', itemId?: string) => void
}

export function addSectionTo(doc: ResumeDoc, type: SectionType): { doc: ResumeDoc; id: string } {
  const s = makeSection(type)
  s.items = [emptyItem(type, uid())]
  const toSide = doc.layout.columns === 2 && !!SECTION_DEFS[type].sidebarFriendly && type !== 'text'
  return {
    id: s.id,
    doc: {
      ...doc,
      sections: [...doc.sections, s],
      layout: toSide ? { ...doc.layout, side: [...doc.layout.side, s.id] } : { ...doc.layout, main: [...doc.layout.main, s.id] },
    },
  }
}

export function AddSectionModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (t: SectionType) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Ajouter une section" wide>
      <div className="section-picker">
        {SECTION_ORDER.map((t) => {
          const d = SECTION_DEFS[t]
          return (
            <button
              key={t}
              className="section-pick"
              onClick={() => {
                onPick(t)
                onClose()
              }}
            >
              <Icon name={d.icon} size={18} />
              <span className="sp-label">{d.label}</span>
              <span className="sp-hint">{d.hint}</span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

export function ContentPanel({ doc, update, active, setActive, onAskClaude }: Props) {
  const [adding, setAdding] = useState(false)
  const refs = useRef<Record<string, HTMLDivElement | null>>({})
  const order = [...doc.layout.main, ...doc.layout.side]
  const byId = new Map(doc.sections.map((s) => [s.id, s]))

  useEffect(() => {
    if (active) refs.current[active]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [active])

  const setSection = (s: Section) => update((d) => ({ ...d, sections: d.sections.map((x) => (x.id === s.id ? s : x)) }))
  const column = (id: string) => (doc.layout.side.includes(id) ? 'side' : 'main')

  const move = (id: string, dir: -1 | 1) =>
    update((d) => {
      const col = d.layout.side.includes(id) ? 'side' : 'main'
      const list = [...d.layout[col]]
      const i = list.indexOf(id)
      const j = i + dir
      if (j < 0 || j >= list.length) return d
      ;[list[i], list[j]] = [list[j], list[i]]
      return { ...d, layout: { ...d.layout, [col]: list } }
    })

  const switchColumn = (id: string) =>
    update((d) => {
      const inSide = d.layout.side.includes(id)
      return {
        ...d,
        layout: {
          ...d.layout,
          main: inSide ? [...d.layout.main, id] : d.layout.main.filter((x) => x !== id),
          side: inSide ? d.layout.side.filter((x) => x !== id) : [...d.layout.side, id],
        },
      }
    })

  const remove = (id: string) => {
    const s = byId.get(id)
    if (!confirmAction(`Supprimer la section « ${s?.title} » ?`)) return
    update((d) => ({ ...d, sections: d.sections.filter((x) => x.id !== id), layout: { ...d.layout, main: d.layout.main.filter((x) => x !== id), side: d.layout.side.filter((x) => x !== id) } }))
  }

  const duplicate = (id: string) =>
    update((d) => {
      const s = d.sections.find((x) => x.id === id)
      if (!s) return d
      const copy: Section = { ...structuredClone(s), id: uid(), title: `${s.title} (copie)` }
      copy.items = copy.items.map((i) => ({ ...i, id: uid() }))
      const col = d.layout.side.includes(id) ? 'side' : 'main'
      const list = [...d.layout[col]]
      list.splice(list.indexOf(id) + 1, 0, copy.id)
      return { ...d, sections: [...d.sections, copy], layout: { ...d.layout, [col]: list } }
    })

  const renderSection = (id: string) => {
    const s = byId.get(id)
    if (!s) return null
    const isOpen = active === id
    const col = column(id)
    return (
      <div key={id} ref={(el) => void (refs.current[id] = el)} className={`sec-card${isOpen ? ' open' : ''}${s.hidden ? ' is-hidden' : ''}`}>
        <div className="sec-head" onClick={() => setActive(isOpen ? null : id)}>
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Icon name={SECTION_DEFS[s.type].icon} size={16} className="sec-icon" />
          <span className="sec-title">{s.title || SECTION_DEFS[s.type].label}</span>
          {SECTION_DEFS[s.type].single ? null : <span className="sec-count">{s.items.length}</span>}
          <div className="row-actions" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn xs" onClick={() => move(id, -1)} title="Monter">
              <ArrowUp size={14} />
            </button>
            <button className="icon-btn xs" onClick={() => move(id, 1)} title="Descendre">
              <ArrowDown size={14} />
            </button>
            <button className="icon-btn xs" onClick={() => setSection({ ...s, hidden: !s.hidden })} title={s.hidden ? 'Afficher la section' : 'Masquer la section'}>
              {s.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <Menu
              align="right"
              trigger={(t) => (
                <button className="icon-btn xs" onClick={t} title="Plus d'actions">
                  <MoreVertical size={14} />
                </button>
              )}
            >
              {(close) => (
                <>
                  {doc.layout.columns === 2 && (
                    <MenuItem
                      icon={<Columns2 size={14} />}
                      onClick={() => {
                        switchColumn(id)
                        close()
                      }}
                    >
                      Déplacer vers la colonne {col === 'side' ? 'principale' : 'latérale'}
                    </MenuItem>
                  )}
                  <MenuItem
                    icon={<Copy size={14} />}
                    onClick={() => {
                      duplicate(id)
                      close()
                    }}
                  >
                    Dupliquer la section
                  </MenuItem>
                  <MenuItem
                    danger
                    icon={<Trash2 size={14} />}
                    onClick={() => {
                      close()
                      remove(id)
                    }}
                  >
                    Supprimer la section
                  </MenuItem>
                </>
              )}
            </Menu>
          </div>
        </div>
        {isOpen && (
          <div className="sec-body">
            <SectionEditor section={s} onChange={setSection} onAskClaude={onAskClaude} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="panel-content">
      <div ref={(el) => void (refs.current.header = el)} className={`sec-card${active === 'header' ? ' open' : ''}`}>
        <div className="sec-head" onClick={() => setActive(active === 'header' ? null : 'header')}>
          {active === 'header' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Icon name="user" size={16} className="sec-icon" />
          <span className="sec-title">En-tête et coordonnées</span>
        </div>
        {active === 'header' && (
          <div className="sec-body">
            <HeaderForm header={doc.header} onChange={(h) => update((d) => ({ ...d, header: h }))} />
          </div>
        )}
      </div>

      {doc.layout.columns === 2 ? (
        <>
          <div className="col-label">Colonne principale</div>
          {doc.layout.main.map(renderSection)}
          <div className="col-label">Colonne latérale</div>
          {doc.layout.side.map(renderSection)}
          {!doc.layout.side.length && <div className="empty-col">Aucune section. Utilisez le menu d'une section pour la déplacer ici.</div>}
        </>
      ) : (
        order.map(renderSection)
      )}

      <button className="btn add-section" onClick={() => setAdding(true)}>
        <Plus size={16} /> Ajouter une section
      </button>
      <AddSectionModal
        open={adding}
        onClose={() => setAdding(false)}
        onPick={(t) => {
          let newId = ''
          update((d) => {
            const r = addSectionTo(d, t)
            newId = r.id
            return r.doc
          })
          setTimeout(() => setActive(newId), 0)
        }}
      />
    </div>
  )
}
