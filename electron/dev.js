/**
 * Lanzador de desarrollo: marca PROLIFE_DEV para que la app espere a que Vite
 * levante en vez de caer a la build. Se ejecuta con Node, no con Electron, así
 * que `import 'electron'` devuelve la ruta del binario.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const child = spawn(electron, [root], {
  stdio: 'inherit',
  env: { ...process.env, PROLIFE_DEV: '1' },
})

child.on('close', (code) => process.exit(code ?? 0))
