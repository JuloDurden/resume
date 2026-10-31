import type { ContactLink, DateValue, JobTarget, LetterDoc, ResumeDoc, Section, SectionItem, SectionType } from '../types'
import { ICONS, PICKABLE_ICONS } from './icons'
import { resumeContentJson } from './export'
import { uid } from './ids'
import { SECTION_DEFS } from '../data/sectionDefs'

export type ClaudeAction = 'summary' | 'bullets' | 'tailor' | 'letter' | 'ats' | 'translate' | 'interview' | 'improve-letter'

export interface ActionDef {
  id: ClaudeAction
  label: string
  description: string
  needsJob?: boolean
  result: 'text' | 'bullets' | 'resume-json' | 'letter-json' | 'none'
}

export const ACTIONS: ActionDef[] = [
  { id: 'tailor', label: 'Adapter le CV à l\'offre', description: 'Claude réécrit le CV pour l\'offre et vous collez le résultat : une copie adaptée est créée.', needsJob: true, result: 'resume-json' },
  { id: 'letter', label: 'Rédiger la lettre de motivation', description: 'Lettre personnalisée à partir du CV et de l\'offre, créée comme nouveau document.', needsJob: true, result: 'letter-json' },
  { id: 'summary', label: 'Améliorer le résumé', description: 'Un résumé percutant de 3 à 4 lignes.', result: 'text' },
  { id: 'bullets', label: 'Réécrire les puces d\'un poste', description: 'Puces orientées résultats, avec verbes d\'action.', result: 'bullets' },
  { id: 'ats', label: 'Analyse ATS approfondie', description: 'Diagnostic détaillé du CV face à l\'offre, à lire dans Claude.', needsJob: true, result: 'none' },
  { id: 'interview', label: 'Préparer l\'entretien', description: 'Questions probables et éléments de réponse tirés du CV.', needsJob: true, result: 'none' },
  { id: 'translate', label: 'Traduire le CV en anglais', description: 'Une copie anglaise du CV est créée.', result: 'resume-json' },
]

const RULES = `Règles impératives :
- N'invente aucune expérience, compétence, certification, date ni chiffre. Si un résultat chiffré serait utile mais absent, écris [X] pour que je le complète.
- Écris en français (sauf demande contraire), sans tiret cadratin ni tiret demi-cadratin.
- Style sobre et factuel, sans superlatifs creux.`

const jobBlock = (job?: JobTarget) =>
  job?.description?.trim()
    ? `\n<offre_d_emploi>\n${job.title ? `Intitulé : ${job.title}\n` : ''}${job.company ? `Entreprise : ${job.company}\n` : ''}${job.description.trim()}\n</offre_d_emploi>\n`
    : ''

const cvBlock = (doc: ResumeDoc) => `\n<cv format="json">\n${JSON.stringify(resumeContentJson(doc), null, 2)}\n</cv>\n`

const JSON_SCHEMA = `Réponds uniquement avec un bloc \`\`\`json contenant un objet de même structure que le CV fourni :
{"header": {"name", "title", "contacts": [{"kind", "value"}]}, "sections": [{"type", "title", "items": [...]}]}
Conserve les types de section et les champs (title, subtitle, location, start, end, current, description, bullets, tags, level, icon, link). Les puces acceptent **gras** et *italique*.`

export function buildPrompt(action: ClaudeAction, doc: ResumeDoc, opts: { itemId?: string; letter?: LetterDoc; keywords?: string[] } = {}): string {
  const job = doc.job
  switch (action) {
    case 'summary':
      return `Tu es un expert du recrutement en France. Rédige le résumé de profil (3 à 4 lignes, 350 à 550 caractères) placé en haut de mon CV.${job?.description ? ' Il doit répondre aux attentes de l\'offre ci-dessous.' : ''}
${RULES}
${cvBlock(doc)}${jobBlock(job)}
Réponds uniquement avec le texte du résumé, sans titre ni commentaire. Propose ensuite, après une ligne "---", deux variantes plus courtes.`
    case 'bullets': {
      const item = doc.sections.flatMap((s) => s.items).find((i) => i.id === opts.itemId)
      return `Tu es un expert du recrutement en France. Réécris les puces de ce poste pour qu'elles soient orientées résultats : une action, un périmètre, un résultat mesurable. Commence chaque puce par un verbe ou un nom d'action. 3 à 6 puces, une ligne et demie maximum chacune.${job?.description ? ' Mets en avant ce qui répond à l\'offre ci-dessous et reprends ses mots-clés quand c\'est exact.' : ''}
${RULES}

<poste>
${JSON.stringify({ poste: item?.title, entreprise: item?.subtitle, contexte: item?.description, puces: item?.bullets }, null, 2)}
</poste>
${jobBlock(job)}
Réponds uniquement avec les puces, une par ligne, chacune commençant par "- ".`
    }
    case 'tailor':
      return `Tu es un expert du recrutement et des ATS en France. Adapte mon CV à l'offre ci-dessous pour maximiser mes chances, sans rien inventer :
- Ajuste le titre et le résumé à l'intitulé de l'offre.
- Reformule et réordonne les puces pour faire ressortir ce qui correspond à l'offre, en reprenant ses mots-clés lorsque c'est exact.
- Réordonne les compétences pour placer en tête celles demandées.${opts.keywords?.length ? `\n- Mots-clés absents de mon CV d'après l'analyse : ${opts.keywords.join(', ')}. Intègre-les uniquement s'ils correspondent à une compétence réelle déjà visible dans le CV.` : ''}
${RULES}
${cvBlock(doc)}${jobBlock(job)}
${JSON_SCHEMA}
Après le bloc JSON, liste en 5 lignes maximum les changements faits et les points que je dois vérifier.`
    case 'translate':
      return `Traduis mon CV en anglais professionnel (anglais britannique), en adaptant les intitulés de section et les formulations aux usages anglo-saxons. Garde les noms propres, entreprises et diplômes français tels quels avec une courte équivalence entre parenthèses si utile.
Ne rajoute aucune information.
${cvBlock(doc)}
${JSON_SCHEMA}`
    case 'letter':
      return `Tu es un expert du recrutement en France. Rédige ma lettre de motivation pour l'offre ci-dessous, à partir de mon CV.
- 3 à 4 paragraphes, 250 à 350 mots au total, ton professionnel et direct.
- Premier paragraphe : pourquoi ce poste et cette entreprise. Deuxième : deux ou trois réalisations concrètes du CV qui répondent aux besoins de l'offre. Troisième : ce que j'apporte et la demande d'entretien.
- Évite les formules toutes faites ("je me permets de", "dynamique et motivé").
${RULES}
${cvBlock(doc)}${jobBlock(job)}
Réponds uniquement avec un bloc \`\`\`json de la forme :
{"subject": "Candidature au poste de ...", "salutation": "Madame, Monsieur,", "body": "paragraphe 1\\n\\nparagraphe 2\\n\\nparagraphe 3", "closing": "formule de politesse", "recipient": {"name": "", "title": "", "company": "", "address": ""}}`
    case 'improve-letter':
      return `Relis et améliore ma lettre de motivation : clarté, concision, impact, orthographe. Garde ma voix et mes faits.
${RULES}

<lettre>
${opts.letter ? JSON.stringify({ subject: opts.letter.subject, salutation: opts.letter.salutation, body: opts.letter.body, closing: opts.letter.closing }, null, 2) : ''}
</lettre>
${jobBlock(opts.letter?.job ?? job)}
Réponds uniquement avec un bloc \`\`\`json de la forme {"subject", "salutation", "body", "closing"} (paragraphes du body séparés par une ligne vide), puis liste en 3 lignes les principales modifications.`
    case 'ats':
      return `Tu es un expert des ATS (Taleo, Workday, SAP SuccessFactors, Teamtailor...) et du recrutement en France. Analyse mon CV face à l'offre :
1. Score de correspondance estimé sur 100 et justification courte.
2. Mots-clés et compétences de l'offre présents, absents, ou présents sous une autre formulation.
3. Exigences de l'offre non couvertes par le CV et comment les traiter honnêtement.
4. Les 5 modifications prioritaires, concrètes, avec la formulation proposée.
5. Points de vigilance de lecture par un ATS.
Présente le résultat de façon structurée, avec des indicateurs visuels, et sois direct.
${RULES}
${cvBlock(doc)}${jobBlock(job)}`
    case 'interview':
      return `Prépare-moi à l'entretien pour l'offre ci-dessous :
1. Les 10 questions les plus probables (techniques, comportementales, motivation).
2. Pour chacune, les éléments de mon CV à utiliser, au format STAR quand c'est pertinent.
3. Les 3 points faibles de mon profil pour ce poste et comment les aborder.
4. 5 questions à poser au recruteur.
${RULES}
${cvBlock(doc)}${jobBlock(job)}`
  }
}

/* ---------- Lecture des réponses de Claude ---------- */

export function extractJson<T = unknown>(text: string): T {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  let body = fence ? fence[1] : text
  if (!fence) {
    const a = body.indexOf('{')
    const b = body.lastIndexOf('}')
    if (a < 0 || b < 0) throw new Error('Aucun JSON trouvé dans la réponse.')
    body = body.slice(a, b + 1)
  }
  return JSON.parse(body.trim()) as T
}

export function parseBullets(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^([-*•▸]|\d+[.)])\s+/.test(l))
    .map((l) => l.replace(/^([-*•▸]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
}

export function parseSummary(text: string): string {
  return text.split(/\n\s*---\s*\n/)[0].trim()
}

interface ClaudeResume {
  header?: { name?: string; title?: string; contacts?: { kind?: string; value?: string }[] }
  sections?: { type?: string; title?: string; items?: Partial<SectionItem>[] }[]
}

const CONTACT_KINDS: ContactLink['kind'][] = ['email', 'phone', 'location', 'linkedin', 'website', 'github', 'other', 'info']

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const strList = (v: unknown) => (Array.isArray(v) ? v.map(str).filter((x): x is string => !!x) : undefined)

function cleanDate(v: unknown): DateValue | undefined {
  if (!v) return
  if (typeof v === 'string' || typeof v === 'number') {
    const m = /(?:(\d{1,2})[/.-])?(\d{4})/.exec(String(v))
    return m ? { year: Number(m[2]), month: m[1] ? Number(m[1]) : undefined } : undefined
  }
  const o = v as DateValue
  const year = Number(o.year)
  if (!year || year < 1950 || year > 2100) return
  const month = Number(o.month)
  return { year, month: month >= 1 && month <= 12 ? month : undefined }
}

/** Nettoie une entrée renvoyée par Claude pour qu'elle respecte le format de l'application. */
export function cleanItem(raw: Partial<SectionItem> | undefined): SectionItem {
  const it = (raw ?? {}) as Record<string, unknown>
  const level = Number(it.level)
  return {
    id: uid(),
    title: str(it.title),
    subtitle: str(it.subtitle),
    location: str(it.location),
    start: cleanDate(it.start),
    end: cleanDate(it.end),
    current: it.current === true || undefined,
    description: str(it.description),
    bullets: strList(it.bullets),
    link: str(it.link),
    level: Number.isFinite(level) ? Math.max(0, Math.min(5, Math.round(level))) : undefined,
    tags: strList(it.tags),
    icon: typeof it.icon === 'string' && it.icon in ICONS ? it.icon : undefined,
  }
}

/** Construit un nouveau CV à partir de la réponse JSON de Claude, en gardant le style et la disposition du CV source. */
export function resumeFromClaude(src: ResumeDoc, data: ClaudeResume, name: string): ResumeDoc {
  if (!data || !Array.isArray(data.sections)) throw new Error('Le JSON ne contient pas de liste "sections".')
  const sideTypes = new Set(src.layout.side.map((id) => src.sections.find((s) => s.id === id)?.type))
  const sections: Section[] = data.sections.map((s) => {
    const type = (s.type && s.type in SECTION_DEFS ? s.type : 'custom') as SectionType
    const prev = src.sections.find((x) => x.type === type)
    return {
      id: uid(),
      type,
      title: s.title || SECTION_DEFS[type].defaultTitle,
      options: prev ? { ...prev.options } : { ...SECTION_DEFS[type].defaults },
      items: (Array.isArray(s.items) ? s.items : []).map((it) => cleanItem(it)),
    }
  })
  const side = src.layout.columns === 2 ? sections.filter((s) => sideTypes.has(s.type)).map((s) => s.id) : []
  const main = sections.filter((s) => !side.includes(s.id)).map((s) => s.id)
  const contacts = Array.isArray(data.header?.contacts)
    ? data.header!.contacts!.filter((c) => c && typeof c.value === 'string' && c.value.trim()).map((c) => ({ id: uid(), kind: (CONTACT_KINDS.includes(c.kind as never) ? c.kind : 'other') as ContactLink['kind'], value: c.value!.trim() }))
    : src.header.contacts
  const now = Date.now()
  return {
    ...structuredClone(src),
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    header: { ...src.header, name: data.header?.name || src.header.name, title: data.header?.title ?? src.header.title, contacts },
    sections,
    layout: { ...src.layout, main, side },
  }
}

export const CLAUDE_URL = 'https://claude.ai/new'

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

/* ---------- Import d'un CV PDF ---------- */

export function pdfImportPrompt(): string {
  const types = Object.values(SECTION_DEFS)
    .map((d) => `- "${d.type}" : ${d.label}`)
    .join('\n')
  return `Je te joins mon CV au format PDF. Convertis-le fidèlement en JSON pour que je puisse l'importer dans mon éditeur de CV.

Règles impératives :
- Recopie le texte tel quel : ne reformule pas, ne corrige pas, n'ajoute ni ne supprime aucune information.
- Respecte l'ordre des sections et des entrées du PDF. Si le CV a deux colonnes, traite chaque section entièrement avant de passer à la suivante.
- Une entrée par poste, diplôme, certification, langue, etc. Chaque ligne à puce devient un élément de "bullets", sans le symbole de puce.
- Dates au format {"month": 1 à 12, "year": AAAA} ; omets "month" s'il n'est pas indiqué. Pour un poste en cours, mets "current": true sans "end".
- Garde le **gras** présent dans les puces en l'entourant de deux astérisques.
- N'écris jamais de tiret cadratin ni de tiret demi-cadratin.

Format attendu, un seul bloc \`\`\`json :
{
  "header": {
    "name": "Prénom Nom",
    "title": "Titre sous le nom",
    "contacts": [{"kind": "email | phone | location | linkedin | website | github | other | info (texte sans lien, ex. permis)", "value": "..."}]
  },
  "sections": [
    {"type": "...", "title": "titre de la section tel qu'il apparaît", "items": [ ... ]}
  ]
}

Types de section disponibles (choisis le plus proche, sinon "custom") :
${types}

Champs d'une entrée selon le type :
- summary, text : {"description": "texte, paragraphes séparés par une ligne vide"}
- experience, education, projects, volunteering, custom : {"title": "poste ou diplôme", "subtitle": "entreprise ou école", "location": "ville", "start": {...}, "end": {...}, "current": false, "description": "contexte éventuel", "bullets": ["..."], "link": "url éventuelle"}
- certifications, awards, publications : {"title", "subtitle": "organisme", "end": {"year": AAAA}, "description"}
- skills : une entrée par groupe {"title": "nom du groupe ou vide", "tags": ["compétence 1", "compétence 2"], "level": 0 à 5 si une jauge est affichée}
- languages : {"title": "Anglais", "subtitle": "niveau écrit (ex. C1, courant)", "level": 0 à 5}
- achievements, interests : {"icon": un nom parmi ${PICKABLE_ICONS.join(', ')}, "title", "description"}
- references : {"title": "nom", "subtitle": "poste, entreprise", "description": "coordonnées"}

Après le bloc JSON, signale en une ou deux lignes ce que tu n'as pas pu lire ou classer avec certitude.`
}
