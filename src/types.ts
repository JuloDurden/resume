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
  /** affichage des précisions d'une compétence : « A (x, y) », « A : x, y » ou sous le nom */
  skillDetails?: 'paren' | 'colon' | 'sub'
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

/** Coordonnées saisies une seule fois dans les Réglages et reportées dans tous les en-têtes. */
export interface Identity {
  name?: string
  photo?: string
  email?: string
  phone?: string
  location?: string
  /** information sans lien (« Permis B, véhiculé ») */
  info?: string
  github?: string
  linkedin?: string
  website?: string
  /** autre lien et son texte affiché */
  other?: string
  otherLabel?: string
  /** signature manuscrite des lettres (PNG transparent) */
  signature?: string
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
  /** mots-clés réaffichés alors qu'ils étaient masqués automatiquement */
  kept?: string[]
}

export interface CompanyAnalysis {
  at: number
  summary?: string
  sector?: string
  size?: string
  news?: string[]
  needs?: { need: string; why?: string }[]
  openings?: { title: string; url?: string }[]
  contacts?: { role: string; name?: string; url?: string }[]
  posts?: { title: string; why?: string; fit?: number }[]
  /** adéquation de mon profil, sur 100 */
  fit?: number
  verdict?: 'go' | 'angle' | 'no'
  matches?: string[]
  gaps?: string[]
  /** angle d'approche conseillé */
  angle?: string
  website?: string
  careersUrl?: string
  sources?: string[]
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
  /** dossier de candidature publié pour le recruteur (offre, CV et lettre en lecture seule) */
  share?: { slug: string; publishedAt: number; resumeId?: string; letterId?: string }
  /** délai avant relance choisi pour cette offre, en jours (sinon le délai par défaut) */
  followUpDays?: number
  /** date précise de la prochaine relance (fin de la période de recrutement annoncée par l'employeur) */
  followUpDate?: number
  /** annonces de la veille rattachées à cette candidature */
  jobIds?: string[]
  /** candidature spontanée : pas d'annonce, l'entreprise est analysée par Claude */
  spontaneous?: boolean
  /** postes visés (candidature spontanée) */
  posts?: string[]
  /** fiche entreprise rédigée par Claude (candidature spontanée) */
  analysis?: CompanyAnalysis
  /** préparation d'entretien rédigée par Claude */
  interview?: InterviewPrep
  /** entretiens prévus ou passés (un par étape du recrutement) */
  interviews?: InterviewSlot[]
  /** date de retour annoncée après le dernier entretien */
  answerBy?: number
  /** réponses et nouvelles du recruteur (après une relance ou spontanément) */
  updates?: RecruiterUpdate[]
}

export interface RecruiterUpdate {
  id: string
  /** jour de réception */
  at: number
  /** réponse à ma relance, ou message reçu sans relance */
  kind: 'reply' | 'news'
  /** ce qu'ils disent, en substance */
  text?: string
  /** date de retour annoncée (« étudiée sous 3 semaines ») */
  waitUntil?: number
  /** relance à laquelle répond ce message */
  afterFollowUp?: number
}

export type InterviewMode = 'site' | 'phone' | 'video'

export interface InterviewSlot {
  id: string
  /** date et heure (heure locale) */
  at?: number
  mode?: InterviewMode
  /** adresse, numéro ou lien de visio */
  place?: string
  /** interlocuteurs */
  with?: string
  notes?: string
  /** entretien passé (confirmé par l'utilisateur) */
  done?: boolean
  /** impression à la sortie de l'entretien */
  feeling?: InterviewFeeling
  /** compte rendu libre */
  report?: string
}

export type InterviewFeeling = 'great' | 'good' | 'mixed' | 'bad'

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
  /** profil de recherche choisi à la main pour ranger le document ('' : sans profil) */
  trackId?: string
  /** nom du PDF imposé (sinon calculé : Prénom NOM - CV - Poste - Entreprise) */
  fileName?: string
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
  /** profil de recherche choisi à la main pour ranger le document ('' : sans profil) */
  trackId?: string
  /** nom du PDF imposé (sinon calculé : Prénom NOM - Lettre de motivation - Poste - Entreprise) */
  fileName?: string
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
  /** identité commune à tous les CV et lettres (Réglages) */
  identity?: Identity
  identityAt?: number
  /** pages carrières d'entreprises lues par la veille */
  companies?: Company[]
  companiesAt?: number
  /** texte d'annonce collé à la main (quand le site ne le fournit pas) */
  texts?: Record<string, string>
  /** profil de recherche imposé à une annonce (v vide : choix automatique), avec sa date pour la fusion */
  trackFor?: Record<string, { v: string; at: number }>
  /** annonces ajoutées à la main depuis leur lien */
  manual?: FeedItem[]
  /** avis de Claude sur certaines annonces */
  reviews?: Record<string, JobReview>
  /** état de chaque annonce (favori, masquée, candidature créée), avec sa date pour la fusion */
  marks: Record<string, { s: MarkState; at: number; t?: string }>
}

export interface Company {
  id: string
  name: string
  /** page carrières ou page d'un logiciel de recrutement (Lever, Greenhouse, SmartRecruiters...) */
  url: string
  /** toutes les offres, même hors de vos recherches */
  all?: boolean
  active?: boolean
  /** site d'emploi (agrégateur, jobboard) plutôt qu'une entreprise : pas de place sur la carte */
  board?: boolean
  /** « pas intéressé » : masquée de la carte, ignorée par la veille */
  state?: 'no'
  /** fiche SIRENE (carte des entreprises) */
  siren?: string
  lat?: number
  lon?: number
  city?: string
  address?: string
  naf?: string
  /** tranche d'effectif INSEE de l'entreprise */
  size?: string
  sector?: string
  /** recherche de position déjà tentée, sans résultat */
  noGeo?: boolean
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
  /** prétentions salariales : minimum acceptable, brut annuel en euros */
  salary?: { min?: number }
  /** délai par défaut avant de relancer une candidature, en jours */
  followUpDays?: number
  /** types de contrat recherchés (vide : tous) ; une annonce qui ne propose aucun d'eux passe en « Hors critères » */
  contracts?: string[]
  /** profils de recherche (IT junior, management confirmé...) : chaque annonce est notée face à chacun, la meilleure note l'emporte */
  tracks?: MatchTrack[]
  /** parcours : chaque expérience des CV (clé entreprise|année de début) rattachée à un métier ROME, ses compétences et ses profils */
  experiences?: Record<string, ExperienceLink>
}

export interface MatchTrack {
  id: string
  name: string
  targets: string[]
  /** niveau visé dans ce profil (sinon celui de l'alerte) */
  level?: 'junior' | 'any' | 'senior'
  /** CV de référence de ce profil (compétences, CV adapté) */
  cvId?: string
  /** compétences ajoutées à la main */
  skills?: string[]
  /** secteurs d'activité visés (référentiel ROME), utilisés par la carte des entreprises */
  sectors?: string[]
}

export interface ExperienceLink {
  /** code ROME du métier exercé */
  rome?: string
  romeLabel?: string
  /** savoir-faire ROME retenus pour cette expérience */
  skills?: string[]
  /** profils de recherche auxquels cette expérience compte (années d'expérience, compétences) */
  tracks?: string[]
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
  facts?: { education?: string; experience?: string; skills?: string; level?: string; summaryOnly?: boolean }
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
  sources?: { degraded?: Record<string, string>; companies?: Record<string, { at: string; url: string; jobs: number; kept: number; method: string; error?: string }> }
  /** salaires vus dans les annonces de l'année (repères par métier et région) */
  salaryLog?: { id: string; at: string; title: string; location?: string; salary: string }[]
  items: FeedItem[]
}
