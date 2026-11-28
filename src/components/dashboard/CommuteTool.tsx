// Outils › Trajet domicile-travail : coût des trajets vers une candidature, par mois et par an, déduit du salaire net.
import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import type { FuelStation, MatchProfile, Offer, OfferCommute } from '../../types'
import { useDocs } from '../../store/documents'
import { Modal, Segmented, toast } from '../ui'
import { HomeInput } from './MatchTools'
import { DEFAULT_CONSO, FUEL_LABEL, commuteOf, inMetro, roadKm, searchStations, type Fuel, type FuelPrices } from '../../lib/commute'
import { searchAddress } from '../../lib/places'
import { Fuel as FuelIcon, MapPin, Plus, Star, X } from 'lucide-react'
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

const eur = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })

/** Stations où l'on fait le plein : leur prix remplace la moyenne des alentours. */
function FuelStations({ profile, fuel, prices, onChange }: { profile?: MatchProfile; fuel: Fuel; prices?: FuelPrices; onChange: (s: FuelStation[]) => void }) {
  const list = profile?.fuelStations ?? []
  const from = profile?.commuteFrom
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  const [found, setFound] = useState<{ id?: number; label: string; lat: number; lon: number; price?: number }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const update = (next: FuelStation[]) => {
    onChange(next)
    // nouveau calcul du prix tout de suite
    setTimeout(() => useFuel.getState().load(from, true), 50)
  }
  const search = async () => {
    if (!from || q.trim().length < 3) return
    setBusy(true)
    try {
      const st = await searchStations(q.trim(), from)
      // sans station au relevé : une adresse, le prix sera celui des stations voisines
      const addr = st.length ? [] : await searchAddress(q.trim(), from).catch(() => [])
      setFound([...st.map((x) => ({ id: x.id, label: x.label, lat: x.lat, lon: x.lon, price: x.prices[fuel] })), ...addr.map((a) => ({ label: a.label, lat: a.lat, lon: a.lon }))])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const add = (f: { id?: number; label: string; lat: number; lon: number }) => {
    update([...list, { id: f.id, label: name.trim() || f.label, address: f.label, lat: f.lat, lon: f.lon, main: !list.length || undefined }])
    setAdding(false)
    setQ('')
    setName('')
    setFound(null)
  }
  const priceOf = (i: number) => prices?.stations?.[i]?.prices[fuel]
  return (
    <div className="fuel-stations">
      {list.map((s, i) => (
        <span key={`${s.id ?? s.label}-${i}`} className={`fuel-st${s.main ? ' main' : ''}`} title={[s.address, s.main ? 'Station principale' : 'De temps en temps', prices?.stations?.[i]?.estimated ? 'pas de relevé : prix des stations voisines' : ''].filter(Boolean).join(' · ')}>
          <button className="fuel-star" onClick={() => update(list.map((x, j) => ({ ...x, main: j === i ? !x.main || undefined : x.main })))} title={s.main ? 'Station principale' : 'Faire de cette station la principale'}>
            <Star size={13} />
          </button>
          {s.label}
          {priceOf(i) !== undefined && <strong>{eur(priceOf(i)!)} €{prices?.stations?.[i]?.estimated ? ' ≈' : ''}</strong>}
          <button onClick={() => update(list.filter((_, j) => j !== i))} title="Retirer">
            <X size={12} />
          </button>
        </span>
      ))}
      {!adding ? (
        <button className="btn sm ghost" onClick={() => setAdding(true)} disabled={!from} title={from ? undefined : "Indiquez d'abord l'adresse de départ"}>
          <FuelIcon size={13} /> {list.length ? 'Ajouter une station' : 'Mes stations habituelles'}
        </button>
      ) : (
        <div className="fuel-add">
          <div className="row-gap">
            <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Rue ou commune de la station" />
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom affiché (ex. Intermarché)" />
            <button className="btn sm" onClick={search} disabled={busy || q.trim().length < 3}>
              {busy ? 'Recherche…' : 'Chercher'}
            </button>
            <button className="btn sm ghost" onClick={() => setAdding(false)}>
              Annuler
            </button>
          </div>
          {found && (
            <div className="fuel-found">
              {!found.length && <span className="small muted">Aucune station ni adresse trouvée.</span>}
              {found.map((f) => (
                <button key={`${f.id ?? f.label}`} onClick={() => add(f)}>
                  {f.id ? <FuelIcon size={13} /> : <MapPin size={13} />}
                  <span>{f.label}</span>
                  <span className="muted small">{f.id ? (f.price ? `${eur(f.price)} €` : `pas de prix ${FUEL_LABEL[fuel]}`) : 'pas de relevé : prix des stations voisines'}</span>
                  <Plus size={13} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
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
                    ? prices.stations?.length
                      ? `${eur(price)} € / L : prix de vos stations habituelles${prices.stations.length > 1 ? ' (la principale compte trois fois plus)' : ''}${prices.maj ? `, relevé le ${new Date(prices.maj).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : ''}`
                      : `${eur(price)} € / L : prix moyen des ${prices.n} stations à moins de 20 km${prices.maj ? `, relevé le ${new Date(prices.maj).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : ''} (prix-carburants.gouv.fr)`
                    : 'Prix du jour indisponible : estimation à 2 € / L'}
                </span>
                <FuelStations profile={profile} fuel={fuel} prices={prices} onChange={(fuelStations) => setP({ fuelStations })} />
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
