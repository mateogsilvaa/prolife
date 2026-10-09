import { BrowserWindow, session } from 'electron'
import { readConfig, writeConfig } from '../server/config.js'
import { resumirDia, resumirActividad, SCRIPT } from '../server/garmin-datos.js'

/**
 * Garmin Connect: sueño, pasos, pulso en reposo, estrés, Body Battery y
 * actividades del reloj.
 *
 * Garmin no tiene API para uso personal —su programa de desarrolladores es solo
 * para empresas— y desde marzo de 2026 bloquea los inicios de sesión que no
 * vienen de un navegador de verdad (comprueban la huella TLS), así que las
 * librerías que entraban con usuario y contraseña ya no sirven.
 *
 * Lo que sí funciona es lo que hace cualquiera: abrir connect.garmin.com en un
 * navegador y entrar. Electron ES un Chromium, así que la app abre la página
 * oficial de Garmin en una ventana suya, entras tú —la contraseña se teclea en
 * la página de Garmin, prolife no la ve ni la guarda— y la sesión queda en una
 * partición propia, como en un navegador que recuerda que entraste. Para leer
 * los datos se abre esa misma web, sin enseñarla, y se le piden a la API
 * interna que usa la propia página, con su testigo CSRF.
 *
 * Los datos no se guardan enteros: se resumen a lo que la app usa y entran en
 * el `db.json` por el mismo camino que lo que llega de la tablet (las
 * operaciones de `server/ops.js`), así que un guardado de la ventana no puede
 * llevárselos por delante.
 */

const PARTICION = 'persist:garmin'
const APP = 'https://connect.garmin.com/app/activities'
/** La primera vez se trae este tramo hacia atrás; después, solo lo reciente. */
const DIAS_INICIALES = 60

let ses = null
function sesion() {
  if (ses) return ses
  ses = session.fromPartition(PARTICION)
  // El user-agent de Chrome a secas: con «Electron/…» dentro, la web de Garmin
  // puede servir otra cosa. La versión de Chromium es la real del programa.
  ses.setUserAgent(ses.getUserAgent().replace(/ Electron\/\S+/, '').replace(/ prolife\/\S+/i, ''))
  return ses
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** El testigo que la página de Garmin pone en su cabecera cuando hay sesión. */
const leerCsrf = (wc) =>
  wc.executeJavaScript(`document.querySelector('meta[name="csrf-token"]')?.content || ''`).catch(() => '')

const enLaApp = (url) => /^https:\/\/connect\.garmin\.com\/(app|modern)\//.test(url || '')

/* ------------------------------------------------------------------ entrar */

/**
 * Abre la página de Garmin para entrar. Se resuelve cuando ya estás dentro
 * (la ventana se cierra sola) o cuando la cierras tú.
 */
export function entrar(padre) {
  return new Promise((resolve) => {
    const w = new BrowserWindow({
      width: 520, height: 780, parent: padre || undefined, title: 'Entrar en Garmin Connect',
      autoHideMenuBar: true, backgroundColor: '#ffffff',
      webPreferences: { session: sesion(), contextIsolation: true, nodeIntegration: false },
    })
    let listo = false
    const mirar = setInterval(async () => {
      if (w.isDestroyed()) return
      const url = w.webContents.getURL()
      if (!enLaApp(url)) return
      if (await leerCsrf(w.webContents)) {
        listo = true
        clearInterval(mirar)
        writeConfig({ garminConectado: true, garminError: '' })
        w.close()
      }
    }, 1500)
    w.on('closed', () => {
      clearInterval(mirar)
      resolve({ ok: listo })
    })
    w.loadURL(APP).catch(() => {})
  })
}

/** Olvida la sesión de Garmin de este ordenador. Los datos ya traídos se quedan. */
export async function salir() {
  await sesion().clearStorageData()
  writeConfig({ garminConectado: false })
}

export function estado() {
  const c = readConfig()
  return {
    conectado: !!c.garminConectado,
    ultima: c.garminUltima || null,
    error: c.garminError || '',
    sincronizando: !!enCurso,
  }
}

/* ------------------------------------------------------------- traer datos */



let enCurso = null

/**
 * Trae lo nuevo de Garmin y lo mete en la base. `puerto` es el del servidor
 * local, que es quien escribe el `db.json`.
 */
export function sincronizar(puerto) {
  enCurso ||= hacerSincronizacion(puerto).finally(() => { enCurso = null })
  return enCurso
}

async function hacerSincronizacion(puerto) {
  const c = readConfig()
  if (!c.garminConectado) return { ok: false, error: 'Garmin no está conectado' }

  // Desde dos días antes de la última vez: el sueño de anoche y los pasos de
  // ayer se terminan de subir al día siguiente, cuando el reloj sincroniza.
  const hoy = new Date()
  const desde = c.garminHasta
    ? new Date(Math.max(new Date(c.garminHasta).getTime() - 2 * 86400000, hoy.getTime() - DIAS_INICIALES * 86400000))
    : new Date(hoy.getTime() - DIAS_INICIALES * 86400000)
  const fechas = []
  for (let d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate()); d <= hoy; d = new Date(d.getTime() + 86400000)) {
    fechas.push(iso(d))
  }

  const w = new BrowserWindow({ show: false, webPreferences: { session: sesion(), contextIsolation: true, nodeIntegration: false } })
  try {
    await w.loadURL(APP).catch(() => {})
    // La página monta su cabecera con el testigo después de cargar.
    let csrf = ''
    for (let i = 0; i < 40 && !csrf; i++) {
      if (!enLaApp(w.webContents.getURL()) && /sso\.garmin\.com/.test(w.webContents.getURL())) break
      csrf = await leerCsrf(w.webContents)
      if (!csrf) await espera(750)
    }
    if (!csrf) return fallo('La sesión de Garmin ha caducado: vuelve a entrar desde Ajustes.', true)

    const datos = await w.webContents.executeJavaScript(SCRIPT(fechas))
    if (datos?.sinSesion) return fallo('La sesión de Garmin ha caducado: vuelve a entrar desde Ajustes.', true)
    if (datos?.error) return fallo('Garmin ha contestado: ' + datos.error)

    const at = Date.now()
    const ops = []
    let n = 0
    for (const [fecha, { resumen, sueno }] of Object.entries(datos.dias || {})) {
      const dia = resumirDia(fecha, resumen, sueno)
      if (!dia) continue
      n++
      ops.push({ kind: 'cambio', op: 'fijar', ruta: ['wellness', fecha], valor: dia, id: `garmin-${fecha}`, at })
    }
    let actividades = 0
    for (const a of datos.actividades || []) {
      const x = resumirActividad(a)
      if (!x) continue
      actividades++
      ops.push({ kind: 'cambio', op: 'poner', ruta: ['garminActivities'], valor: x, id: `garmin-act-${x.id}`, at })
    }
    if (ops.length) {
      const res = await fetch(`http://127.0.0.1:${puerto}/api/db/ops`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops }),
      })
      if (!res.ok) return fallo('No se pudo guardar lo de Garmin: ' + (await res.text()).slice(0, 200))
    }
    const ultima = { at, dias: n, actividades, fallos: (datos.fallos || []).length }
    writeConfig({ garminUltima: ultima, garminHasta: iso(hoy), garminError: '' })
    return { ok: true, ...ultima }
  } catch (e) {
    return fallo(e.message)
  } finally {
    if (!w.isDestroyed()) w.destroy()
  }
}

function fallo(mensaje, sinSesion = false) {
  writeConfig({ garminError: mensaje, ...(sinSesion ? { garminConectado: false } : {}) })
  return { ok: false, error: mensaje, sinSesion }
}
