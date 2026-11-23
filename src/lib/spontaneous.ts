// Candidatures spontanées : analyse de l'entreprise par Claude, pseudo-annonce tirée de ses besoins.
import type { CompanyAnalysis, FeedItem, MatchProfile, Offer } from '../types'
import { extractJson } from './prompts'

export const SPONTANEOUS = 'Candidature spontanée'

/** Intitulé affiché d'une candidature spontanée : ses postes visés, sinon « Candidature spontanée ». */
export const spontaneousTitle = (posts?: string[]) => (posts?.length ? posts.join(' / ') : SPONTANEOUS)

const norm = (s?: string) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(sas|sa|sarl|sasu|group|groupe|france)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Même entreprise ? (« Groupe GSF » et « GSF » se valent) */
export const sameCompany = (a?: string, b?: string) => {
  const x = norm(a)
  const y = norm(b)
  return !!x && !!y && (x === y || (x.length > 3 && y.includes(x)) || (y.length > 3 && x.includes(y)))
}

/** Annonces de la veille publiées par cette entreprise. */
export const companyOpenings = (company: string | undefined, items: FeedItem[] | undefined) => (items ?? []).filter((i) => sameCompany(i.company, company))

/** Postes à proposer : ceux suggérés par Claude, les annonces de l'entreprise, puis mes métiers visés. */
export function postSuggestions(o: Pick<Offer, 'company' | 'analysis' | 'posts'>, items: FeedItem[] | undefined, profile?: MatchProfile): { title: string; from: string; fit?: number }[] {
  const out: { title: string; from: string; fit?: number }[] = []
  const add = (title: string | undefined, from: string, fit?: number) => {
    const t = title?.trim()
    if (!t || out.some((x) => norm(x.title) === norm(t)) || o.posts?.some((p) => norm(p) === norm(t))) return
    out.push({ title: t, from, fit })
  }
  for (const p of [...(o.analysis?.posts ?? [])].sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0))) add(p.title, 'Proposé par Claude', p.fit)
  for (const i of companyOpenings(o.company, items)) add(i.title.replace(/\s*[([]?\s*\b(h\s*\/\s*f|f\s*\/\s*h)\b\s*[)\]]?/gi, ' ').replace(/\s+/g, ' '), 'Offre publiée par l\'entreprise')
  for (const t of profile?.tracks?.flatMap((t) => t.targets) ?? profile?.targets ?? []) add(t, 'Mes métiers visés')
  return out
}

/** Pseudo-annonce : ce que l'entreprise cherche probablement, pour le score ATS, l'adaptation du CV et la lettre. */
export function spontaneousDescription(o: Pick<Offer, 'company' | 'posts' | 'analysis'>): string {
  const a = o.analysis
  if (!a) return ''
  const lines = [
    `Candidature spontanée${o.company ? ` chez ${o.company}` : ''} : pas d'annonce publiée, besoins déduits de l'analyse de l'entreprise.`,
    o.posts?.length ? `Postes visés : ${o.posts.join(', ')}.` : '',
    a.summary ? `\nL'entreprise : ${a.summary}` : '',
    a.news?.length ? `\nActualités :\n${a.news.map((n) => `- ${n}`).join('\n')}` : '',
    a.needs?.length ? `\nBesoins probables :\n${a.needs.map((n) => `- ${n.need}${n.why ? ` (${n.why})` : ''}`).join('\n')}` : '',
    a.openings?.length ? `\nOffres publiées par l'entreprise :\n${a.openings.map((x) => `- ${x.title}`).join('\n')}` : '',
    a.angle ? `\nAngle d'approche : ${a.angle}` : '',
  ]
  return lines.filter(Boolean).join('\n').trim()
}

export function companyAnalysisPrompt(o: Offer, opts: { cvText: string; profile?: MatchProfile; openings: FeedItem[] }): string {
  const tracks = opts.profile?.tracks?.length
    ? opts.profile.tracks.map((t) => `- ${t.name} : ${t.targets.join(', ')}`).join('\n')
    : (opts.profile?.targets ?? []).map((t) => `- ${t}`).join('\n')
  const known = opts.openings.length ? `\nOffres de cette entreprise déjà repérées par ma veille :\n${opts.openings.map((i) => `- ${i.title}${i.location ? ` (${i.location})` : ''}${i.url ? ` ${i.url}` : ''}`).join('\n')}\n` : ''
  return `Je prépare une candidature spontanée chez ${o.company || "l'entreprise ci-dessous"}${o.website ? ` (${o.website})` : ''}. Fais une recherche web sur cette entreprise (site officiel, page carrières, actualités récentes, presse locale, LinkedIn, offres d'emploi publiées) puis dis-moi si ma candidature a du sens et sous quel angle.

Ce que je veux savoir :
1. L'entreprise : activité, secteur, taille, sites${opts.profile?.home?.nom ? ` (en particulier autour de ${opts.profile.home.nom})` : ''}, en 2 ou 3 phrases.
2. Ses actualités des 12 derniers mois qui peuvent créer un besoin (croissance, rachat, nouveau site, déménagement, transformation numérique, changement d'outil, départs).
3. Ses besoins probables, déduits de ces actualités, de ses offres publiées et de son secteur, chacun avec sa justification.
4. Les offres qu'elle publie en ce moment, même hors de mon profil : elles disent ce qui lui manque.
5. À qui écrire : la fonction la plus pertinente (DSI, DRH, directeur des opérations…) et le nom s'il est public, avec le lien de la source.
6. Les postes que je pourrais lui proposer, du plus crédible au moins crédible, avec une note d'adéquation sur 100 pour chacun.
7. Mon adéquation globale sur 100, ce qui colle, ce qui manque, et un verdict : "go" (à tenter), "angle" (possible avec un angle précis) ou "no" (pas pour moi).
8. L'angle d'approche en une ou deux phrases : par quel besoin entrer.

Sois honnête : si rien ne colle, dis-le. N'invente rien : si une information est introuvable, laisse le champ vide. Cite tes sources.
${o.posts?.length ? `\nPostes auxquels je pense déjà : ${o.posts.join(', ')}. Dis-moi s'ils sont crédibles chez eux.\n` : ''}${known}
Mes profils de recherche :
${tracks || '- (non précisés)'}

<mon_cv>
${opts.cvText.trim()}
</mon_cv>

Réponds en français. Termine par un bloc \`\`\`json de cette forme exacte (les textes courts, sans markdown) :
{"summary": "", "sector": "", "size": "", "website": "", "careersUrl": "", "news": [""], "needs": [{"need": "", "why": ""}], "openings": [{"title": "", "url": ""}], "contacts": [{"role": "", "name": "", "url": ""}], "posts": [{"title": "", "why": "", "fit": 0}], "fit": 0, "verdict": "go", "matches": [""], "gaps": [""], "angle": "", "sources": [""]}`
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : [])
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : typeof v === 'string' && /^\d+$/.test(v) ? Math.min(100, +v) : undefined)
const objs = <T,>(v: unknown, map: (x: Record<string, unknown>) => T | undefined): T[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').map(map).filter((x): x is T => !!x) : []

/** Lit la réponse de Claude (bloc JSON) ; lève une erreur lisible sinon. */
export function parseCompanyAnalysis(text: string): CompanyAnalysis {
  const j = extractJson<Record<string, unknown>>(text)
  const verdict = str(j.verdict).toLowerCase()
  const a: CompanyAnalysis = {
    at: Date.now(),
    summary: str(j.summary) || undefined,
    sector: str(j.sector) || undefined,
    size: str(j.size) || undefined,
    website: str(j.website) || undefined,
    careersUrl: str(j.careersUrl) || undefined,
    news: strs(j.news),
    needs: objs(j.needs, (x) => (str(x.need) ? { need: str(x.need), why: str(x.why) || undefined } : undefined)),
    openings: objs(j.openings, (x) => (str(x.title) ? { title: str(x.title), url: str(x.url) || undefined } : undefined)),
    contacts: objs(j.contacts, (x) => (str(x.role) || str(x.name) ? { role: str(x.role), name: str(x.name) || undefined, url: str(x.url) || undefined } : undefined)),
    posts: objs(j.posts, (x) => (str(x.title) ? { title: str(x.title), why: str(x.why) || undefined, fit: num(x.fit) } : undefined)),
    fit: num(j.fit),
    verdict: verdict === 'go' || verdict === 'angle' || verdict === 'no' ? verdict : undefined,
    matches: strs(j.matches),
    gaps: strs(j.gaps),
    angle: str(j.angle) || undefined,
    sources: strs(j.sources),
  }
  if (!a.summary && !a.needs?.length && a.fit === undefined) throw new Error("La réponse ne contient pas la fiche attendue : collez toute la réponse de Claude, bloc JSON compris.")
  return a
}

export const VERDICT: Record<NonNullable<CompanyAnalysis['verdict']>, { label: string; tone: string }> = {
  go: { label: 'À tenter', tone: 'ok' },
  angle: { label: 'Possible avec un angle précis', tone: 'mid' },
  no: { label: 'Pas pour moi', tone: 'low' },
}
