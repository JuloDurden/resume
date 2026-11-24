// Secteurs d'activité (référentiel ROME de France Travail) et leur correspondance avec les codes NAF de l'INSEE,
// pour chercher les entreprises d'un secteur autour de chez soi (API Recherche d'entreprises).

/** Une requête : soit une liste de codes NAF, soit une section (lettre A à U). */
export interface SectorQuery {
  codes?: string[]
  section?: string
}
export interface SectorDef {
  name: string
  queries: SectorQuery[]
  /** débuts de code NAF qui appartiennent au secteur (filtre les résultats d'une section) */
  prefixes?: string[]
  /** divisions NAF (2 chiffres) comprises, bornes incluses */
  divs?: [number, number][]
}

const codes = (...c: string[]): SectorQuery => ({ codes: c })
const section = (s: string): SectorQuery => ({ section: s })

export const SECTORS: SectorDef[] = [
  { name: 'Informatique et télécommunication', queries: [codes('62.01Z', '62.02A', '62.02B', '62.03Z', '62.09Z', '63.11Z', '63.12Z', '61.10Z', '61.20Z', '61.30Z', '61.90Z', '58.21Z', '58.29A', '58.29B', '58.29C', '95.11Z', '95.12Z', '46.51Z', '46.52Z')], prefixes: ['62', '63.1', '61', '58.2', '95.1', '46.51', '46.52'] },
  { name: 'Édition', queries: [codes('58.11Z', '58.12Z', '58.13Z', '58.14Z', '58.19Z', '58.21Z', '58.29A', '58.29B', '58.29C')], prefixes: ['58'] },
  { name: 'Communication et marketing', queries: [codes('73.11Z', '73.12Z', '73.20Z', '70.21Z', '74.10Z', '63.91Z')], prefixes: ['73', '70.21', '74.1', '63.91'] },
  { name: 'Finance, banque et assurance', queries: [section('K')], prefixes: ['64', '65', '66'] },
  { name: 'Commerce et distribution', queries: [section('G')], prefixes: ['45', '46', '47'] },
  { name: 'Logistique et transport', queries: [section('H')], prefixes: ['49', '50', '51', '52', '53'] },
  { name: 'Maintenance, entretien et nettoyage', queries: [codes('81.10Z', '81.21Z', '81.22Z', '81.29A', '81.29B', '81.30Z', '33.11Z', '33.12Z', '33.13Z', '33.14Z', '33.15Z', '33.16Z', '33.17Z', '33.19Z', '33.20A', '33.20B', '33.20C', '33.20D', '95.21Z', '95.22Z', '95.29Z')], prefixes: ['81', '33', '95.2'] },
  { name: 'Gestion administrative et ressources humaines', queries: [codes('78.10Z', '78.20Z', '78.30Z', '82.11Z', '82.19Z', '82.20Z', '82.30Z', '82.91Z', '82.92Z', '82.99Z', '70.10Z', '70.22Z')], prefixes: ['78', '82', '70.1', '70.22'] },
  { name: 'Activités juridiques et comptables', queries: [codes('69.10Z', '69.20Z')], prefixes: ['69'] },
  { name: 'Enseignement et formation', queries: [section('P')], prefixes: ['85'] },
  { name: 'Service public, défense et sécurité', queries: [section('O'), codes('80.10Z', '80.20Z', '80.30Z')], prefixes: ['84', '80'] },
  { name: 'Santé', queries: [codes('86.10Z', '86.21Z', '86.22A', '86.22B', '86.22C', '86.23Z', '86.90A', '86.90B', '86.90C', '86.90D', '86.90E', '86.90F', '21.10Z', '21.20Z', '75.00Z')], prefixes: ['86', '21', '75'] },
  { name: 'Social', queries: [codes('87.10A', '87.10B', '87.10C', '87.20A', '87.20B', '87.30A', '87.30B', '87.90A', '87.90B', '88.10A', '88.10B', '88.10C', '88.91A', '88.91B', '88.99A', '88.99B')], prefixes: ['87', '88'] },
  { name: 'Service à la personne', queries: [codes('88.10A', '88.91A', '97.00Z', '96.02A', '96.02B', '96.04Z', '96.09Z')], prefixes: ['97', '96'] },
  { name: 'Énergie', queries: [section('D'), codes('06.10Z', '06.20Z', '19.20Z')], prefixes: ['35', '06', '19.2'] },
  { name: 'Environnement', queries: [section('E')], prefixes: ['36', '37', '38', '39'] },
  { name: 'Bâtiment et travaux publics (BTP)', queries: [section('F')], prefixes: ['41', '42', '43'] },
  { name: 'Architecture, études et normes', queries: [codes('71.11Z', '71.12A', '71.12B', '71.20A', '71.20B', '74.90A', '74.90B')], prefixes: ['71', '74.9'] },
  { name: 'Recherche', queries: [codes('72.11Z', '72.19Z', '72.20Z')], prefixes: ['72'] },
  { name: 'Industries', queries: [section('C')], divs: [[10, 33]] },
  { name: 'Industrie - Alimentaire', queries: [section('C')], divs: [[10, 12]] },
  { name: 'Industrie - Textile et mode', queries: [section('C')], divs: [[13, 15]] },
  { name: 'Industrie - Bois', queries: [section('C')], divs: [[16, 16], [31, 31]] },
  { name: 'Industrie - Papier et imprimerie', queries: [section('C')], divs: [[17, 18]] },
  { name: 'Industrie - Chimie', queries: [section('C')], divs: [[20, 22]] },
  { name: 'Industrie - Métallurgie', queries: [section('C')], divs: [[24, 25]] },
  { name: 'Industrie - Électronique', queries: [section('C')], divs: [[26, 27]] },
  { name: 'Automobile', queries: [codes('29.10Z', '29.20Z', '29.31Z', '29.32Z', '45.11Z', '45.19Z', '45.20A', '45.20B', '45.31Z', '45.32Z', '45.40Z')], prefixes: ['29', '45'] },
  { name: 'Agriculture et élevage', queries: [section('A')], prefixes: ['01', '02', '03'] },
  { name: 'Hôtellerie et restauration', queries: [section('I')], prefixes: ['55', '56'] },
  { name: 'Tourisme', queries: [codes('79.11Z', '79.12Z', '79.90Z', '55.20Z', '55.30Z', '93.21Z')], prefixes: ['79', '55.2', '55.3', '93.21'] },
  { name: 'Sport, animation et loisir', queries: [codes('93.11Z', '93.12Z', '93.13Z', '93.19Z', '93.21Z', '93.29Z', '85.51Z')], prefixes: ['93', '85.51'] },
  { name: 'Culture et patrimoine', queries: [codes('90.01Z', '90.02Z', '90.03A', '90.03B', '90.04Z', '91.01Z', '91.02Z', '91.03Z', '91.04Z')], prefixes: ['90', '91'] },
  { name: "Artisanat d'art, audiovisuel et spectacle", queries: [codes('59.11A', '59.11B', '59.11C', '59.12Z', '59.13A', '59.13B', '59.14Z', '59.20Z', '60.10Z', '60.20A', '60.20B', '32.12Z', '23.41Z')], prefixes: ['59', '60', '32.1', '23.41'] },
  { name: 'Immobilier', queries: [section('L')], prefixes: ['68'] },
]

export const SECTOR_NAMES = SECTORS.map((s) => s.name)
export const sectorDef = (name: string) => SECTORS.find((s) => s.name === name)

/** Le code NAF (ex. « 62.02A ») fait-il partie du secteur ? */
export function inSector(naf: string | undefined, def: SectorDef): boolean {
  if (!naf) return false
  if (def.prefixes?.some((p) => naf.startsWith(p))) return true
  const d = parseInt(naf.slice(0, 2), 10)
  return !!def.divs?.some(([a, b]) => d >= a && d <= b)
}

/** Secteur d'un code NAF : d'abord parmi les secteurs choisis (dans leur ordre), sinon le premier secteur qui convient. */
export function sectorOfNaf(naf: string | undefined, preferred: string[] = []): string | undefined {
  if (!naf) return undefined
  for (const n of preferred) {
    const d = sectorDef(n)
    if (d && inSector(naf, d)) return n
  }
  // les secteurs larges (« Industries ») après les plus précis
  const precise = SECTORS.filter((s) => s.name !== 'Industries')
  return precise.find((s) => inSector(naf, s))?.name ?? (inSector(naf, sectorDef('Industries')!) ? 'Industries' : undefined)
}

/** Tranches d'effectif INSEE. */
export const SIZE_LABEL: Record<string, string> = {
  '00': '0 salarié',
  '01': '1 ou 2 salariés',
  '02': '3 à 5 salariés',
  '03': '6 à 9 salariés',
  '11': '10 à 19 salariés',
  '12': '20 à 49 salariés',
  '21': '50 à 99 salariés',
  '22': '100 à 199 salariés',
  '31': '200 à 249 salariés',
  '32': '250 à 499 salariés',
  '41': '500 à 999 salariés',
  '42': '1 000 à 1 999 salariés',
  '51': '2 000 à 4 999 salariés',
  '52': '5 000 à 9 999 salariés',
  '53': '10 000 salariés et plus',
}
/** Rang comparable d'une tranche (0 si inconnue). */
export const sizeRank = (code?: string) => (code && /^\d\d$/.test(code) ? parseInt(code, 10) : 0)
