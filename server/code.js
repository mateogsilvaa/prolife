import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, execFile } from 'node:child_process'

/**
 * Editor integrado: se apoya en `code serve-web`, el servidor web oficial que
 * trae la propia instalación de VS Code del usuario. Así el editor empotrado es
 * VS Code de verdad, con su marketplace, sus extensiones y sus ajustes — no una
 * imitación ni una copia descargada aparte.
 *
 * Microsoft exige aceptar los términos de licencia del servidor. NO se aceptan
 * por su cuenta: hasta que el usuario lo confirme en Ajustes, esto no arranca.
 */

const CLI = process.platform === 'win32' ? 'code.cmd' : 'code'
const DATA_DIR = path.join(os.homedir(), '.prolife', 'vscode-server')
export const LICENSE_URL = 'https://aka.ms/vscode-server-license'
export const PRIVACY_URL = 'https://privacy.microsoft.com/en-US/privacystatement'

let proc = null
let info = null // { url, port, token, folder }
let starting = null
let lastError = null

function detectCli() {
  return new Promise((resolve) => {
    execFile(CLI, ['--version'], { shell: process.platform === 'win32', timeout: 15000 }, (err, stdout) => {
      if (err) return resolve(null)
      resolve(String(stdout).split('\n')[0].trim())
    })
  })
}

let cliVersion
export async function status() {
  if (cliVersion === undefined) cliVersion = await detectCli()
  return {
    cli: cliVersion,
    installed: !!cliVersion,
    running: !!info,
    url: info?.url || null,
    folder: info?.folder || null,
    error: lastError,
    licenseUrl: LICENSE_URL,
    privacyUrl: PRIVACY_URL,
  }
}

/**
 * Arranca el servidor (una sola instancia para toda la app) y devuelve la URL
 * ya autenticada. La primera vez VS Code descarga sus binarios de servidor, lo
 * que puede tardar un minuto.
 */
export function start({ accepted }) {
  if (info) return Promise.resolve(info)
  if (starting) return starting

  if (!accepted) {
    return Promise.reject(
      Object.assign(new Error('Faltan por aceptar los términos de licencia del servidor de VS Code'), { status: 412 })
    )
  }

  starting = new Promise((resolve, reject) => {
    const token = crypto.randomBytes(24).toString('hex')
    fs.mkdirSync(DATA_DIR, { recursive: true })

    const child = spawn(
      CLI,
      [
        'serve-web',
        '--host', '127.0.0.1',
        '--port', '0', // que el sistema elija uno libre
        '--connection-token', token,
        '--accept-server-license-terms',
        '--server-data-dir', DATA_DIR,
        '--disable-telemetry',
      ],
      { shell: process.platform === 'win32', windowsHide: true }
    )

    let out = ''
    const timer = setTimeout(() => {
      reject(Object.assign(new Error('El servidor de VS Code no respondió a tiempo'), { status: 504 }))
      starting = null
    }, 180000)

    const onData = (buf) => {
      out += buf
      // "Web UI available at http://127.0.0.1:PORT?tkn=..."
      const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)/)
      if (m && !info) {
        clearTimeout(timer)
        const port = Number(m[1])
        info = { url: `http://127.0.0.1:${port}/?tkn=${token}`, port, token, folder: null }
        lastError = null
        starting = null
        resolve(info)
      }
    }

    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    child.on('error', (err) => {
      clearTimeout(timer)
      lastError = err.message
      starting = null
      info = null
      reject(err)
    })

    child.on('exit', (code) => {
      if (!info) {
        clearTimeout(timer)
        lastError = `serve-web terminó con código ${code}: ${out.slice(-300)}`
        starting = null
        reject(new Error(lastError))
      }
      proc = null
      info = null
    })

    proc = child
  })

  return starting
}

/** URL para abrir una carpeta concreta en el editor ya arrancado. */
export function urlFor(absFolder) {
  if (!info) return null
  info.folder = absFolder
  return `${info.url}&folder=${encodeURIComponent(absFolder)}`
}

export function stop() {
  if (proc) {
    proc.kill()
    proc = null
  }
  info = null
  return { ok: true }
}

process.on('exit', () => { if (proc) proc.kill() })
