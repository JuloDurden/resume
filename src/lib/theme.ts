// Thème de l'interface : clair, sombre ou celui du système. Réglage propre à ce navigateur.
export type ThemeChoice = 'system' | 'light' | 'dark'
const KEY = 'resume-theme'
const media = () => window.matchMedia?.('(prefers-color-scheme: dark)')

export function themeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(choice = themeChoice()) {
  const dark = choice === 'dark' || (choice === 'system' && !!media()?.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    /* réglage non mémorisé : appliqué pour cette session */
  }
  applyTheme(choice)
}

/** À appeler une fois au démarrage : suit aussi les changements du système. */
export function initTheme() {
  applyTheme()
  media()?.addEventListener?.('change', () => themeChoice() === 'system' && applyTheme())
}

/** Largeur des pages : actuelle (1240 px), intermédiaire (1600 px) ou toute la largeur. */
export type PageWidth = 'desktop' | 'wide' | 'full'
const WKEY = 'resume-width'
export function widthChoice(): PageWidth {
  try {
    const v = localStorage.getItem(WKEY)
    return v === 'wide' || v === 'full' ? v : 'desktop'
  } catch {
    return 'desktop'
  }
}
export function setWidth(w: PageWidth) {
  try {
    if (w === 'desktop') localStorage.removeItem(WKEY)
    else localStorage.setItem(WKEY, w)
  } catch {
    /* appliqué pour cette session */
  }
  document.documentElement.dataset.width = w
}
export const initWidth = () => {
  document.documentElement.dataset.width = widthChoice()
}
