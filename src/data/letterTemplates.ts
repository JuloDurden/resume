import type { LetterDoc, LetterOptions, StyleSettings } from '../types'
import { BASE_STYLE, templateStyle } from './templates'

export const DEFAULT_LETTER_OPTIONS: LetterOptions = {
  layout: 'single',
  sidebarPosition: 'left',
  sidebarWidth: 31,
  showRecipient: true,
  recipientAlign: 'right',
  showDate: true,
  dateAlign: 'right',
  subjectStyle: 'label',
  signatureAlign: 'right',
  signatureBold: true,
  signatureHeight: 16,
  paragraphSpacing: 0.9,
}

export const letterOptions = (d: LetterDoc): LetterOptions => ({ ...DEFAULT_LETTER_OPTIONS, ...d.options })

export interface LetterTemplateDef {
  id: string
  name: string
  description: string
  style: Partial<StyleSettings>
  options: Partial<LetterOptions>
}

export const LETTER_TEMPLATES: LetterTemplateDef[] = [
  {
    id: 'directe',
    name: 'Directe',
    description: "Sans bloc destinataire, objet en capitales avec filet. D'après la lettre de Julien.",
    style: {
      fontHeading: 'Rubik',
      fontBody: 'Inter',
      fontSize: 9.6,
      nameSize: 26,
      lineHeight: 1.38,
      margin: 18,
      sectionSpacing: 6,
      primary: '#2b2f33',
      accent: '#139c9e',
      text: '#2b2f33',
      muted: '#5b6268',
      headerLayout: 'left',
      headerPlacement: 'top',
      showPhoto: false,
      contactIcons: true,
      nameUppercase: false,
      headingBold: false,
    },
    options: { showRecipient: false, showDate: false, subjectStyle: 'heading', signatureAlign: 'left', signatureBold: false, paragraphSpacing: 1 },
  },
  {
    id: 'classique-lettre',
    name: 'Classique',
    description: 'Destinataire et date à droite, « Objet : » en gras, signature à droite.',
    style: { ...templateStyle('classique'), margin: 20, fontSize: 10.2, headerLayout: 'center' },
    options: { showRecipient: true, recipientAlign: 'right', showDate: true, dateAlign: 'right', subjectStyle: 'label', signatureAlign: 'right', signatureBold: true },
  },
  {
    id: 'laterale-lettre',
    name: 'Latérale',
    description: 'Colonne colorée avec photo et coordonnées, assortie au CV Sarcelle.',
    style: { ...templateStyle('sarcelle'), fontSize: 9.4, margin: 12, lineHeight: 1.38, showPhoto: true, photoInSidebar: false },
    options: { layout: 'sidebar', sidebarPosition: 'left', sidebarWidth: 31, showRecipient: true, recipientAlign: 'left', showDate: true, dateAlign: 'left', subjectStyle: 'heading', signatureAlign: 'left', signatureBold: false },
  },
  {
    id: 'bandeau-lettre',
    name: 'Bandeau',
    description: 'En-tête dans un bandeau coloré, ton moderne.',
    style: { ...templateStyle('horizon'), margin: 16, fontSize: 9.8, showPhoto: false },
    options: { showRecipient: true, recipientAlign: 'left', showDate: true, dateAlign: 'right', subjectStyle: 'bold', signatureAlign: 'left', signatureBold: true },
  },
  {
    id: 'moderne-lettre',
    name: 'Moderne',
    description: 'En-tête centré, accent coloré, mise en page aérée.',
    style: { ...BASE_STYLE, fontHeading: 'Montserrat', fontBody: 'Open Sans', fontSize: 9.8, nameSize: 24, margin: 18, primary: '#1d3557', accent: '#e76f51', headerLayout: 'center', contactIcons: true },
    options: { showRecipient: true, recipientAlign: 'left', showDate: true, dateAlign: 'left', subjectStyle: 'heading', signatureAlign: 'left', signatureBold: true, paragraphSpacing: 1.1 },
  },
  {
    id: 'reparti-lettre',
    name: 'Répartie',
    description: 'Nom à gauche, coordonnées à droite, très lisible.',
    style: { ...templateStyle('equilibre'), margin: 18, fontSize: 10, headingIcons: false },
    options: { showRecipient: true, recipientAlign: 'right', showDate: true, dateAlign: 'right', subjectStyle: 'label', signatureAlign: 'right', signatureBold: true },
  },
]

export function applyLetterTemplate(d: LetterDoc, id: string, keepColors = false): LetterDoc {
  const t = LETTER_TEMPLATES.find((x) => x.id === id) ?? LETTER_TEMPLATES[0]
  const style: StyleSettings = { ...BASE_STYLE, ...t.style, pageFormat: d.style.pageFormat }
  if (t.options.layout !== 'sidebar') style.headerPlacement = 'top'
  if (keepColors) Object.assign(style, { primary: d.style.primary, accent: d.style.accent, sidebarBg: d.style.sidebarBg, sidebarText: d.style.sidebarText, sidebarAccent: d.style.sidebarAccent })
  return { ...d, templateId: id, style, options: { ...DEFAULT_LETTER_OPTIONS, ...t.options } }
}
