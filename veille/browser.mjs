// Navigateur sans affichage (Playwright, Chromium) pour les pages construites par script :
// détail des offres France Travail, Jobijoba, APEC, pages carrières des entreprises.
// Installé à la demande lors du premier besoin ; sans lui, la veille continue avec de simples requêtes.
import { execSync } from 'node:child_process'

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
let browserP = null
let used = 0
export const MAX_RENDERS = 60

async function launch() {
  let pw
  try {
    pw = await import('playwright')
  } catch {
    return null
  }
  const chromium = pw.chromium ?? pw.default?.chromium
  try {
    return await chromium.launch()
  } catch {
    try {
      execSync('npx playwright install --with-deps chromium', { stdio: 'ignore', timeout: 300000 })
      return await chromium.launch()
    } catch {
      return null
    }
  }
}

/** Affiche une page comme un navigateur et renvoie son HTML final et son texte visible (null si impossible). */
export async function render(url, { settle = 2500 } = {}) {
  if (used >= MAX_RENDERS) return null
  used++
  browserP ??= launch()
  const b = await browserP
  if (!b) return null
  const page = await b.newPage({ locale: 'fr-FR', userAgent: UA })
  try {
    const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 })
    } catch {
      /* pages qui chargent en continu : on prend ce qui est affiché */
    }
    await page.waitForTimeout(settle)
    return {
      status: r?.status() ?? 0,
      url: page.url(),
      html: await page.content(),
      text: await page.evaluate(() => document.body?.innerText ?? ''),
      links: await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.href, text: (a.innerText || a.getAttribute('aria-label') || a.title || '').replace(/\s+/g, ' ').trim() }))),
    }
  } catch {
    return null
  } finally {
    await page.close().catch(() => {})
  }
}

export const renders = () => used

export async function closeBrowser() {
  const b = await browserP
  await b?.close().catch(() => {})
}
