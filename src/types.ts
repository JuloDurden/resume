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
}

export type SkillDisplay = 'tags' | 'list' | 'inline' | 'bars' | 'dots'
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
  kind: 'email' | 'phone' | 'location' | 'linkedin' | 'website' | 'github' | 'other'
  value: string
  label?: string
}

export interface Header {
  name: string
  title: string
  photo?: string // data URL
  contacts: ContactLink[]
}

export type HeaderLayout = 'left' | 'center' | 'split' | 'banner'
export type HeaderPlacement = 'top' | 'main' | 'sidebar'
export type HeadingStyle = 'underline' | 'bar' | 'plain' | 'boxed' | 'leftbar' | 'dotted'
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
}

export interface Layout {
  columns: 1 | 2
  sidebarPosition: 'left' | 'right'
  sidebarWidth: number // percent of page
  main: string[]
  side: string[]
}

export interface JobTarget {
  title?: string
  company?: string
  url?: string
  description?: string
  ignored?: string[]
  extra?: string[]
}

export interface ResumeDoc {
  id: string
  kind: 'resume'
  name: string
  createdAt: number
  updatedAt: number
  templateId: string
  style: StyleSettings
  layout: Layout
  header: Header
  sections: Section[]
  job?: JobTarget
}

export interface Recipient {
  name?: string
  title?: string
  company?: string
  address?: string
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
  linkedResumeId?: string
  job?: JobTarget
}

export type AnyDoc = ResumeDoc | LetterDoc
