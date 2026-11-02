import { useRef, useState } from 'react'
import { BookOpen, X, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Eye, EyeOff, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { Offer, Section, SectionItem, SectionOptions } from '../../types'
import { useRomeDrawer } from '../RomeDrawer'
import { useOffer } from '../../store/documents'
import type { RomeFiche } from '../../lib/rome'
import { SECTION_DEFS, emptyItem } from '../../data/sectionDefs'
import { uid } from '../../lib/ids'
import { stripInline } from '../../lib/inline'
import { Field, Segmented, TextArea, TextInput, Toggle } from '../ui'
import { BulletsEditor, DateInput, IconPicker, LevelInput, TagsInput } from './fields'

const OPTION_LABELS: Partial<Record<keyof SectionOptions, string>> = {
  showDates: 'Dates',
  showLocation: 'Lieu',
  showDescription: 'Description',
  showBullets: 'Puces',
  showLink: 'Lien',
  showIcons: 'Icônes',
  compact: 'Affichage compact',
}

const FORMAT_HINT = 'Mise en forme : **gras**, *italique*, [texte](lien)'

export function SectionEditor({ section, onChange, onAskClaude, offerId }: { section: Section; onChange: (s: Section) => void; onAskClaude?: (action: 'summary' | 'bullets', itemId?: string) => void; offerId?: string }) {
  const def = SECTION_DEFS[section.type]
  const [open, setOpen] = useState<string | null>(section.items.length === 1 ? section.items[0].id : null)
  const setItem = (id: string, patch: Partial<SectionItem>) => onChange({ ...section, items: section.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })
  const setOpt = (patch: Partial<SectionOptions>) => onChange({ ...section, options: { ...section.options, ...patch } })
  const moveItem = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= section.items.length) return
    const items = [...section.items]
    ;[items[i], items[j]] = [items[j], items[i]]
    onChange({ ...section, items })
  }

  if (def.single) {
    const item = section.items[0] ?? { id: uid(), description: '' }
    return (
      <div className="form-stack">
        <Field label="Titre de la section">
          <TextInput value={section.title} onChange={(v) => onChange({ ...section, title: v })} />
        </Field>
        <Field label={def.labels.description} hint={FORMAT_HINT}>
          <TextArea value={item.description} minRows={4} onChange={(v) => onChange({ ...section, items: [{ ...item, description: v }] })} placeholder={def.hint} />
        </Field>
        {section.type === 'summary' && onAskClaude && (
          <button className="btn ghost sm claude self-start" onClick={() => onAskClaude('summary')}>
            <Sparkles size={14} /> Améliorer avec Claude
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="form-stack">
      <Field label="Titre de la section">
        <TextInput value={section.title} onChange={(v) => onChange({ ...section, title: v })} />
      </Field>
      {def.options.length > 0 && (
        <div className="options-box">
          {section.type === 'skills' && (
            <Field label="Affichage">
              <Segmented
                value={section.options.skillDisplay ?? 'tags'}
                onChange={(v) => setOpt({ skillDisplay: v })}
                options={[
                  { value: 'tags', label: 'Étiquettes' },
                  { value: 'flow', label: 'En ligne avec puces' },
                  { value: 'inline', label: 'Texte' },
                  { value: 'list', label: 'Liste' },
                  { value: 'lines', label: 'Lignes' },
                  { value: 'bars', label: 'Barres' },
                  { value: 'dots', label: 'Points' },
                ]}
              />
            </Field>
          )}
          {section.type === 'languages' && (
            <Field label="Niveau">
              <Segmented
                value={section.options.levelDisplay ?? 'dots'}
                onChange={(v) => setOpt({ levelDisplay: v })}
                options={[
                  { value: 'dots', label: 'Points' },
                  { value: 'bars', label: 'Barre' },
                  { value: 'text', label: 'Texte seul' },
                ]}
              />
            </Field>
          )}
          {def.options.includes('columns') && (
            <Field label="Colonnes">
              <Segmented value={section.options.columns ?? 1} onChange={(v) => setOpt({ columns: v })} options={[{ value: 1, label: '1' }, { value: 2, label: '2' }]} />
            </Field>
          )}
          <div className="toggles">
            {def.options
              .filter((o) => OPTION_LABELS[o])
              .map((o) => (
                <Toggle key={o} label={OPTION_LABELS[o]} checked={section.options[o] !== false && (o !== 'compact' || !!section.options[o])} onChange={(v) => setOpt({ [o]: v })} />
              ))}
          </div>
        </div>
      )}

      <div className="items">
        {section.items.map((it, i) => {
          const isOpen = open === it.id
          const summary = stripInline(it.title) || (it.tags?.length ? it.tags.join(', ') : '') || 'Nouvelle entrée'
          return (
            <div key={it.id} className={`item-card${isOpen ? ' open' : ''}${it.hidden ? ' is-hidden' : ''}`}>
              <div className="item-head" onClick={() => setOpen(isOpen ? null : it.id)}>
                {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                <div className="item-sum">
                  <span className="item-title">{summary}</span>
                  {it.subtitle && <span className="item-sub">{stripInline(it.subtitle)}</span>}
                </div>
                <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="icon-btn xs" onClick={() => moveItem(i, -1)} disabled={i === 0} title="Monter">
                    <ArrowUp size={13} />
                  </button>
                  <button className="icon-btn xs" onClick={() => moveItem(i, 1)} disabled={i === section.items.length - 1} title="Descendre">
                    <ArrowDown size={13} />
                  </button>
                  <button className="icon-btn xs" onClick={() => setItem(it.id, { hidden: !it.hidden })} title={it.hidden ? 'Afficher' : 'Masquer'}>
                    {it.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button
                    className="icon-btn xs"
                    title="Dupliquer"
                    onClick={() => {
                      const copy = { ...structuredClone(it), id: uid() }
                      const items = [...section.items]
                      items.splice(i + 1, 0, copy)
                      onChange({ ...section, items })
                      setOpen(copy.id)
                    }}
                  >
                    <Copy size={13} />
                  </button>
                  <button className="icon-btn xs" title="Supprimer" onClick={() => onChange({ ...section, items: section.items.filter((x) => x.id !== it.id) })}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {isOpen && (
                <div className="item-body">
                  <ItemFields section={section} item={it} onChange={(p) => setItem(it.id, p)} onAskClaude={onAskClaude} offerId={offerId} />
                </div>
              )}
            </div>
          )
        })}
      </div>
      <button
        className="btn ghost sm self-start"
        onClick={() => {
          const it = emptyItem(section.type, uid())
          onChange({ ...section, items: [...section.items, it] })
          setOpen(it.id)
        }}
      >
        <Plus size={14} /> Ajouter {section.type === 'skills' ? 'un groupe' : 'une entrée'}
      </button>
    </div>
  )
}

function ItemFields({ section, item, onChange, onAskClaude, offerId }: { section: Section; item: SectionItem; onChange: (p: Partial<SectionItem>) => void; onAskClaude?: (a: 'summary' | 'bullets', id?: string) => void; offerId?: string }) {
  const def = SECTION_DEFS[section.type]
  const f = def.fields
  const L = def.labels
  return (
    <div className="form-stack">
      {(f.includes('icon') || f.includes('title')) && (
        <div className="row-gap">
          {f.includes('icon') && <IconPicker value={item.icon} onChange={(v) => onChange({ icon: v })} />}
          {f.includes('title') && (
            <Field label={L.title}>
              <TextInput value={item.title} onChange={(v) => onChange({ title: v })} />
              {['experience', 'volunteering'].includes(section.type) && <TitleVariants item={item} onChange={onChange} offerId={offerId} />}
            </Field>
          )}
        </div>
      )}
      {(f.includes('subtitle') || f.includes('location')) && (
        <div className="grid-2">
          {f.includes('subtitle') && (
            <Field label={L.subtitle}>
              <TextInput value={item.subtitle} onChange={(v) => onChange({ subtitle: v })} />
            </Field>
          )}
          {f.includes('location') && (
            <Field label={L.location}>
              <TextInput value={item.location} onChange={(v) => onChange({ location: v })} />
            </Field>
          )}
        </div>
      )}
      {f.includes('dates') && (
        <div className="dates-row">
          {!['certifications', 'awards', 'publications'].includes(section.type) && (
            <Field label="Début">
              <DateInput value={item.start} onChange={(v) => onChange({ start: v })} />
            </Field>
          )}
          <Field label={['certifications', 'awards', 'publications'].includes(section.type) ? 'Date' : 'Fin'}>
            <DateInput value={item.end} onChange={(v) => onChange({ end: v })} disabled={item.current} />
          </Field>
          {!['certifications', 'awards', 'publications'].includes(section.type) && <Toggle checked={!!item.current} onChange={(v) => onChange({ current: v })} label="En cours" />}
        </div>
      )}
      {f.includes('link') && (
        <Field label={L.link}>
          <TextInput value={item.link} onChange={(v) => onChange({ link: v })} placeholder="https://" />
        </Field>
      )}
      {f.includes('tags') && (
        <Field label={L.tags} hint="Entrée ou virgule pour ajouter, glisser pour réordonner.">
          <TagsInput value={item.tags ?? []} onChange={(v) => onChange({ tags: v })} />
        </Field>
      )}
      {f.includes('level') && (section.type !== 'skills' || ['bars', 'dots'].includes(section.options.skillDisplay ?? '')) && (
        <Field label={L.level}>
          <LevelInput value={item.level} onChange={(v) => onChange({ level: v })} />
        </Field>
      )}
      {f.includes('description') && (
        <Field label={L.description} hint={FORMAT_HINT}>
          <TextArea value={item.description} minRows={2} onChange={(v) => onChange({ description: v })} />
        </Field>
      )}
      {f.includes('bullets') && (
        <Field label={L.bullets}>
          <BulletsEditor value={item.bullets ?? []} onChange={(v) => onChange({ bullets: v })} onAskClaude={onAskClaude && section.type === 'experience' ? () => onAskClaude('bullets', item.id) : undefined} />
        </Field>
      )}
    </div>
  )
}

/** Variantes d'intitulé d'un poste (ex. Responsable de secteur, Chef de secteur, Manager commercial) et accès à la fiche métier. */
function TitleVariants({ item, onChange, offerId }: { item: SectionItem; onChange: (p: Partial<SectionItem>) => void; offerId?: string }) {
  const open = useRomeDrawer((s) => s.open)
  const offer = useOffer(offerId)
  const variants = item.titleVariants ?? []
  const all = [...new Set([...(item.title ? [item.title] : []), ...variants])]
  const pickRef = useRef(item)
  pickRef.current = item
  const add = (t: string) => {
    const cur = pickRef.current
    const list = [...new Set([...(cur.titleVariants ?? []), ...(cur.title ? [cur.title] : []), t])]
    onChange({ titleVariants: list })
  }
  const context = [item.subtitle, item.description, ...(item.bullets ?? [])].filter(Boolean).join(' ')
  return (
    <div className="title-variants">
      {all.length > 1 &&
        all.map((t) => (
          <span key={t} className={`title-variant${t === item.title ? ' on' : ''}`} onClick={() => onChange({ title: t, titleVariants: [...new Set([...variants, ...(item.title ? [item.title] : [])])] })} title="Utiliser cet intitulé">
            {t}
            {t !== item.title && (
              <button
                className="x"
                title="Retirer cette variante"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange({ titleVariants: variants.filter((v) => v !== t) })
                }}
              >
                <X size={11} />
              </button>
            )}
          </span>
        ))}
      <button
        className="btn ghost sm"
        onClick={() =>
          open({
            query: item.title,
            context,
            label: 'Intitulés équivalents et fiche métier',
            picked: all,
            onPick: add,
            claudePrompt: offer?.description ? (fiche) => titlePrompt(item, fiche, offer) : undefined,
          })
        }
      >
        <BookOpen size={14} /> Intitulés équivalents et fiche métier
      </button>
    </div>
  )
}

function titlePrompt(item: SectionItem, fiche: RomeFiche, offer: Offer): string {
  return `Je candidate à l'offre ci-dessous. Pour mon expérience « ${item.title} »${item.subtitle ? ` chez ${item.subtitle}` : ''}, propose les 3 intitulés de poste les plus adaptés à cette offre, choisis parmi les intitulés officiels du métier ROME ${fiche.code} (${fiche.intitule}) ou très proches, sans exagérer mon niveau de responsabilité.

Mes missions :
${[item.description, ...(item.bullets ?? [])].filter(Boolean).map((b) => `- ${b}`).join('\n')}

Intitulés officiels possibles : ${fiche.appellations.slice(0, 60).join(' ; ')}

<offre>
${offer.title ?? ''}${offer.company ? ` - ${offer.company}` : ''}
${offer.description ?? ''}
</offre>

Réponds uniquement par 3 lignes commençant par "- ", chacune au format : intitulé : raison en une phrase. Sans tiret cadratin.`
}
