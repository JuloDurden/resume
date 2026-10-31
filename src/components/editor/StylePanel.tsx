import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Minus, Plus, Settings2 } from 'lucide-react'
import type { HeaderLayout, HeadingStyle, PhotoShape, StyleSettings } from '../../types'
import { FONTS, ensureFont, fontStack } from '../../lib/fonts'
import { ColorInput, Field, Segmented, Select, Slider, TextInput, Toggle } from '../ui'

interface Palette {
  name: string
  primary: string
  accent: string
  side: string
  sideText: string
  sideAccent: string
}

const PALETTES: Palette[] = [
  { name: 'Marine', primary: '#1f3a5f', accent: '#2f6fb3', side: '#1f3a5f', sideText: '#e8eef6', sideAccent: '#9cc3f0' },
  { name: 'Sarcelle', primary: '#2b2f33', accent: '#139c9e', side: '#006666', sideText: '#ffffff', sideAccent: '#ffffff' },
  { name: 'Ardoise', primary: '#1e293b', accent: '#0e7490', side: '#1e293b', sideText: '#e2e8f0', sideAccent: '#67e8f9' },
  { name: 'Forêt', primary: '#1b4332', accent: '#2d6a4f', side: '#1b4332', sideText: '#e7f3ec', sideAccent: '#95d5b2' },
  { name: 'Bordeaux', primary: '#5c1a2b', accent: '#9b2c3f', side: '#5c1a2b', sideText: '#f8e9ec', sideAccent: '#f2a7b5' },
  { name: 'Pétrole', primary: '#0f4c5c', accent: '#e36414', side: '#0f4c5c', sideText: '#e6f1f3', sideAccent: '#fbb36c' },
  { name: 'Indigo', primary: '#3730a3', accent: '#4f46e5', side: '#eef2ff', sideText: '#1e1b4b', sideAccent: '#4338ca' },
  { name: 'Prune', primary: '#4a1d4f', accent: '#8e3b8f', side: '#f6eef7', sideText: '#2b0f2e', sideAccent: '#7b2d7c' },
  { name: 'Graphite', primary: '#111827', accent: '#4b5563', side: '#f3f4f6', sideText: '#111827', sideAccent: '#111827' },
]

/* ---------- Briques visuelles ---------- */

function Block({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="sp-block">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

/** Curseur à crans nommés, à la manière d'un sélecteur de niveau. */
function Steps({ label, values, labels, value, onChange, ends }: { label: string; values: number[]; labels: string[]; value: number; onChange: (v: number) => void; ends?: [string, string] }) {
  const idx = values.reduce((best, v, i) => (Math.abs(v - value) < Math.abs(values[best] - value) ? i : best), 0)
  const exact = Math.abs(values[idx] - value) < 0.001
  return (
    <div className="steps">
      <div className="steps-label">
        {label} : <strong>{labels[idx]}</strong>
      </div>
      <div className="steps-row">
        <button className="icon-btn xs" disabled={idx === 0 && exact} onClick={() => onChange(values[exact ? idx - 1 : idx] ?? values[0])} aria-label="Moins">
          <Minus size={14} />
        </button>
        <div className="steps-track">
          {values.map((v, i) => (
            <button key={v} className={`steps-dot${i === idx ? ' on' : ''}${i < idx ? ' past' : ''}`} onClick={() => onChange(v)} title={labels[i]} aria-label={labels[i]} />
          ))}
          <div className="steps-fill" style={{ width: `${(idx / (values.length - 1)) * 100}%` }} />
        </div>
        <button className="icon-btn xs" disabled={idx === values.length - 1 && exact} onClick={() => onChange(values[exact ? idx + 1 : idx] ?? values[values.length - 1])} aria-label="Plus">
          <Plus size={14} />
        </button>
      </div>
      {ends && (
        <div className="steps-ends">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
    </div>
  )
}

function Picto<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string; art: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="pictos">
      {options.map((o) => (
        <button key={String(o.value)} className={`picto${o.value === value ? ' on' : ''}`} onClick={() => onChange(o.value)} title={o.label}>
          <span className="picto-art">{o.art}</span>
          <span className="picto-label">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

function FontPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    FONTS.forEach((f) => ensureFont(f.name))
    const on = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', on)
    return () => document.removeEventListener('mousedown', on)
  }, [open])
  useEffect(() => ensureFont(value), [value])
  const groups: [string, typeof FONTS][] = [
    ['Sans empattement', FONTS.filter((f) => f.category === 'sans')],
    ['Avec empattement', FONTS.filter((f) => f.category === 'serif')],
    ['Polices système', FONTS.filter((f) => f.category === 'system')],
  ]
  return (
    <div className="font-picker" ref={ref}>
      <span className="field-label">{label}</span>
      <button className="font-current" onClick={() => setOpen((o) => !o)} style={{ fontFamily: fontStack(value) }}>
        {value}
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="font-list">
          {groups.map(([g, list]) => (
            <div key={g}>
              <div className="font-group">{g}</div>
              {list.map((f) => (
                <button
                  key={f.name}
                  className={f.name === value ? 'on' : ''}
                  style={{ fontFamily: fontStack(f.name) }}
                  onClick={() => {
                    onChange(f.name)
                    setOpen(false)
                  }}
                >
                  {f.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- Petits dessins ---------- */

const COLUMN_ART = {
  one: (
    <span className="art-page">
      <span className="art-col" style={{ flex: 1 }} />
    </span>
  ),
  left: (
    <span className="art-page">
      <span className="art-col fill" style={{ flex: 0.55 }} />
      <span className="art-col" style={{ flex: 1 }} />
    </span>
  ),
  right: (
    <span className="art-page">
      <span className="art-col" style={{ flex: 1 }} />
      <span className="art-col fill" style={{ flex: 0.55 }} />
    </span>
  ),
}

function HeadingArt({ kind }: { kind: HeadingStyle }) {
  return (
    <span className={`art-heading ah-${kind}`}>
      <b>TITRE</b>
    </span>
  )
}

function HeaderArt({ kind }: { kind: HeaderLayout }) {
  return (
    <span className={`art-header ahd-${kind}`}>
      <span className="ahd-name" />
      <span className="ahd-line" />
      {kind === 'split' && <span className="ahd-side" />}
    </span>
  )
}

/* ---------- Panneau ---------- */

interface Props {
  style: StyleSettings
  onChange: (p: Partial<StyleSettings>) => void
  hasSidebar: boolean
  isLetter?: boolean
  columns?: { columns: 1 | 2; position: 'left' | 'right' }
  onColumns?: (columns: 1 | 2, position: 'left' | 'right') => void
}

export function StylePanel({ style, onChange, hasSidebar, isLetter, columns, onColumns }: Props) {
  const [customColors, setCustomColors] = useState(false)
  const darkSidebar = hasSidebar && style.sidebarBg.toLowerCase() !== style.pageBg.toLowerCase()
  const applyPalette = (p: Palette) =>
    onChange({
      primary: p.primary,
      accent: p.accent,
      headerBg: p.primary === '#2b2f33' ? p.side : p.primary,
      ...(darkSidebar ? { sidebarBg: p.side, sidebarText: p.sideText, sidebarAccent: p.sideAccent } : { sidebarAccent: p.accent }),
    })
  const colKey = !columns ? 'one' : columns.columns === 1 ? 'one' : columns.position

  return (
    <div className="panel-content style-panel">
      <Block title="Couleurs">
        <div className="swatches">
          {PALETTES.map((p) => {
            const on = style.accent === p.accent && (style.primary === p.primary || (darkSidebar && style.sidebarBg === p.side))
            return (
              <button key={p.name} className={`swatch${on ? ' on' : ''}`} title={p.name} onClick={() => applyPalette(p)} style={{ background: darkSidebar ? p.side : p.primary }}>
                <span style={{ background: p.accent }} />
              </button>
            )
          })}
          <button className={`swatch custom${customColors ? ' on' : ''}`} title="Couleurs personnalisées" onClick={() => setCustomColors((c) => !c)}>
            <Plus size={16} />
          </button>
        </div>
        {customColors && (
          <div className="grid-2 custom-colors">
            <ColorInput label="Principale" value={style.primary} onChange={(v) => onChange({ primary: v })} />
            <ColorInput label="Accent" value={style.accent} onChange={(v) => onChange({ accent: v })} />
            {hasSidebar && <ColorInput label="Fond colonne latérale" value={style.sidebarBg} onChange={(v) => onChange({ sidebarBg: v })} />}
            {hasSidebar && <ColorInput label="Texte colonne latérale" value={style.sidebarText} onChange={(v) => onChange({ sidebarText: v })} />}
            {hasSidebar && <ColorInput label="Accent colonne latérale" value={style.sidebarAccent} onChange={(v) => onChange({ sidebarAccent: v })} />}
            {style.headerLayout === 'banner' && <ColorInput label="Fond du bandeau" value={style.headerBg} onChange={(v) => onChange({ headerBg: v })} />}
            <ColorInput label="Texte" value={style.text} onChange={(v) => onChange({ text: v })} />
            <ColorInput label="Texte secondaire" value={style.muted} onChange={(v) => onChange({ muted: v })} />
            <ColorInput label="Fond de page" value={style.pageBg} onChange={(v) => onChange({ pageBg: v })} />
          </div>
        )}
      </Block>

      <Block title="Police">
        <div className="grid-2">
          <FontPicker label="Titres" value={style.fontHeading} onChange={(v) => onChange({ fontHeading: v })} />
          <FontPicker label="Texte" value={style.fontBody} onChange={(v) => onChange({ fontBody: v })} />
        </div>
        <Steps label="Taille du texte" values={[7.8, 8.6, 9.4, 10.2, 11]} labels={['très petite', 'petite', 'moyenne', 'grande', 'très grande']} value={style.fontSize} onChange={(v) => onChange({ fontSize: v })} ends={['A', 'A+']} />
        <Steps label="Interligne" values={[1.15, 1.25, 1.35, 1.45, 1.6]} labels={['serré', 'condensé', 'normal', 'aéré', 'spacieux']} value={style.lineHeight} onChange={(v) => onChange({ lineHeight: v })} ends={['condensé', 'spacieux']} />
      </Block>

      <Block title="Espacements">
        <Steps label="Marges de page" values={[7, 9, 12, 15, 19]} labels={['très étroites', 'étroites', 'normales', 'larges', 'très larges']} value={style.margin} onChange={(v) => onChange({ margin: v })} ends={['étroit', 'large']} />
        <Steps label="Espace entre sections" values={[2.5, 4, 5.5, 7, 9]} labels={['très compact', 'compact', 'normal', 'aéré', 'très aéré']} value={style.sectionSpacing} onChange={(v) => onChange({ sectionSpacing: v })} ends={['compact', "plus d'espace"]} />
      </Block>

      {columns && onColumns && (
        <Block title="Disposition des colonnes">
          <Picto
            value={colKey}
            onChange={(k) => (k === 'one' ? onColumns(1, columns.position) : onColumns(2, k as 'left' | 'right'))}
            options={[
              { value: 'one', label: 'Une colonne', art: COLUMN_ART.one },
              { value: 'left', label: 'Latérale à gauche', art: COLUMN_ART.left },
              { value: 'right', label: 'Latérale à droite', art: COLUMN_ART.right },
            ]}
          />
        </Block>
      )}

      {!isLetter && (
        <Block title="Titres de section">
          <Picto
            value={style.headingStyle}
            onChange={(v) => onChange({ headingStyle: v })}
            options={(['underline', 'rule', 'bar', 'leftbar', 'boxed', 'dotted', 'plain'] as HeadingStyle[]).map((k) => ({
              value: k,
              label: { underline: 'Souligné', rule: 'Filet fin', bar: 'Trait court', leftbar: 'Barre', boxed: 'Encadré', dotted: 'Pointillé', plain: 'Simple' }[k],
              art: <HeadingArt kind={k} />,
            }))}
          />
          <div className="toggles">
            <Toggle label="Majuscules" checked={style.headingUppercase} onChange={(v) => onChange({ headingUppercase: v })} />
            <Toggle label="Gras" checked={style.headingBold !== false} onChange={(v) => onChange({ headingBold: v })} />
            <Toggle label="Icônes" checked={style.headingIcons} onChange={(v) => onChange({ headingIcons: v })} />
          </div>
        </Block>
      )}

      {!isLetter && (
        <Block title="Intitulés des entrées (postes, projets, diplômes)">
          <Steps label="Taille" values={[100, 108, 116, 125, 135]} labels={['comme le texte', 'un peu plus grande', 'plus grande', 'grande', 'très grande']} value={style.itemTitleSize ?? 100} onChange={(v) => onChange({ itemTitleSize: v })} />
          <div className="row-wrap">
            <Field label="Couleur">
              <div className="mini-swatches">
                {(['text', 'primary', 'accent'] as const).map((c) => (
                  <button
                    key={c}
                    className={`mini-swatch${(style.itemTitleColor ?? 'text') === c ? ' on' : ''}`}
                    style={{ background: c === 'text' ? style.text : c === 'primary' ? style.primary : style.accent }}
                    title={{ text: 'Couleur du texte', primary: 'Couleur principale', accent: 'Accent' }[c]}
                    onClick={() => onChange({ itemTitleColor: c })}
                  />
                ))}
              </div>
            </Field>
            <Field label="Police">
              <Segmented
                value={style.itemTitleFont ?? 'body'}
                onChange={(v) => onChange({ itemTitleFont: v })}
                options={[
                  { value: 'body', label: 'Du texte' },
                  { value: 'heading', label: 'Des titres' },
                ]}
              />
            </Field>
          </div>
          <Toggle label="En gras" checked={style.itemTitleBold !== false} onChange={(v) => onChange({ itemTitleBold: v })} />
        </Block>
      )}

      <Block title="En-tête">
        <Picto
          value={style.headerLayout}
          onChange={(v) => onChange({ headerLayout: v })}
          options={(['left', 'center', 'split', 'banner'] as HeaderLayout[]).map((k) => ({ value: k, label: { left: 'À gauche', center: 'Centré', split: 'Réparti', banner: 'Bandeau' }[k], art: <HeaderArt kind={k} /> }))}
        />
        <div className="toggles">
          <Toggle label="Nom en majuscules" checked={!!style.nameUppercase} onChange={(v) => onChange({ nameUppercase: v })} />
          <Toggle label="Icônes des coordonnées" checked={style.contactIcons} onChange={(v) => onChange({ contactIcons: v })} />
        </div>
      </Block>

      <Block title="Photo">
        <Toggle label="Afficher la photo" checked={style.showPhoto} onChange={(v) => onChange({ showPhoto: v })} />
        {style.showPhoto && (
          <>
            <Picto
              value={style.photoShape}
              onChange={(v) => onChange({ photoShape: v })}
              options={(['circle', 'rounded', 'square'] as PhotoShape[]).map((k) => ({ value: k, label: { circle: 'Ronde', rounded: 'Arrondie', square: 'Carrée' }[k], art: <span className={`art-photo ap-${k}`} /> }))}
            />
            {hasSidebar && !isLetter && style.headerPlacement !== 'sidebar' && (
              <Toggle label="Placer la photo dans la colonne latérale" checked={!!style.photoInSidebar} onChange={(v) => onChange({ photoInSidebar: v })} />
            )}
          </>
        )}
      </Block>

      <details className="sp-advanced">
        <summary>
          <Settings2 size={15} /> Réglages fins
        </summary>
        <div className="form-stack">
          <Slider label="Taille du texte" value={style.fontSize} min={7.5} max={12.5} step={0.1} unit=" pt" onChange={(v) => onChange({ fontSize: v })} />
          <Slider label="Taille du nom" value={style.nameSize} min={14} max={40} step={0.5} unit=" pt" onChange={(v) => onChange({ nameSize: v })} />
          {!isLetter && <Slider label="Taille des titres de section" value={style.headingSize} min={8} max={16} step={0.5} unit=" pt" onChange={(v) => onChange({ headingSize: v })} />}
          {!isLetter && <Slider label="Taille des intitulés d'entrées" value={style.itemTitleSize ?? 100} min={90} max={150} step={1} unit=" %" onChange={(v) => onChange({ itemTitleSize: v })} />}
          <Slider label="Interligne" value={style.lineHeight} min={1.05} max={1.9} step={0.05} onChange={(v) => onChange({ lineHeight: v })} />
          <Slider label="Marges de page" value={style.margin} min={6} max={28} step={0.5} unit=" mm" onChange={(v) => onChange({ margin: v })} />
          <Slider label="Espace entre sections" value={style.sectionSpacing} min={1} max={14} step={0.5} unit=" mm" onChange={(v) => onChange({ sectionSpacing: v })} />
          {!isLetter && <Slider label="Espace entre entrées" value={style.itemSpacing} min={0.5} max={9} step={0.5} unit=" mm" onChange={(v) => onChange({ itemSpacing: v })} />}
          {hasSidebar && <Slider label="Espace entre colonnes" value={style.columnGap} min={3} max={16} step={0.5} unit=" mm" onChange={(v) => onChange({ columnGap: v })} />}
          {style.showPhoto && <Slider label="Taille de la photo" value={style.photoSize} min={14} max={45} step={1} unit=" mm" onChange={(v) => onChange({ photoSize: v })} />}
          <Toggle label="Texte justifié" checked={style.justify} onChange={(v) => onChange({ justify: v })} />
          {!isLetter && (
            <Field label="Emplacement de l'en-tête">
              <Segmented
                value={style.headerPlacement}
                onChange={(v) => onChange({ headerPlacement: v })}
                options={[
                  { value: 'top', label: 'Pleine largeur' },
                  { value: 'main', label: 'Colonne principale' },
                  { value: 'sidebar', label: 'Colonne latérale' },
                ]}
              />
            </Field>
          )}
          {!isLetter && (
            <>
              <div className="grid-2">
                <Field label="Format des dates">
                  <Select
                    value={style.dateFormat}
                    onChange={(v) => onChange({ dateFormat: v })}
                    options={[
                      { value: 'MM/YYYY', label: '03/2024' },
                      { value: 'MMM YYYY', label: 'mars 2024' },
                      { value: 'MMMM YYYY', label: 'Mars 2024' },
                      { value: 'YYYY', label: '2024' },
                    ]}
                  />
                </Field>
                <Field label="Séparateur des dates">
                  <Select
                    value={style.dateSeparator}
                    onChange={(v) => onChange({ dateSeparator: v })}
                    options={[
                      { value: ' - ', label: '2020 - 2024' },
                      { value: ' à ', label: '2020 à 2024' },
                      { value: ' > ', label: '2020 > 2024' },
                      { value: ' / ', label: '2020 / 2024' },
                    ]}
                  />
                </Field>
              </div>
              <Field label="Libellé du poste en cours">
                <TextInput value={style.currentLabel} onChange={(v) => onChange({ currentLabel: v })} />
              </Field>
              <Field label="Symbole des puces et séparateurs">
                <Segmented value={style.bullet} onChange={(v) => onChange({ bullet: v })} options={['•', '◦', '▪', '▸', '›', '✓', '-', '|'].map((b) => ({ value: b, label: b }))} />
              </Field>
            </>
          )}
          <Field label="Format de page">
            <Segmented
              value={style.pageFormat}
              onChange={(v) => onChange({ pageFormat: v })}
              options={[
                { value: 'A4', label: 'A4 (Europe)' },
                { value: 'Letter', label: 'Letter (US)' },
              ]}
            />
          </Field>
        </div>
      </details>
    </div>
  )
}

