export interface FontDef {
  name: string
  category: 'sans' | 'serif' | 'system'
  google?: string // family spec for Google Fonts css2
}

const g = (name: string, ital = true) =>
  `family=${name.replace(/ /g, '+')}:${ital ? 'ital,wght@0,400;0,700;1,400' : 'wght@400;700'}`

export const FONTS: FontDef[] = [
  { name: 'Inter', category: 'sans', google: g('Inter') },
  { name: 'Roboto', category: 'sans', google: g('Roboto') },
  { name: 'Open Sans', category: 'sans', google: g('Open Sans') },
  { name: 'Lato', category: 'sans', google: g('Lato') },
  { name: 'Source Sans 3', category: 'sans', google: g('Source Sans 3') },
  { name: 'Montserrat', category: 'sans', google: g('Montserrat') },
  { name: 'Raleway', category: 'sans', google: g('Raleway') },
  { name: 'Poppins', category: 'sans', google: g('Poppins') },
  { name: 'Nunito', category: 'sans', google: g('Nunito') },
  { name: 'Work Sans', category: 'sans', google: g('Work Sans') },
  { name: 'IBM Plex Sans', category: 'sans', google: g('IBM Plex Sans') },
  { name: 'Rubik', category: 'sans', google: g('Rubik') },
  { name: 'DM Sans', category: 'sans', google: g('DM Sans') },
  { name: 'Manrope', category: 'sans', google: g('Manrope', false) },
  { name: 'Barlow', category: 'sans', google: g('Barlow') },
  { name: 'Merriweather', category: 'serif', google: g('Merriweather') },
  { name: 'Lora', category: 'serif', google: g('Lora') },
  { name: 'Playfair Display', category: 'serif', google: g('Playfair Display') },
  { name: 'PT Serif', category: 'serif', google: g('PT Serif') },
  { name: 'EB Garamond', category: 'serif', google: g('EB Garamond') },
  { name: 'Libre Baskerville', category: 'serif', google: g('Libre Baskerville') },
  { name: 'Crimson Pro', category: 'serif', google: g('Crimson Pro') },
  { name: 'Source Serif 4', category: 'serif', google: g('Source Serif 4') },
  { name: 'Arial', category: 'system' },
  { name: 'Helvetica', category: 'system' },
  { name: 'Georgia', category: 'system' },
  { name: 'Verdana', category: 'system' },
  { name: 'Times New Roman', category: 'system' },
]

const loaded = new Set<string>()

export function ensureFont(name: string) {
  if (loaded.has(name)) return
  const def = FONTS.find((f) => f.name === name)
  if (!def || !def.google) return
  loaded.add(name)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?${def.google}&display=swap`
  document.head.appendChild(link)
}

export function fontStack(name: string): string {
  const def = FONTS.find((f) => f.name === name)
  const fallback = def?.category === 'serif' || name === 'Georgia' || name === 'Times New Roman' ? 'Georgia, serif' : 'Arial, sans-serif'
  return `"${name}", ${fallback}`
}
