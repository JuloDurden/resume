import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

declare const __BUILD_ID__: string

/** Prévient quand une nouvelle version de l'application a été publiée depuis l'ouverture de l'onglet. */
export function UpdateBanner() {
  const [outdated, setOutdated] = useState(false)
  useEffect(() => {
    if (import.meta.env.DEV) return
    const check = async () => {
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) return
        const { build } = await r.json()
        if (build && build !== __BUILD_ID__) setOutdated(true)
      } catch {
        /* hors ligne */
      }
    }
    check()
    const id = setInterval(check, 10 * 60000)
    const onVis = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
  if (!outdated) return null
  return (
    <div className="update-banner">
      Une nouvelle version de Resume est disponible.
      <button className="btn sm primary" onClick={() => location.reload()}>
        <RefreshCw size={14} /> Recharger
      </button>
    </div>
  )
}
