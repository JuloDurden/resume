// Trajet domicile-travail d'une candidature : distance estimée depuis l'adresse de départ, coût par mois et
// par an selon le moyen (voiture, véhicule fourni, transports, vélo), à déduire du salaire net.
import type { FuelStation, MatchProfile, Offer, OfferCommute } from '../types'
import { geoOf } from './match'

export type CommuteMode = OfferCommute['mode']
export type Fuel = NonNullable<MatchProfile['fuel']>

export const MODE_LABEL: Record<CommuteMode, string> = { car: 'voiture', company: 'véhicule fourni', tc: 'transports en commun', bike: 'vélo ou à pied' }
export const FUEL_LABEL: Record<Fuel, string> = { gazole: 'Gazole', sp95: 'SP95', e10: 'SP95-E10' }

/** Distance par la route ≈ distance à vol d'oiseau × 1,3. */
export const ROAD_FACTOR = 1.3
/** Semaines travaillées par an (congés déduits). */
export const WEEKS = 47
export const DEFAULT_CONSO = 6.5
/** Prix de secours si le relevé du jour n'est pas disponible. */
export const FALLBACK_PRICES: Record<Fuel, number> = { gazole: 2.0, sp95: 2.0, e10: 1.9 }

/** Communes de Montpellier Méditerranée Métropole : réseau TaM gratuit pour leurs habitants. */
const METRO = new Set(
  [
    'Baillargues', 'Beaulieu', 'Castelnau-le-Lez', 'Castries', 'Clapiers', 'Cournonsec', 'Cournonterral', 'Fabrègues', 'Grabels', 'Jacou', 'Juvignac', 'Lattes', 'Lavérune', 'Le Crès', 'Montaud',
    'Montferrier-sur-Lez', 'Montpellier', 'Murviel-lès-Montpellier', 'Pérols', 'Pignan', 'Prades-le-Lez', 'Restinclières', 'Saint-Brès', 'Saint-Drézéry', 'Saint-Geniès-des-Mourgues',
    "Saint-Georges-d'Orques", 'Saint-Jean-de-Védas', 'Saussan', 'Sussargues', 'Vendargues', 'Villeneuve-lès-Maguelone',
  ].map((n) => key(n)),
)
function key(n: string) {
  return n
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()
}
/** « Montpellier (34) », « Lattes - 34970 » → commune de la Métropole ? */
export const inMetro = (place?: string) => !!place && METRO.has(key(place.replace(/\(.*?\)|\d{2,5}|-\s*$/g, ' ').split(/[,/]/)[0]))

const haversine = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = (d: number) => (d * Math.PI) / 180
  const x = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(x))
}

/** Distance par la route (aller), estimée ; undefined si le lieu n'est pas encore localisé. */
export function roadKm(from: { lat: number; lon: number } | undefined, location?: string): number | undefined {
  if (!from) return undefined
  const to = geoOf(location)
  if (!to) return undefined
  return Math.max(2, Math.round(haversine(from, to) * ROAD_FACTOR))
}

export interface CommuteCost {
  mode: CommuteMode
  days: number
  km: number
  minutes?: number
  month: number
  year: number
  /** détail affiché : « voiture · 12 km · 5 j/sem. » */
  note: string
  /** prix du litre utilisé (voiture) */
  price?: number
}

const SPEED: Record<CommuteMode, number> = { car: 36, company: 36, tc: 22, bike: 16 }

/**
 * Coût des trajets d'une candidature. Réglages de la candidature (offer.commute), sinon voiture 5 jours sur 5.
 * undefined : pas d'adresse de départ ou lieu inconnu (et pas de distance saisie).
 */
export function commuteOf(o: Offer, profile: MatchProfile | undefined, prices: Record<Fuel, number> | undefined): CommuteCost | undefined {
  const c: OfferCommute = o.commute ?? { mode: 'car', days: 5 }
  const km = c.km ?? roadKm(profile?.commuteFrom, o.location)
  if (km === undefined) return undefined
  const days = c.days || 5
  const fuel = profile?.fuel ?? 'gazole'
  const price = (prices ?? FALLBACK_PRICES)[fuel]
  const trips = days * WEEKS * 2
  const fuelYear = (km * trips * (profile?.conso ?? DEFAULT_CONSO) * price) / 100
  let year = 0
  const bits: string[] = [MODE_LABEL[c.mode], `${km} km`, `${days} j/sem.`]
  if (c.mode === 'car') year = fuelYear + (c.toll ?? 0) * 12
  else if (c.mode === 'company') year = c.fuelPaid === false ? fuelYear : 0
  else if (c.mode === 'tc') year = inMetro(profile?.commuteFrom?.nom) && inMetro(o.location) ? 0 : ((c.pass ?? 0) * 12) / 2
  if (c.mode === 'car' && c.toll) bits.push('péage')
  if (c.mode === 'company') bits[0] = c.fuelPaid === false ? 'véhicule fourni, carburant à ta charge' : 'véhicule et carburant fournis'
  if (c.mode === 'tc' && !year) bits[0] = inMetro(o.location) && inMetro(profile?.commuteFrom?.nom) ? 'TaM, gratuit (Métropole)' : 'transports, abonnement à saisir'
  return {
    mode: c.mode,
    days,
    km,
    minutes: c.mode === 'tc' ? undefined : Math.max(5, Math.round(((km / SPEED[c.mode]) * 60) / 5) * 5),
    month: year / 12,
    year,
    note: bits.join(' · '),
    price: c.mode === 'car' || (c.mode === 'company' && c.fuelPaid === false) ? price : undefined,
  }
}

/* ---------- prix moyen du carburant autour de l'adresse de départ (prix-carburants.gouv.fr) ---------- */

const PRICE_KEY = 'resume-fuel-prices'
export interface StationPrice {
  label: string
  main?: boolean
  prices: Partial<Record<Fuel, number>>
  maj?: string
  /** pas de relevé : moyenne des stations à moins de 2 km */
  estimated?: boolean
}
export interface FuelPrices {
  at: number
  /** prix des stations habituelles (sinon : moyenne des stations à moins de 20 km) */
  stations?: StationPrice[]
  /** empreinte des stations habituelles prises en compte */
  key?: string
  /** relevé le plus récent pris en compte */
  maj?: string
  n: number
  prices: Record<Fuel, number>
  near: { lat: number; lon: number }
}

export const cachedPrices = (): FuelPrices | undefined => {
  try {
    return JSON.parse(localStorage.getItem(PRICE_KEY) ?? 'null') ?? undefined
  } catch {
    return undefined
  }
}

/** Moyenne des stations à moins de 20 km, relevée une fois par jour (données ouvertes « Prix des carburants »). */
export async function fetchPrices(near: { lat: number; lon: number }, now = Date.now()): Promise<FuelPrices | undefined> {
  const c = cachedPrices()
  if (c && now - c.at < 12 * 3600000 && Math.abs(c.near.lat - near.lat) < 0.05 && Math.abs(c.near.lon - near.lon) < 0.05) return c
  const where = `within_distance(geom, geom'POINT(${near.lon.toFixed(4)} ${near.lat.toFixed(4)})', 20km)`
  const select = 'avg(gazole_prix) as gazole, avg(sp95_prix) as sp95, avg(e10_prix) as e10, max(gazole_maj) as maj, count(*) as n'
  const url = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?select=${encodeURIComponent(select)}&where=${encodeURIComponent(where)}&limit=1`
  try {
    const r = await fetch(url)
    if (!r.ok) return c
    const row = ((await r.json()) as { results?: { gazole?: number; sp95?: number; e10?: number; maj?: string; n?: number }[] }).results?.[0]
    if (!row?.n) return c
    const p: FuelPrices = {
      at: now,
      maj: row.maj,
      n: row.n,
      near,
      prices: { gazole: row.gazole ?? FALLBACK_PRICES.gazole, sp95: row.sp95 ?? FALLBACK_PRICES.sp95, e10: row.e10 ?? FALLBACK_PRICES.e10 },
    }
    localStorage.setItem(PRICE_KEY, JSON.stringify(p))
    return p
  } catch {
    return c
  }
}

/* ---------- stations habituelles ---------- */

const DATASET = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records'
const FUELS: Fuel[] = ['gazole', 'sp95', 'e10']
type Row = { id: number; adresse?: string; ville?: string; cp?: string; gazole_prix?: number | null; sp95_prix?: number | null; e10_prix?: number | null; e10_maj?: string; gazole_maj?: string; geom?: { lat: number; lon: number } }
const ask = async (where: string, select: string, limit = 20): Promise<Row[]> => {
  const r = await fetch(`${DATASET}?select=${encodeURIComponent(select)}&where=${encodeURIComponent(where)}&limit=${limit}`)
  if (!r.ok) throw new Error(`Prix des carburants : erreur ${r.status}`)
  return ((await r.json()) as { results?: Row[] }).results ?? []
}
const near = (lat: number, lon: number, km: number) => `within_distance(geom, geom'POINT(${lon.toFixed(5)} ${lat.toFixed(5)})', ${km}km)`
const ROW = 'id,adresse,ville,cp,gazole_prix,sp95_prix,e10_prix,e10_maj,gazole_maj,geom'

export const stationsKey = (st?: { id?: number; lat: number; lon: number; main?: boolean }[]) => (st ?? []).map((s) => `${s.id ?? `${s.lat.toFixed(4)},${s.lon.toFixed(4)}`}${s.main ? '*' : ''}`).join('|')

/** Stations du jeu de données qui répondent à une recherche (adresse, ville), les plus proches d'abord. */
export async function searchStations(q: string, from: { lat: number; lon: number }): Promise<{ id: number; label: string; lat: number; lon: number; prices: Partial<Record<Fuel, number>> }[]> {
  const words = q.replace(/["\\]/g, ' ').trim()
  if (words.length < 3) return []
  const rows = await ask(`"${words}" and ${near(from.lat, from.lon, 60)}`, ROW, 15)
  const dist = (r: Row) => (r.geom ? (r.geom.lat - from.lat) ** 2 + (r.geom.lon - from.lon) ** 2 : 9)
  return rows
    .filter((r) => r.geom)
    .sort((a, b) => dist(a) - dist(b))
    .map((r) => ({
      id: r.id,
      label: `${(r.adresse ?? '').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())}, ${r.ville ?? ''}`.replace(/^, /, ''),
      lat: r.geom!.lat,
      lon: r.geom!.lon,
      prices: { gazole: r.gazole_prix ?? undefined, sp95: r.sp95_prix ?? undefined, e10: r.e10_prix ?? undefined },
    }))
}

/** Prix aux stations habituelles : relevé de la station, sinon moyenne des stations à moins de 2 km ; la principale compte trois fois plus. */
export async function fetchStationPrices(stations: FuelStation[], fallback?: FuelPrices, now = Date.now()): Promise<FuelPrices | undefined> {
  if (!stations.length) return undefined
  const ids = stations.map((s) => s.id).filter((x): x is number => x !== undefined)
  const rows = ids.length ? await ask(ids.map((id) => `id=${id}`).join(' or '), ROW, ids.length) : []
  const out: StationPrice[] = []
  for (const s of stations) {
    const row = rows.find((r) => r.id === s.id)
    const prices: Partial<Record<Fuel, number>> = {}
    for (const f of FUELS) if (row?.[`${f}_prix`]) prices[f] = row[`${f}_prix`]!
    let estimated = false
    // carburant sans relevé à cette station : la moyenne de ses voisines
    if (FUELS.some((f) => prices[f] === undefined)) {
      const around = await ask(near(s.lat, s.lon, 2), 'avg(gazole_prix) as gazole_prix, avg(sp95_prix) as sp95_prix, avg(e10_prix) as e10_prix', 1).catch(() => [])
      for (const f of FUELS) if (prices[f] === undefined && around[0]?.[`${f}_prix`]) {
        prices[f] = around[0][`${f}_prix`]!
        estimated = true
      }
    }
    out.push({ label: s.label, main: s.main, prices, maj: row?.e10_maj ?? row?.gazole_maj, estimated: estimated || undefined })
  }
  const avg = {} as Record<Fuel, number>
  for (const f of FUELS) {
    const w = out.filter((s) => s.prices[f] !== undefined).map((s) => ({ p: s.prices[f]!, w: s.main ? 3 : 1 }))
    const total = w.reduce((n, x) => n + x.w, 0)
    avg[f] = total ? w.reduce((n, x) => n + x.p * x.w, 0) / total : (fallback?.prices[f] ?? FALLBACK_PRICES[f])
  }
  const maj = out.map((s) => s.maj).filter(Boolean).sort().at(-1)
  return { at: now, maj, n: out.length, near: { lat: stations[0].lat, lon: stations[0].lon }, prices: avg, stations: out, key: stationsKey(stations) }
}
