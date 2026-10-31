import type { SectionItem, SectionOptions, SectionType } from '../types'

export type FieldKey =
  | 'title'
  | 'subtitle'
  | 'location'
  | 'dates'
  | 'description'
  | 'bullets'
  | 'link'
  | 'level'
  | 'tags'
  | 'icon'

export interface SectionDef {
  type: SectionType
  label: string
  defaultTitle: string
  icon: string
  hint: string
  fields: FieldKey[]
  labels: Partial<Record<FieldKey, string>>
  options: (keyof SectionOptions)[]
  defaults: SectionOptions
  single?: boolean // une seule entrée (texte)
  sidebarFriendly?: boolean
  atsAliases: string[]
}

export const SECTION_DEFS: Record<SectionType, SectionDef> = {
  summary: {
    type: 'summary',
    label: 'Résumé / Profil',
    defaultTitle: 'Profil',
    icon: 'user',
    hint: 'Trois ou quatre lignes qui résument votre valeur pour le poste visé.',
    fields: ['description'],
    labels: { description: 'Texte' },
    options: [],
    defaults: {},
    single: true,
    atsAliases: ['profil', 'résumé', 'resume', 'summary', 'à propos', 'about', 'synthèse', 'objectif', 'profil professionnel'],
  },
  experience: {
    type: 'experience',
    label: 'Expérience',
    defaultTitle: 'Expérience professionnelle',
    icon: 'briefcase',
    hint: 'Postes du plus récent au plus ancien, avec des réalisations chiffrées.',
    fields: ['title', 'subtitle', 'location', 'dates', 'link', 'description', 'bullets'],
    labels: { title: 'Poste', subtitle: 'Entreprise', location: 'Lieu', description: 'Contexte (optionnel)', bullets: 'Réalisations', link: 'Lien' },
    options: ['showDates', 'showLocation', 'showDescription', 'showBullets', 'showLink'],
    defaults: { showDates: true, showLocation: true, showDescription: true, showBullets: true, showLink: false },
    atsAliases: ['expérience', 'expériences', 'experience', 'parcours', 'expérience professionnelle', 'work experience', 'employment', 'emplois'],
  },
  education: {
    type: 'education',
    label: 'Formation',
    defaultTitle: 'Formation',
    icon: 'graduation-cap',
    hint: 'Diplômes et formations, du plus récent au plus ancien.',
    fields: ['title', 'subtitle', 'location', 'dates', 'description', 'bullets'],
    labels: { title: 'Diplôme', subtitle: 'Établissement', location: 'Lieu', description: 'Détails', bullets: 'Points clés' },
    options: ['showDates', 'showLocation', 'showDescription', 'showBullets'],
    defaults: { showDates: true, showLocation: true, showDescription: true, showBullets: true },
    atsAliases: ['formation', 'formations', 'éducation', 'education', 'diplômes', 'études', 'cursus'],
  },
  skills: {
    type: 'skills',
    label: 'Compétences',
    defaultTitle: 'Compétences',
    icon: 'wrench',
    hint: 'Regroupez vos compétences par thème (outils, méthodes, savoir-être).',
    fields: ['title', 'tags', 'level'],
    labels: { title: 'Groupe (optionnel)', tags: 'Compétences', level: 'Niveau global' },
    options: ['skillDisplay'],
    defaults: { skillDisplay: 'tags' },
    sidebarFriendly: true,
    atsAliases: ['compétences', 'competences', 'skills', 'compétences techniques', 'savoir-faire', 'outils', 'technologies', 'compétences clés'],
  },
  languages: {
    type: 'languages',
    label: 'Langues',
    defaultTitle: 'Langues',
    icon: 'languages',
    hint: 'Langue, niveau (ex. C1, courant, natif) et jauge optionnelle.',
    fields: ['title', 'subtitle', 'level'],
    labels: { title: 'Langue', subtitle: 'Niveau', level: 'Jauge' },
    options: ['levelDisplay'],
    defaults: { levelDisplay: 'dots' },
    sidebarFriendly: true,
    atsAliases: ['langues', 'languages', 'langue'],
  },
  certifications: {
    type: 'certifications',
    label: 'Certifications',
    defaultTitle: 'Certifications',
    icon: 'badge-check',
    hint: 'Certifications avec organisme et date d\'obtention.',
    fields: ['title', 'subtitle', 'dates', 'description', 'link'],
    labels: { title: 'Certification', subtitle: 'Organisme', description: 'Détails', link: 'Lien de vérification' },
    options: ['showDates', 'showDescription', 'showLink', 'compact'],
    defaults: { showDates: true, showDescription: false, showLink: false },
    sidebarFriendly: true,
    atsAliases: ['certifications', 'certification', 'certificats', 'licences'],
  },
  projects: {
    type: 'projects',
    label: 'Projets',
    defaultTitle: 'Projets',
    icon: 'folder-kanban',
    hint: 'Projets marquants, personnels ou professionnels.',
    fields: ['title', 'subtitle', 'location', 'dates', 'link', 'description', 'bullets'],
    labels: { title: 'Projet', subtitle: 'Contexte / client', location: 'Lieu', description: 'Description', bullets: 'Points clés', link: 'Lien' },
    options: ['showDates', 'showLocation', 'showDescription', 'showBullets', 'showLink'],
    defaults: { showDates: true, showLocation: false, showDescription: true, showBullets: true, showLink: true },
    atsAliases: ['projets', 'projects', 'réalisations projets', 'projets clés'],
  },
  achievements: {
    type: 'achievements',
    label: 'Réalisations clés',
    defaultTitle: 'Réalisations clés',
    icon: 'trophy',
    hint: 'Vos succès les plus marquants, avec une icône et un court texte.',
    fields: ['icon', 'title', 'description'],
    labels: { title: 'Réalisation', description: 'Description' },
    options: ['showIcons', 'showDescription', 'columns'],
    defaults: { showIcons: true, showDescription: true, columns: 1 },
    sidebarFriendly: true,
    atsAliases: ['réalisations', 'réalisations clés', 'achievements', 'points forts', 'forces', 'atouts'],
  },
  interests: {
    type: 'interests',
    label: 'Centres d\'intérêt',
    defaultTitle: 'Centres d\'intérêt',
    icon: 'heart',
    hint: 'Loisirs et engagements qui disent quelque chose de vous.',
    fields: ['icon', 'title', 'description'],
    labels: { title: 'Intérêt', description: 'Précision' },
    options: ['showIcons', 'showDescription', 'columns'],
    defaults: { showIcons: true, showDescription: true, columns: 1 },
    sidebarFriendly: true,
    atsAliases: ['centres d\'intérêt', 'intérêts', 'loisirs', 'interests', 'hobbies', 'passions'],
  },
  volunteering: {
    type: 'volunteering',
    label: 'Bénévolat',
    defaultTitle: 'Engagement bénévole',
    icon: 'hand-heart',
    hint: 'Engagements associatifs et responsabilités bénévoles.',
    fields: ['title', 'subtitle', 'location', 'dates', 'description', 'bullets'],
    labels: { title: 'Rôle', subtitle: 'Organisation', location: 'Lieu', description: 'Description', bullets: 'Actions' },
    options: ['showDates', 'showLocation', 'showDescription', 'showBullets'],
    defaults: { showDates: true, showLocation: true, showDescription: true, showBullets: true },
    atsAliases: ['bénévolat', 'engagement', 'engagement bénévole', 'volunteering', 'vie associative', 'associatif'],
  },
  awards: {
    type: 'awards',
    label: 'Prix et distinctions',
    defaultTitle: 'Prix et distinctions',
    icon: 'award',
    hint: 'Récompenses, concours, distinctions.',
    fields: ['title', 'subtitle', 'dates', 'description'],
    labels: { title: 'Distinction', subtitle: 'Décerné par', description: 'Description' },
    options: ['showDates', 'showDescription'],
    defaults: { showDates: true, showDescription: true },
    sidebarFriendly: true,
    atsAliases: ['prix', 'distinctions', 'awards', 'récompenses'],
  },
  publications: {
    type: 'publications',
    label: 'Publications / Conférences',
    defaultTitle: 'Publications',
    icon: 'book-open',
    hint: 'Articles, conférences, interventions.',
    fields: ['title', 'subtitle', 'dates', 'link', 'description'],
    labels: { title: 'Titre', subtitle: 'Média / événement', description: 'Description', link: 'Lien' },
    options: ['showDates', 'showDescription', 'showLink'],
    defaults: { showDates: true, showDescription: true, showLink: true },
    atsAliases: ['publications', 'conférences', 'interventions', 'articles'],
  },
  references: {
    type: 'references',
    label: 'Références',
    defaultTitle: 'Références',
    icon: 'contact',
    hint: 'Personnes pouvant recommander votre travail.',
    fields: ['title', 'subtitle', 'description'],
    labels: { title: 'Nom', subtitle: 'Poste, entreprise', description: 'Coordonnées' },
    options: ['showDescription'],
    defaults: { showDescription: true },
    sidebarFriendly: true,
    atsAliases: ['références', 'references', 'recommandations'],
  },
  custom: {
    type: 'custom',
    label: 'Section personnalisée',
    defaultTitle: 'Nouvelle section',
    icon: 'layout-list',
    hint: 'Section libre avec entrées, dates et puces.',
    fields: ['title', 'subtitle', 'location', 'dates', 'link', 'description', 'bullets'],
    labels: { title: 'Titre', subtitle: 'Sous-titre', location: 'Lieu', description: 'Description', bullets: 'Puces', link: 'Lien' },
    options: ['showDates', 'showLocation', 'showDescription', 'showBullets', 'showLink'],
    defaults: { showDates: true, showLocation: true, showDescription: true, showBullets: true, showLink: true },
    atsAliases: [],
  },
  text: {
    type: 'text',
    label: 'Texte libre',
    defaultTitle: 'À propos',
    icon: 'align-left',
    hint: 'Un simple bloc de texte (citation, motivation, disponibilité...).',
    fields: ['description'],
    labels: { description: 'Texte' },
    options: [],
    defaults: {},
    single: true,
    sidebarFriendly: true,
    atsAliases: [],
  },
}

export const SECTION_ORDER: SectionType[] = [
  'summary',
  'experience',
  'education',
  'skills',
  'languages',
  'certifications',
  'projects',
  'achievements',
  'interests',
  'volunteering',
  'awards',
  'publications',
  'references',
  'text',
  'custom',
]

export function emptyItem(type: SectionType, id: string): SectionItem {
  switch (type) {
    case 'summary':
    case 'text':
      return { id, description: '' }
    case 'skills':
      return { id, title: '', tags: [] }
    case 'languages':
      return { id, title: '', subtitle: '', level: 3 }
    case 'achievements':
      return { id, icon: 'star', title: '', description: '' }
    case 'interests':
      return { id, icon: 'heart', title: '', description: '' }
    default:
      return { id, title: '', subtitle: '', bullets: [] }
  }
}
