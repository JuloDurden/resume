import type { ResumeDoc, SectionItem } from '../types'
import { ACTION_NOUNS, ACTION_VERBS, STOPWORDS } from './stopwords'
import { resumeToText, orderedSections } from './export'
import { SECTION_DEFS } from '../data/sectionDefs'
import { stripInline } from './inline'

export const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface Tok {
  raw: string
  norm: string
  stem: string
  sentenceStart: boolean
  afterBreak: boolean
}

// Suffixes français et anglais retirés pour rapprocher les formes d'un même mot
// (accompagnement / accompagner, formations / former, déploiement / déployer...)
const SUFFIXES = [
  'issements', 'issement', 'atrices', 'ateurs', 'ations', 'atrice', 'ateur', 'ation', 'ements', 'ement', 'ments', 'ment',
  'ances', 'ences', 'ance', 'ence', 'ités', 'ite', 'iques', 'ique', 'ables', 'able', 'istes', 'iste', 'euses', 'euse', 'eurs', 'eur',
  'ives', 'ive', 'ifs', 'if', 'ions', 'ion', 'ees', 'ee', 'es', 'er', 'ez', 'ant', 'ing', 'ed', 'e', 's', 'x',
]
export function stem(t: string): string {
  if (t.length <= 4 || /\d|[+#.]/.test(t)) return t
  for (const suf of SUFFIXES) {
    if (t.endsWith(suf) && t.length - suf.length >= 4) return t.slice(0, -suf.length).replace(/(y|i)$/, 'i')
  }
  return t
}

// Familles de mots : verbe, participe et nom d'action ramenés à une même racine
// (coordonner / coordination, sécuriser / sécurité, gérer / gestion, conduire / conduite…)
const FAMILY: [RegExp, string][] = [
  [/^coordon|^coordin/, 'coordin'],
  [/^securis/, 'secur'],
  [/^prestat/, 'prest'],
  [/^(gere|gerer|geree|geres|gerant|gestionnair|gestion)$/, 'gest'],
  [/^(conduir|conduit|conduis)/, 'condu'],
  [/^(suivr|suivi)/, 'suivi'],
  [/^(resoudr|resolu|resolv)/, 'resol'],
  [/^planific/, 'planifi'],
  [/^mainten/, 'mainten'],
  [/^analy/, 'analys'],
  [/^(encadr)/, 'encadr'],
]
export const canon = (st: string) => {
  for (const [re, c] of FAMILY) if (re.test(st)) return c
  return st
}

// Synonymes reconnus comme « forme proche » (crédit partiel)
const SYNONYMS: string[][] = [
  ['encadr', 'manag'],
  ['support', 'assist'],
  ['satisfact', 'experient'],
]
const synOf = (st: string) => SYNONYMS.find((g) => g.includes(st)) ?? []

export function tokenize(text: string): Tok[] {
  const out: Tok[] = []
  const re = /[\p{L}\p{N}][\p{L}\p{N}+#./'’-]*|[.!?;:\n•]|[(),/|«»"]/gu
  let sentenceStart = true
  let afterBreak = true
  for (const m of text.matchAll(re)) {
    let raw = m[0]
    if (/^[.!?;:\n•]$/.test(raw)) {
      sentenceStart = true
      afterBreak = true
      continue
    }
    if (/^[(),/|«»"]$/.test(raw)) {
      afterBreak = true
      continue
    }
    raw = raw.replace(/[.'’-]+$/, '')
    // élisions françaises : l'équipe, d'outils
    const el = /^(?:[ldjmnstc]|qu|jusqu|lorsqu)['’](.+)$/i.exec(raw)
    if (el) raw = el[1]
    if (!raw) continue
    const norm = strip(raw)
    out.push({ raw, norm, stem: canon(stem(norm)), sentenceStart, afterBreak })
    sentenceStart = false
    afterBreak = false
  }
  return out
}

const isStop = (t: Tok) => STOPWORDS.has(t.norm) || /^\d+$/.test(t.norm)

// Mots fréquents dans les annonces mais sans valeur pour un CV : rémunération, avantages, contrat,
// formules d'accroche, valeurs de l'entreprise…
const NOISE_WORDS = `salaire salaires remuneration brut bruts brute net annuel annuelle mensuel mensuelle euro euros eur k€ prime primes variable rtt mutuelle prevoyance ticket tickets restaurant cse forfait mobilite teletravail avantage avantages interessement participation epargne cheques cadeaux
contrat cdi cdd interim alternance stage temps plein partiel heure heures semaine semaines jour jours mois an ans annee annees horaire horaires date demarrage debut embauche immediat immediate duree hebdomadaire
postuler candidater rejoindre rejoignez aventure opportunite carriere evolution evolutions perspective perspectives
vrai vraie vrais vie main mains quelque quelques toujours souvent prise pris aimez aimer adorez concret concrete concrets concretes description publiee publie publies proposer proposons apporter apportez trouver preuve cours disposition national nationale nationaux objectifs engage engagee engages engagees diversite inclusion handicap egalite durable durables seminaire seminaires croissance marque marques salon salons valeurs ambiance convivial conviviale bienveillance bienveillant bienveillante passion passionne passionnee dynamique top unique belle beau grande grand leader numero acteur acteurs reference implante implantee implantes situe situee rattache rattachee dedie dediee sein cadre environnement contexte quotidien
organisme organismes filiale filiales siege agence agences ville region regional regionale regionaux departement local locale locaux
publiee annonce annonces reference ref offre sas sasu sarl janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre prendre mettre faire permettre comprendre apprendre grace`
  .split(/\s+/)
  .map((w) => canon(stem(w)))
const NOISE = new Set(NOISE_WORDS)
// Régions et grandes villes : le lieu est dans l'offre, pas une compétence
const PLACES = new Set(
  `france occitanie languedoc roussillon midi pyrenees herault gard aude lozere aveyron tarn garonne gers ariege bouches rhone provence alpes cote azur nouvelle aquitaine auvergne ile idf bretagne normandie hauts grand est centre loire bourgogne franche comte corse montpellier toulouse nimes perpignan beziers sete narbonne carcassonne ales lunel castelnau lattes perols mauguio marseille lyon paris bordeaux nantes lille nice rennes strasbourg grenoble garosud sud nord ouest est`
    .split(/\s+/)
    .map((w) => canon(stem(w))),
)
const GENERIC_CO = new Set(['technolog', 'servic', 'group', 'solution', 'conseil', 'consult', 'system', 'franc', 'international', 'industri', 'societ', 'entrepris', 'sas', 'sa', 'sarl', 'et'])

/** Zone de l'annonce : le poste (missions, profil), l'entreprise (présentation), les conditions (salaire, avantages). */
type Zone = 'job' | 'company' | 'perks'
const ZONE_WEIGHT: Record<Zone, number> = { job: 1, company: 0.35, perks: 0 }
const HEAD_COMPANY = /^(qui sommes[- ]nous|l'?entreprise|notre (societe|groupe|entreprise|client|structure|histoire)|a propos|about|presentation|le groupe|votre (futur )?employeur|nous sommes|le contexte|contexte)\b/
const HEAD_PERKS = /^(avantages|nous (vous )?offrons|ce que nous (vous )?(offrons|proposons)|remuneration|salaire|conditions|pourquoi nous rejoindre|package|informations? complementaires?|processus de recrutement|deroulement|modalites|infos? pratiques)\b/
const HEAD_JOB = /^(vos? missions?|missions?|le poste|description du poste|descriptif|responsabilites|activites|votre profil|profil|competences|vous etes|vous avez|qualifications|prerequis|requis|savoir|ce que vous ferez|votre role|role)\b/
const META_LINE = /^(salaire|remuneration|duree du travail|horaires?|type de contrat|contrat|lieu( de travail)?|avantages?|deplacements?|experience|formation|qualification|secteur d'activite|taille|statut|date|publie|reference|nature d'offre|travail en|langues?|permis)\s*:/

/** Découpe l'annonce en zones grâce à ses intertitres. */
function zonesOf(text: string): { text: string; zone: Zone }[] {
  const out: { text: string; zone: Zone }[] = []
  let zone: Zone = 'job'
  for (const line of text.split(/\n/)) {
    const l = strip(line.replace(/[*#_•·-]+/g, ' ').trim())
    if (l.length && l.length <= 60) {
      if (HEAD_COMPANY.test(l)) zone = 'company'
      else if (HEAD_PERKS.test(l)) zone = 'perks'
      else if (HEAD_JOB.test(l)) zone = 'job'
    }
    out.push({ text: line, zone: META_LINE.test(l) ? 'perks' : zone })
  }
  return out
}

export interface KeywordContext {
  company?: string
  location?: string
}

/** Mots propres à l'entreprise (nom, sigle) et au lieu, qu'aucun CV ne peut contenir. */
function contextNoise(ctx: KeywordContext = {}) {
  const co = tokenize(ctx.company ?? '').map((t) => t.stem).filter((s) => s.length > 1 && !GENERIC_CO.has(s))
  const words = (ctx.company ?? '').split(/[\s-]+/).filter((w) => /^\p{Lu}/u.test(w) && w.length > 1)
  const acronym = strip(words.map((w) => w[0]).join(''))
  const loc = tokenize(ctx.location ?? '').map((t) => t.stem)
  return (t: Tok) => {
    const flat = t.norm.replace(/[^a-z0-9]/g, '')
    return co.includes(t.stem) || (acronym.length >= 3 && flat === acronym) || loc.includes(t.stem) || PLACES.has(t.stem)
  }
}

/** Mot sans intérêt pour un CV : bruit d'annonce, montant, horaire, code ROME, nom de l'entreprise ou lieu. */
const isNumericNoise = (t: Tok) =>
  /^\d/.test(t.norm) || // 45k, 35h/semaine, 32000.0, 1h
  /^[a-n]\d{4}$/.test(t.norm) || // codes ROME
  /^bac\+?\d?$/.test(t.norm) ||
  /^[hf]\/[hf](\/\w+)?$/.test(t.norm) || // H/F/NB
  (t.norm.includes('/') && t.norm.split('/').every((p) => !p || STOPWORDS.has(p) || NOISE.has(canon(stem(p))) || /^\d/.test(p))) // bruts/an

// Adjectifs trop généraux pour être un mot-clé seul (ils restent dans les expressions : « formation professionnelle »)
const WEAK_UNI = new Set(
  `professionnel professionnelle interne internes externe externes nouveau nouvelle nouveaux general generale global globale different differents divers diverses principal principale adapte adaptee important importante autonome rigoureux rigoureuse`
    .split(/\s+/)
    .map((w) => canon(stem(w))),
)

/** Formes d'action à afficher en nom (encadrez → encadrement). */
const ACTION_LABEL: Record<string, string> = Object.fromEntries(
  `accompagnement administration amélioration analyse animation automatisation cadrage conception conduite coordination déploiement développement encadrement évaluation formation gestion intégration management migration négociation optimisation organisation pilotage planification recrutement rédaction sécurité suivi supervision maintenance résolution prestation`
    .split(/\s+/)
    .map((w) => [canon(stem(strip(w))), w]),
)
const isConjugated = (raw: string) => /(?:é|ée|és|ées|ez|er|ons|ent|ant)$/i.test(raw)
const isTechnical = (t: Tok) =>
  /[+#]|\d/.test(t.raw) ||
  (!t.sentenceStart && /^[A-Z][A-Za-z]*[A-Z]/.test(t.raw)) || // PowerBI, ServiceNow
  (/^[A-Z]{2,6}$/.test(t.raw) && !STOPWORDS.has(t.norm)) // ITIL, SQL, KPI

const KNOWN = new Set(
  `agile scrum kanban safe itil itsm jira confluence zendesk servicenow glpi sql python excel vba powerbi tableau sap salesforce crm erp api rest devops docker kubernetes aws azure gcp cloud linux windows sharepoint office365 teams figma ux ui seo sem analytics prince2 pmp lean rgpd gdpr iso sla kpi okr moa amoa moe recette uat mco tma roadmap backlog budget reporting pilotage gouvernance cybersecurite securite reseau infrastructure helpdesk support incident probleme changement release deploiement migration integration specification specifications cahier user story stories product owner business analyst management encadrement leadership communication negociation formation conduite transformation digital digitalisation data bi dashboard automatisation qualite processus amelioration continue satisfaction client fournisseur prestataire contrat achat`
    .split(/\s+/)
    .map(stem),
)

export interface Keyword {
  key: string // tiges jointes par espace
  label: string
  stems: string[]
  freq: number
  weight: number
  /** vient seulement de la présentation de l'entreprise */
  zone?: 'company'
}

const CONNECTORS = new Set(['de', 'des', 'du', 'd', 'la', 'le', 'les', 'l', 'et', 'en', 'of', 'and', 'the', 'a', 'au', 'aux', 'pour', 'sur'])
const GRAM_LINKS = new Set(['de', 'des', 'du', 'd', 'la', 'le', 'l', 'of', 'the'])

/** Extrait les mots-clés pertinents d'une offre d'emploi. */
export function extractKeywords(jobText: string, max = 40, ctx: KeywordContext = {}): Keyword[] {
  const ctxNoise = contextNoise(ctx)
  const noisy = (t: Tok) => isStop(t) || NOISE.has(t.stem) || isNumericNoise(t) || ctxNoise(t)
  // jetons avec le poids de leur zone ; les conditions (salaire, avantages) sont ignorées
  const toks: (Tok & { zw: number })[] = []
  for (const z of zonesOf(jobText)) {
    if (!ZONE_WEIGHT[z.zone]) continue
    const ts = tokenize(z.text)
    if (ts.length) ts[0].afterBreak = ts[0].sentenceStart = true
    for (const t of ts) toks.push({ ...t, zw: ZONE_WEIGHT[z.zone] })
  }
  const uni = new Map<string, { freq: number; w: number; jobW: number; tech: boolean; forms: Map<string, number> }>()
  for (const t of toks) {
    if (noisy(t) || t.norm.length < 2) continue
    if (t.norm.length < 3 && !isTechnical(t)) continue
    const e = uni.get(t.stem) ?? { freq: 0, w: 0, jobW: 0, tech: false, forms: new Map() }
    e.freq++
    e.w += t.zw
    if (t.zw === 1) e.jobW++
    e.tech ||= isTechnical(t)
    e.forms.set(t.raw, (e.forms.get(t.raw) ?? 0) + 1)
    uni.set(t.stem, e)
  }

  // n-grammes : mots de contenu consécutifs, avec connecteurs autorisés au milieu
  const grams = new Map<string, { freq: number; w: number; label: string; stems: string[]; tech: boolean }>()
  for (let i = 0; i < toks.length; i++) {
    if (noisy(toks[i]) || toks[i].norm.length < 2) continue
    const stems = [toks[i].stem]
    const raws = [toks[i].raw]
    let tech = isTechnical(toks[i]) || (!toks[i].sentenceStart && /^[A-Z]/.test(toks[i].raw))
    for (let j = i + 1; j < Math.min(toks.length, i + 5) && stems.length < 3; j++) {
      const t = toks[j]
      if (t.sentenceStart || t.afterBreak) break
      if (GRAM_LINKS.has(t.norm)) {
        if (stems.length === 0) break
        raws.push(t.raw)
        continue
      }
      if (noisy(t) || t.norm.length < 2) break
      stems.push(t.stem)
      raws.push(t.raw)
      tech = tech && /^[A-Z0-9]/.test(t.raw)
      const key = stems.join(' ')
      const e = grams.get(key) ?? { freq: 0, w: 0, label: raws.join(' '), stems: [...stems], tech }
      e.freq++
      e.w += toks[i].zw
      grams.set(key, e)
    }
  }

  const out: Keyword[] = []
  for (const [s, e] of uni) {
    const known = KNOWN.has(s)
    if (WEAK_UNI.has(s)) continue
    // présent uniquement dans la présentation de l'entreprise et peu répété : contexte, pas compétence
    if (!e.jobW && !known && !e.tech && e.w < 1) continue
    if (e.w < 2 && !e.tech && !known) continue
    let label = [...e.forms.entries()].sort((a, b) => b[1] - a[1])[0][0]
    // verbe ou participe isolé (« encadrez », « publiée ») : gardé seulement s'il désigne une action, affiché en nom
    if (!e.tech && isConjugated(label)) {
      if (!ACTION_LABEL[s]) continue
      label = ACTION_LABEL[s]
    }
    out.push({ key: s, label, stems: [s], freq: e.freq, weight: e.w * (e.tech ? 2 : 1) * (known ? 1.6 : 1), zone: e.jobW ? undefined : 'company' })
  }
  for (const [k, e] of grams) {
    const known = e.stems.every((s) => KNOWN.has(s))
    if (e.w < 2 && !e.tech && !known) continue
    out.push({ key: k, label: e.label, stems: e.stems, freq: e.freq, weight: e.w * 1.8 * (e.tech ? 1.5 : 1) * (known ? 1.3 : 1) })
  }
  // un mot isolé n'apparaissant que dans une expression retenue fait doublon
  const kept = out
    .sort((a, b) => b.weight - a.weight)
    .filter((k, _i, arr) => {
      if (k.stems.length > 1) return true
      const inGram = arr.filter((g) => g.stems.length > 1 && g.stems.includes(k.stems[0]))
      return !inGram.some((g) => g.freq >= k.freq)
    })
  return kept.slice(0, max)
}

export function cvStems(text: string): string[] {
  return tokenize(text)
    .filter((t) => !CONNECTORS.has(t.norm))
    .map((t) => t.stem)
}

export function countMatches(hay: string[], needle: string[]): number {
  let n = 0
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    n++
  }
  return n
}

export type MatchKind = 'full' | 'near' | 'partial' | 'none'
export interface KeywordResult extends Keyword {
  inCv: number
  match: MatchKind
  credit: number
}

export interface MatchResult {
  /** masqués automatiquement (déjà masqués dans d'autres candidatures) */
  auto: Keyword[]
  keywords: KeywordResult[]
  score: number
  matched: number
  total: number
}

const close = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a)))

function matchOne(hay: string[], set: Set<string>, k: Keyword): { inCv: number; match: MatchKind; credit: number } {
  const exact = countMatches(hay, k.stems)
  if (exact) return { inCv: exact, match: 'full', credit: 1 }
  const present = k.stems.filter((s) => set.has(s) || synOf(s).some((x) => set.has(x)) || hay.some((h) => close(h, s)))
  if (present.length === k.stems.length) return { inCv: 1, match: 'near', credit: 0.8 }
  if (k.stems.length > 1 && present.length / k.stems.length >= 0.5) return { inCv: 0, match: 'partial', credit: 0.4 }
  return { inCv: 0, match: 'none', credit: 0 }
}

export interface MatchOptions extends KeywordContext {
  /** mots masqués dans d'autres candidatures : masqués d'office ici */
  learned?: string[]
}

export function matchKeywords(cvText: string, jobText: string, ignored: string[] = [], extra: string[] = [], opts: MatchOptions = {}): MatchResult {
  const learned = new Set(opts.learned ?? [])
  const all = extractKeywords(jobText, 40, opts)
  const kws = all.filter((k) => !learned.has(k.key))
  const auto = all.filter((k) => learned.has(k.key) && !ignored.includes(k.key))
  for (const e of extra) {
    const stems = cvStems(e)
    if (!stems.length) continue
    const key = stems.join(' ')
    if (!kws.find((k) => k.key === key)) kws.unshift({ key, label: e, stems, freq: 1, weight: 3 })
  }
  const hay = cvStems(cvText)
  const set = new Set(hay)
  const list: KeywordResult[] = kws.filter((k) => !ignored.includes(k.key)).map((k) => ({ ...k, ...matchOne(hay, set, k) }))
  const total = list.reduce((a, k) => a + k.weight, 0)
  const got = list.reduce((a, k) => a + k.weight * k.credit, 0)
  return {
    auto,
    keywords: list,
    score: total ? Math.round((got / total) * 100) : 0,
    matched: list.filter((k) => k.match === 'full' || k.match === 'near').length,
    total: list.length,
  }
}

/* ---------- Contrôles structurels ---------- */

export type CheckStatus = 'ok' | 'warn' | 'error' | 'info'
export interface Check {
  id: string
  label: string
  status: CheckStatus
  detail: string
  /** 'ats' : affecte la lecture par un logiciel (compté dans le score). 'redaction' : conseil de rédaction (non compté). */
  kind: 'ats' | 'redaction'
}

// Contrôles qui influencent réellement la lecture par un ATS
const ATS_CHECKS = new Set(['contact', 'title', 'title-match', 'exp', 'exp-dates', 'exp-company', 'education', 'skills', 'headings', 'columns', 'format', 'photo'])

const bulletsOf = (items: SectionItem[]) => items.flatMap((i) => (i.bullets ?? []).filter((b) => b.trim()))

/** Puce au format « Thème : détails » (« Organisation du travail : plannings, absences… »). */
export const isThemed = (b: string) => /^[^:]{3,45}\s:\s*\S/.test(stripInline(b).trim())

export function startsWithAction(b: string): boolean {
  const words = strip(stripInline(b).trim()).split(/\s+/)
  const first = (words[0] ?? '').replace(/[^a-z]/g, '')
  if (!first) return false
  if (ACTION_NOUNS.includes(first) || (first === 'mise' && words[1] === 'en')) return true
  return ACTION_VERBS.some((v) => first === v || (first.length > 4 && /(e|ee|es|ees|er|ant)$/.test(first) && v.startsWith(first.replace(/(ee|es|ees|er|ant)$/, 'e').slice(0, -1))))
}

export function runChecks(doc: ResumeDoc, pages: number): Check[] {
  const checks: Check[] = []
  const secs = orderedSections(doc)
  const of = (t: string) => secs.filter((s) => s.type === t)
  const add = (id: string, label: string, status: CheckStatus, detail: string) => checks.push({ id, label, status, detail, kind: ATS_CHECKS.has(id) ? 'ats' : 'redaction' })

  const contacts = doc.header.contacts.filter((c) => c.value.trim())
  const hasEmail = contacts.some((c) => c.kind === 'email' && /@/.test(c.value))
  const hasPhone = contacts.some((c) => c.kind === 'phone' && /\d{6,}/.test(c.value.replace(/\s/g, '')))
  add('contact', 'Coordonnées', hasEmail && hasPhone ? 'ok' : 'error', hasEmail && hasPhone ? 'Email et téléphone présents.' : `Ajoutez ${!hasEmail ? 'un email' : ''}${!hasEmail && !hasPhone ? ' et ' : ''}${!hasPhone ? 'un téléphone' : ''}.`)

  add('title', 'Titre du poste', doc.header.title.trim() ? 'ok' : 'warn', doc.header.title.trim() ? 'Un titre clair aide l\'ATS à classer votre profil.' : 'Ajoutez sous votre nom l\'intitulé du poste visé.')
  if (doc.job?.title?.trim() && doc.header.title.trim()) {
    const want = cvStems(doc.job.title).filter((s) => !STOPWORDS.has(s))
    const have = new Set(cvStems(doc.header.title))
    const ok = want.filter((s) => have.has(s)).length
    add('title-match', 'Titre aligné sur l\'offre', ok >= Math.ceil(want.length / 2) ? 'ok' : 'warn', ok >= Math.ceil(want.length / 2) ? 'Votre titre reprend l\'intitulé de l\'offre.' : `Reprenez l'intitulé de l'offre (« ${doc.job.title} ») dans votre titre.`)
  }

  const summary = of('summary')[0]?.items[0]?.description?.trim() ?? ''
  add('summary', 'Résumé de profil', !summary ? 'warn' : summary.length < 150 ? 'warn' : summary.length > 700 ? 'warn' : 'ok', !summary ? 'Ajoutez un court résumé : c\'est souvent la première chose lue.' : summary.length < 150 ? 'Résumé un peu court, visez 3 à 4 lignes.' : summary.length > 700 ? 'Résumé long, visez 3 à 4 lignes.' : 'Longueur adaptée.')

  const exp = of('experience').flatMap((s) => s.items.filter((i) => !i.hidden))
  if (!exp.length) add('exp', 'Expérience', 'error', 'Aucune expérience renseignée.')
  else {
    const noDates = exp.filter((i) => !i.start?.year)
    const noCompany = exp.filter((i) => !i.subtitle?.trim())
    add('exp-dates', 'Dates des expériences', noDates.length ? 'warn' : 'ok', noDates.length ? `${noDates.length} poste(s) sans date de début : les ATS calculent l'ancienneté avec ces dates.` : 'Toutes les expériences sont datées.')
    if (noCompany.length) add('exp-company', 'Entreprises', 'warn', `${noCompany.length} poste(s) sans nom d'entreprise.`)
    // les recruteurs lisent surtout les 3 postes les plus récents ; les anciens peuvent tenir en une ligne
    const nb = (i: SectionItem) => (i.bullets ?? []).filter((b) => b.trim()).length + (i.description?.trim() && !(i.bullets ?? []).some((b) => b.trim()) ? 1 : 0)
    // postes récents : en cours ou terminés depuis moins de 10 ans (3 au plus) ; sans dates, les deux premiers
    const year = new Date().getFullYear()
    const dated = exp.filter((i) => i.current || (i.end?.year ?? i.start?.year))
    const recent = (dated.length ? exp.filter((i) => i.current || year - (i.end?.year ?? i.start?.year ?? 0) <= 10) : exp.slice(0, 2)).slice(0, 3)
    const thin = recent.filter((i) => nb(i) < 2)
    const heavy = exp.filter((i) => nb(i) > 7)
    const names = (l: SectionItem[]) => l.map((i) => i.title || 'sans titre').slice(0, 3).join(', ')
    add(
      'exp-bullets',
      'Puces par poste',
      thin.length || heavy.length ? 'warn' : 'ok',
      thin.length
        ? `Développez vos postes récents en 3 à 6 puces (${names(thin)}).`
        : heavy.length
          ? `Plus de 7 puces : gardez les plus fortes (${names(heavy)}).`
          : `Postes récents détaillés${exp.length > 3 ? ', postes plus anciens résumés : c\'est l\'équilibre attendu' : ''}.`,
    )
  }

  const bullets = bulletsOf(secs.flatMap((s) => (['experience', 'projects', 'volunteering', 'custom'].includes(s.type) ? s.items : [])))
  if (bullets.length) {
    const quant = bullets.filter((b) => /\d/.test(b)).length / bullets.length
    add('quant', 'Résultats chiffrés', quant >= 0.25 ? 'ok' : 'warn', `${Math.round(quant * 100)} % des puces contiennent un chiffre (taille d'équipe, volume, délai, gain). Visez au moins une puce chiffrée sur quatre.`)
    const themed = bullets.filter(isThemed).length
    const action = bullets.filter((b) => startsWithAction(b) || isThemed(b)).length / bullets.length
    add(
      'verbs',
      'Puces orientées action',
      action >= 0.6 ? 'ok' : 'warn',
      `${Math.round(action * 100)} % des puces commencent par une action (pilotage, déploiement, coordination…)${themed ? ` ou par un thème suivi de deux-points (${themed} puce${themed > 1 ? 's' : ''})` : ''}.${action < 0.6 ? ' Les autres décrivent un contexte plutôt qu\'une réalisation.' : ''}`,
    )
    const long = bullets.filter((b) => stripInline(b).length > 220).length
    if (long) add('long-bullets', 'Puces trop longues', 'warn', `${long} puce(s) dépassent 2 lignes : allez à l'essentiel.`)
  }

  add('education', 'Formation', of('education').length ? 'ok' : 'warn', of('education').length ? 'Section présente.' : 'Ajoutez une section Formation, attendue par la plupart des ATS.')
  add('skills', 'Compétences', of('skills').length ? 'ok' : 'warn', of('skills').length ? 'Section présente.' : 'Ajoutez une section Compétences : c\'est là que les ATS cherchent les mots-clés.')

  const nonStd = secs.filter((s) => {
    const al = SECTION_DEFS[s.type].atsAliases
    if (!al.length) return false
    const t = strip(s.title.trim())
    return !al.some((a) => strip(a) === t || t.includes(strip(a)))
  })
  add('headings', 'Titres de sections', nonStd.length ? 'warn' : 'ok', nonStd.length ? `Titres peu standards : ${nonStd.map((s) => `« ${s.title} »`).join(', ')}. Préférez des intitulés classiques.` : 'Intitulés reconnus par les ATS.')

  const words = resumeToText(doc).split(/\s+/).filter(Boolean).length
  add('length', 'Longueur', pages <= 2 && words >= 250 && words <= 1000 ? 'ok' : 'warn', `${pages} page(s), ${words} mots. ${pages > 2 ? 'Visez 2 pages maximum.' : words < 250 ? 'Contenu un peu léger.' : words > 1000 ? 'Contenu dense, pensez à synthétiser.' : 'Bon équilibre.'}`)

  if (doc.style.showPhoto && doc.header.photo) add('photo', 'Photo', 'info', 'Acceptée en France, mais ignorée par les ATS. À retirer pour les candidatures à l\'international.')
  if (doc.layout.columns === 2) add('columns', 'Mise en page deux colonnes', 'info', 'Bien lue par les ATS récents, mais certains outils anciens mélangent l\'ordre des colonnes. Pour une candidature via un portail ancien (Taleo, par exemple), préférez un modèle une colonne.')
  add('format', 'Format du fichier', 'ok', 'PDF avec texte sélectionnable, polices intégrées, liens actifs.')
  return checks
}

/** Lisibilité ATS (0-100) : uniquement les contrôles qui affectent l'analyse par un logiciel. */
export function parseScore(checks: Check[]): number {
  const pts = checks.filter((c) => c.kind === 'ats' && c.status !== 'info')
  return Math.round((pts.reduce((a, c) => a + (c.status === 'ok' ? 1 : c.status === 'warn' ? 0.6 : 0), 0) / Math.max(1, pts.length)) * 100)
}

/** Score global : 75 % correspondance des mots-clés, 25 % lisibilité. Les conseils de rédaction ne comptent pas. */
export function overallScore(match: MatchResult | null, checks: Check[]): number {
  const p = parseScore(checks)
  if (!match || !match.total) return p
  return Math.round(match.score * 0.75 + p * 0.25)
}
