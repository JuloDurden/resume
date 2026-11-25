// Carte des entreprises autour du domicile : entreprises suivies, candidatures et entreprises découvertes
// (base SIRENE, secteurs choisis dans les profils de recherche). Volet flottant repliable à droite.
import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Pencil,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  Loader2,
  MapPin,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  Send,
  Settings2,
  Star,
  Undo2,
} from 'lucide-react'
import type { Company, Offer } from '../../types'
import { useDocs } from '../../store/documents'
import { useFeed } from '../../store/feed'
import { uid } from '../../lib/ids'
import { geocode, geoOf } from '../../lib/match'
import { annuaireUrl, guessBoard, km, MAX_RADIUS, nearbySector, searchPlaces, type Place } from '../../lib/places'
import { SIZE_LABEL, sectorOfNaf, sizeRank } from '../../lib/sectors'
import { suggestSectors } from '../../lib/sectorSeed'
import { sameCompany } from '../../lib/spontaneous'
import { openSettings } from '../SettingsModal'
import { Segmented, TextInput, Toggle, toast } from '../ui'
import { CompanyAnalysisModal, SpontaneousModal } from './SpontaneousTools'
import { CompanyEditModal } from './CompanyEdit'

// leaflet.markercluster s'accroche à la variable globale L
;(window as unknown as { L: typeof L }).L = L
const clusterReady = import('leaflet.markercluster')

type Kind = 'offer' | 'follow' | 'found' | 'no'
interface Item {
  key: string
  name: string
  lat: number
  lon: number
  kind: Kind
  dist: number
  sector?: string
  size?: string
  place?: Place
  company?: Company
  offers: Offer[]
  /** position approchée (centre de la commune) */
  approx?: boolean
}

const KIND_LABEL: Record<Kind, string> = { offer: 'Candidature', follow: 'Suivie', found: 'Découverte', no: 'Pas intéressé' }
const MONTPELLIER = { nom: 'Montpellier', lat: 43.61, lon: 3.8742 }
const FOLLOW_SIZE = [
  { value: 0, label: 'Toutes' },
  { value: 11, label: '10+' },
  { value: 21, label: '50+' },
  { value: 32, label: '250+' },
]
const KINDS: Kind[] = ['offer', 'follow', 'found', 'no']

function useLocal<T>(key: string, init: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key)
      return s ? (JSON.parse(s) as T) : init
    } catch {
      return init
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {
      /* réglage de confort : tant pis */
    }
  }, [key, v])
  return [v, setV] as const
}

const newId = () => uid().replace(/[^a-zA-Z0-9]/g, '')
const fromPlace = (p: Place, sector?: string): Partial<Company> => ({ siren: p.siren, lat: p.lat, lon: p.lon, city: p.city, address: p.address, naf: p.naf, size: p.size, sector: sector ?? sectorOfNaf(p.naf) })
/** taille comparable : l'entreprise, à défaut l'établissement, à défaut sa catégorie */
const rankOf = (it: Item) => sizeRank(it.size) || sizeRank(it.place?.localSize) || (it.place?.cat === 'GE' ? 52 : it.place?.cat === 'ETI' ? 32 : 0)
const sizeText = (it: Item) => (it.size && SIZE_LABEL[it.size]) || (it.place?.cat === 'GE' ? 'Grande entreprise' : it.place?.cat === 'ETI' ? 'ETI' : undefined)

export function CompanyMap() {
  const profile = useDocs((s) => s.watch.profile)
  const saved = useDocs((s) => s.watch.companies)
  const offersMap = useDocs((s) => s.offers)
  const setCompanies = useDocs((s) => s.setCompanies)
  const home = profile?.home ?? MONTPELLIER
  const companies = useMemo(() => (saved ?? []).filter((c) => !(c.board ?? guessBoard(c))), [saved])
  const tracks = profile?.tracks ?? []
  const sectors = useMemo(() => [...new Set(tracks.flatMap((t) => t.sectors ?? []))], [tracks])

  const [radius, setRadius] = useLocal('resume-map-radius', Math.min(profile?.maxKm ?? 30, MAX_RADIUS))
  const [off, setOff] = useLocal<string[]>('resume-map-sectors-off', [])
  const [minSize, setMinSize] = useLocal('resume-map-size', 11)
  const [kinds, setKinds] = useLocal<Kind[]>('resume-map-kinds', ['offer', 'follow', 'found'])
  const [panel, setPanel] = useLocal('resume-map-panel', true)
  const [pages, setPages] = useState(2)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Map<string, Place & { sector: string }>>(new Map())
  const [extra, setExtra] = useState<Place[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null)
  const [, setGeoTick] = useState(0)
  const [adding, setAdding] = useState(false)
  const [applyTo, setApplyTo] = useState<{ name: string; careers?: string } | null>(null)
  const [analyse, setAnalyse] = useState<Offer | null>(null)
  const active = sectors.filter((s) => !off.includes(s))

  /* ---------- secteurs proposés au premier passage, d'après les candidatures ---------- */
  const [seeding, setSeeding] = useState(false)
  useEffect(() => {
    const p = useDocs.getState().watch.profile
    if (!p?.tracks?.length || p.tracks.some((t) => t.sectors?.length) || localStorage.getItem('resume-sectors-seeded')) return
    setSeeding(true)
    suggestSectors(p.tracks, Object.values(useDocs.getState().offers), p.home ?? MONTPELLIER)
      .then((by) => {
        const cur = useDocs.getState().watch.profile
        if (!cur?.tracks || cur.tracks.some((t) => t.sectors?.length)) return
        const next = cur.tracks.map((t) => {
          const s = [...(by[t.id] ?? [])]
          // candidature prévue : Responsable d'agence à l'Assurance Mutuelle des Motards
          if (/management/i.test(t.name) && !s.includes('Finance, banque et assurance')) s.push('Finance, banque et assurance')
          return { ...t, sectors: s }
        })
        useDocs.getState().setProfile({ ...cur, tracks: next })
        localStorage.setItem('resume-sectors-seeded', '1')
        toast.ok('Secteurs proposés d’après vos candidatures : modifiables dans Réglages, Profil')
      })
      .catch(() => undefined)
      .finally(() => setSeeding(false))
  }, [])

  /* ---------- entreprises découvertes ---------- */
  const activeKey = active.join('|')
  useEffect(() => {
    let stop = false
    ;(async () => {
      setError(null)
      const next = new Map<string, Place & { sector: string }>()
      for (const s of active) {
        if (stop) return
        setLoading(s)
        try {
          for (const p of await nearbySector(s, home, pages)) if (!next.has(p.siren)) next.set(p.siren, { ...p, sector: s })
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          break
        }
        if (!stop) setFound(new Map(next))
      }
      if (!stop) {
        setFound(next)
        setLoading(null)
      }
    })()
    return () => {
      stop = true
    }
  }, [activeKey, pages, home.lat, home.lon]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- position des entreprises suivies (une fois) ---------- */
  useEffect(() => {
    const todo = companies.filter((c) => c.lat === undefined && !c.noGeo)
    if (!todo.length) return
    let stop = false
    ;(async () => {
      const patch = new Map<string, Partial<Company>>()
      for (const c of todo) {
        if (stop) return
        try {
          const list = await searchPlaces(c.name, home, { dept: '34' }).catch(() => [] as Place[])
          const p = (list.length ? list : await searchPlaces(c.name, home)).find((x) => km(home, x) <= 150)
          patch.set(c.id, p ? fromPlace(p) : { noGeo: true })
        } catch {
          /* réseau : nouvel essai à la prochaine ouverture */
        }
      }
      if (stop || !patch.size) return
      const list = useDocs.getState().watch.companies ?? []
      setCompanies(list.map((c) => (patch.has(c.id) ? { ...c, ...patch.get(c.id) } : c)))
    })()
    return () => {
      stop = true
    }
  }, [companies.map((c) => c.id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- candidatures : lieu de l'offre en dernier recours ---------- */
  const offers = useMemo(() => Object.values(offersMap).filter((o) => o.company?.trim()), [offersMap])
  useEffect(() => geocode(offers.map((o) => o.location), () => setGeoTick((n) => n + 1), home), [offers]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- assemblage ---------- */
  const items = useMemo(() => {
    const out: Item[] = []
    const mk = (base: Omit<Item, 'dist'>): Item => ({ ...base, dist: km(home, base) })
    for (const c of companies) {
      if (c.lat === undefined || c.lon === undefined) continue
      out.push(mk({ key: `c:${c.id}`, name: c.name, lat: c.lat, lon: c.lon, kind: c.state === 'no' ? 'no' : 'follow', sector: c.sector, size: c.size, company: c, offers: [] }))
    }
    const all = [...found.values(), ...extra.map((p) => ({ ...p, sector: sectorOfNaf(p.naf, sectors) ?? '' }))]
    const bySiren = new Map(all.map((p) => [p.siren, p]))
    // candidatures, regroupées par entreprise
    for (const o of offers) {
      const hit = out.find((it) => it.kind !== 'no' && sameCompany(it.name, o.company))
      if (hit) {
        hit.offers.push(o)
        continue
      }
      const p = all.find((x) => sameCompany(x.name, o.company))
      const g = p ?? geoOf(o.location)
      if (!g) continue
      out.push(mk({ key: `o:${o.company!.trim().toLowerCase()}`, name: o.company!.trim(), lat: g.lat, lon: g.lon, kind: 'offer', sector: p?.sector, size: p?.size, place: p, offers: [o], approx: !p }))
    }
    for (const it of out) {
      if (it.offers.length && it.kind === 'follow') it.kind = 'offer'
      const p = it.company?.siren ? bySiren.get(it.company.siren) : undefined
      if (p && !it.place) it.place = p
    }
    const taken = new Set(out.map((it) => it.company?.siren ?? it.place?.siren).filter(Boolean))
    for (const p of all) {
      if (taken.has(p.siren) || out.some((it) => sameCompany(it.name, p.name))) continue
      out.push(mk({ key: `f:${p.siren}`, name: p.name, lat: p.lat, lon: p.lon, kind: 'found', sector: p.sector || undefined, size: p.size, place: p, offers: [] }))
    }
    return out
  }, [companies, found, extra, offers, sectors, home]) // eslint-disable-line react-hooks/exhaustive-deps

  const needle = q.trim().toLowerCase()
  const visible = useMemo(
    () =>
      items.filter((it) => {
        if (!kinds.includes(it.kind)) return false
        if (needle && !it.name.toLowerCase().includes(needle) && !(it.place?.city ?? '').toLowerCase().includes(needle)) return false
        if (it.kind === 'found') {
          if (it.dist > radius) return false
          if (it.sector && !active.includes(it.sector) && !extra.some((p) => p.siren === it.place?.siren)) return false
          if (minSize && rankOf(it) < minSize) return false
        }
        return true
      }),
    [items, kinds, needle, radius, activeKey, minSize, extra], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const inView = useMemo(() => {
    const order: Record<Kind, number> = { offer: 0, follow: 1, found: 2, no: 3 }
    return visible.filter((it) => !bounds || bounds.contains([it.lat, it.lon])).sort((a, b) => order[a.kind] - order[b.kind] || a.dist - b.dist)
  }, [visible, bounds])
  const sel = items.find((it) => it.key === selected)

  /* ---------- carte ---------- */
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const ring = useRef<L.Circle | null>(null)
  const cluster = useRef<L.MarkerClusterGroup | null>(null)
  const pins = useRef<L.LayerGroup | null>(null)
  const markers = useRef(new Map<string, L.Marker>())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!box.current || map.current) return
    const m = L.map(box.current, { zoomControl: false, attributionControl: true }).setView([home.lat, home.lon], 11)
    L.control.zoom({ position: 'bottomleft' }).addTo(m)
    map.current = m
    // fond OpenStreetMap, adouci (et inversé en thème sombre) par CSS
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'cmap-tiles',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Entreprises : INSEE, data.gouv.fr',
    }).addTo(m)
    const zoomClass = () => {
      const z = m.getZoom()
      m.getContainer().classList.toggle('z12', z >= 12)
      m.getContainer().classList.toggle('z14', z >= 14)
    }
    m.on('zoomend', zoomClass)
    m.on('moveend', () => setBounds(m.getBounds()))
    zoomClass()
    L.marker([home.lat, home.lon], { icon: L.divIcon({ className: 'pin-home', html: '<span></span>', iconSize: [16, 16] }), zIndexOffset: 1000 })
      .bindTooltip('Domicile', { direction: 'top', offset: [0, -8] })
      .addTo(m)
    pins.current = L.layerGroup().addTo(m)
    clusterReady.then(() => {
      cluster.current = L.markerClusterGroup({
        maxClusterRadius: 48,
        disableClusteringAtZoom: 15,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: false,
        iconCreateFunction: (c) => {
          const n = c.getChildCount()
          const s = n < 10 ? 30 : n < 50 ? 36 : 44
          return L.divIcon({ className: 'pin-cluster', html: `<span>${n}</span>`, iconSize: [s, s] })
        },
      }).addTo(m)
      setReady(true)
    })
    setTimeout(() => {
      m.invalidateSize()
      setBounds(m.getBounds())
    }, 50)
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(box.current)
    return () => {
      ro.disconnect()
      m.remove()
      map.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // cercle du rayon de recherche
  useEffect(() => {
    if (!map.current) return
    ring.current?.remove()
    ring.current = L.circle([home.lat, home.lon], { radius: radius * 1000, color: '#378add', weight: 1.5, dashArray: '6 5', fillOpacity: 0.04, interactive: false }).addTo(map.current)
  }, [radius, home.lat, home.lon])

  // épingles
  useEffect(() => {
    if (!ready || !pins.current || !cluster.current) return
    pins.current.clearLayers()
    cluster.current.clearLayers()
    markers.current.clear()
    const clustered: L.Marker[] = []
    for (const it of visible) {
      const mk = L.marker([it.lat, it.lon], {
        icon: L.divIcon({ className: `pin pin-${it.kind}${it.approx ? ' approx' : ''}`, html: '<span></span>', iconSize: [16, 16] }),
        riseOnHover: true,
        keyboard: false,
      })
      mk.bindTooltip(it.name, { permanent: true, direction: 'right', offset: [7, 0], className: `pin-label${it.kind === 'found' || it.kind === 'no' ? '' : ' lbl-pin'}` })
      mk.on('click', () => {
        setSelected(it.key)
        setPanel(true)
      })
      mk.on('mouseover', () => mk.getTooltip()?.getElement()?.classList.add('hover'))
      mk.on('mouseout', () => mk.getTooltip()?.getElement()?.classList.remove('hover'))
      markers.current.set(it.key, mk)
      if (it.kind === 'found' || it.kind === 'no') clustered.push(mk)
      else pins.current.addLayer(mk)
    }
    cluster.current.addLayers(clustered)
  }, [visible, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  // sélection : la carte va vers l'entreprise
  useEffect(() => {
    markers.current.forEach((mk, k) => mk.getElement()?.classList.toggle('sel', k === selected))
    const mk = selected ? markers.current.get(selected) : undefined
    if (!mk || !map.current) return
    if (cluster.current?.hasLayer(mk)) cluster.current.zoomToShowLayer(mk, () => mk.getElement()?.classList.add('sel'))
    else map.current.flyTo(mk.getLatLng(), Math.max(map.current.getZoom(), 13), { duration: 0.6 })
  }, [selected, visible])

  const hover = (key: string, on: boolean) => markers.current.get(key)?.getTooltip()?.getElement()?.classList.toggle('hover', on)

  /* ---------- actions ---------- */
  const listNow = () => useDocs.getState().watch.companies ?? []
  const follow = (it: Item) => {
    const list = listNow()
    if (it.company) return setCompanies(list.map((c) => (c.id === it.company!.id ? { ...c, state: undefined } : c)))
    const p = it.place
    setCompanies([...list, { id: newId(), name: it.name, url: '', active: false, ...(p ? fromPlace(p, it.sector) : { lat: it.lat, lon: it.lon }) }])
    toast.ok(`${it.name} suivie : ajoutez sa page carrières pour que la veille lise ses offres`)
  }
  const unfollow = (it: Item) => {
    if (!it.company) return
    if (it.company.url && !window.confirm(`Ne plus suivre ${it.name} ? Ses offres disparaîtront de vos annonces au prochain passage de la veille.`)) return
    setCompanies(listNow().filter((c) => c.id !== it.company!.id))
    setSelected(null)
  }
  const notInterested = (it: Item) => {
    const list = listNow()
    if (it.company) setCompanies(list.map((c) => (c.id === it.company!.id ? { ...c, state: 'no', active: false } : c)))
    else setCompanies([...list, { id: newId(), name: it.name, url: '', active: false, state: 'no', ...(it.place ? fromPlace(it.place, it.sector) : { lat: it.lat, lon: it.lon }) }])
    setSelected(null)
    toast.ok(`${it.name} masquée (filtre « Pas intéressé » pour la revoir)`)
  }
  const restore = (it: Item) => {
    if (!it.company) return
    setCompanies(listNow().filter((c) => c.id !== it.company!.id))
  }
  const patch = (c: Company, p: Partial<Company>) => setCompanies(listNow().map((x) => (x.id === c.id ? { ...x, ...p } : x)))

  const searchBase = async () => {
    if (needle.length < 2) return
    setLoading(`« ${q.trim()} »`)
    try {
      const list = (await searchPlaces(q.trim(), home)).filter((p) => km(home, p) <= 150)
      if (!list.length) toast.error('Aucune entreprise de ce nom près de chez vous')
      setExtra((e) => [...e.filter((x) => !list.some((p) => p.siren === x.siren)), ...list])
      if (list[0]) setTimeout(() => setSelected(`f:${list[0].siren}`), 100)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(null)
    }
  }

  const toggleKind = (k: Kind) => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])
  const count = (k: Kind) => items.filter((it) => it.kind === k).length

  return (
    <div className="cmap">
      <div ref={box} className="cmap-map" />
      {!panel && (
        <button className="cmap-open btn" onClick={() => setPanel(true)} title="Afficher la liste">
          <PanelRightOpen size={15} /> Liste ({inView.length})
        </button>
      )}
      {panel && (
        <aside className="cmap-panel">
          {sel ? (
            <PlaceSheet
              it={sel}
              onBack={() => setSelected(null)}
              onFollow={() => follow(sel)}
              onUnfollow={() => unfollow(sel)}
              onNo={() => notInterested(sel)}
              onRestore={() => restore(sel)}
              onPatch={(p) => sel.company && patch(sel.company, p)}
              onApply={() => setApplyTo({ name: sel.name, careers: sel.company?.url || undefined })}
            />
          ) : (
            <>
              <div className="cmap-head">
                <strong>
                  <Building2 size={15} /> Entreprises
                </strong>
                <span className="muted small">{inView.length} dans la zone visible</span>
                <span className="spacer" />
                <button className="icon-btn xs" title="Ajouter une entreprise" onClick={() => setAdding((v) => !v)}>
                  <Plus size={15} />
                </button>
                <button className="icon-btn xs" title="Replier le volet" onClick={() => setPanel(false)}>
                  <PanelRightClose size={15} />
                </button>
              </div>
              {adding && <AddCompany onDone={() => setAdding(false)} />}
              <div className="cmap-search">
                <Search size={14} />
                <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchBase()} placeholder="Rechercher une entreprise, une ville" />
              </div>
              {needle.length >= 2 && (
                <button className="btn sm ghost cmap-base" onClick={searchBase}>
                  <Search size={13} /> Chercher « {q.trim()} » dans la base des entreprises
                </button>
              )}
              <div className="cmap-filters">
                <div className="cmap-row">
                  <span className="muted small">Rayon</span>
                  <input type="range" min={5} max={MAX_RADIUS} step={5} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
                  <strong className="small">{radius} km</strong>
                </div>
                <div className="cmap-chips">
                  {KINDS.map((k) => (
                    <button key={k} className={`cmap-chip k-${k}${kinds.includes(k) ? ' on' : ''}`} onClick={() => toggleKind(k)}>
                      <i /> {KIND_LABEL[k]} <span>{count(k)}</span>
                    </button>
                  ))}
                </div>
                <div className="cmap-sub muted small">
                  Secteurs
                  <button className="link-btn" onClick={() => openSettings('profile')} title="Choisir les secteurs dans chaque profil de recherche">
                    <Settings2 size={12} /> modifier
                  </button>
                </div>
                {sectors.length ? (
                  <div className="cmap-chips">
                    {sectors.map((s) => (
                      <button key={s} className={`cmap-chip${off.includes(s) ? '' : ' on'}`} onClick={() => setOff(off.includes(s) ? off.filter((x) => x !== s) : [...off, s])}>
                        {s}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="small muted">{seeding ? 'Recherche des secteurs de vos candidatures…' : 'Aucun secteur choisi : ajoutez-en dans Réglages, Profil.'}</p>
                )}
                <div className="cmap-row">
                  <span className="muted small">Taille</span>
                  <Segmented value={minSize} onChange={setMinSize} options={FOLLOW_SIZE} />
                </div>
              </div>
              <div className="cmap-list">
                {inView.slice(0, 200).map((it) => (
                  <button key={it.key} className="cmap-item" onClick={() => setSelected(it.key)} onMouseEnter={() => hover(it.key, true)} onMouseLeave={() => hover(it.key, false)}>
                    <i className={`dot k-${it.kind}`} />
                    <span className="cmap-item-main">
                      <span className="cmap-name">{it.name}</span>
                      <span className="muted small">{[it.sector, `${Math.round(it.dist)} km`, it.offers.length ? `${it.offers.length} candidature${it.offers.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}</span>
                    </span>
                    <ChevronRight size={14} className="muted" />
                  </button>
                ))}
                {!inView.length && !loading && <p className="small muted cmap-empty">Aucune entreprise ici : dézoomez, élargissez le rayon ou les filtres.</p>}
              </div>
              <div className="cmap-foot small">
                {loading ? (
                  <span className="muted">
                    <Loader2 size={13} className="spin" /> Recherche : {loading}
                  </span>
                ) : error ? (
                  <span className="err-text">
                    <AlertTriangle size={13} /> {error}
                  </span>
                ) : (
                  <>
                    <span className="muted">{found.size} trouvées dans vos secteurs, les plus grandes d'abord</span>
                    <button className="btn sm ghost" onClick={() => setPages((p) => p + 2)}>
                      Charger plus
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </aside>
      )}
      {applyTo && <SpontaneousModal preset={applyTo} onClose={() => setApplyTo(null)} onCreated={(o) => setAnalyse(o)} />}
      {analyse && <CompanyAnalysisModal offer={useDocs.getState().offers[analyse.id] ?? analyse} onClose={() => setAnalyse(null)} />}
    </div>
  )
}

function AddCompany({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const add = () => {
    if (!name.trim()) return
    let u = url.trim()
    if (u && !/^https?:\/\//.test(u)) u = `https://${u}`
    const list = useDocs.getState().watch.companies ?? []
    useDocs.getState().setCompanies([...list, { id: newId(), name: name.trim(), url: u, active: !!u }])
    toast.ok(`${name.trim()} ajoutée : elle apparaîtra sur la carte dès qu'elle sera localisée`)
    onDone()
  }
  return (
    <div className="cmap-add">
      <TextInput value={name} onChange={setName} placeholder="Nom de l'entreprise" />
      <TextInput value={url} onChange={setUrl} placeholder="Page carrières (facultatif)" />
      <button className="btn sm primary" disabled={!name.trim()} onClick={add}>
        <Plus size={13} /> Suivre
      </button>
    </div>
  )
}

function VeilleStatus({ c }: { c: Company }) {
  const st = useFeed((s) => s.feed?.sources?.companies?.[c.id])
  const n = useFeed((s) => (s.feed?.items ?? []).filter((i) => i.id.startsWith(`co-${c.id}-`)).length)
  if (!c.url) return null
  return (
    <p className={`small cr-status${st?.error ? ' err' : ''}`}>
      {!st ? (
        <>
          <Clock size={12} /> Sera lue au prochain passage de la veille
        </>
      ) : st.error ? (
        <>
          <AlertTriangle size={12} /> {st.error}
        </>
      ) : (
        <>
          <CheckCircle2 size={12} /> {n} offre{n > 1 ? 's' : ''} dans vos annonces · {st.jobs} publiée{st.jobs > 1 ? 's' : ''}
        </>
      )}
    </p>
  )
}

function PlaceSheet({ it, onBack, onFollow, onUnfollow, onNo, onRestore, onPatch, onApply }: { it: Item; onBack: () => void; onFollow: () => void; onUnfollow: () => void; onNo: () => void; onRestore: () => void; onPatch: (p: Partial<Company>) => void; onApply: () => void }) {
  const c = it.company
  const [edit, setEdit] = useState(false)
  const [url, setUrl] = useState(c?.url ?? '')
  useEffect(() => setUrl(c?.url ?? ''), [c?.id, c?.url])
  const followed = !!c && c.state !== 'no'
  const saveUrl = () => {
    let u = url.trim()
    if (u && !/^https?:\/\//.test(u)) u = `https://${u}`
    if (u === (c?.url ?? '')) return
    onPatch({ url: u, active: !!u })
    if (u) toast.ok('Page carrières enregistrée : la veille la lira au prochain passage')
  }
  const siren = c?.siren ?? it.place?.siren
  const openOffer = (o: Offer) => window.dispatchEvent(new CustomEvent('resume-open-offer', { detail: o.id }))
  return (
    <div className="cmap-sheet">
      <button className="link-btn" onClick={onBack}>
        <ArrowLeft size={14} /> Liste
      </button>
      <h3 className="cmap-title">
        {it.name}
        {c && (
          <button className="icon-btn xs" title="Modifier (nom, page, adresse, entreprise officielle)" onClick={() => setEdit(true)}>
            <Pencil size={14} />
          </button>
        )}
      </h3>
      {edit && c && <CompanyEditModal company={c} onClose={() => setEdit(false)} />}
      <div className="cmap-badges">
        <span className={`cmap-badge k-${it.kind}`}>{KIND_LABEL[it.kind]}</span>
        {it.sector && <span className="cmap-badge">{it.sector}</span>}
      </div>
      <ul className="cmap-facts small">
        <li>
          <MapPin size={13} /> {c?.address ?? it.place?.address ?? c?.city ?? it.place?.city ?? 'Lieu de l’offre'} · {Math.round(it.dist)} km{it.approx ? ' (centre de la commune)' : ''}
        </li>
        {sizeText(it) && (
          <li>
            <Building2 size={13} /> {sizeText(it)}
            {it.place && it.place.sites > 1 ? ` · ${it.place.sites} établissements dans la zone` : ''}
          </li>
        )}
      </ul>
      <div className="cmap-actions">
        {followed ? (
          <button className="btn sm" onClick={onUnfollow}>
            <Star size={13} className="filled" /> Suivie
          </button>
        ) : (
          <button className="btn sm primary" onClick={onFollow}>
            <Star size={13} /> Suivre
          </button>
        )}
        <button className="btn sm" onClick={onApply}>
          <Send size={13} /> Candidature spontanée
        </button>
        {it.kind === 'no' ? (
          <button className="btn sm ghost" onClick={onRestore}>
            <Undo2 size={13} /> Rétablir
          </button>
        ) : (
          !it.offers.length && (
            <button className="btn sm ghost" onClick={onNo}>
              <Ban size={13} /> Pas intéressé
            </button>
          )
        )}
      </div>
      {followed && c && (
        <div className="cmap-careers">
          <label className="small">Page carrières (liste des offres)</label>
          <div className="row-gap">
            <TextInput value={url} onChange={setUrl} placeholder="https://..." />
            <button className="btn sm" onClick={saveUrl} disabled={url.trim() === (c.url ?? '')}>
              Enregistrer
            </button>
          </div>
          {!c.url && (
            <a className="small" href={`https://www.google.com/search?q=${encodeURIComponent(`${it.name} offres d'emploi carrières`)}`} target="_blank" rel="noreferrer">
              <Search size={12} /> Chercher sa page carrières <ExternalLink size={10} />
            </a>
          )}
          <VeilleStatus c={c} />
          {c.url && (
            <div className="row-gap">
              <Toggle label="Toutes les offres" checked={!!c.all} onChange={(v) => onPatch({ all: v })} />
              <Toggle label="Lue par la veille" checked={c.active !== false} onChange={(v) => onPatch({ active: v })} />
            </div>
          )}
        </div>
      )}
      {it.offers.length > 0 && (
        <div className="cmap-offers">
          <strong className="small">Candidatures</strong>
          {it.offers.map((o) => (
            <button key={o.id} className="cmap-item" onClick={() => openOffer(o)}>
              <i className="dot k-offer" />
              <span className="cmap-item-main">
                <span className="cmap-name">{o.title}</span>
                <span className="muted small">{o.spontaneous ? 'Candidature spontanée' : o.location}</span>
              </span>
              <Eye size={14} className="muted" />
            </button>
          ))}
        </div>
      )}
      <div className="cmap-links small">
        {siren && (
          <a href={annuaireUrl(siren)} target="_blank" rel="noreferrer">
            Fiche officielle <ExternalLink size={10} />
          </a>
        )}
        <a href={`https://www.google.com/search?q=${encodeURIComponent(it.name + ' ' + (it.place?.city ?? ''))}`} target="_blank" rel="noreferrer">
          Site web <ExternalLink size={10} />
        </a>
      </div>
    </div>
  )
}
