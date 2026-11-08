// Offres publiées sur les pages carrières des entreprises (liste dans data/watch.json, champ companies).
// 1. Logiciels de recrutement connus : leurs API publiques (Lever, Greenhouse, SmartRecruiters, Recruitee,
//    Workable, Teamtailor).
// 2. Autres sites : la page carrières est lue (affichée par un navigateur si besoin), les liens d'offres
//    repérés, puis chaque offre lue via ses données structurées JobPosting (utilisées par Google Jobs).
import { createHash } from 'node:crypto'
import { render } from './browser.mjs'

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
const EVERY_H = 6
/** version de la lecture : changer pour relire toutes les pages carrières au prochain passage */
const CAREER_V = 2
const MAX_DETAILS = 30
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12)

const decode = (s) =>
  (s ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
const htmlText = (s) =>
  decode(decode(s ?? ''))
    .replace(/<br\s*\/?>|<\/(p|li|div|h\d|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 7000)

async function get(url, init = {}) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 15000)
  try {
    return await fetch(url, { ...init, signal: ctl.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr', ...(init.headers ?? {}) } })
  } finally {
    clearTimeout(t)
  }
}
const json = async (url, init) => {
  const r = await get(url, init)
  if (!r.ok) throw new Error(`${new URL(url).hostname} : erreur ${r.status}`)
  return r.json()
}

/* ---------- logiciels de recrutement ---------- */

const ATS = [
  {
    name: 'Lever',
    re: /jobs\.(?:eu\.)?lever\.co\/([\w.-]+)/,
    async list(co, url) {
      const eu = /eu\.lever/.test(url) ? 'api.eu' : 'api'
      return (await json(`https://${eu}.lever.co/v0/postings/${co}?mode=json`)).map((j) => ({
        title: j.text,
        location: j.categories?.location,
        contract: j.categories?.commitment,
        url: j.hostedUrl,
        date: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
        text: htmlText([j.descriptionPlain ?? j.description, ...(j.lists ?? []).map((l) => `${l.text}\n${l.content}`), j.additionalPlain].filter(Boolean).join('\n\n')),
      }))
    },
  },
  {
    name: 'Greenhouse',
    re: /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([\w-]+)/,
    async list(co) {
      return ((await json(`https://boards-api.greenhouse.io/v1/boards/${co}/jobs?content=true`)).jobs ?? []).map((j) => ({
        title: j.title,
        location: j.location?.name,
        url: j.absolute_url,
        date: j.first_published ?? j.updated_at,
        text: htmlText(j.content),
      }))
    },
  },
  {
    name: 'SmartRecruiters',
    re: /(?:careers|jobs)\.smartrecruiters\.com\/([\w-]+)/,
    async list(co) {
      const d = await json(`https://api.smartrecruiters.com/v1/companies/${co}/postings?limit=100`)
      return (d.content ?? []).map((j) => ({
        title: j.name,
        location: [j.location?.city, j.location?.region].filter(Boolean).join(', '),
        contract: j.typeOfEmployment?.label,
        url: `https://jobs.smartrecruiters.com/${co}/${j.id}`,
        date: j.releasedDate,
        detail: async () => {
          const x = await json(`https://api.smartrecruiters.com/v1/companies/${co}/postings/${j.id}`)
          return htmlText(Object.values(x.jobAd?.sections ?? {}).map((s) => `${s.title ?? ''}\n${s.text ?? ''}`).join('\n\n'))
        },
      }))
    },
  },
  {
    name: 'Recruitee',
    re: /([\w-]+)\.recruitee\.com/,
    async list(co) {
      return ((await json(`https://${co}.recruitee.com/api/offers/`)).offers ?? []).map((j) => ({
        title: j.title,
        location: j.location ?? j.city,
        contract: j.employment_type_code,
        url: j.careers_url,
        date: j.published_at ?? j.created_at,
        text: htmlText(`${j.description ?? ''}\n${j.requirements ?? ''}`),
      }))
    },
  },
  {
    name: 'Workable',
    re: /apply\.workable\.com\/([\w-]+)/,
    async list(co) {
      const d = await json(`https://apply.workable.com/api/v3/accounts/${co}/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      return (d.results ?? []).map((j) => ({
        title: j.title,
        location: [j.location?.city, j.location?.country].filter(Boolean).join(', '),
        contract: j.type,
        url: `https://apply.workable.com/${co}/j/${j.shortcode}/`,
        date: j.published,
        detail: async () => {
          const x = await json(`https://apply.workable.com/api/v2/accounts/${co}/jobs/${j.shortcode}`)
          return htmlText(`${x.description ?? ''}\n${x.requirements ?? ''}\n${x.benefits ?? ''}`)
        },
      }))
    },
  },
  {
    name: 'Teamtailor',
    re: /([\w-]+)\.teamtailor\.com/,
    async list(co) {
      const r = await get(`https://${co}.teamtailor.com/jobs.rss`)
      if (!r.ok) throw new Error(`Teamtailor : erreur ${r.status}`)
      const xml = await r.text()
      return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
        const tag = (n) => decode(new RegExp(`<${n}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${n}>`).exec(it)?.[1] ?? '')
        // lieu : <tt:location><tt:city>Montpellier</tt:city><tt:zip>34000</tt:zip>...</tt:location>
        const loc = tag('tt:location')
        const sub = (n) => new RegExp(`<tt:${n}>([^<]*)</tt:${n}>`).exec(loc)?.[1]?.trim()
        const city = sub('city') || sub('name')
        const zip = sub('zip')
        return { title: tag('title'), url: tag('link'), date: tag('pubDate') ? new Date(tag('pubDate')).toISOString() : undefined, location: city ? `${city}${zip ? ` (${zip.slice(0, 2)})` : ''}` : htmlText(loc) || undefined, text: htmlText(tag('description')) }
      })
    },
  },
]

/* ---------- lecture générique ---------- */

const JOB_PATH = /job|emploi|offre|offer|career|carriere|poste|position|recrut|annonce|vacanc|opportunit|jobs\/|candidat/i
/** Lien vers une offre précise (et non une page de rubrique) : chemin assez profond, terminé par un identifiant ou un intitulé. */
const POSTING = (href) => {
  try {
    const u = new URL(href)
    if (/welcometothejungle/.test(u.hostname)) return /\/companies\/[^/]+\/jobs\/[^/?#]+/.test(u.pathname)
    const segs = u.pathname.split('/').filter(Boolean)
    const last = segs.at(-1) ?? ''
    return JOB_PATH.test(u.pathname + u.search) && (segs.length >= 2 || /[?&](id|job|offre|offer|ref)\w*=/i.test(u.search)) && (/\d{3,}/.test(last + u.search) || last.split(/[-_]/).length >= 3)
  } catch {
    return false
  }
}
/** Contenu principal d'une page (sans menus, en-tête ni pied de page). */
async function mainText(html) {
  try {
    const { parse } = await import('node-html-parser')
    const root = parse(html)
    root.querySelectorAll('script,style,noscript,nav,header,footer,aside,form,[role=navigation],[class*=cookie],[id*=cookie],[class*=menu],[class*=breadcrumb]').forEach((e) => e.remove())
    const cands = root.querySelectorAll('article,main,[class*=job],[class*=offre],[class*=offer],[class*=annonce],[class*=description],[class*=content],[id*=content]')
    const best = cands.map((e) => ({ e, n: e.structuredText.length })).sort((a, b) => b.n - a.n)[0]
    const el = best && best.n > 300 ? best.e : root.querySelector('body') ?? root
    return el.structuredText.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 7000)
  } catch {
    return htmlText(html)
  }
}

/** Page d'offre sans données structurées : on vérifie qu'elle ressemble à une annonce. */
const LOOKS_LIKE_JOB = /(profil recherch|vos missions|missions principales|description du poste|le poste|type de contrat|\bCDI\b|\bCDD\b|job description|responsibilities|requirements|qualifications)/i
const NOT_JOB = /linkedin|facebook|twitter|x\.com|instagram|youtube|glassdoor|indeed\.|mailto:|tel:|\.pdf$|politique|privacy|cookie|mentions|login|connexion|signup|inscription|spontan/i
const NAV_TEXT = /^(voir|en savoir|d[ée]couvr|postuler|candidater|toutes? les|nos offres|offres d.emploi|rejoignez|accueil|menu|suivant|pr[ée]c[ée]dent|retour|plus|\d+)$/i

function jobPosting(html) {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      // certains sites laissent des retours à la ligne bruts dans les chaînes : JSON tolérant
      const d = JSON.parse(m[1].replace(/[\u0000-\u001f]+/g, ' '))
      const list = [d, ...(Array.isArray(d) ? d : []), ...(d?.['@graph'] ?? [])].flat()
      const jp = list.find((x) => x && (x['@type'] === 'JobPosting' || (Array.isArray(x['@type']) && x['@type'].includes('JobPosting'))))
      if (jp) return jp
    } catch {
      /* JSON invalide */
    }
  }
  return null
}

function fromPosting(jp, url) {
  const loc = [jp.jobLocation].flat().filter(Boolean)[0]?.address
  const place = typeof loc === 'string' ? loc : [loc?.addressLocality, loc?.postalCode ? `(${String(loc.postalCode).slice(0, 2)})` : ''].filter(Boolean).join(' ')
  const sal = jp.baseSalary?.value
  return {
    employer: typeof jp.hiringOrganization === 'string' ? jp.hiringOrganization : jp.hiringOrganization?.name,
    title: htmlText(jp.title ?? jp.name ?? ''),
    location: place || undefined,
    contract: [jp.employmentType].flat().filter(Boolean).join(', ') || undefined,
    salary: sal ? [sal.minValue, sal.maxValue ?? sal.value].filter(Boolean).join(' - ') + ` ${jp.baseSalary.currency ?? '€'} ${sal.unitText ?? ''}`.trim() : undefined,
    date: jp.datePosted,
    url: jp.url && /^https?:/.test(jp.url) ? jp.url : url,
    text: htmlText([jp.description, jp.qualifications, jp.responsibilities, jp.educationRequirements?.credentialCategory ?? jp.educationRequirements, jp.experienceRequirements?.description ?? jp.experienceRequirements].filter((x) => typeof x === 'string').join('\n\n')),
  }
}

async function page(url) {
  try {
    const r = await get(url)
    const html = r.ok ? await r.text() : ''
    const links = [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => {
      let href = m[1]
      try {
        href = new URL(decode(m[1]), r.url || url).href
      } catch {
        /* lien invalide */
      }
      return { href, text: htmlText(m[2]).replace(/\s+/g, ' ').trim() }
    })
    return { html, links, url: r.url || url }
  } catch {
    return { html: '', links: [], url }
  }
}

/** Liens d'offres d'une page carrières (avec un navigateur si la liste est construite par script). */
async function jobLinks(url) {
  let p = await page(url)
  const pick = (links, base) => {
    const host = new URL(base).hostname.replace(/^www\./, '')
    const seen = new Set()
    return links.filter((l) => {
      if (!l.href.startsWith('http') || NOT_JOB.test(l.href) || seen.has(l.href) || l.href.replace(/\/$/, '') === base.replace(/\/$/, '')) return false
      const sameSite = new URL(l.href).hostname.replace(/^www\./, '').endsWith(host.split('.').slice(-2).join('.'))
      const ats = ATS.some((a) => a.re.test(l.href)) || /welcometothejungle|jobaffinity|taleez|flatchr|digitalrecruiters|breezy|bamboohr|join\.com|softgarden|talentview|jobs\.|careers\./.test(l.href)
      if (!(sameSite || ats) || !POSTING(l.href)) return false
      const t = l.text
      if (t.length < 6 || t.length > 160 || NAV_TEXT.test(t)) return false
      seen.add(l.href)
      return true
    })
  }
  let found = pick(p.links, p.url)
  if (found.length < 2 || !p.html) {
    const r = await render(url)
    if (r) {
      p = { html: r.html, links: r.links, url: r.url }
      found = pick(r.links, r.url)
    }
  }
  return found
}

/* ---------- assemblage ---------- */

/**
 * @param companies [{ id, name, url, all? }]
 * @param keep (titre) => ids des alertes correspondantes ([] : hors de vos recherches)
 */
export async function readCareers({ companies, keep, add, notes, sources, prevStatus }) {
  const status = { ...(prevStatus ?? {}) }
  let total = 0
  for (const c of companies) {
    if (!c?.url || !c.id) continue
    const last = status[c.id]
    if (last?.at && last.v === CAREER_V && last.url === c.url && last.all === !!c.all && Date.now() - new Date(last.at).getTime() < EVERY_H * 3600000 && !last.error) {
      // lu récemment : les offres déjà connues restent dans la liste
      continue
    }
    const st = { at: new Date().toISOString(), v: CAREER_V, url: c.url, all: !!c.all, jobs: 0, kept: 0, method: '' }
    try {
      const ats = ATS.find((a) => a.re.test(c.url))
      let offers = []
      if (ats) {
        st.method = ats.name
        offers = await ats.list(ats.re.exec(c.url)[1], c.url)
      } else {
        st.method = 'page carrières'
        const links = await jobLinks(c.url)
        // offres proposées via un logiciel connu depuis la page de l'entreprise
        const viaAts = links.map((l) => ATS.find((a) => a.re.test(l.href))).find(Boolean)
        if (viaAts && links.filter((l) => viaAts.re.test(l.href)).length >= Math.max(1, links.length / 2)) {
          st.method = `page carrières, ${viaAts.name}`
          offers = await viaAts.list(viaAts.re.exec(links.find((l) => viaAts.re.test(l.href)).href)[1], c.url)
        } else offers = links.map((l) => ({ title: l.text, url: l.href, lazy: true }))
      }
      st.jobs = offers.length
      let details = 0
      for (const o of offers) {
        let alertIds = keep(o.title ?? '')
        if (!c.all && !alertIds.length && !o.lazy) continue
        // lien seul : on lit l'offre (données structurées) si son texte de lien évoque une de vos recherches
        if (o.lazy) {
          if (!c.all && !alertIds.length) continue
          if (details >= MAX_DETAILS) continue
          details++
          const p = await page(o.url)
          let jp = jobPosting(p.html)
          let textFallback = p.html ? await mainText(p.html) : ''
          if (!jp && textFallback.length < 400) {
            const r = await render(o.url)
            if (r) {
              jp = jobPosting(r.html)
              textFallback = await mainText(r.html)
            }
          }
          if (!jp && !LOOKS_LIKE_JOB.test(textFallback)) continue
          Object.assign(o, jp ? fromPosting(jp, o.url) : { text: textFallback })
          alertIds = keep(o.title ?? '')
          if (!c.all && !alertIds.length) continue
        } else if (o.detail && !o.text && details < MAX_DETAILS) {
          details++
          o.text = await o.detail().catch(() => '')
        }
        if (!o.title || !o.url) continue
        st.kept++
        total++
        add(
          {
            id: `co-${c.id}-${hash(o.url)}`,
            title: o.title,
            // site d'annonces (AFJV...) : l'employeur réel est indiqué dans l'offre
            company: o.employer && o.employer.toLowerCase() !== c.name.toLowerCase() ? o.employer : c.name,
            location: o.location || undefined,
            contract: o.contract || undefined,
            salary: o.salary || undefined,
            date: o.date || new Date().toISOString(),
            url: o.url,
            source: `Site de ${c.name}`,
            ...(o.text && o.text.length > 120 ? { fullText: o.text } : {}),
          },
          ['company', ...alertIds],
        )
      }
      st.ids = undefined
    } catch (e) {
      st.error = e.message?.slice(0, 160) ?? 'erreur inconnue'
    }
    status[c.id] = st
  }
  sources.companies = status
  if (companies.length) notes.push(`Pages carrières : ${total} offre(s) retenue(s) sur ${companies.length} entreprise(s) (lecture toutes les ${EVERY_H} h).`)
}
