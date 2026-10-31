import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/resume/',
  plugins: [react()],
  test: { environment: 'node' },
} as any)
