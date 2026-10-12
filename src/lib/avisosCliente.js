import { avisosProgramados, resumenMatinal, ajustesAvisos, horaDe, isoDe } from '../../server/avisos.js'

/**
 * Los avisos en cada aparato.
 *
 * - **Ordenador** (Electron): no hay nada que hacer aquí; el servidor los manda
 *   como notificación de Windows.
 * - **iPhone / navegador**: avisos push. El aparato se suscribe y deja su
 *   suscripción en la base; el ordenador los envía cuando tiene prolife abierta.
 *   En el iPhone exige que la web esté añadida a la pantalla de inicio.
 * - **Tablet** (APK): notificaciones locales programadas en el propio aparato
 *   para los próximos días. Suenan aunque la app esté cerrada y el ordenador
 *   apagado.
 */

export const esEscritorio = () => typeof window !== 'undefined' && !!window.prolife?.isDesktop
export const esNativo = () => typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()
export const esIOS = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
export const enPantallaDeInicio = () =>
  typeof window !== 'undefined' && (window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches)
export const pushDisponible = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const b64aBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

/** Un número estable a partir de un texto: las notificaciones locales piden id numérico. */
const idNumerico = (txt) => {
  let h = 0
  for (const c of String(txt)) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0
  return Math.abs(h) % 2_000_000_000
}

const nombreAparato = () =>
  esIOS() ? (/ipad/i.test(navigator.userAgent) ? 'iPad' : 'iPhone') : /android/i.test(navigator.userAgent) ? 'Android' : 'Navegador'

/** ¿Este aparato ya está suscrito? */
export async function suscripcionActual() {
  if (!pushDisponible()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

/**
 * Suscribe este aparato a los avisos push y guarda la suscripción en la base,
 * donde la encuentra el ordenador. Devuelve un texto con lo que ha pasado.
 */
export async function activarPush(db, update) {
  if (!pushDisponible()) throw new Error('Este navegador no admite avisos push.')
  if (esIOS() && !enPantallaDeInicio()) throw new Error('En el iPhone los avisos solo funcionan con la web añadida a la pantalla de inicio (Compartir → Añadir a pantalla de inicio). Ábrela desde ese icono y vuelve aquí.')
  const clave = db.settings?.push?.vapidPublic
  if (!clave) throw new Error('Falta preparar los avisos en el ordenador: abre prolife allí una vez (con la versión nueva) y vuelve a intentarlo.')
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('Sin permiso para avisos. Puedes darlo en Ajustes del iPhone → Notificaciones → prolife.')
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aBytes(clave) })
  const json = sub.toJSON()
  const registro = { id: `push_${idNumerico(json.endpoint)}`, endpoint: json.endpoint, keys: json.keys, device: nombreAparato(), createdAt: Date.now() }
  update((d) => {
    d.pushSubs ||= []
    const i = d.pushSubs.findIndex((x) => x.id === registro.id)
    if (i >= 0) d.pushSubs[i] = registro
    else d.pushSubs.push(registro)
  })
  return registro
}

export async function desactivarPush(update) {
  const sub = await suscripcionActual()
  if (!sub) return
  const id = `push_${idNumerico(sub.endpoint)}`
  await sub.unsubscribe().catch(() => {})
  update((d) => { d.pushSubs = (d.pushSubs || []).filter((x) => x.id !== id) })
}

/* ------------------------------------------------------------ tablet (APK) -- */

let plugin = null
const local = async () => (plugin ||= (await import('@capacitor/local-notifications')).LocalNotifications)

export async function permisoLocal() {
  if (!esNativo()) return 'no'
  const ln = await local()
  return (await ln.checkPermissions()).display
}

export async function pedirPermisoLocal() {
  const ln = await local()
  return (await ln.requestPermissions()).display
}

/**
 * Programa en la tablet los avisos de los próximos 14 días. Se rehace entero
 * cada vez (se borran los de prolife y se vuelven a poner), así que llamarla
 * de más no duplica nada.
 */
export async function programarLocales(db) {
  if (!esNativo()) return 0
  const ln = await local()
  if ((await ln.checkPermissions()).display !== 'granted') return 0
  const pendientes = await ln.getPending()
  const nuestros = pendientes.notifications.filter((n) => n.extra?.prolife)
  if (nuestros.length) await ln.cancel({ notifications: nuestros.map((n) => ({ id: n.id })) })

  const aj = ajustesAvisos(db)
  if (!aj.activos) return 0
  const ahora = Date.now()
  const lista = avisosProgramados(db, ahora, ahora + 14 * 86400_000)
  // El resumen de cada mañana de la próxima semana, con lo que ya se sabe hoy.
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const fecha = isoDe(d)
    const at = horaDe(fecha, aj.resumen)
    if (at <= ahora) continue
    const r = resumenMatinal(db, fecha)
    if (r) lista.push({ ...r, key: `resumen:${fecha}`, at })
  }
  const notificaciones = lista.slice(0, 60).map((x) => ({
    id: idNumerico(x.key),
    title: x.title,
    body: x.body || '',
    schedule: { at: new Date(x.at), allowWhileIdle: true },
    extra: { prolife: true, url: x.url || '#/' },
  }))
  if (notificaciones.length) await ln.schedule({ notifications: notificaciones })
  return notificaciones.length
}

/** Al tocar un aviso local, la app abre en su pantalla. */
export async function escucharToques() {
  if (!esNativo()) return
  const ln = await local()
  ln.addListener('localNotificationActionPerformed', (e) => {
    const url = e.notification?.extra?.url
    if (url) location.hash = url
  })
}
