export type SectionType =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'languages'
  | 'certifications'
  | 'projects'
  | 'achievements'
  | 'interests'
  | 'volunteering'
  | 'awards'
  | 'references'
  | 'publications'
  | 'custom'
  | 'text'

export interface DateValue {
  month?: number // 1-12
  year?: number
}

export interface SectionItem {
  id: string
  title?: string
  subtitle?: string
  location?: string
  start?: DateValue
  end?: DateValue
  current?: boolean
  description?: string
  bullets?: string[]
  link?: string
  level?: number // 0-5
  tags?: string[]
  icon?: string
  hidden?: boolean
  /** variantes d'intitulé pour ce poste (selon l'offre visée) */
  titleVariants?: string[]
}

export type SkillDisplay = 'tags' | 'flow' | 'list' | 'lines' | 'inline' | 'bars' | 'dots'
export type LevelDisplay = 'dots' | 'bars' | 'text' | 'none'

export interface SectionOptions {
  showDates?: boolean
  showLocation?: boolean
  showDescription?: boolean
  showBullets?: boolean
  showLink?: boolean
  showIcons?: boolean
  skillDisplay?: SkillDisplay
  levelDisplay?: LevelDisplay
  compact?: boolean
  columns?: 1 | 2
}

export interface Section {
  id: string
  type: SectionType
  title: string
  hidden?: boolean
  items: SectionItem[]
  options: SectionOptions
}

export interface ContactLink {
  id: string
  kind: 'email' | 'phone' | 'location' | 'linkedin' | 'website' | 'github' | 'other' | 'info'
  value: string
  label?: string
  /** ligne d'affichage dans l'en-tête (0 = première) */
  row?: number
}

export interface Header {
  name: string
  title: string
  photo?: string // data URL
  contacts: ContactLink[]
}

export type HeaderLayout = 'left' | 'center' | 'split' | 'banner'
export type HeaderPlacement = 'top' | 'main' | 'sidebar'
export type HeadingStyle = 'underline' | 'bar' | 'plain' | 'boxed' | 'leftbar' | 'dotted' | 'rule'
export type DateFormat = 'MM/YYYY' | 'MMM YYYY' | 'MMMM YYYY' | 'YYYY'
export type PageFormat = 'A4' | 'Letter'
export type PhotoShape = 'circle' | 'rounded' | 'square'

export interface StyleSettings {
  fontHeading: string
  fontBody: string
  fontSize: number // pt
  nameSize: number // pt
  headingSize: number // pt
  lineHeight: number
  margin: number // mm
  sectionSpacing: number // mm
  itemSpacing: number // mm
  columnGap: number // mm
  primary: string
  accent: string
  text: string
  muted: string
  pageBg: string
  sidebarBg: string
  sidebarText: string
  sidebarAccent: string
  headerBg: string
  headerText: string
  headingStyle: HeadingStyle
  headingUppercase: boolean
  headingIcons: boolean
  headerLayout: HeaderLayout
  headerPlacement: HeaderPlacement
  showPhoto: boolean
  photoShape: PhotoShape
  photoSize: number // mm
  contactIcons: boolean
  dateFormat: DateFormat
  dateSeparator: string
  currentLabel: string
  bullet: string
  pageFormat: PageFormat
  justify: boolean
  nameUppercase?: boolean
  headingBold?: boolean
  itemTitleBold?: boolean
  itemTitleSize?: number // % de la taille du texte
  itemTitleFont?: 'heading' | 'body'
  itemTitleColor?: 'text' | 'primary' | 'accent'
  photoInSidebar?: boolean
}

export interface Layout {
  columns: 1 | 2
  sidebarPosition: 'left' | 'right'
  sidebarWidth: number // percent of page
  main: string[]
  side: string[]
}

export type JobStatus = 'todo' | 'applied' | 'interview' | 'rejected' | 'offer'

export interface JobTarget {
  id?: string
  createdAt?: number
  status?: JobStatus
  lastScore?: number
  notes?: string
  title?: string
  company?: string
  url?: string
  description?: string
  ignored?: string[]
  extra?: string[]
}

export interface OfferContact {
  name?: string
  role?: string
  email?: string
  phone?: string
  linkedin?: string
}

/** Offre d'emploi, partagée entre les CV et lettres qui y sont rattachés. */
export interface Offer extends JobTarget {
  id: string
  createdAt: number
  updatedAt: number
  location?: string
  contract?: string
  website?: string
  logo?: string
  contacts?: OfferContact[]
  snapshotAt?: number
  /** Dernier score ATS par CV analysé */
  scores?: Record<string, number>
  /** Code métier ROME (fourni par France Travail) */
  romeCode?: string
  /** Identifiant de l'annonce dans la veille */
  sourceId?: string
  salary?: string
  /** date de chaque changement de statut (statistiques) */
  statusAt?: Partial<Record<JobStatus, number>>
  /** dates des relances envoyées */
  followUps?: number[]
  /** relances désactivées pour cette offre */
  noFollowUp?: boolean
  /** préparation d'entretien rédigée par Claude */
  interview?: InterviewPrep
}

export interface InterviewPrep {
  at: number
  company?: string
  pitch?: string
  questions?: { q: string; why?: string; answer?: string }[]
  weaknesses?: { point: string; how?: string }[]
  ask?: string[]
  checklist?: string[]
}

export interface ResumeDoc {
  id: string
  kind: 'resume'
  name: string
  /** CV de référence : modèle personnel d'un type de poste, à dupliquer pour chaque candidature */
  reference?: boolean
  createdAt: number
  updatedAt: number
  templateId: string
  style: StyleSettings
  layout: Layout
  header: Header
  sections: Section[]
  /** Offre actuellement analysée (copie synchronisée de l'élément correspondant de `jobs`). */
  job?: JobTarget
  /** Ancien historique des offres (migré vers les offres globales). */
  jobs?: JobTarget[]
  offerId?: string
}

export interface Recipient {
  name?: string
  title?: string
  company?: string
  address?: string
}

export interface LetterOptions {
  layout: 'single' | 'sidebar'
  sidebarPosition: 'left' | 'right'
  sidebarWidth: number
  showRecipient: boolean
  recipientAlign: 'left' | 'right'
  showDate: boolean
  dateAlign: 'left' | 'right'
  subjectStyle: 'label' | 'heading' | 'bold'
  signatureAlign: 'left' | 'right'
  signatureBold: boolean
  signatureHeight: number // mm
  paragraphSpacing: number // em
}

export interface LetterDoc {
  id: string
  kind: 'letter'
  name: string
  createdAt: number
  updatedAt: number
  templateId: string
  style: StyleSettings
  header: Header
  recipient: Recipient
  place?: string
  date?: string
  subject?: string
  salutation?: string
  body: string
  closing?: string
  signature?: string
  /** Signature manuscrite (image PNG, fond transparent) */
  signatureImage?: string
  linkedResumeId?: string
  job?: JobTarget
  options?: Partial<LetterOptions>
  offerId?: string
}

export type AnyDoc = ResumeDoc | LetterDoc

/* ---------- Veille d'annonces ---------- */

export interface Alert {
  id: string
  keywords: string
  commune?: string
  communeCode?: string
  distance?: number
  departement?: string
  contracts?: string[]
  active?: boolean
  /** niveau visé : junior (0 à 2 ans), tous niveaux, ou confirmé / management */
  level?: 'junior' | 'any' | 'senior'
}

export type MarkState = 'fav' | 'hidden' | 'applied' | 'deleted' | 'none'

export interface WatchState {
  alerts: Alert[]
  alertsAt: number
  /** termes à exclure de la liste des annonces (ex. « alternance », « B2B ») */
  excludes?: string[]
  /** profil utilisé pour l'indice de correspondance */
  profile?: MatchProfile
  profileAt?: number
  /** avis de Claude sur certaines annonces */
  reviews?: Record<string, JobReview>
  /** état de chaque annonce (favori, masquée, candidature créée), avec sa date pour la fusion */
  marks: Record<string, { s: MarkState; at: number; t?: string }>
}

export interface MatchProfile {
  /** CV de référence (compétences) */
  cvId?: string
  /** métiers visés */
  targets: string[]
  /** niveau de diplôme : 0 (aucun), 2 (bac+2), 3, 5... */
  degree: number
  home?: { nom: string; lat: number; lon: number }
  /** périmètre de recherche en km : au-delà, une offre sans télétravail a la note 0 */
  maxKm?: number
}

export interface JobReview {
  score: number
  verdict?: string
  pros?: string[]
  cons?: string[]
  tip?: string
  at: number
}

export interface FeedItem {
  id: string
  alerts: string[]
  title: string
  company?: string
  companyUrl?: string
  logo?: string
  location?: string
  contract?: string
  contractCode?: string
  worktime?: string
  salary?: string
  experience?: string
  rome?: string
  romeLabel?: string
  date?: string
  updated?: string
  firstSeen?: string
  /** date limite de candidature (aaaa-mm-jj) */
  until?: string
  /** l'annonce n'est plus en ligne */
  closed?: boolean
  checkedAt?: string
  /** texte complet de l'annonce, récupéré par la veille */
  fullText?: string
  textTried?: boolean
  facts?: { education?: string; experience?: string; skills?: string; level?: string }
  url: string
  source: string
  contact?: { name?: string; email?: string }
  description?: string
}

export interface Feed {
  updatedAt: string
  status: 'ok' | 'error'
  errors?: string[]
  notes?: string[]
  alerts?: number
  /** sites constatés en mode dégradé au dernier passage (nom d'hôte, date) */
  sources?: { degraded?: Record<string, string> }
  items: FeedItem[]
}
