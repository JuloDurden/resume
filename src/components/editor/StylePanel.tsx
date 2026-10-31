import type { ReactNode } from 'react'
import type { StyleSettings } from '../../types'
import { FONTS } from '../../lib/fonts'
import { ColorInput, Field, Segmented, Select, Slider, TextInput, Toggle } from '../ui'

const PALETTES: { name: string; primary: string; accent: string; side?: string; sideText?: string; sideAccent?: string }[] = [
  { name: 'Marine', primary: '#1f3a5f', accent: '#2f6fb3', side: '#1f3a5f', sideText: '#e8eef6', sideAccent: '#9cc3f0' },
  { name: 'Ardoise', primary: '#1e293b', accent: '#0e7490', side: '#1e293b', sideText: '#e2e8f0', sideAccent: '#67e8f9' },
  { name: 'Forêt', primary: '#1b4332', accent: '#2d6a4f', side: '#1b4332', sideText: '#e7f3ec', sideAccent: '#95d5b2' },
  { name: 'Bordeaux', primary: '#5c1a2b', accent: '#9b2c3f', side: '#5c1a2b', sideText: '#f8e9ec', sideAccent: '#f2a7b5' },
  { name: 'Indigo', primary: '#3730a3', accent: '#4f46e5', side: '#eef2ff', sideText: '#1e1b4b', sideAccent: '#4338ca' },
  { name: 'Pétrole', primary: '#0f4c5c', accent: '#e36414', side: '#0f4c5c', sideText: '#e6f1f3', sideAccent: '#fbb36c' },
  { name: 'Graphite', primary: '#111827', accent: '#4b5563', side: '#f3f4f6', sideText: '#111827', sideAccent: '#111827' },
  { name: 'Prune', primary: '#4a1d4f', accent: '#8e3b8f', side: '#f6eef7', sideText: '#2b0f2e', sideAccent: '#7b2d7c' },
]

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="style-group">
      <h3>{title}</h3>
      <div className="form-stack">{children}</div>
    </section>
  )
}

const fontOptions = [
  ...FONTS.filter((f) => f.category === 'sans').map((f) => ({ value: f.name, label: f.name })),
  ...FONTS.filter((f) => f.category === 'serif').map((f) => ({ value: f.name, label: `${f.name} (serif)` })),
  ...FONTS.filter((f) => f.category === 'system').map((f) => ({ value: f.name, label: `${f.name} (système)` })),
]

export function StylePanel({ style, onChange, hasSidebar, isLetter }: { style: StyleSettings; onChange: (p: Partial<StyleSettings>) => void; hasSidebar: boolean; isLetter?: boolean }) {
  return (
    <div className="panel-content">
      <Group title="Palette">
        <div className="palettes">
          {PALETTES.map((p) => (
            <button
              key={p.name}
              className={`palette${style.primary === p.primary && style.accent === p.accent ? ' on' : ''}`}
              title={p.name}
              onClick={() =>
                onChange({
                  primary: p.primary,
                  accent: p.accent,
                  headerBg: p.primary,
                  ...(hasSidebar && style.sidebarBg !== '#ffffff' && style.sidebarBg !== style.pageBg ? { sidebarBg: p.side, sidebarText: p.sideText, sidebarAccent: p.sideAccent } : { sidebarAccent: p.accent }),
                })
              }
            >
              <span style={{ background: p.primary }} />
              <span style={{ background: p.accent }} />
              <em>{p.name}</em>
            </button>
          ))}
        </div>
        <div className="grid-2">
          <ColorInput label="Couleur principale" value={style.primary} onChange={(v) => onChange({ primary: v })} />
          <ColorInput label="Accent" value={style.accent} onChange={(v) => onChange({ accent: v })} />
          <ColorInput label="Texte" value={style.text} onChange={(v) => onChange({ text: v })} />
          <ColorInput label="Texte secondaire" value={style.muted} onChange={(v) => onChange({ muted: v })} />
          <ColorInput label="Fond de page" value={style.pageBg} onChange={(v) => onChange({ pageBg: v })} />
          {style.headerLayout === 'banner' && (
            <>
              <ColorInput label="Fond du bandeau" value={style.headerBg} onChange={(v) => onChange({ headerBg: v })} />
              <ColorInput label="Texte du bandeau" value={style.headerText} onChange={(v) => onChange({ headerText: v })} />
            </>
          )}
        </div>
        {hasSidebar && (
          <div className="grid-2">
            <ColorInput label="Fond colonne latérale" value={style.sidebarBg} onChange={(v) => onChange({ sidebarBg: v })} />
            <ColorInput label="Texte colonne latérale" value={style.sidebarText} onChange={(v) => onChange({ sidebarText: v })} />
            <ColorInput label="Accent colonne latérale" value={style.sidebarAccent} onChange={(v) => onChange({ sidebarAccent: v })} />
          </div>
        )}
      </Group>

      <Group title="Typographie">
        <div className="grid-2">
          <Field label="Police des titres">
            <Select value={style.fontHeading} onChange={(v) => onChange({ fontHeading: v })} options={fontOptions} />
          </Field>
          <Field label="Police du texte">
            <Select value={style.fontBody} onChange={(v) => onChange({ fontBody: v })} options={fontOptions} />
          </Field>
        </div>
        <Slider label="Taille du texte" value={style.fontSize} min={7.5} max={12.5} step={0.1} unit=" pt" onChange={(v) => onChange({ fontSize: v })} />
        <Slider label="Taille du nom" value={style.nameSize} min={14} max={40} step={0.5} unit=" pt" onChange={(v) => onChange({ nameSize: v })} />
        {!isLetter && <Slider label="Taille des titres de section" value={style.headingSize} min={8} max={16} step={0.5} unit=" pt" onChange={(v) => onChange({ headingSize: v })} />}
        <Slider label="Interligne" value={style.lineHeight} min={1.05} max={1.9} step={0.05} onChange={(v) => onChange({ lineHeight: v })} />
        <Toggle label="Texte justifié" checked={style.justify} onChange={(v) => onChange({ justify: v })} />
      </Group>

      <Group title="Espacements">
        <Slider label="Marges de page" value={style.margin} min={6} max={28} step={0.5} unit=" mm" onChange={(v) => onChange({ margin: v })} />
        <Slider label="Espace entre sections" value={style.sectionSpacing} min={1} max={14} step={0.5} unit=" mm" onChange={(v) => onChange({ sectionSpacing: v })} />
        {!isLetter && <Slider label="Espace entre entrées" value={style.itemSpacing} min={0.5} max={9} step={0.5} unit=" mm" onChange={(v) => onChange({ itemSpacing: v })} />}
        {hasSidebar && <Slider label="Espace entre colonnes" value={style.columnGap} min={3} max={16} step={0.5} unit=" mm" onChange={(v) => onChange({ columnGap: v })} />}
      </Group>

      {!isLetter && (
        <Group title="Titres de section">
          <Segmented
            value={style.headingStyle}
            onChange={(v) => onChange({ headingStyle: v })}
            options={[
              { value: 'underline', label: 'Souligné' },
              { value: 'bar', label: 'Trait' },
              { value: 'leftbar', label: 'Barre' },
              { value: 'boxed', label: 'Encadré' },
              { value: 'dotted', label: 'Pointillé' },
              { value: 'rule', label: 'Filet fin' },
              { value: 'plain', label: 'Simple' },
            ]}
          />
          <div className="toggles">
            <Toggle label="Majuscules" checked={style.headingUppercase} onChange={(v) => onChange({ headingUppercase: v })} />
            <Toggle label="Icônes" checked={style.headingIcons} onChange={(v) => onChange({ headingIcons: v })} />
            <Toggle label="Titres en gras" checked={style.headingBold !== false} onChange={(v) => onChange({ headingBold: v })} />
            <Toggle label="Intitulés des entrées en gras" checked={style.itemTitleBold !== false} onChange={(v) => onChange({ itemTitleBold: v })} />
          </div>
        </Group>
      )}

      <Group title="En-tête">
        <Field label="Disposition">
          <Segmented
            value={style.headerLayout}
            onChange={(v) => onChange({ headerLayout: v })}
            options={[
              { value: 'left', label: 'Gauche' },
              { value: 'center', label: 'Centré' },
              { value: 'split', label: 'Réparti' },
              { value: 'banner', label: 'Bandeau' },
            ]}
          />
        </Field>
        {!isLetter && (
          <Field label="Emplacement" hint={!hasSidebar && style.headerPlacement === 'sidebar' ? 'La colonne latérale n\'est pas active : en-tête affiché en haut.' : undefined}>
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
        <div className="toggles">
          <Toggle label="Afficher la photo" checked={style.showPhoto} onChange={(v) => onChange({ showPhoto: v })} />
          <Toggle label="Icônes des coordonnées" checked={style.contactIcons} onChange={(v) => onChange({ contactIcons: v })} />
          <Toggle label="Nom en majuscules" checked={!!style.nameUppercase} onChange={(v) => onChange({ nameUppercase: v })} />
          {hasSidebar && !isLetter && style.showPhoto && style.headerPlacement !== 'sidebar' && (
            <Toggle label="Photo dans la colonne latérale" checked={!!style.photoInSidebar} onChange={(v) => onChange({ photoInSidebar: v })} />
          )}
        </div>
        {style.showPhoto && (
          <>
            <Field label="Forme de la photo">
              <Segmented
                value={style.photoShape}
                onChange={(v) => onChange({ photoShape: v })}
                options={[
                  { value: 'circle', label: 'Ronde' },
                  { value: 'rounded', label: 'Arrondie' },
                  { value: 'square', label: 'Carrée' },
                ]}
              />
            </Field>
            <Slider label="Taille de la photo" value={style.photoSize} min={14} max={45} step={1} unit=" mm" onChange={(v) => onChange({ photoSize: v })} />
          </>
        )}
      </Group>

      {!isLetter && (
        <Group title="Dates et puces">
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
            <Field label="Séparateur">
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
          <Field label="Symbole des puces">
            <Segmented value={style.bullet} onChange={(v) => onChange({ bullet: v })} options={['•', '◦', '▪', '▸', '›', '✓', '-'].map((b) => ({ value: b, label: b }))} />
          </Field>
        </Group>
      )}

      <Group title="Page">
        <Segmented
          value={style.pageFormat}
          onChange={(v) => onChange({ pageFormat: v })}
          options={[
            { value: 'A4', label: 'A4 (Europe)' },
            { value: 'Letter', label: 'Letter (US)' },
          ]}
        />
      </Group>
    </div>
  )
}
