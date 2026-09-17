import { Browser } from '@capacitor/browser'
import { App } from '@capacitor/app'
import { CLIENT_ID, WEB_CLIENT_ID } from './google.config.js'
import { usarSesion, guardarToken, cerrarSesion } from './drive.js'

/**
 * Entrar con Google desde el APK, para poder hablar con Drive.
 *
 * Se usa el flujo estándar de «aplicación instalada»: PKCE contra el navegador
 * del sistema. Es a propósito y no un capricho: meter la pantalla de Google
 * dentro de un WebView propio es justo lo que Google bloquea —y con razón,
 * porque una app que enseña un formulario de contraseña de Google dentro de sí
 * misma es indistinguible de una que las roba—. Así, la contraseña se teclea en
 * Chrome, que es de quien uno se fía, y aquí solo vuelve un código.
 *
 * No hay secreto de cliente porque en una app instalada no puede haberlo: el
 * APK está en el aparato y cualquiera podría sacarlo. Lo que protege el flujo
 * es PKCE —un secreto distinto en cada intento, que no viaja— y que Google solo
 * acepta el código si la app viene firmada con la huella registrada.
 */

const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth'
const TESTIGO = 'https://oauth2.googleapis.com/token'
const REDIRECCION = 'com.mateo.prolife:/oauth2redirect'
/** Acceso a Drive: los archivos los creó el ordenador, no esta app. */
const PERMISOS = 'https://www.googleapis.com/auth/drive'

/**
 * Lo que esta app le pide a Google, tal cual va en la petición.
 *
 * Está expuesto a propósito: cuando Google contesta «la solicitud no es
 * válida» no dice *qué* no le cuadra, y lo único que resuelve eso es poner
 * estos tres valores al lado de los de la consola y ver cuál baila.
 */
export const PETICION = {
  clientId: CLIENT_ID,
  paquete: 'com.mateo.prolife',
  redireccion: REDIRECCION,
  permisos: PERMISOS,
}

const REFRESCO_KEY = 'prolife.drive.refresco'

/**
 * ¿Esto es el APK o una página web?
 *
 * Los dos hablan con el mismo Drive, pero entran de forma distinta y no es un
 * capricho de implementación: en el APK hay un aparato con una firma que Google
 * puede comprobar, y por eso se le puede dar un testigo duradero. En una página
 * no hay nada que comprobar, así que Google solo da acceso por una hora y lo
 * renueva mientras haya sesión abierta en el navegador. Fingir que son lo mismo
 * acabaría en una web que pide entrar cada vez que se recarga.
 */
const enElNavegador = () => !window.Capacitor?.isNativePlatform?.()

const clienteDeAqui = () => (enElNavegador() ? WEB_CLIENT_ID : CLIENT_ID)

/* ------------------------------------------------------------------ PKCE -- */

const base64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function verificador() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64url(bytes)
}

const reto = async (verif) =>
  base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verif)))

/* ------------------------------------------------------------- el flujo --- */

/** Pide los testigos a Google. Sirve tanto para el código como para refrescar. */
async function pedirTestigos(cuerpo) {
  const res = await fetch(TESTIGO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...cuerpo }),
  })
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(datos.error_description || datos.error || `Google ha contestado ${res.status}`)
  return datos
}

/**
 * Abre Chrome para que Mateo entre con su cuenta, y espera a que Android nos
 * devuelva el control con el código dentro de la URL.
 */
export function entrar() {
  if (enElNavegador()) return entrarEnLaWeb()
  return entrarEnElApk()
}

function entrarEnElApk() {
  return new Promise((resolve, reject) => {
    ;(async () => {
      if (!CLIENT_ID || CLIENT_ID.startsWith('PON-AQUI')) {
        return reject(new Error('Falta el identificador de cliente de Google. Ver src/lib/google.config.js.'))
      }

      const verif = verificador()
      const estado = verificador()
      let escucha = null
      let listo = false

      // Si algo sale mal a mitad, no puede quedarse un oyente vivo para siempre.
      const cerrar = async () => {
        listo = true
        escucha?.remove?.()
        await Browser.close().catch(() => {})
      }

      escucha = await App.addListener('appUrlOpen', async ({ url }) => {
        if (listo || !url.startsWith('com.mateo.prolife:')) return
        try {
          // La URL de vuelta trae `?code=…&state=…`, pero el esquema propio no
          // se puede meter en `new URL()` de forma fiable en todos los Android.
          const params = new URLSearchParams(url.split('?')[1] || '')
          if (params.get('state') !== estado) throw new Error('La respuesta de Google no cuadra con la petición.')
          const error = params.get('error')
          if (error) throw new Error(error === 'access_denied' ? 'Has cancelado la entrada.' : error)
          const code = params.get('code')
          if (!code) throw new Error('Google no ha devuelto ningún código.')

          const datos = await pedirTestigos({
            code,
            code_verifier: verif,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECCION,
          })
          if (datos.refresh_token) localStorage.setItem(REFRESCO_KEY, datos.refresh_token)
          guardarToken(datos)
          await cerrar()
          resolve(datos)
        } catch (e) {
          await cerrar()
          reject(e)
        }
      })

      const url =
        `${AUTORIZAR}?client_id=${encodeURIComponent(CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(REDIRECCION)}` +
        '&response_type=code' +
        `&scope=${encodeURIComponent(PERMISOS)}` +
        `&code_challenge=${await reto(verif)}&code_challenge_method=S256` +
        `&state=${estado}` +
        // `offline` + `consent` es lo que hace que Google mande el testigo de
        // refresco. Sin él habría que volver a entrar cada hora.
        '&access_type=offline&prompt=consent'

      await Browser.open({ url }).catch(async (e) => { await cerrar(); reject(e) })
    })()
  })
}

/** Cerrar sesión de verdad: también el testigo de refresco, que es el duradero. */
export function salir() {
  localStorage.removeItem(REFRESCO_KEY)
  cerrarSesion()
}

export const puedeEntrar = () => {
  const id = clienteDeAqui()
  return !!id && !id.startsWith('PON-AQUI')
}

/* ------------------------------------------------------- entrar en la web -- */

/**
 * El conector de Google, cargado cuando hace falta y no antes.
 *
 * Se inyecta desde aquí en vez de ponerlo en el `index.html` para que la app de
 * escritorio y el APK no vayan a buscar a Google un script que no van a usar.
 */
let gis = null
function cargarGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  gis ||= new Promise((ok, mal) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = ok
    s.onerror = () => { gis = null; mal(new Error('No se ha podido cargar el conector de Google. ¿Hay conexión?')) }
    document.head.appendChild(s)
  })
  return gis
}

/** El cliente de testigos, uno solo: crear otro por cada renovación los apila. */
let cliente = null
let esperando = null

async function pedirTestigoWeb(prompt) {
  await cargarGis()
  if (!cliente) {
    cliente = window.google.accounts.oauth2.initTokenClient({
      client_id: WEB_CLIENT_ID,
      scope: PERMISOS,
      // La respuesta llega por aquí y no por el valor de retorno, así que hace
      // falta guardar a quién contestarle.
      callback: (r) => {
        const quien = esperando
        esperando = null
        if (!quien) return
        if (r.error) return quien.mal(new Error(r.error_description || r.error))
        guardarToken({ access_token: r.access_token, expires_in: r.expires_in })
        quien.ok(r.access_token)
      },
      error_callback: (e) => {
        const quien = esperando
        esperando = null
        quien?.mal(new Error(e?.type === 'popup_closed' ? 'Has cerrado la ventana de Google.' : e?.message || 'Google ha cancelado la entrada.'))
      },
    })
  }
  if (esperando) throw new Error('Ya hay una entrada en marcha.')
  return new Promise((ok, mal) => {
    esperando = { ok, mal }
    cliente.requestAccessToken({ prompt })
  })
}

async function entrarEnLaWeb() {
  if (!WEB_CLIENT_ID || WEB_CLIENT_ID.startsWith('PON-AQUI')) {
    throw new Error('A esta versión web le falta el identificador de cliente. Ver src/lib/google.config.js.')
  }
  const token = await pedirTestigoWeb('consent')
  return { access_token: token }
}

/**
 * El testigo de acceso dura una hora. En vez de hacer entrar a Mateo cada hora
 * —en mitad de una clase, además—, se renueva solo con el de refresco, que no
 * caduca mientras no se revoque.
 */
let renovando = null

usarSesion(async () => {
  try {
    const guardado = JSON.parse(localStorage.getItem('prolife.drive.token') || 'null')
    if (guardado?.access_token && guardado.expira > Date.now()) return guardado.access_token
  } catch {
    /* sin sesión guardada: se intenta refrescar */
  }

  if (enElNavegador()) {
    // Sin testigo de refresco —Google no se lo da a una página— se vuelve a
    // pedir sin molestar: mientras haya sesión de Google abierta en el
    // navegador, se renueva sin que él se entere.
    if (!localStorage.getItem('prolife.drive.token')) return null
    return pedirTestigoWeb('').catch(() => null)
  }

  const refresco = localStorage.getItem(REFRESCO_KEY)
  if (!refresco) return null

  // Varias llamadas a la vez no pueden disparar varias renovaciones.
  renovando ||= pedirTestigos({ refresh_token: refresco, grant_type: 'refresh_token' })
    .then((datos) => {
      guardarToken(datos)
      return datos.access_token
    })
    .catch(() => {
      // El refresco ya no vale (revocado, o cambió la contraseña): a entrar otra vez.
      localStorage.removeItem(REFRESCO_KEY)
      return null
    })
    .finally(() => { renovando = null })

  return renovando
})
