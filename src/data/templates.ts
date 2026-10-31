import type { Layout, ResumeDoc, SectionType, StyleSettings } from '../types'

export const BASE_STYLE: StyleSettings = {
  fontHeading: 'Inter',
  fontBody: 'Inter',
  fontSize: 9.5,
  nameSize: 24,
  headingSize: 11,
  lineHeight: 1.4,
  margin: 14,
  sectionSpacing: 6,
  itemSpacing: 3.5,
  columnGap: 8,
  primary: '#1f3a5f',
  accent: '#2f6fb3',
  text: '#1f2933',
  muted: '#5b6773',
  pageBg: '#ffffff',
  sidebarBg: '#ffffff',
  sidebarText: '#1f2933',
  sidebarAccent: '#2f6fb3',
  headerBg: '#1f3a5f',
  headerText: '#ffffff',
  headingStyle: 'underline',
  headingUppercase: true,
  headingIcons: false,
  headerLayout: 'left',
  headerPlacement: 'top',
  showPhoto: false,
  photoShape: 'circle',
  photoSize: 26,
  contactIcons: true,
  dateFormat: 'MM/YYYY',
  dateSeparator: ' - ',
  currentLabel: 'Aujourd\'hui',
  bullet: '•',
  pageFormat: 'A4',
  justify: false,
}

export interface TemplateDef {
  id: string
  name: string
  description: string
  ats: 'excellent' | 'bon' | 'moyen'
  style: Partial<StyleSettings>
  layout: Pick<Layout, 'columns' | 'sidebarPosition' | 'sidebarWidth'>
  sidebarTypes: SectionType[]
}

const SIDE_DEFAULT: SectionType[] = ['skills', 'languages', 'certifications', 'achievements', 'interests', 'awards', 'references']

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'epure',
    name: 'Épure',
    description: 'Une colonne, sobre, pensé pour passer tous les ATS.',
    ats: 'excellent',
    style: {
      fontHeading: 'Source Sans 3',
      fontBody: 'Source Sans 3',
      fontSize: 10,
      primary: '#111827',
      accent: '#111827',
      headingStyle: 'underline',
      headerLayout: 'left',
      contactIcons: false,
    },
    layout: { columns: 1, sidebarPosition: 'right', sidebarWidth: 33 },
    sidebarTypes: [],
  },
  {
    id: 'classique',
    name: 'Classique',
    description: 'Sérif élégant, en-tête centré, structure traditionnelle.',
    ats: 'excellent',
    style: {
      fontHeading: 'Lora',
      fontBody: 'Source Serif 4',
      fontSize: 10,
      nameSize: 26,
      primary: '#2b2b2b',
      accent: '#7a4b2a',
      headingStyle: 'underline',
      headingUppercase: true,
      headerLayout: 'center',
      contactIcons: false,
      dateFormat: 'MMM YYYY',
    },
    layout: { columns: 1, sidebarPosition: 'right', sidebarWidth: 33 },
    sidebarTypes: [],
  },
  {
    id: 'horizon',
    name: 'Horizon',
    description: 'Bandeau coloré en en-tête, une colonne aérée.',
    ats: 'bon',
    style: {
      fontHeading: 'Montserrat',
      fontBody: 'Open Sans',
      fontSize: 9.5,
      primary: '#0f4c5c',
      accent: '#e36414',
      headerBg: '#0f4c5c',
      headerText: '#ffffff',
      headingStyle: 'leftbar',
      headerLayout: 'banner',
      showPhoto: true,
      headingIcons: true,
    },
    layout: { columns: 1, sidebarPosition: 'right', sidebarWidth: 33 },
    sidebarTypes: [],
  },
  {
    id: 'ardoise',
    name: 'Ardoise',
    description: 'Colonne latérale sombre avec photo et coordonnées.',
    ats: 'bon',
    style: {
      fontHeading: 'Inter',
      fontBody: 'Inter',
      fontSize: 9.2,
      primary: '#1e293b',
      accent: '#0e7490',
      sidebarBg: '#1e293b',
      sidebarText: '#e2e8f0',
      sidebarAccent: '#67e8f9',
      headingStyle: 'bar',
      headerLayout: 'left',
      headerPlacement: 'sidebar',
      showPhoto: true,
    },
    layout: { columns: 2, sidebarPosition: 'left', sidebarWidth: 34 },
    sidebarTypes: SIDE_DEFAULT,
  },
  {
    id: 'equilibre',
    name: 'Équilibre',
    description: 'Deux colonnes sur fond blanc, accents colorés.',
    ats: 'bon',
    style: {
      fontHeading: 'Lato',
      fontBody: 'Lato',
      fontSize: 9.5,
      primary: '#1d3557',
      accent: '#457b9d',
      sidebarAccent: '#457b9d',
      headingStyle: 'leftbar',
      headerLayout: 'split',
      headingIcons: true,
    },
    layout: { columns: 2, sidebarPosition: 'right', sidebarWidth: 34 },
    sidebarTypes: SIDE_DEFAULT,
  },
  {
    id: 'indigo',
    name: 'Indigo',
    description: 'Colonne latérale teintée, typographie géométrique.',
    ats: 'bon',
    style: {
      fontHeading: 'Poppins',
      fontBody: 'Nunito',
      fontSize: 9.3,
      primary: '#3730a3',
      accent: '#4f46e5',
      sidebarBg: '#eef2ff',
      sidebarText: '#1e1b4b',
      sidebarAccent: '#4338ca',
      headingStyle: 'plain',
      headerLayout: 'left',
      headerPlacement: 'main',
      showPhoto: true,
      photoShape: 'rounded',
    },
    layout: { columns: 2, sidebarPosition: 'right', sidebarWidth: 33 },
    sidebarTypes: SIDE_DEFAULT,
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Dense et efficace pour tenir sur une page.',
    ats: 'excellent',
    style: {
      fontHeading: 'Roboto',
      fontBody: 'Roboto',
      fontSize: 8.8,
      nameSize: 20,
      headingSize: 10,
      lineHeight: 1.3,
      margin: 10,
      sectionSpacing: 4,
      itemSpacing: 2.5,
      primary: '#7f1d1d',
      accent: '#b91c1c',
      headingStyle: 'boxed',
      headerLayout: 'split',
    },
    layout: { columns: 1, sidebarPosition: 'right', sidebarWidth: 33 },
    sidebarTypes: [],
  },
  {
    id: 'editorial',
    name: 'Éditorial',
    description: 'Titres en Playfair, mise en page de magazine.',
    ats: 'moyen',
    style: {
      fontHeading: 'Playfair Display',
      fontBody: 'Source Sans 3',
      fontSize: 9.8,
      nameSize: 30,
      primary: '#1b4332',
      accent: '#2d6a4f',
      sidebarBg: '#f4f1ea',
      sidebarText: '#1f2933',
      sidebarAccent: '#2d6a4f',
      headingStyle: 'dotted',
      headingUppercase: false,
      headerLayout: 'left',
      headerPlacement: 'top',
      dateFormat: 'MMMM YYYY',
    },
    layout: { columns: 2, sidebarPosition: 'left', sidebarWidth: 32 },
    sidebarTypes: SIDE_DEFAULT,
  },
]

export const getTemplate = (id: string) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]

export function templateStyle(id: string): StyleSettings {
  const t = getTemplate(id)
  return { ...BASE_STYLE, ...t.style }
}

/** Applique un modèle à un CV : style + disposition, en conservant le contenu. */
export function applyTemplate(doc: ResumeDoc, templateId: string, keepColors = false): ResumeDoc {
  const t = getTemplate(templateId)
  const style = templateStyle(templateId)
  if (keepColors) {
    style.primary = doc.style.primary
    style.accent = doc.style.accent
  }
  style.pageFormat = doc.style.pageFormat
  const all = [...doc.layout.main, ...doc.layout.side]
  let layout: Layout
  if (t.layout.columns === 1) {
    layout = { ...t.layout, main: all, side: [] }
  } else {
    const byId = new Map(doc.sections.map((s) => [s.id, s]))
    const side = all.filter((id) => t.sidebarTypes.includes(byId.get(id)?.type as SectionType))
    const main = all.filter((id) => !side.includes(id))
    layout = { ...t.layout, main, side }
  }
  return { ...doc, templateId, style, layout }
}
