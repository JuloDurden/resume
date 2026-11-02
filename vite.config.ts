import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const BUILD_ID = new Date().toISOString()

/** Publie version.json pour que les onglets ouverts détectent une nouvelle version. */
const versionFile = (): Plugin => ({
  name: 'version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) })
  },
})

export default defineConfig({
  base: '/resume/',
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  test: { environment: 'node' },
} as never)
