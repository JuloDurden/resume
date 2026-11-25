// Modifier une entreprise enregistrée : nom, page carrières, adresse exacte (position sur la carte)
// et rattachement à l'entreprise officielle (base SIRENE), par son nom et/ou son adresse.
import { useEffect, useMemo, useState } from 'react'
import { Building2, Check, Link2, Link2Off, MapPin, Search } from 'lucide-react'
import type { Company } from '../../types'
import { useDocs } from '../../store/documents'
import { deptOfAddress, km, searchAddress, searchPlaces, type Address, type Place } from '../../lib/places'
import { SIZE_LABEL, sectorOfNaf } from '../../lib/sectors'
import { Field, Modal, TextInput, toast } from '../ui'

const MONTPELLIER = { lat: 43.61, lon: 3.8742 }
type Link = Pick<Company, 'siren' | 'naf' | 'size' | 'sector'> & { name?: string }

export function CompanyEditModal({ company, onClose }: { company: Company; onClose: () => void }) {
  const home = useDocs((s) => s.watch.profile?.home) ?? MONTPELLIER
  const tracks = useDocs((s) => s.watch.profile?.tracks)
  const sectors = useMemo(() => [...new Set((tracks ?? []).flatMap((t) => t.sectors ?? []))], [tracks])
  const [name, setName] = useState(company.name)
  const [url, setUrl] = useState(company.url)
  const [address, setAddress] = useState(company.address ?? '')
  const [pos, setPos] = useState<{ lat: number; lon: number } | undefined>(company.lat !== undefined && company.lon !== undefined ? { lat: company.lat, lon: company.lon } : undefined)
  const [suggest, setSuggest] = useState<Address[]>([])
  const [typing, setTyping] = useState(false)
  const [link, setLink] = useState<Link | undefined>(company.siren ? { siren: company.siren, naf: company.naf, size: company.size, sector: company.sector } : undefined)
  const [q, setQ] = useState(company.name)
  const [results, setResults] = useState<Place[] | null>(null)
  const [busy, setBusy] = useState(false)

  // suggestions d'adresses pendant la saisie
  useEffect(() => {
    if (!typing || address.trim().length < 5) return setSuggest([])
    const t = setTimeout(() => {
      searchAddress(address.trim(), home)
        .then(setSuggest)
        .catch(() => setSuggest([]))
    }, 350)
    return () => clearTimeout(t)
  }, [address, typing]) // eslint-disable-line react-hooks/exhaustive-deps

  const pickAddress = (a: Address) => {
    setAddress(a.label)
    setPos({ lat: a.lat, lon: a.lon })
    setSuggest([])
    setTyping(false)
  }

  const search = async () => {
    if (!q.trim()) return
    setBusy(true)
    try {
      const dept = deptOfAddress(address)
      let list = await searchPlaces(q.trim(), pos ?? home, { dept, nearest: !!pos })
      if (!list.length && dept) list = await searchPlaces(q.trim(), pos ?? home, { nearest: !!pos })
      setResults(list)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const attach = (p: Place) => {
    setLink({ siren: p.siren, naf: p.naf, size: p.size, sector: sectorOfNaf(p.naf, sectors), name: p.name })
    // sans adresse saisie, celle de l'établissement trouvé
    if (!address.trim() || !pos) {
      setAddress(p.address ?? p.city ?? '')
      setPos({ lat: p.lat, lon: p.lon })
    }
    setResults(null)
  }

  const save = () => {
    let u = url.trim()
    if (u && !/^https?:\/\//.test(u)) u = `https://${u}`
    const patch: Partial<Company> = {
      name: name.trim() || company.name,
      url: u,
      active: u ? (company.url ? company.active : true) : false,
      address: address.trim() || undefined,
      lat: pos?.lat,
      lon: pos?.lon,
      noGeo: pos ? undefined : company.noGeo,
      siren: link?.siren,
      naf: link?.naf,
      size: link?.size,
      sector: link?.sector ?? company.sector,
    }
    const list = useDocs.getState().watch.companies ?? []
    useDocs.getState().setCompanies(list.map((c) => (c.id === company.id ? { ...c, ...patch } : c)))
    toast.ok('Entreprise enregistrée')
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Modifier ${company.name}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={save}>
            <Check size={14} /> Enregistrer
          </button>
        </>
      }
    >
      <div className="form-stack co-edit">
        <Field label="Nom">
          <TextInput value={name} onChange={setName} />
        </Field>
        <Field label="Page carrières (liste des offres)" hint="Facultative : sans elle, la veille ne lit pas les offres de l'entreprise.">
          <TextInput value={url} onChange={setUrl} placeholder="https://..." />
        </Field>
        <Field label="Adresse" hint="Pour placer l'entreprise exactement sur la carte. Choisissez une des adresses proposées.">
          <div className="co-addr">
            <TextInput
              value={address}
              onChange={(v) => {
                setAddress(v)
                setTyping(true)
              }}
              placeholder="ex. 1095 avenue Henri Becquerel, Montpellier"
            />
            {suggest.length > 0 && (
              <div className="co-suggest">
                {suggest.map((a) => (
                  <button key={`${a.lat},${a.lon}`} onClick={() => pickAddress(a)}>
                    <MapPin size={13} /> {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className={`small ${pos && !typing ? 'ok-text' : 'muted'}`}>
            {pos && !typing ? `Placée sur la carte · ${Math.round(km(home, pos))} km de chez vous` : typing ? 'Choisissez une adresse dans la liste' : 'Pas encore placée sur la carte'}
          </span>
        </Field>
        <Field label="Entreprise officielle (base SIRENE)" hint="Rattacher l'entreprise donne son secteur, sa taille et sa fiche officielle. La recherche tient compte de l'adresse saisie.">
          {link?.siren ? (
            <div className="co-link">
              <Link2 size={14} />
              <span>
                {link.name ?? name} · SIREN {link.siren}
                {link.sector ? ` · ${link.sector}` : ''}
                {link.size && SIZE_LABEL[link.size] ? ` · ${SIZE_LABEL[link.size]}` : ''}
              </span>
              <button className="btn sm ghost" onClick={() => setLink(undefined)} title="Détacher">
                <Link2Off size={13} />
              </button>
            </div>
          ) : (
            <span className="small muted">Non rattachée</span>
          )}
          <div className="co-search">
            <TextInput value={q} onChange={setQ} placeholder="Nom de l'entreprise" />
            <button className="btn sm" onClick={search} disabled={busy || !q.trim()}>
              <Search size={13} /> {busy ? 'Recherche…' : 'Rechercher'}
            </button>
          </div>
          {results && (
            <div className="co-results">
              {!results.length && <p className="small muted">Aucune entreprise trouvée : essayez un autre nom ou le nom légal (raison sociale).</p>}
              {results.map((p) => (
                <button key={p.siren} className="co-result" onClick={() => attach(p)}>
                  <Building2 size={15} className="muted" />
                  <span>
                    <strong>{p.name}</strong>
                    <span className="small muted">
                      {[p.address ?? p.city, sectorOfNaf(p.naf), p.size && SIZE_LABEL[p.size], `${Math.round(km(pos ?? home, p))} km${pos ? " de l'adresse" : ''}`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="btn sm">Rattacher</span>
                </button>
              ))}
            </div>
          )}
        </Field>
      </div>
    </Modal>
  )
}
