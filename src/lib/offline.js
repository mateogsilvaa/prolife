/**
 * Guardar archivos sueltos para poder abrirlos sin el ordenador.
 *
 * A propósito **no** es automático. Un cuatrimestre de PDFs son cientos de
 * megas: llenarle el almacenamiento a la tablet con archivos que quizá no vas a
 * mirar no es una decisión que pueda tomar la app por su cuenta. Se guarda lo
 * que digas, y se ve cuánto ocupa.
 *
 * La caché la escribe la propia página; el service worker solo la consulta
 * cuando el ordenador no contesta (ver `public/sw.js`).
 */
const CACHE = 'prolife-files-v1'

/**
 * Clave estable de un archivo. La URL real puede llevar la clave de acceso
 * (`&k=…`), que cambia al renovarla: si formara parte de la clave de caché, todo
 * lo guardado dejaría de encontrarse el día que la renueves.
 */
export const keyFor = (p) => `/api/fs/raw?p=${encodeURIComponent(p)}`

/** En un origen inseguro (http a secas) el navegador ni siquiera define `caches`. */
export const canStore = () => typeof caches !== 'undefined' && typeof window !== 'undefined' && window.isSecureContext

async function open() {
  return caches.open(CACHE)
}

/** Rutas guardadas ahora mismo. */
export async function listSaved() {
  if (!canStore()) return []
  try {
    const c = await open()
    return (await c.keys())
      .map((r) => new URL(r.url).searchParams.get('p'))
      .filter(Boolean)
  } catch {
    return []
  }
}

export async function saveFile(path, fetchUrl) {
  if (!canStore()) throw new Error('Este navegador no puede guardar archivos aquí')
  const res = await fetch(fetchUrl, { cache: 'reload' })
  if (!res.ok) throw new Error(`No se ha podido leer el archivo (${res.status})`)
  const c = await open()
  await c.put(keyFor(path), res)
}

export async function removeFile(path) {
  if (!canStore()) return false
  return (await open()).delete(keyFor(path))
}

/** Cuántos archivos hay guardados y cuánto ocupan, para poder decidir vaciarlo. */
export async function usage() {
  if (!canStore()) return { files: 0, bytes: 0 }
  try {
    const c = await open()
    const keys = await c.keys()
    let bytes = 0
    for (const k of keys) {
      const res = await c.match(k)
      if (!res) continue
      const len = Number(res.headers.get('content-length'))
      bytes += Number.isFinite(len) && len > 0 ? len : (await res.clone().blob()).size
    }
    return { files: keys.length, bytes }
  } catch {
    return { files: 0, bytes: 0 }
  }
}

export async function clearAll() {
  if (typeof caches === 'undefined') return false
  return caches.delete(CACHE)
}
