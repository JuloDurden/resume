import type { ContactLink } from '../types'

/** Regroupe les coordonnées par ligne, dans l'ordre des lignes puis de saisie. */
export function toRows(contacts: ContactLink[]): ContactLink[][] {
  const keys = [...new Set(contacts.map((c) => c.row ?? 0))].sort((a, b) => a - b)
  return keys.map((k) => contacts.filter((c) => (c.row ?? 0) === k))
}

/** Aplatit les lignes en renumérotant (les lignes vides disparaissent). */
export function fromRows(rows: ContactLink[][]): ContactLink[] {
  return rows.filter((r) => r.length).flatMap((r, i) => r.map((c) => ({ ...c, row: i })))
}

/** Déplace une coordonnée d'un cran ; aux extrémités d'une ligne, elle passe à la ligne voisine. */
export function moveContact(contacts: ContactLink[], id: string, dir: -1 | 1): ContactLink[] {
  const rows = toRows(contacts).map((r) => [...r])
  const ri = rows.findIndex((r) => r.some((c) => c.id === id))
  if (ri < 0) return contacts
  const ci = rows[ri].findIndex((c) => c.id === id)
  const row = rows[ri]
  if (dir === -1) {
    if (ci > 0) [row[ci - 1], row[ci]] = [row[ci], row[ci - 1]]
    else if (ri > 0) rows[ri - 1].push(row.splice(ci, 1)[0])
  } else {
    if (ci < row.length - 1) [row[ci], row[ci + 1]] = [row[ci + 1], row[ci]]
    else if (ri < rows.length - 1) rows[ri + 1].unshift(row.splice(ci, 1)[0])
    else if (row.length > 1) rows.push(row.splice(ci, 1))
  }
  return fromRows(rows)
}

export function moveRow(contacts: ContactLink[], ri: number, dir: -1 | 1): ContactLink[] {
  const rows = toRows(contacts)
  const j = ri + dir
  if (j < 0 || j >= rows.length) return contacts
  ;[rows[ri], rows[j]] = [rows[j], rows[ri]]
  return fromRows(rows)
}
