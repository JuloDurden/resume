// Historique d'une candidature (onglet « Échanges ») : une ligne verticale porte les étapes, du plus ancien
// au plus récent ; chaque relance est suivie de sa réponse, ou marquée « sans réponse ».
import { ExternalLink } from 'lucide-react'
import { useDocs } from '../../store/documents'
import type { InterviewMode, Offer } from '../../types'
import { slotsOf, type Station } from '../../lib/timeline'

const fmtDay = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: new Date(t).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })

/** Nombre d'étapes déjà passées (titre de l'onglet). */
export const pastSteps = (o: Offer) => slotsOf(o).reduce((n, s) => n + (s.kind === 'branch' ? (s.reply ? 2 : 1) : s.st.future ? 0 : 1), 0)

function Step({ st, child, note, offer }: { st: Station; child?: boolean; note?: string; offer?: Offer }) {
  const saveOffer = useDocs((s) => s.saveOffer)
  return (
    <li className={`tl-step t-${st.tone}${st.future ? ' future' : ''}${child ? ' child' : ''}`}>
      <span className="tl-date">{fmtDay(st.at)}</span>
      <span className="tl-dot" aria-hidden="true" />
      <div className="tl-body">
        <strong>{st.label}</strong>
        {st.auto && <span className="tl-src"> · lu dans Gmail</span>}
        {st.future && <span className="tl-src"> · à venir</span>}
        {st.ivId && offer && (
          <select
            className="tl-select"
            aria-label="Type d'entretien"
            value=""
            onChange={(e) => e.target.value && saveOffer({ ...offer, interviews: (offer.interviews ?? []).map((v) => (v.id === st.ivId ? { ...v, mode: e.target.value as InterviewMode } : v)) })}
          >
            <option value="">Préciser le type…</option>
            <option value="site">Sur place</option>
            <option value="phone">Téléphonique</option>
            <option value="video">En visio</option>
          </select>
        )}
        {st.sub && <p>{st.sub}</p>}
        {note && <p className="muted">{note}</p>}
        {st.url && (
          <a className="tl-link" href={st.url} target="_blank" rel="noreferrer">
            <ExternalLink size={12} /> Ouvrir dans Gmail
          </a>
        )}
      </div>
    </li>
  )
}

/** Chronologie verticale de la candidature. */
export function Timeline({ offer }: { offer: Offer }) {
  const slots = slotsOf(offer)
  return (
    <ol className="timeline">
      {slots.map((s, i) =>
        s.kind === 'main' ? (
          <Step key={i} st={s.st} offer={offer} />
        ) : (
          [<Step key={`${i}f`} st={s.fu} note={s.reply ? undefined : 'sans réponse'} />, s.reply ? <Step key={`${i}r`} st={s.reply} child /> : null]
        ),
      )}
    </ol>
  )
}
