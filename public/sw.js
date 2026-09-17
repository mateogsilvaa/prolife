/**
 * Service worker de prolife.
 *
 * Existe por un motivo concreto: que la app instalada en la tablet abra aunque
 * el ordenador esté apagado o estés fuera de la red, y enseñe lo último que vio
 * en vez de una pantalla en blanco. Lo que NO hace es fingir que puedes seguir
 * trabajando sin conexión: los datos de verdad viven en el ordenador, así que
 * sin él la app entra en modo consulta y no deja escribir.
 *
 * Los archivos de la app se guardan al instalar, y el resto según se va pidiendo.
 * No hay lista escrita a mano —los nombres los pone Vite con un hash distinto en
 * cada compilación—: se sacan del propio `/`, que es lo único con nombre fijo.
 */
/**
 * Dónde cuelga la app.
 *
 * En el ordenador y en el APK es «/», pero en GitHub Pages es «/prolife/». Con
 * la raíz escrita a mano, el service worker guardaba e iba a buscar una portada
 * que allí no existe, y la app sin conexión abría en blanco. El ámbito del
 * propio registro ya lo dice, así que no hay que configurarlo en ningún sitio.
 */
const RAIZ = new URL(self.registration?.scope || '/', self.location).pathname

const VERSION = 'v1'
const SHELL = `prolife-shell-${VERSION}`
const DATA = `prolife-data-${VERSION}`
/** La escribe la página (ver `src/lib/offline.js`); aquí solo se consulta. */
const FILES = 'prolife-files-v1'

/**
 * Al instalar se guarda la app entera, no solo el HTML.
 *
 * Guardando solo `/` quedaba una portada que apunta a un `<script>` que no está:
 * los archivos de la app se descargan en esa primera carga, ANTES de que este
 * service worker tome el mando, así que su `fetch` no los ve y no los guarda.
 * Apagabas el ordenador después de la primera visita y la app abría en blanco —
 * que es exactamente lo que pasa al instalarla en la tablet y salir de casa.
 *
 * Los nombres los pone Vite con un hash distinto en cada compilación, pero no
 * hace falta una lista escrita a mano: vienen dentro del propio `/`.
 */
self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(SHELL)
      try {
        const res = await fetch(RAIZ, { cache: 'reload' })
        if (res.ok) {
          const html = await res.clone().text()
          await c.put(RAIZ, res)
          const refs = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)]
            .map((m) => m[1])
            .filter((u) => !u.startsWith('/api'))
          // Uno que falle no puede tumbar la instalación entera.
          await Promise.all([...new Set(refs)].map((u) => c.add(u).catch(() => {})))
        }
      } catch {
        /* sin red al instalar: se guardará al primer arranque con ordenador */
      }
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      // Los archivos que el usuario guardó a mano no se tiran en una
      // actualización: los eligió él y le costaron su descarga.
      .then((names) =>
        Promise.all(names.filter((n) => n !== FILES && !n.endsWith(VERSION)).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  )
})

/**
 * Cómo se busca en la caché.
 *
 * `ignoreVary` hace falta de verdad: el servidor responde `Vary: Origin` a todo
 * lo que llega con cabecera `Origin`, y los `<script>` y `<link>` que pone Vite
 * llevan `crossorigin`, así que la mandan. Lo que se guarda al instalar lo pide
 * este service worker, que no manda ninguna — y entonces la copia guardada no
 * se encuentra nunca, aunque esté ahí. Son archivos nuestros del mismo origen:
 * su contenido no cambia según quién los pida.
 */
const BUSCAR = { ignoreVary: true }

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
          // Solo se guarda lo que está bien. Sin esto, una sola respuesta mala
          // —una compilación a medias, un proxy que se queja— sustituía a la
          // portada guardada, y a partir de ahí la app sin ordenador delante
          // enseñaba ese error para siempre.
          if (res.ok) {
            const copy = res.clone()
            caches.open(SHELL).then((c) => c.put(RAIZ, copy))
          }
          return res
        })
        .catch(() => caches.match(RAIZ, { ignoreSearch: true, ...BUSCAR }))
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
          const hit = await caches.match('/api/db', BUSCAR)
          if (hit) return markStale(hit)
          return new Response(JSON.stringify({ error: 'Sin conexión con el ordenador' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
        })
    )
    return
  }

  if (sameOrigin && url.pathname === '/api/fs/raw') {
    // Primero el disco del ordenador, que es la verdad. Si no contesta, y solo
    // si este archivo se guardó a mano, se sirve la copia. La clave de acceso
    // se quita de la URL: cambia al renovarla y dejaría lo guardado inservible.
    const key = `${url.pathname}?p=${encodeURIComponent(url.searchParams.get('p') || '')}`
    e.respondWith(
      fetch(request).catch(async () => {
        const hit = await caches.match(key, BUSCAR)
        if (hit) return markStale(hit)
        return new Response('Este archivo no está guardado para consultarlo sin el ordenador.', {
          status: 504,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      })
    )
    return
  }

  // El resto de la API no se cachea nunca: un guardado que falla tiene que
  // fallar, y una carpeta no puede listarse de una copia vieja.
  if (sameOrigin && url.pathname.startsWith('/api/')) return

  // Estáticos (incluidas las tipografías de Google): de la caché si están, y se
  // refrescan por detrás para la próxima vez.
  e.respondWith(
    caches.match(request, BUSCAR).then((hit) => {
      const live = fetch(request)
        .then((res) => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone()
            caches.open(SHELL).then((c) => c.put(request, copy))
          }
          return res
        })
        // Ni copia ni red: aquí se devolvía `hit`, que en ese caso es
        // `undefined`. Un `respondWith(undefined)` no es una petición que falla:
        // es el service worker reventando, y por eso un archivo que faltaba
        // dejaba la pantalla en blanco en vez de dar un error entendible.
        .catch(
          () =>
            hit ||
            new Response('Este archivo no está guardado para abrir sin el ordenador.', {
              status: 504,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
        )
      return hit || live
    })
  )
})
