import { useState } from 'react'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { EyeOff, GripVertical, Plus } from 'lucide-react'
import type { Layout, ResumeDoc, Section } from '../../types'
import { SECTION_DEFS } from '../../data/sectionDefs'
import { Icon } from '../../lib/icons'
import { Field, Segmented, Slider } from '../ui'
import { AddSectionModal, addSectionTo } from './ContentPanel'

type Col = 'main' | 'side'

function Item({ section, overlay }: { section: Section; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging && !overlay ? 0.35 : 1 }}
      className={`dnd-item${overlay ? ' overlay' : ''}`}
      {...attributes}
      {...listeners}
    >
      <GripVertical size={14} className="grip" />
      <Icon name={SECTION_DEFS[section.type].icon} size={14} />
      <span>{section.title}</span>
      {section.hidden && <EyeOff size={13} className="muted" />}
    </div>
  )
}

function Column({ id, title, ids, byId }: { id: Col; title: string; ids: string[]; byId: Map<string, Section> }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div className={`dnd-col${isOver ? ' over' : ''}`} ref={setNodeRef}>
      <div className="dnd-col-title">{title}</div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {ids.map((sid) => {
          const s = byId.get(sid)
          return s ? <Item key={sid} section={s} /> : null
        })}
      </SortableContext>
      {!ids.length && <div className="dnd-empty">Déposez une section ici</div>}
    </div>
  )
}

export function LayoutPanel({ doc, update }: { doc: ResumeDoc; update: (fn: (d: ResumeDoc) => ResumeDoc) => void }) {
  const { layout } = doc
  const byId = new Map(doc.sections.map((s) => [s.id, s]))
  const [dragId, setDragId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const setLayout = (l: Partial<Layout>) => update((d) => ({ ...d, layout: { ...d.layout, ...l } }))
  const two = layout.columns === 2

  const findCol = (id: string): Col | null => (id === 'main' || id === 'side' ? id : layout.main.includes(id) ? 'main' : layout.side.includes(id) ? 'side' : null)

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (!over) return
    const from = findCol(String(active.id))
    const to = findCol(String(over.id))
    if (!from || !to || from === to) return
    update((d) => {
      const src = d.layout[from].filter((x) => x !== active.id)
      const dst = [...d.layout[to]]
      const idx = dst.indexOf(String(over.id))
      dst.splice(idx < 0 ? dst.length : idx, 0, String(active.id))
      return { ...d, layout: { ...d.layout, [from]: src, [to]: dst } }
    })
  }
  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null)
    const { active, over } = e
    if (!over) return
    const col = findCol(String(active.id))
    if (!col || col !== findCol(String(over.id))) return
    const list = layout[col]
    const a = list.indexOf(String(active.id))
    const b = list.indexOf(String(over.id))
    if (a >= 0 && b >= 0 && a !== b) setLayout({ [col]: arrayMove(list, a, b) })
  }

  return (
    <div className="panel-content">
      <section className="style-group">
        <h3>Colonnes</h3>
        <div className="form-stack">
          <Segmented
            value={layout.columns}
            onChange={(v) =>
              update((d) => {
                if (v === 1) return { ...d, layout: { ...d.layout, columns: 1, main: [...d.layout.main, ...d.layout.side], side: [] } }
                const side = d.layout.main.filter((id) => SECTION_DEFS[byId.get(id)?.type ?? 'custom'].sidebarFriendly && byId.get(id)?.type !== 'text')
                return { ...d, layout: { ...d.layout, columns: 2, main: d.layout.main.filter((id) => !side.includes(id)), side } }
              })
            }
            options={[
              { value: 1, label: 'Une colonne' },
              { value: 2, label: 'Deux colonnes' },
            ]}
          />
          {two && (
            <>
              <Field label="Position de la colonne latérale">
                <Segmented
                  value={layout.sidebarPosition}
                  onChange={(v) => setLayout({ sidebarPosition: v })}
                  options={[
                    { value: 'left', label: 'À gauche' },
                    { value: 'right', label: 'À droite' },
                  ]}
                />
              </Field>
              <Slider label="Largeur de la colonne latérale" value={layout.sidebarWidth} min={24} max={46} step={1} unit=" %" onChange={(v) => setLayout({ sidebarWidth: v })} />
            </>
          )}
        </div>
      </section>

      <section className="style-group">
        <h3>Ordre des sections</h3>
        <p className="muted small">Glissez les sections pour les réordonner{two ? ' ou les changer de colonne' : ''}.</p>
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
          <div className={`dnd-cols${two ? ' two' : ''}${two && layout.sidebarPosition === 'left' ? ' side-left' : ''}`}>
            <Column id="main" title={two ? 'Principale' : 'Sections'} ids={layout.main} byId={byId} />
            {two && <Column id="side" title="Latérale" ids={layout.side} byId={byId} />}
          </div>
          <DragOverlay>{dragId && byId.get(dragId) ? <Item section={byId.get(dragId)!} overlay /> : null}</DragOverlay>
        </DndContext>
        <button className="btn ghost sm self-start" onClick={() => setAdding(true)}>
          <Plus size={14} /> Ajouter une section
        </button>
      </section>
      <AddSectionModal open={adding} onClose={() => setAdding(false)} onPick={(t) => update((d) => addSectionTo(d, t).doc)} />
    </div>
  )
}
