import type { DateFormat, DateValue, SectionItem, StyleSettings } from '../types'

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export function formatDate(d: DateValue | undefined, fmt: DateFormat): string {
  if (!d || !d.year) return ''
  const m = d.month
  if (!m || fmt === 'YYYY') return String(d.year)
  switch (fmt) {
    case 'MM/YYYY':
      return `${String(m).padStart(2, '0')}/${d.year}`
    case 'MMM YYYY':
      return `${MONTHS_SHORT[m - 1]} ${d.year}`
    case 'MMMM YYYY': {
      const s = MONTHS_LONG[m - 1]
      return `${s.charAt(0).toUpperCase()}${s.slice(1)} ${d.year}`
    }
  }
  return String(d.year)
}

export function formatRange(item: SectionItem, style: Pick<StyleSettings, 'dateFormat' | 'dateSeparator' | 'currentLabel'>): string {
  const s = formatDate(item.start, style.dateFormat)
  const e = item.current ? style.currentLabel : formatDate(item.end, style.dateFormat)
  if (s && e) return s === e ? s : `${s}${style.dateSeparator}${e}`
  return s || e
}

export const MONTH_OPTIONS = MONTHS_LONG.map((m, i) => ({ value: i + 1, label: m }))

export function todayFr(): string {
  const d = new Date()
  return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`
}
