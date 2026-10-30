import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', allowedHosts: true },
  preview: { host: '0.0.0.0', allowedHosts: true },
  build: {
    target: 'es2022',
    rollupOptions: { output: { manualChunks(id) {
      if (!id.includes('/node_modules/')) return
      if (id.includes('/prettier/')) return
      if (id.includes('/@codemirror/lang-') || /\/@lezer\/(?:html|javascript|css|xml|markdown|json|yaml)\//.test(id)) return 'editor-languages'
      if (id.includes('/@codemirror/') || id.includes('/@lezer/')) return 'editor-engine'
      if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'react-vendor'
      if (id.includes('/jszip/') || id.includes('/pako/') || id.includes('/lie/') || id.includes('/readable-stream/')) return 'archive-vendor'
      if (id.includes('/parse5/') || id.includes('/entities/') || id.includes('/marked/')) return 'preview-vendor'
    } } },
  },
  test: { environment: 'jsdom', setupFiles: ['./src/tests/setup.ts'] },
})
