// Outils › Trajet domicile-travail : coût des trajets vers une candidature, par mois et par an, déduit du salaire net.
import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import type { MatchProfile, Offer, OfferCommute } from '../../types'
import { useDocs } from '../../store/documents'
import { Modal, Segmented, toast } from '../ui'
import { HomeInput } from './MatchTools'
import { DEFAULT_CONSO, FUEL_LABEL, commuteOf, inMetro, roadKm, type Fuel } from '../../lib/commute'
import { geocode } from '../../lib/match'
import { fmtEur, fmtRange, payOf } from '../../lib/pay'
import { useFuel } from './PayTools'

export const useCommuteTool = create<{ open: boolean; offerId?: string; show: (offerId?: string) => void; close: () => void }>((set) => ({
  open: false,
  show: (offerId) => set({ open: true, offerId }),
  close: () => set({ open: false }),
}))

export function CommuteTool() {
  const st = useCommuteTool()
  if (!st.open) return null
  return <CommuteModal initial={st.offerId} onClose={st.close} />
}

const kEur = (n: number) => `${(Math.round(n / 100) / 10).toLocaleString('fr-FR')} k€`

function CommuteModal({ initial, onClose }: { initial?: string; onClose: () => void }) {
  const offersMap = useDocs((s) => s.offers)
  const profile = useDocs((s) => s.watch.profile)
  const setProfile = useDocs((s) => s.setProfile)
  const saveOffer = useDocs((s) => s.saveOffer)
  const prices = useFuel((s) => s.prices)
  const loadPrices = useFuel((s) => s.load)
  const [, setTick] = useState(0)
  const offers = useMemo(
    () => Object.values(offersMap).filter((o) => o.status !== 'rejected' && (o.location || o.commute?.km)).sort((a, b) => (b.statusAt?.applied ?? b.createdAt) - (a.statusAt?.applied ?? a.createdAt)),
    [offersMap],
  )
  const [id, setId] = useState(initial && offersMap[initial] ? initial : offers[0]?.id)
  const offer: Offer | undefined = id ? offersMap[id] : undefined
  const [draft, setDraft] = useState<OfferCommute>(() => offer?.commute ?? { mode: offer && /fourni|fonction|service/i.test(offer.description ?? '') ? 'company' : 'car', days: 5 })
  const [editKm, setEditKm] = useState(false)
  const from = profile?.commuteFrom
  useEffect(() => loadPrices(from), [from, loadPrices])
  useEffect(() => geocode(offers.map((o) => o.location), () => setTick((n) => n + 1), from), [offers, from])

  const pick = (nid: string) => {
    setId(nid)
    setDraft(offersMap[nid]?.commute ?? { mode: 'car', days: 5 })
    setEditKm(false)
  }
  const setP = (p: Partial<MatchProfile>) => profile && setProfile({ ...profile, ...p })
  if (!offer)
    return (
      <Modal open onClose={onClose} title="Trajet domicile-travail" footer={<button className="btn" onClick={onClose}>Fermer</button>}>
        <p className="muted">Aucune candidature avec un lieu de travail.</p>
      </Modal>
    )
  const cost = commuteOf({ ...offer, commute: draft }, profile, prices?.prices)
  const estKm = roadKm(from, offer.location)
  const pay = payOf(offer)
  const fuel: Fuel = profile?.fuel ?? 'gazole'
  const carLike = draft.mode === 'car' || (draft.mode === 'company' && draft.fuelPaid === false)
  const price = (prices?.prices ?? undefined)?.[fuel]
  const set = (p: Partial<OfferCommute>) => setDraft((d) => ({ ...d, ...p }))
  const save = () => {
    saveOffer({ ...offer, commute: draft })
    toast.ok('Trajet enregistré pour cette candidature')
    onClose()
  }
  const m = cost?.month ?? 0
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Trajet domicile-travail"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Fermer
          </button>
          <button className="btn primary" onClick={save} disabled={!cost}>
            Enregistrer pour cette candidature
          </button>
        </>
      }
    >
      <div className="calc">
        <div className="calc-in">
          {!from && (
            <div className="notice small">
              <strong>Ton adresse de départ</strong> (privée, jamais sur un CV ni une lettre) :
              <HomeInput value={undefined} onChange={(h) => h && setP({ commuteFrom: h })} />
            </div>
          )}
          <label>
            <span className="calc-label">Vers</span>
            <select className="input select" value={offer.id} onChange={(e) => pick(e.target.value)}>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {[o.company || o.title, o.location].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
          </label>
          {from && (
            <span className="small muted">
              Depuis {from.nom} · {cost ? `${cost.km} km${cost.minutes ? ` · ≈ ${cost.minutes} min` : ''} par trajet` : 'lieu en cours de localisation'}{' '}
              <button className="link" onClick={() => setEditKm((v) => !v)}>
                corriger
              </button>
            </span>
          )}
          {editKm && (
            <label className="calc-inline">
              Distance (aller)
              <input className="input" type="number" min={1} value={draft.km ?? estKm ?? ''} onChange={(e) => set({ km: Number(e.target.value) || undefined })} />
              km
              {draft.km !== undefined && (
                <button className="link small" onClick={() => set({ km: undefined })}>
                  estimation
                </button>
              )}
            </label>
          )}
          <div>
            <span className="calc-label">Comment tu y vas</span>
            <div className="calc-modes">
              {(
                [
                  ['car', 'Voiture perso'],
                  ['company', 'Véhicule fourni'],
                  ['tc', 'Transports en commun'],
                  ['bike', 'Vélo, à pied'],
                ] as [OfferCommute['mode'], string][]
              ).map(([v, l]) => (
                <button key={v} className={`btn${draft.mode === v ? ' primary' : ''}`} onClick={() => set({ mode: v })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {draft.mode === 'company' && (
            <label className="check">
              <input type="checkbox" checked={draft.fuelPaid !== false} onChange={(e) => set({ fuelPaid: e.target.checked ? undefined : false })} /> Carburant pris en charge par l'entreprise
            </label>
          )}
          <div>
            <span className="calc-label">Jours sur site par semaine</span>
            <Segmented value={draft.days} onChange={(d) => set({ days: d })} options={[1, 2, 3, 4, 5].map((d) => ({ value: d, label: String(d) }))} />
          </div>
          {carLike && (
            <>
              <div>
                <span className="calc-label">Carburant</span>
                <Segmented value={fuel} onChange={(f) => setP({ fuel: f })} options={(Object.keys(FUEL_LABEL) as Fuel[]).map((f) => ({ value: f, label: FUEL_LABEL[f] }))} />
                <span className="small muted">
                  {price && prices
                    ? `${price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € / L : prix moyen des ${prices.n} stations à moins de 20 km${prices.maj ? `, relevé le ${new Date(prices.maj).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : ''} (prix-carburants.gouv.fr)`
                    : 'Prix du jour indisponible : estimation à 2 € / L'}
                </span>
              </div>
              <div className="calc-more">
                <label>
                  <span className="calc-label">Consommation (L / 100 km)</span>
                  <input className="input" type="number" step={0.1} min={2} value={profile?.conso ?? DEFAULT_CONSO} onChange={(e) => setP({ conso: Number(e.target.value) || undefined })} />
                </label>
                {draft.mode === 'car' && (
                  <label>
                    <span className="calc-label">Péage (€ / mois, si besoin)</span>
                    <input className="input" type="number" step={1} min={0} value={draft.toll ?? ''} placeholder="0" onChange={(e) => set({ toll: Number(e.target.value) || undefined })} />
                  </label>
                )}
              </div>
            </>
          )}
          {draft.mode === 'tc' && !(inMetro(from?.nom) && inMetro(offer.location)) && (
            <label>
              <span className="calc-label">Abonnement (€ / mois)</span>
              <input className="input" type="number" min={0} value={draft.pass ?? ''} onChange={(e) => set({ pass: Number(e.target.value) || undefined })} />
              <span className="small muted">L'employeur en rembourse la moitié.</span>
            </label>
          )}
          {draft.mode === 'tc' && inMetro(from?.nom) && inMetro(offer.location) && <span className="small muted">Réseau TaM gratuit pour les habitants de la Métropole de Montpellier.</span>}
        </div>
        <div className="calc-out">
          {cost ? (
            <table className="calc-table commute-table">
              <thead>
                <tr>
                  <th />
                  <th>Par mois</th>
                  <th>Par an</th>
                </tr>
              </thead>
              <tbody>
                {pay && (
                  <tr>
                    <th>Salaire net</th>
                    <td>{fmtRange(pay.netMin, pay.netMax)}</td>
                    <td>{kEur(pay.netMin * 12) === kEur(pay.netMax * 12) ? kEur(pay.netMin * 12) : `${kEur(pay.netMin * 12).replace(' k€', '')} – ${kEur(pay.netMax * 12)}`}</td>
                  </tr>
                )}
                <tr className="ct-cost">
                  <th>
                    Trajets
                    <div className="small muted">{cost.note}</div>
                  </th>
                  <td>{m ? `− ${fmtEur(m)} €` : '0 €'}</td>
                  <td>{cost.year ? `− ${fmtEur(cost.year)} €` : '0 €'}</td>
                </tr>
                {pay && (
                  <tr className="ct-rest">
                    <th>Il te reste</th>
                    <td>{fmtRange(pay.netMin - m, pay.netMax - m)}</td>
                    <td>{kEur((pay.netMin - m) * 12) === kEur((pay.netMax - m) * 12) ? kEur((pay.netMin - m) * 12) : `${kEur((pay.netMin - m) * 12).replace(' k€', '')} – ${kEur((pay.netMax - m) * 12)}`}</td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <p className="muted">{from ? 'Lieu de travail en cours de localisation, ou à corriger.' : 'Indique ton adresse de départ pour estimer les trajets.'}</p>
          )}
          {!pay && cost && <p className="muted small">Ajoute le salaire de cette candidature pour voir ce qu'il te reste.</p>}
          <p className="muted small">Estimation : distance à vol d'oiseau × 1,3, 47 semaines travaillées par an, carburant et péage seulement.</p>
        </div>
      </div>
    </Modal>
  )
}
