import type { ReactNode } from 'react'
import type { ContactLink, Header, Section, SectionItem, StyleSettings } from '../types'
import { Icon } from '../lib/icons'
import { toRows } from '../lib/contactRows'
import { renderInline } from '../lib/inline'
import { formatRange } from '../lib/dates'
import { SECTION_DEFS } from '../data/sectionDefs'
import type { Block } from './Paginator'

const CONTACT_ICON: Record<ContactLink['kind'], string> = {
  email: 'mail',
  phone: 'phone',
  location: 'map-pin',
  linkedin: 'linkedin',
  website: 'globe',
  github: 'github',
  other: 'link',
  info: 'star',
}

export function contactHref(c: ContactLink): string | undefined {
  const v = c.value.trim()
  if (!v) return
  switch (c.kind) {
    case 'email':
      return `mailto:${v}`
    case 'phone':
      return `tel:${v.replace(/[^\d+]/g, '')}`
    case 'location':
    case 'info':
      return undefined
    default:
      return /^https?:\/\//i.test(v) ? v : `https://${v}`
  }
}

export function Contacts({ header, style, stacked }: { header: Header; style: StyleSettings; stacked?: boolean }) {
  const items = header.contacts.filter((c) => c.value.trim())
  if (!items.length) return null
  const rows = toRows(items)
  const one = (c: ContactLink) => {
    const href = contactHref(c)
    const label = c.label || c.value
    const inner = (
      <>
        {style.contactIcons && <Icon name={CONTACT_ICON[c.kind]} size={11} className="cv-cicon" />}
        <span>{label}</span>
      </>
    )
    return href ? (
      <a key={c.id} className="cv-contact" href={href} target="_blank" rel="noreferrer">
        {inner}
      </a>
    ) : (
      <span key={c.id} className="cv-contact">
        {inner}
      </span>
    )
  }
  if (rows.length > 1 && !stacked)
    return (
      <div className="cv-contacts multi">
        {rows.map((r, i) => (
          <div className="cv-crow" key={i}>
            {r.map(one)}
          </div>
        ))}
      </div>
    )
  return (
    <div className={`cv-contacts${stacked ? ' stacked' : ''}`}>
      {rows.flat().map(one)}
    </div>
  )
}

function Photo({ header, style }: { header: Header; style: StyleSettings }) {
  if (!style.showPhoto || !header.photo) return null
  return <img className={`cv-photo shape-${style.photoShape}`} src={header.photo} alt="" />
}

/** En-tête du document. `where` indique l'emplacement (haut de page, colonne principale, colonne latérale). */
export function HeaderBlock({ header, style, where }: { header: Header; style: StyleSettings; where: 'top' | 'main' | 'sidebar' }) {
  const layout = where === 'sidebar' ? 'sidebar' : where === 'main' && style.headerLayout === 'banner' ? 'left' : style.headerLayout
  const name = <div className="cv-name">{header.name}</div>
  const title = header.title ? <div className="cv-title">{header.title}</div> : null
  if (layout === 'sidebar') {
    return (
      <div className="cv-header layout-sidebar">
        <Photo header={header} style={style} />
        {name}
        {title}
        <Contacts header={header} style={style} stacked />
      </div>
    )
  }
  if (layout === 'split') {
    return (
      <div className="cv-header layout-split">
        <div className="cv-hmain">
          <Photo header={header} style={style} />
          <div>
            {name}
            {title}
          </div>
        </div>
        <Contacts header={header} style={style} stacked />
      </div>
    )
  }
  return (
    <div className={`cv-header layout-${layout}`}>
      <Photo header={header} style={style} />
      <div className="cv-hbody">
        {name}
        {title}
        <Contacts header={header} style={style} />
      </div>
    </div>
  )
}

export function SectionHeading({ section, style }: { section: Section; style: StyleSettings }) {
  return (
    <div className={`cv-heading h-${style.headingStyle}`}>
      {style.headingIcons && <Icon name={SECTION_DEFS[section.type].icon} size={13} className="cv-hicon" />}
      <span>{section.title}</span>
    </div>
  )
}

function Bullets({ items, style }: { items: string[]; style: StyleSettings }) {
  if (!items.length) return null
  return (
    <ul className="cv-bullets">
      {items.map((b, i) => (
        <li key={i}>
          <span className="cv-bullet-mark">{style.bullet}</span>
          <span className="cv-bullet-text">{renderInline(b)}</span>
        </li>
      ))}
    </ul>
  )
}

function Level({ level, mode }: { level?: number; mode: 'dots' | 'bars' }) {
  const l = Math.max(0, Math.min(5, level ?? 0))
  if (mode === 'bars')
    return (
      <div className="cv-bar">
        <div style={{ width: `${l * 20}%` }} />
      </div>
    )
  return (
    <div className="cv-dots">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= l ? 'on' : ''} />
      ))}
    </div>
  )
}

const visibleBullets = (it: SectionItem) => (it.bullets ?? []).filter((b) => b.trim())

/** Découpe une entrée en blocs paginables : en-tête (+ premières puces) puis puces restantes. */
function entryBlocks(section: Section, item: SectionItem, style: StyleSettings, isFirst: boolean): ReactNode[] {
  const o = section.options
  const dates = o.showDates !== false ? formatRange(item, style) : ''
  const loc = o.showLocation !== false ? item.location : ''
  const link = o.showLink && item.link ? item.link : ''
  const bullets = o.showBullets !== false ? visibleBullets(item) : []
  const desc = o.showDescription !== false ? item.description : ''

  if (section.type === 'certifications' && o.compact) {
    return [
      <div className={`cv-entry compact${isFirst ? ' first' : ''}`}>
        <span className="cv-etitle">{renderInline(item.title)}</span>
        {item.subtitle && <span className="cv-esub">, {item.subtitle}</span>}
        {dates && <span className="cv-edates"> ({dates})</span>}
      </div>,
    ]
  }

  const keep = 2
  const head = (
    <div className={`cv-entry${isFirst ? ' first' : ''}`}>
      <div className="cv-erow">
        <span className="cv-etitle">{renderInline(item.title)}</span>
        {dates && <span className="cv-edates">{dates}</span>}
      </div>
      {(item.subtitle || loc) && (
        <div className="cv-erow sub">
          <span className="cv-esub">{renderInline(item.subtitle)}</span>
          {loc && <span className="cv-eloc">{loc}</span>}
        </div>
      )}
      {desc && <div className="cv-edesc">{renderInline(desc)}</div>}
      {link && (
        <a className="cv-elink" href={/^https?:/i.test(link) ? link : `https://${link}`} target="_blank" rel="noreferrer">
          <Icon name="link" size={10} />
          {link.replace(/^https?:\/\//i, '')}
        </a>
      )}
      <Bullets items={bullets.slice(0, keep)} style={style} />
    </div>
  )
  const rest = bullets.slice(keep).map((b, i) => (
    <div className="cv-entry-cont" key={i}>
      <Bullets items={[b]} style={style} />
    </div>
  ))
  return [head, ...rest]
}

function skillBlocks(section: Section, style: StyleSettings): ReactNode[] {
  const mode = section.options.skillDisplay ?? 'tags'
  const items = section.items.filter((i) => !i.hidden)
  return items.map((it, idx) => {
    const tags = (it.tags ?? []).filter((t) => t.trim())
    let body: ReactNode
    if (mode === 'tags')
      body = (
        <div className="cv-tags">
          {tags.map((t, i) => (
            <span key={i} className="cv-tag">
              {t}
            </span>
          ))}
        </div>
      )
    else if (mode === 'inline') body = <div className="cv-inline">{tags.join(', ')}</div>
    else if (mode === 'flow')
      body = (
        <div className="cv-flow">
          {tags.map((t, i) => (
            <span key={i}>{renderInline(t)}</span>
          ))}
        </div>
      )
    else if (mode === 'list')
      body = <Bullets items={tags} style={style} />
    else if (mode === 'lines')
      body = (
        <div className="cv-lines">
          {tags.map((t, i) => (
            <div key={i}>{renderInline(t)}</div>
          ))}
        </div>
      )
    else
      body = (
        <div className="cv-skill-level">
          <div className="cv-inline">{tags.join(', ')}</div>
          <Level level={it.level} mode={mode === 'bars' ? 'bars' : 'dots'} />
        </div>
      )
    return (
      <div className={`cv-skill-group${idx === 0 ? ' first' : ''}`}>
        {it.title && <div className="cv-group-title">{it.title}</div>}
        {body}
      </div>
    )
  })
}

function languageBlocks(section: Section): ReactNode[] {
  const mode = section.options.levelDisplay ?? 'dots'
  return section.items
    .filter((i) => !i.hidden)
    .map((it, idx) => (
      <div className={`cv-lang${idx === 0 ? ' first' : ''}`}>
        <div className="cv-lang-text">
          <span className="cv-etitle">{it.title}</span>
          {it.subtitle && <span className="cv-esub">{it.subtitle}</span>}
        </div>
        {(mode === 'dots' || mode === 'bars') && <Level level={it.level} mode={mode} />}
      </div>
    ))
}

function iconListBlocks(section: Section): ReactNode[] {
  const o = section.options
  const items = section.items.filter((i) => !i.hidden)
  const cols = o.columns === 2 ? 2 : 1
  const rows: SectionItem[][] = []
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols))
  return rows.map((row, idx) => (
    <div className={`cv-iconrow cols-${cols}${idx === 0 ? ' first' : ''}`}>
      {row.map((it) => (
        <div className="cv-iconitem" key={it.id}>
          {o.showIcons !== false && (
            <span className="cv-iconwrap">
              <Icon name={it.icon} size={14} />
            </span>
          )}
          <div>
            <div className="cv-etitle">{renderInline(it.title)}</div>
            {o.showDescription !== false && it.description && <div className="cv-edesc">{renderInline(it.description)}</div>}
          </div>
        </div>
      ))}
    </div>
  ))
}

function referenceBlocks(section: Section): ReactNode[] {
  return section.items
    .filter((i) => !i.hidden)
    .map((it, idx) => (
      <div className={`cv-entry${idx === 0 ? ' first' : ''}`}>
        <div className="cv-etitle">{it.title}</div>
        {it.subtitle && <div className="cv-esub">{it.subtitle}</div>}
        {section.options.showDescription !== false && it.description && <div className="cv-edesc pre">{it.description}</div>}
      </div>
    ))
}

function textBlocks(section: Section): ReactNode[] {
  const text = section.items[0]?.description ?? ''
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim())
  if (!paras.length) return [<div className="cv-text first" />]
  return paras.map((p, i) => <div className={`cv-text${i === 0 ? ' first' : ''}`}>{renderInline(p)}</div>)
}

export function sectionBlocks(section: Section, style: StyleSettings): Block[] {
  let parts: ReactNode[]
  switch (section.type) {
    case 'summary':
    case 'text':
      parts = textBlocks(section)
      break
    case 'skills':
      parts = skillBlocks(section, style)
      break
    case 'languages':
      parts = languageBlocks(section)
      break
    case 'achievements':
    case 'interests':
      parts = iconListBlocks(section)
      break
    case 'references':
      parts = referenceBlocks(section)
      break
    default:
      parts = section.items.filter((i) => !i.hidden).flatMap((it, i) => entryBlocks(section, it, style, i === 0))
  }
  const heading = <SectionHeading section={section} style={style} />
  if (!parts.length)
    return [{ key: `${section.id}:h`, sectionId: section.id, node: <div className="cv-section-start">{heading}</div> }]
  return parts.map((p, i) => ({
    key: `${section.id}:${i}`,
    sectionId: section.id,
    node:
      i === 0 ? (
        <div className="cv-section-start">
          {heading}
          {p}
        </div>
      ) : (
        p
      ),
  }))
}
