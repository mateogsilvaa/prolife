import { Browser } from '@capacitor/browser'
import { App } from '@capacitor/app'
import { CLIENT_ID } from './google.config.js'
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

const REFRESCO_KEY = 'prolife.drive.refresco'

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

export const puedeEntrar = () => !!CLIENT_ID && !CLIENT_ID.startsWith('PON-AQUI')

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
