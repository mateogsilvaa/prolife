import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * `base` sale del entorno porque en GitHub Pages la app no cuelga de la raíz
 * del dominio sino de `/prolife/`, y con la base mal puesta el HTML se carga
 * pero pide el JavaScript a una ruta que no existe: pantalla en blanco sin un
 * solo error visible. En el escritorio y en el APK sigue siendo `/`.
 */
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    port: 5199,
    open: true,
    proxy: {
      '/api': 'http://127.0.0.1:4321',
    },
  },
  build: { outDir: 'dist' },
})
