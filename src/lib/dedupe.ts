// Regroupement des annonces identiques reçues par plusieurs sites (LinkedIn, Glassdoor, Jobijoba...).
import type { FeedItem } from '../types'
import { strip } from './ats'

export interface JobGroup {
  /** identifiant de l'annonce principale */
  id: string
  /** annonce affichée, complétée avec les informations des doublons */
  item: FeedItem
  /** toutes les annonces du groupe (principale comprise) */
  members: FeedItem[]
}

const GENDER = /\(\s*(?:h|f|x|nb|ng)(?:\s*\/\s*(?:h|f|x|nb|ng))*\s*\)|\b(?:h|f)\s*\/\s*(?:h|f)(?:\s*\/\s*(?:x|nb|ng))?\b/g
const CONTRACT = /\((?:cdi|cdd|interim|alternance|stage|freelance)\)|\b-?\s*(?:cdi|cdd)\s*$/g
const COMPANY_NOISE = /\b(sas|sasu|sa|sarl|group|groupe|france|recrutement|recruitment|solutions|consulting|conseil)\b/g

export const titleKey = (t: string) =>
  strip(t)
    .replace(GENDER, ' ')
    .replace(CONTRACT, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const companyKey = (c?: string) =>
  strip(c ?? '')
    .replace(/\d[.,]\d\s*★/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(COMPANY_NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const cityKey = (l?: string) =>
  strip(l ?? '')
    .replace(/\(.*?\)|\d+/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .split(' ')[0] ?? ''

/** Les sigles d'entreprise s'écrivent souvent en entier ailleurs (« LEA » et « LEA Recrutement »). */
const sameCompany = (a: string, b: string) => !!a && !!b && (a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `) || a.replace(/ /g, '') === b.replace(/ /g, ''))

/** Annonce la plus riche en premier : site de l'entreprise, texte complet, puis description, puis date la plus ancienne. */
const richness = (i: FeedItem) => (i.source.startsWith('Site de ') ? 10 : 0) + (i.fullText ? 4 : 0) + (i.description && i.description.length > 120 ? 2 : 0) + (i.salary ? 1 : 0) + (i.contract ? 0.5 : 0)

export function groupJobs(items: FeedItem[]): JobGroup[] {
  const groups: { members: FeedItem[]; title: string; companies: string[]; city: string }[] = []
  for (const it of items) {
    const title = titleKey(it.title)
    const company = companyKey(it.company)
    const city = cityKey(it.location)
    // un intitulé long et précis suffit avec la ville ; un intitulé court exige la même entreprise
    const distinctive = title.split(' ').filter((w) => w.length > 2).length >= 4
    const g = groups.find((x) => x.title === title && (x.companies.some((c) => sameCompany(c, company)) || (distinctive && !!city && x.city === city)))
    if (g) {
      g.members.push(it)
      if (company && !g.companies.includes(company)) g.companies.push(company)
    } else groups.push({ members: [it], title, companies: company ? [company] : [], city })
  }
  return groups.map(({ members }) => {
    const sorted = [...members].sort((a, b) => richness(b) - richness(a) || (a.date ?? '').localeCompare(b.date ?? ''))
    const main = sorted[0]
    const pick = <K extends keyof FeedItem>(k: K) => main[k] ?? sorted.find((m) => m[k])?.[k]
    const item: FeedItem = {
      ...main,
      company: pick('company'),
      location: pick('location'),
      contract: pick('contract'),
      salary: pick('salary'),
      worktime: pick('worktime'),
      description: pick('description'),
      fullText: pick('fullText'),
      // date de première parution
      date: members.map((m) => m.date).filter(Boolean).sort()[0] ?? main.date,
      firstSeen: members.map((m) => m.firstSeen).filter(Boolean).sort()[0] ?? main.firstSeen,
      alerts: [...new Set(members.flatMap((m) => m.alerts))],
    }
    return { id: main.id, item, members: sorted }
  })
}
