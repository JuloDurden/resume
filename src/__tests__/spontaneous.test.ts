import { describe, expect, it } from 'vitest'
import { parseCompanyAnalysis, postSuggestions, sameCompany, spontaneousDescription } from '../lib/spontaneous'
import { migrate } from '../lib/migrate'
import type { FeedItem, Offer } from '../types'

const answer = `Voici mon analyse…
\`\`\`json
{"summary": "Groupe de propreté, 40 000 salariés.", "sector": "Services", "size": "ETI", "website": "https://gsf.fr", "careersUrl": "https://gsf.fr/carrieres", "news": ["Nouveau siège"], "needs": [{"need": "Pilotage de prestataires IT", "why": "migration ERP"}], "openings": [{"title": "Chef de projet SI", "url": ""}], "contacts": [{"role": "DSI", "name": "", "url": ""}], "posts": [{"title": "Responsable d'exploitation IT", "why": "", "fit": 78}, {"title": "Chef de projet SI", "fit": "55"}], "fit": 72, "verdict": "angle", "matches": ["ITIL"], "gaps": ["Secteur"], "angle": "Entrer par la migration ERP", "sources": ["https://gsf.fr"]}
\`\`\``

describe('candidatures spontanées', () => {
  it('lit la fiche de Claude', () => {
    const a = parseCompanyAnalysis(answer)
    expect(a.fit).toBe(72)
    expect(a.verdict).toBe('angle')
    expect(a.posts?.[1].fit).toBe(55)
    expect(a.contacts?.[0].role).toBe('DSI')
    expect(() => parseCompanyAnalysis('{"foo": 1}')).toThrow()
  })
  it('compare les entreprises', () => {
    expect(sameCompany('Groupe GSF', 'GSF')).toBe(true)
    expect(sameCompany('Urbasolar', 'GSF')).toBe(false)
  })
  it('propose des postes et bâtit la pseudo-annonce', () => {
    const analysis = parseCompanyAnalysis(answer)
    const items = [{ id: '1', alerts: [], title: 'Technicien support H/F', company: 'GSF' }] as unknown as FeedItem[]
    const s = postSuggestions({ company: 'GSF', analysis, posts: ['Chef de projet SI'] }, items, { targets: ['Business Analyst'], degree: 2 })
    expect(s.map((x) => x.title)).toEqual(["Responsable d'exploitation IT", 'Technicien support', 'Business Analyst'])
    const d = spontaneousDescription({ company: 'GSF', posts: ['Chef de projet SI'], analysis })
    expect(d).toContain('Pilotage de prestataires IT')
    expect(d).toContain('Postes visés : Chef de projet SI')
  })
  it('convertit les anciennes candidatures spontanées', () => {
    const o = { id: 'a', title: 'Candidature Spontanée Support Applicatif & Accompagnement utilisateurs', company: 'AB+ Software', createdAt: 1, updatedAt: 1 } as Offer
    const m = migrate({ docs: {}, offers: { a: o } })
    expect(m.offers.a.spontaneous).toBe(true)
    expect(m.offers.a.posts).toEqual(['Support Applicatif & Accompagnement utilisateurs'])
    expect(m.offers.a.title).toBe('Support Applicatif & Accompagnement utilisateurs')
  })
})
