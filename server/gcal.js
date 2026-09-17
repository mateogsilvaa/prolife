/**
 * Hablar con Google Calendar desde el ordenador.
 *
 * Vive en el servidor y no en la interfaz por dos razones. La primera es el
 * testigo de refresco: puede durar meses y es lo único que de verdad da acceso
 * a la cuenta, así que se guarda en `~/.prolife/config.json` —del ordenador, no
 * de la carpeta sincronizada— y no en el `localStorage` de un navegador. La
 * segunda es que sincronizar es reconciliar listas enteras, y eso se hace mejor
 * donde no hay una pantalla esperando.
 *
 * El flujo de entrada es el de «aplicación instalada»: se abre el navegador de
 * verdad y Google vuelve a `http://127.0.0.1:<puerto>/api/gcal/callback`, que
 * es este mismo servidor. Google admite el bucle local sin registrar el puerto,
 * así que no hay nada que configurar por ahí.
 *
 * El identificador y el secreto de cliente los pone Mateo en Ajustes y se
 * quedan en su `config.json`. No van en el repositorio a propósito: aunque en
 * una app instalada el «secreto» no protege nada —Google lo dice— y lo que de
 * verdad protege es PKCE, un secreto escrito en un repositorio es un secreto
 * quemado, y aquí no cuesta nada tenerlo fuera.
 */
import crypto from 'node:crypto'
import { readConfig, writeConfig } from './config.js'

const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth'
const PERMISOS = 'https://www.googleapis.com/auth/calendar'

/**
 * A dónde se llama de verdad.
 *
 * Se puede apuntar a otro sitio con `PROLIFE_GCAL_API` a propósito: sincronizar
 * BORRA lo que sobra, y una función que borra hay que poder probarla entera
 * antes de soltarla contra la cuenta de alguien. Sin esta rendija, la única
 * forma de comprobar que borra lo justo sería descubrirlo en vivo.
 */
const TESTIGO = process.env.PROLIFE_GCAL_API
  ? `${process.env.PROLIFE_GCAL_API}/token`
  : 'https://oauth2.googleapis.com/token'
const API = process.env.PROLIFE_GCAL_API || 'https://www.googleapis.com/calendar/v3'

/** El calendario que crea y gobierna prolife dentro de tu cuenta. */
export const NOMBRE_CALENDARIO = 'prolife'

class GcalError extends Error {
  constructor(mensaje, status = 500) {
    super(mensaje)
    this.status = status
  }
}

/* ------------------------------------------------------------ credenciales */

const credenciales = () => {
  const cfg = readConfig()
  return { id: cfg.gcalClientId || '', secreto: cfg.gcalClientSecret || '' }
}

export const configurado = () => {
  const { id, secreto } = credenciales()
  return !!id && !!secreto
}

export const redireccion = (puerto) => `http://127.0.0.1:${puerto}/api/gcal/callback`

/* -------------------------------------------------------------- el arranque */

/**
 * Lo que dura una entrada a medias.
 *
 * El verificador de PKCE se genera al abrir el navegador y hace falta cuando
 * Google vuelve, minutos después. Vive en memoria porque es de este intento y
 * de nadie más: si el servidor se reinicia por medio, el intento se pierde y se
 * vuelve a empezar, que es lo correcto.
 */
let enCurso = null

const base64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function urlDeEntrada(puerto) {
  const { id } = credenciales()
  if (!id) throw new GcalError('Falta el identificador de cliente de Google. Ponlo en Ajustes.', 412)

  const verificador = base64url(crypto.randomBytes(32))
  const reto = base64url(crypto.createHash('sha256').update(verificador).digest())
  const estado = base64url(crypto.randomBytes(16))
  enCurso = { verificador, estado, puerto, desde: Date.now() }

  const p = new URLSearchParams({
    client_id: id,
    redirect_uri: redireccion(puerto),
    response_type: 'code',
    scope: PERMISOS,
    code_challenge: reto,
    code_challenge_method: 'S256',
    state: estado,
    // Sin esto no hay testigo de refresco y habría que volver a entrar cada hora.
    access_type: 'offline',
    prompt: 'consent',
  })
  return `${AUTORIZAR}?${p}`
}

async function pedirTestigos(cuerpo) {
  const { id, secreto } = credenciales()
  const res = await fetch(TESTIGO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secreto, ...cuerpo }),
  })
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new GcalError(datos.error_description || datos.error || `Google ha contestado ${res.status}`, 400)
  }
  return datos
}

/** Google ha vuelto con el código: se cambia por testigos y se guarda el de refresco. */
export async function terminarEntrada({ code, state, error }) {
  if (error) throw new GcalError(error === 'access_denied' ? 'Has cancelado la entrada.' : error, 400)
  if (!enCurso) throw new GcalError('No había ninguna entrada en marcha. Vuelve a darle a Conectar.', 400)
  if (state !== enCurso.estado) throw new GcalError('La respuesta de Google no cuadra con la petición.', 400)
  if (!code) throw new GcalError('Google no ha devuelto ningún código.', 400)

  const intento = enCurso
  enCurso = null
  const datos = await pedirTestigos({
    code,
    code_verifier: intento.verificador,
    grant_type: 'authorization_code',
    redirect_uri: redireccion(intento.puerto),
  })
  if (!datos.refresh_token) {
    throw new GcalError('Google no ha dado testigo de refresco. Revoca el acceso a prolife en tu cuenta y entra otra vez.', 400)
  }
  writeConfig({ gcalRefresh: datos.refresh_token })
  guardarAcceso(datos)
  return { ok: true }
}

export function salir() {
  writeConfig({ gcalRefresh: '' })
  acceso = null
}

/* ------------------------------------------------------- testigo de acceso */

/** El de una hora, en memoria. El duradero es el de refresco, que sí va a disco. */
let acceso = null
let renovando = null

const guardarAcceso = (datos) => {
  // Un minuto de margen: más vale renovar de más que fallar a mitad de una tanda.
  acceso = { token: datos.access_token, expira: Date.now() + (Number(datos.expires_in) || 3600) * 1000 - 60_000 }
}

async function token() {
  if (acceso && acceso.expira > Date.now()) return acceso.token
  const refresco = readConfig().gcalRefresh
  if (!refresco) throw new GcalError('No has conectado Google Calendar.', 401)

  // Varias llamadas a la vez no pueden disparar varias renovaciones.
  renovando ||= pedirTestigos({ refresh_token: refresco, grant_type: 'refresh_token' })
    .then((datos) => { guardarAcceso(datos); return acceso.token })
    .catch((e) => {
      // El refresco ya no vale: revocado, o la contraseña ha cambiado.
      writeConfig({ gcalRefresh: '' })
      throw new GcalError('La conexión con Google Calendar ha caducado. Vuelve a conectarla. ' + e.message, 401)
    })
    .finally(() => { renovando = null })
  return renovando
}

export const conectado = () => !!readConfig().gcalRefresh

/* ---------------------------------------------------------------- llamadas */

async function pedir(ruta, opts = {}) {
  const t = await token()
  const res = await fetch(API + ruta, {
    ...opts,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  })
  if (res.status === 204) return null
  const datos = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = datos?.error?.message || `Google Calendar ha contestado ${res.status}`
    throw new GcalError(msg, res.status)
  }
  return datos
}

/** Todas las páginas de un listado. Google pagina y nunca dice cuántas hay. */
async function todas(ruta, campo = 'items') {
  const out = []
  let pagina = ''
  do {
    const sep = ruta.includes('?') ? '&' : '?'
    const r = await pedir(`${ruta}${pagina ? `${sep}pageToken=${encodeURIComponent(pagina)}` : ''}`)
    out.push(...(r?.[campo] || []))
    pagina = r?.nextPageToken || ''
    // Un tope por si algo va mal: mejor una lista corta que un bucle infinito.
  } while (pagina && out.length < 2500)
  return out
}

export const listarCalendarios = () =>
  todas('/users/me/calendarList?maxResults=250&fields=items(id,summary,backgroundColor,primary,accessRole),nextPageToken')

/**
 * El calendario de prolife, creándolo si no está.
 *
 * Tener el suyo propio es lo que hace que sincronizar sea seguro: prolife es el
 * ÚNICO que escribe ahí, igual que el ordenador es el único que escribe el
 * `db.json`. Así borrar lo que sobra no puede llevarse por delante nada que
 * hayas puesto tú a mano en tu calendario personal.
 */
export async function calendarioDeProlife() {
  const guardado = readConfig().gcalCalendarId
  if (guardado) {
    const existe = await pedir(`/calendars/${encodeURIComponent(guardado)}?fields=id`).catch(() => null)
    if (existe) return guardado
    // Lo borró desde Google: se crea otro en vez de fallar para siempre.
  }
  const mios = await listarCalendarios()
  const suyo = mios.find((c) => c.summary === NOMBRE_CALENDARIO && c.accessRole === 'owner')
  const id = suyo
    ? suyo.id
    : (await pedir('/calendars', {
        method: 'POST',
        body: JSON.stringify({ summary: NOMBRE_CALENDARIO, description: 'Clases, exámenes y entregas. Lo mantiene prolife: no lo edites a mano.', timeZone: zonaHoraria() }),
      })).id
  writeConfig({ gcalCalendarId: id })
  return id
}

export const zonaHoraria = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid'

/** Los eventos que prolife tiene puestos en su calendario. */
export const eventosDeProlife = (calendarId) =>
  todas(
    `/calendars/${encodeURIComponent(calendarId)}/events?maxResults=2500&showDeleted=false` +
      '&fields=items(id,summary,description,location,start,end,recurrence,colorId),nextPageToken'
  )

export const crearEvento = (calendarId, evento) =>
  pedir(`/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', body: JSON.stringify(evento) })

export const cambiarEvento = (calendarId, id, evento) =>
  pedir(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(evento),
  })

export const borrarEvento = (calendarId, id) =>
  pedir(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`, { method: 'DELETE' })

/**
 * Lo que hay en TUS calendarios entre dos fechas, para poder verlo dentro de
 * prolife. Solo se lee: lo que pongas en Google es tuyo y prolife no lo toca.
 */
export async function eventosDe(calendarId, desde, hasta) {
  const p = new URLSearchParams({
    timeMin: `${desde}T00:00:00Z`,
    timeMax: `${hasta}T23:59:59Z`,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
    fields: 'items(id,summary,location,start,end,htmlLink),nextPageToken',
  })
  return todas(`/calendars/${encodeURIComponent(calendarId)}/events?${p}`)
}

/**
 * Un identificador de evento válido para Google, deducido de la cosa de prolife
 * que representa.
 *
 * Es lo que permite sincronizar desde los DOS ordenadores sin llevar ninguna
 * tabla de equivalencias: los dos calculan el mismo identificador para la misma
 * clase, así que el segundo actualiza el evento del primero en vez de crear un
 * duplicado. Google solo admite base32hex —de la «a» a la «v» y dígitos—, y de
 * ahí que se codifique en vez de usar el id de prolife tal cual.
 */
export function idDeEvento(clave) {
  const hex = crypto.createHash('sha1').update(String(clave)).digest('hex')
  // hex → base32hex: cada dígito hexadecimal cabe de sobra en el alfabeto
  // permitido, y así no hay que implementar el reagrupado de bits.
  const mapa = '0123456789abcdefghijklmnopqrstuv'
  return 'prolife' + [...hex].map((c) => mapa[parseInt(c, 16)]).join('')
}

export { GcalError }
