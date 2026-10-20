import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

/**
 * The XR store lazily imports a desktop headset emulator (with several MB of synthetic rooms).
 * Emulation is disabled in this project, so the import is replaced by a tiny stub.
 */
function stripXREmulator(): Plugin {
  const id = '\0xr-emulate-stub'
  return {
    name: 'strip-xr-emulator',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './emulate.js' && importer && importer.replace(/\\/g, '/').includes('@pmndrs/xr/dist/')) return id
      return null
    },
    load(loadId) {
      if (loadId === id) return 'export function emulate() { return undefined }'
      return null
    },
  }
}

// HTTPS is only needed for the dev server (WebXR requires a secure context on LAN).
export default defineConfig(({ command }) => ({
  base: './',
  plugins: [stripXREmulator(), react(), ...(command === 'serve' ? [basicSsl()] : [])],
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  server: {
    host: true,
  },
}))
