// Salaire : encadré de la candidature ouverte (net estimé, montant annoncé, écart avec le minimum),
// saisie d'un salaire appris après coup, pastille de la liste, et calculateur brut / net (menu Outils).
import { useState } from 'react'
import { create } from 'zustand'
import { Bike, Bus, Car, KeyRound, Plus } from 'lucide-react'
import type { Offer } from '../../types'
import { useDocs } from '../../store/documents'
import { Modal, Segmented } from '../ui'
import { RATES, STATUS_LABEL, afterTax, fmtEur, fmtRange, payOf, signed, vsMinimum, type Pay, type PayStatus } from '../../lib/pay'
import { cachedPrices, fetchPrices, fetchStationPrices, stationsKey, type CommuteCost, type FuelPrices } from '../../lib/commute'
import { useCommuteTool } from './CommuteTool'
import { useFeed } from '../../store/feed'

const frDay = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

/* ---------- prix du carburant (relevé du jour autour de l'adresse de départ) ---------- */

export const useFuel = create<{ prices?: FuelPrices; load: (near?: { lat: number; lon: number }, force?: boolean) => void }>((set, get) => ({
  prices: cachedPrices(),
  load: (near, force) => {
    if (!near) return
    const stations = useDocs.getState().watch.profile?.fuelStations ?? []
    const key = stationsKey(stations)
    const cur = get().prices
    const fresh = cur && Date.now() - cur.at < 12 * 3600000 && (cur.key ?? '') === key
    if (!force && fresh && (key || (Math.abs(cur.near.lat - near.lat) < 0.05 && Math.abs(cur.near.lon - near.lon) < 0.05))) return
    // relevé direct ; à défaut, celui de la veille (data/feed.json)
    fetchPrices(near).then(async (p) => {
      const fromFeed = useFeed.getState().feed?.fuel
      const area = [p, fromFeed].filter((x): x is FuelPrices => !!x).sort((a, b) => b.at - a.at)[0]
      // stations habituelles : leur prix l'emporte sur la moyenne des alentours
      const mine = key ? await fetchStationPrices(stations, area).catch(() => undefined) : undefined
      const best = mine ?? area
      if (best) {
        set({ prices: best })
        try {
          localStorage.setItem('resume-fuel-prices', JSON.stringify(best))
        } catch {
          /* cache facultatif */
        }
      }
    })
  },
}))

export const MODE_ICON = { car: Car, company: KeyRound, tc: Bus, bike: Bike }

/** Montant en k€ avec une décimale : 24 209 → « 24,2 k€ ». */
const kEur = (n: number) => `${(Math.round(n / 100) / 10).toLocaleString('fr-FR')} k€`
const kRange = (a: number, b: number) => (kEur(a) === kEur(b) ? kEur(a) : `${kEur(a).replace(' k€', '')} – ${kEur(b)}`)

/* ---------- calculateur (ouvert depuis le menu Outils ou l'encadré Salaire) ---------- */

export const usePayCalc = create<{ open: boolean; amount?: number; status?: PayStatus; show: (p?: { amount?: number; status?: PayStatus }) => void; close: () => void }>((set) => ({
  open: false,
  show: (p) => set({ open: true, amount: p?.amount, status: p?.status }),
  close: () => set({ open: false }),
}))

export function PayCalculator() {
  const st = usePayCalc()
  if (!st.open) return null
  return <CalcModal key={`${st.amount}-${st.status}`} amount={st.amount ?? 32000} status={st.status ?? 'nc'} onClose={st.close} />
}

function CalcModal({ amount: initAmount, status: initStatus, onClose }: { amount: number; status: PayStatus; onClose: () => void }) {
  const profile = useDocs((s) => s.watch.profile)
  const setProfile = useDocs((s) => s.setProfile)
  const [amount, setAmount] = useState(String(initAmount))
  const [sense, setSense] = useState<'brut' | 'net'>('brut')
  const [period, setPeriod] = useState<'h' | 'm' | 'y'>('y')
  const [status, setStatus] = useState<PayStatus>(initStatus)
  const [hours, setHours] = useState(35)
  const [months, setMonths] = useState(12)
  const [more, setMore] = useState(false)
  const [detail, setDetail] = useState(false)
  const tax = profile?.taxRate ?? 0
  const r = RATES[status]
  const v = Math.max(0, parseFloat(amount.replace(',', '.')) || 0)
  const hoursYear = hours * 52
  const year = period === 'y' ? v : period === 'm' ? v * months : v * hoursYear
  const brut = sense === 'brut' ? year : year / (1 - r)
  const net = brut * (1 - r)
  const after = afterTax(brut, status, tax)
  const vs = vsMinimum({ min: brut, max: brut, status, netMin: net / 12, netMax: net / 12, text: '' }, profile?.salary?.min)
  const two = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <Modal open onClose={onClose} title="Salaire brut / net" wide footer={<button className="btn" onClick={onClose}>Fermer</button>}>
      <div className="calc">
        <div className="calc-in">
          <label className="calc-amount">
            <span className="calc-label">Montant</span>
            <span>
              <input className="input" type="number" min={0} step={100} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />€
            </span>
          </label>
          <Segmented value={sense} onChange={setSense} options={[{ value: 'brut', label: 'Brut' }, { value: 'net', label: 'Net' }]} />
          <Segmented value={period} onChange={setPeriod} options={[{ value: 'h', label: 'À l’heure' }, { value: 'm', label: 'Par mois' }, { value: 'y', label: 'Par an' }]} />
          <div>
            <span className="calc-label">Statut</span>
            <Segmented value={status} onChange={setStatus} options={(['nc', 'c'] as PayStatus[]).map((s) => ({ value: s, label: s === 'nc' ? 'Non-cadre' : 'Cadre' }))} />
          </div>
          <button className="link small" onClick={() => setMore((m) => !m)} aria-expanded={more}>
            {more ? 'Moins d’options' : 'Plus d’options (heures, 13e mois, impôt)'}
          </button>
          {more && (
            <div className="calc-more">
              <label>
                <span className="calc-label">Heures / semaine</span>
                <input className="input" type="number" min={1} max={48} value={hours} onChange={(e) => setHours(Math.max(1, Number(e.target.value) || 35))} />
              </label>
              <label>
                <span className="calc-label">Nombre de mois</span>
                <select className="input select" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                  {[12, 13, 14].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="calc-label">Impôt à la source (%)</span>
                <input className="input" type="number" min={0} max={45} step={0.1} value={tax || ''} placeholder="0" onChange={(e) => profile && setProfile({ ...profile, taxRate: Number(e.target.value) || undefined })} />
              </label>
            </div>
          )}
        </div>
        <div className="calc-out">
          <div className="calc-big">
            <span className="muted">Net par mois{tax ? ', après impôt' : ''}</span>
            <strong>{fmtEur((tax ? after : net) / months)} €</strong>
            <span className="muted">
              {tax ? `${fmtEur(net / months)} € avant impôt · ` : ''}
              {fmtEur(brut / months)} € brut
            </span>
          </div>
          {vs && (
            <p className={`calc-vs t-${vs.tone}`}>
              <strong>{vs.low >= 0 ? 'Au-dessus' : 'En dessous'}</strong> de ton minimum ({signed(vs.low)} par mois)
            </p>
          )}
          <button className="link small" onClick={() => setDetail((d) => !d)} aria-expanded={detail}>
            {detail ? 'Masquer le détail' : 'Détail à l’heure, au mois, à l’année'}
          </button>
          {detail && (
            <table className="calc-table">
              <thead>
                <tr>
                  <th />
                  <th>Brut</th>
                  <th>Net</th>
                  <th>Après impôt</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Par heure</th>
                  <td>{two(brut / hoursYear)} €</td>
                  <td>{two(net / hoursYear)} €</td>
                  <td>{two(after / hoursYear)} €</td>
                </tr>
                <tr>
                  <th>Par mois</th>
                  <td>{fmtEur(brut / months)} €</td>
                  <td>{fmtEur(net / months)} €</td>
                  <td>{fmtEur(after / months)} €</td>
                </tr>
                <tr>
                  <th>Par an</th>
                  <td>{fmtEur(brut)} €</td>
                  <td>{fmtEur(net)} €</td>
                  <td>{fmtEur(after)} €</td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="muted small">
            Estimation : cotisations moyennes ({Math.round(r * 100)} % {STATUS_LABEL[status]}).{' '}
            {profile?.salary?.min ? `Ton minimum : ${Math.round(profile.salary.min / 1000)} k€ brut par an (profil de recherche).` : 'Indique ton minimum dans ton profil de recherche (onglet Annonces) pour situer chaque salaire.'}
          </p>
        </div>
      </div>
    </Modal>
  )
}

/* ---------- liste : pastille du net estimé ---------- */

export function PayChip({ pay, minBrut, commute }: { pay: Pay; minBrut?: number; commute?: CommuteCost }) {
  const vs = vsMinimum(pay, minBrut)
  const cost = commute?.month ?? 0
  const Icon = commute ? MODE_ICON[commute.mode] : undefined
  const title = [
    `Salaire ${pay.text} (${STATUS_LABEL[pay.status]}) : ${fmtRange(pay.netMin, pay.netMax)} net/mois estimés`,
    commute ? `trajet ${commute.note} : ${cost ? `− ${fmtEur(cost)} €/mois` : '0 €'}` : '',
    vs ? (vs.tone === 'ok' ? 'au-dessus de ton minimum' : vs.tone === 'ko' ? 'en dessous de ton minimum' : 'autour de ton minimum') : '',
  ]
    .filter(Boolean)
    .join('\n')
  return (
    <span className={`pay-chip t-${vs?.tone ?? 'none'}`} title={title}>
      <span className="pc-month">
        {fmtRange(pay.netMin - cost, pay.netMax - cost)} <small>/ mois</small>
      </span>
      <span className="pc-year">
        {kRange((pay.netMin - cost) * 12, (pay.netMax - cost) * 12)} / an
        {commute && Icon && (
          <>
            {' · '}
            <Icon size={12} aria-label={commute.mode === 'company' ? 'véhicule fourni' : 'trajet'} /> {cost ? `− ${fmtEur(cost)} € trajet` : 'trajet 0 €'}
          </>
        )}
      </span>
    </span>
  )
}

/* ---------- candidature ouverte : encadré Salaire, ou saisie ---------- */

export function SalaryBlock({ offer, autoEdit, commute }: { offer: Offer; autoEdit?: boolean; commute?: CommuteCost }) {
  const saveOffer = useDocs((s) => s.saveOffer)
  const minBrut = useDocs((s) => s.watch.profile?.salary?.min)
  const hasFrom = useDocs((s) => !!s.watch.profile?.commuteFrom)
  const showCalc = usePayCalc((s) => s.show)
  const openCommute = useCommuteTool((s) => s.show)
  const pay = payOf(offer)
  const [editing, setEditing] = useState(!!autoEdit && !pay)
  const [text, setText] = useState(offer.salary ?? '')
  const save = () => {
    const t = text.trim()
    // noté après coup : l'annonce n'en donnait pas
    saveOffer({ ...offer, salary: t || undefined, salaryAt: t ? (offer.salary ? offer.salaryAt : Date.now()) : undefined })
    setEditing(false)
  }
  if (!pay || editing)
    return editing ? (
      <form
        className="pay-edit"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <label htmlFor={`pay-${offer.id}`}>Salaire</label>
        <input id={`pay-${offer.id}`} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="ex. 30 k€ brut/an, 2 400 € net/mois" autoFocus />
        <button className="btn primary" type="submit">
          OK
        </button>
        <button className="btn ghost" type="button" onClick={() => setEditing(false)}>
          Annuler
        </button>
      </form>
    ) : (
      <button className="pay-add" onClick={() => setEditing(true)}>
        <Plus size={14} /> Ajouter le salaire
      </button>
    )
  const vs = vsMinimum(pay, minBrut)
  const cost = commute?.month ?? 0
  const Icon = commute ? MODE_ICON[commute.mode] : Car
  const flip = (s: PayStatus): PayStatus => (s === 'c' ? 'nc' : 'c')
  const vsText = vs ? (Math.round(vs.low) === Math.round(vs.high) ? signed(vs.low) : `${signed(vs.low)} à ${signed(vs.high)}`) : ''
  return (
    <section className={`pay-block t-${vs?.tone ?? 'none'}`} aria-label="Salaire et trajet">
      <table>
        <colgroup>
          <col className="pb-c1" />
          <col className="pb-c2" />
          <col className="pb-c3" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="pb-head">
              <div className="pb-meta">
                <span className="pb-kicker">Salaire</span>
                <span className="pb-text" title={pay.text}>
                  {pay.later ? `noté le ${frDay(offer.salaryAt!)} : ` : ''}
                  {pay.text}
                </span>
                <button className="link" onClick={() => saveOffer({ ...offer, payStatus: flip(pay.status) })} title="Changer le statut de l'estimation">
                  {STATUS_LABEL[pay.status]}
                </button>
                <button
                  className="link"
                  onClick={() => {
                    setText(offer.salary ?? '')
                    setEditing(true)
                  }}
                >
                  modifier
                </button>
                <button className="link" onClick={() => showCalc({ amount: Math.round((pay.min + pay.max) / 2), status: pay.status })} title="Calculateur brut / net">
                  détail
                </button>
              </div>
            </th>
            <th scope="col">Par mois</th>
            <th scope="col">Par an</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">
              Net estimé{' '}
              {vs && (
                <span className="pb-pill" title={`${vs.tone === 'ok' ? 'Au-dessus de' : vs.tone === 'ko' ? 'En dessous de' : 'Autour de'} ton minimum (${fmtEur(vs.minNet)} € net / mois)`}>
                  {vsText}
                </span>
              )}
            </th>
            <td className="pb-big">{fmtRange(pay.netMin, pay.netMax)}</td>
            <td className="pb-mid">{kRange(pay.netMin * 12, pay.netMax * 12)}</td>
          </tr>
          <tr className="pb-commute">
            <th scope="row">
              <Icon size={14} /> Trajets{' '}
              <span className="small muted">
                {commute ? `${commute.note}${commute.price ? ` · ${commute.price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/L` : ''}` : hasFrom ? 'lieu de travail inconnu' : 'adresse de départ à indiquer'} ·{' '}
                <button className="link" onClick={() => openCommute(offer.id)}>
                  {commute ? 'modifier' : 'renseigner'}
                </button>
              </span>
            </th>
            <td className="pb-cost">{commute ? (cost ? `− ${fmtEur(cost)} €` : '0 €') : ''}</td>
            <td className="pb-cost">{commute ? (commute.year ? `− ${fmtEur(commute.year)} €` : '0 €') : ''}</td>
          </tr>
          {commute && (
            <tr className="pb-rest">
              <th scope="row">Il te reste</th>
              <td className="pb-big">{fmtRange(pay.netMin - cost, pay.netMax - cost)}</td>
              <td className="pb-mid">{kRange((pay.netMin - cost) * 12, (pay.netMax - cost) * 12)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}
