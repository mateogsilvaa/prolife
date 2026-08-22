/**
 * Service worker de prolife.
 *
 * Existe por un motivo concreto: que la app instalada en la tablet abra aunque
 * el ordenador esté apagado o estés fuera de la red, y enseñe lo último que vio
 * en vez de una pantalla en blanco. Lo que NO hace es fingir que puedes seguir
 * trabajando sin conexión: los datos de verdad viven en el ordenador, así que
 * sin él la app entra en modo consulta y no deja escribir.
 *
 * No hay lista de archivos que precargar: los nombres los pone Vite con un hash
 * en cada compilación. Se cachea lo que se va pidiendo, que además evita
 * guardar cosas que esta instalación no llega a usar.
 */
const VERSION = 'v1'
const SHELL = `prolife-shell-${VERSION}`
const DATA = `prolife-data-${VERSION}`

self.addEventListener('install', (e) => {
  // El HTML es lo único con nombre fijo, y sin él no hay nada que arrancar.
  e.waitUntil(caches.open(SHELL).then((c) => c.add('/')).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !n.endsWith(VERSION)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  )
})

/** Copia de una respuesta con una marca de que salió de la caché, no de la red. */
async function markStale(res) {
  const body = await res.blob()
  const headers = new Headers(res.headers)
  headers.set('X-Prolife-Stale', '1')
  return new Response(body, { status: res.status, statusText: res.statusText, headers })
}

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin

  // Navegación: primero la red, para no servir una versión vieja de la app
  // cuando el ordenador está delante; si no hay, lo guardado.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/', { ignoreSearch: true }))
    )
    return
  }

  if (sameOrigin && url.pathname === '/api/db') {
    // La base entera: se guarda la última buena para poder consultarla sin el
    // ordenador delante. La app ve la marca y se pone en modo consulta.
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(DATA).then((c) => c.put('/api/db', copy))
          }
          return res
        })
        .catch(async () => {
          const hit = await caches.match('/api/db')
          if (hit) return markStale(hit)
          return new Response(JSON.stringify({ error: 'Sin conexión con el ordenador' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
        })
    )
    return
  }

  // El resto de la API no se cachea nunca: un guardado que falla tiene que
  // fallar, y un archivo del disco no puede servirse de una copia vieja.
  if (sameOrigin && url.pathname.startsWith('/api/')) return

  // Estáticos (incluidas las tipografías de Google): de la caché si están, y se
  // refrescan por detrás para la próxima vez.
  e.respondWith(
    caches.match(request).then((hit) => {
      const live = fetch(request)
        .then((res) => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone()
            caches.open(SHELL).then((c) => c.put(request, copy))
          }
          return res
        })
        .catch(() => hit)
      return hit || live
    })
  )
})
