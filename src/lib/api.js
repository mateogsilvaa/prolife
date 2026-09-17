import { drive } from './drive.js'

const base = ''
const KEY = 'prolife.key'

/**
 * ¿Hay un servidor de prolife detrás, o hay que hablar con Google Drive?
 *
 * En el ordenador —y en la tablet abierta por el navegador contra el
 * ordenador— la app se sirve por http y detrás hay un servidor que lee y
 * escribe en una carpeta de verdad. Dentro del APK no hay servidor ninguno: la
 * app va empaquetada en el propio aparato y los datos están en Drive.
 *
 * Lo pregunta Capacitor, que es quien lo sabe de verdad. Mirar el protocolo no
 * sirve: el APK se sirve desde `https://localhost`, que es indistinguible de
 * una página normal. El protocolo se deja solo como red de seguridad por si
 * alguna vez se empaqueta de otra manera.
 */
function modoDrive() {
  if (typeof window === 'undefined') return false
  try {
    if (localStorage.getItem('prolife.modo') === 'drive') return true
  } catch {
    /* sin storage: mandan las señales de abajo */
  }
  if (window.Capacitor?.isNativePlatform?.()) return true
  return /^(capacitor|file|ionic):$/.test(window.location.protocol)
}

export const enDrive = modoDrive()

/**
 * Clave de acceso, solo necesaria cuando la app se abre desde otro aparato (la
 * tablet). Desde el propio ordenador el servidor no la pide, así que aquí no
 * hay nada que guardar y `key` se queda vacía.
 *
 * Llega una vez en el enlace de emparejamiento (`?k=…`), se guarda y se borra
 * de la barra de direcciones para que no acabe en el historial ni compartida
 * por accidente al enviar el enlace a alguien.
 */
function adoptKeyFromUrl() {
  try {
    const url = new URL(window.location.href)
    const k = url.searchParams.get('k')
    if (!k) return
    localStorage.setItem(KEY, k)
    url.searchParams.delete('k')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  } catch {
    /* sin window (pruebas) o URL rara: se sigue sin clave */
  }
}

const readKey = () => {
  try {
    return localStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

if (typeof window !== 'undefined') adoptKeyFromUrl()

export const hasKey = () => !!readKey()
export const forgetKey = () => localStorage.removeItem(KEY)

async function req(url, opts = {}) {
  const key = readKey()
  const headers = opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }
  if (key) headers['X-Prolife-Key'] = key
  const res = await fetch(base + url, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
    body: opts.body instanceof FormData ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}))
    const err = new Error(msg.error || `Error ${res.status}`)
    err.status = res.status
    throw err
  }
  const data = await res.json()
  // La marca la pone el service worker cuando ha servido su copia porque el
  // ordenador no contestaba: quien recibe esto sabe que está mirando el pasado.
  if (data && typeof data === 'object' && res.headers.get('X-Prolife-Stale')) data._stale = true
  return data
}

const apiServidor = {
  health: () => req('/api/health'),
  getConfig: () => req('/api/config'),
  setConfig: (body) => req('/api/config', { method: 'PUT', body }),

  syncRoots: () => req('/api/sync/roots'),

  getDb: () => req('/api/db'),
  /** `opts` permite `keepalive` para el guardado de última hora al cerrar. */
  putDb: (body, opts) => req('/api/db', { method: 'PUT', body, ...opts }),
  dbStamp: () => req('/api/db/stamp'),
  /** Cambios sueltos apuntados sin el ordenador; se aplican sobre el db de ahora. */
  sendOps: (ops) => req('/api/db/ops', { method: 'POST', body: { ops } }),

  list: (p = '') => req(`/api/fs/list?p=${encodeURIComponent(p)}`),
  tree: (p = '') => req(`/api/fs/tree?p=${encodeURIComponent(p)}`),
  mkdir: (p) => req('/api/fs/mkdir', { method: 'POST', body: { p } }),
  readText: (p) => req(`/api/fs/text?p=${encodeURIComponent(p)}`),
  writeText: (p, content) => req('/api/fs/text', { method: 'PUT', body: { p, content } }),
  rename: (p, name) => req('/api/fs/rename', { method: 'POST', body: { p, name } }),
  move: (p, to) => req('/api/fs/move', { method: 'POST', body: { p, to } }),
  remove: (p) => req('/api/fs/delete', { method: 'POST', body: { p } }),
  /** El texto de un archivo aunque sea PDF o Word; para leerlo, no para editarlo. */
  extract: (p) => req(`/api/fs/extract?p=${encodeURIComponent(p)}`),
  search: (q, p = '', leibles = false) =>
    req(`/api/fs/buscar?q=${encodeURIComponent(q)}&p=${encodeURIComponent(p)}${leibles ? '&leibles=1' : ''}`),

  upload: (p, files) => {
    const fd = new FormData()
    fd.append('p', p)
    for (const f of files) fd.append('files', f)
    return req('/api/fs/upload', { method: 'POST', body: fd })
  },

  /**
   * URL directa para <iframe>/<img>: sirve el archivo real desde el disco. Aquí
   * no se pueden poner cabeceras, así que la clave viaja en la propia URL.
   */
  raw: (p, download) => {
    const key = readKey()
    return `/api/fs/raw?p=${encodeURIComponent(p)}${download ? '&download=1' : ''}${key ? `&k=${encodeURIComponent(key)}` : ''}`
  },

  codeStatus: () => req('/api/code/status'),
  codeAccept: (accepted) => req('/api/code/accept', { method: 'POST', body: { accepted } }),
  codeStart: (folder) => req('/api/code/start', { method: 'POST', body: { folder } }),
  codeStop: () => req('/api/code/stop', { method: 'POST', body: {} }),

  getRemote: () => req('/api/remote'),
  setRemote: (body) => req('/api/remote', { method: 'PUT', body }),

  tailscaleStatus: () => req('/api/tailscale/status'),
  tailscaleServe: () => req('/api/tailscale/serve', { method: 'POST', body: {} }),

  aiStatus: (url) => req(`/api/ai/status?url=${encodeURIComponent(url || '')}`),
  aiChat: (body) => req('/api/ai/chat', { method: 'POST', body }),

  gcalStatus: () => req('/api/gcal/status'),
  gcalConfig: (body) => req('/api/gcal/config', { method: 'POST', body }),
  gcalLogin: () => req('/api/gcal/login'),
  gcalLogout: () => req('/api/gcal/logout', { method: 'POST', body: {} }),
  gcalMostrar: (ids) => req('/api/gcal/mostrar', { method: 'POST', body: { ids } }),
  gcalSync: () => req('/api/gcal/sync', { method: 'POST', body: {} }),
  gcalEvents: (from, to) => req(`/api/gcal/events?from=${from}&to=${to}`),

  openUrl: (url) => req('/api/open', { method: 'POST', body: { url } }),
  openPath: (p) => req('/api/open', { method: 'POST', body: { p } }),
  openInCode: (p) => req('/api/open', { method: 'POST', body: { p, app: 'code' } }),
  reveal: (p) => req('/api/open', { method: 'POST', body: { p, app: 'reveal' } }),

  /**
   * La URL de los bytes de un archivo, prometida en vez de devuelta.
   *
   * Contra el servidor es la misma URL de `raw()` y no cuesta nada; contra
   * Drive hay que traerse el archivo y envolverlo en un `blob:`. Quien pinte un
   * PDF o una imagen usa esto, para que le dé igual dónde esté el archivo.
   */
  rawUrl: async (p) => apiServidor.raw(p),
}

/**
 * Lo mismo, pero contra Google Drive, para la tablet con el APK.
 *
 * Solo están las funciones que tienen sentido sin ordenador: leer la base,
 * leer y escribir documentos, y dejar los cambios de la base en el buzón. Lo
 * demás —abrir VS Code, hablar con Ollama, tocar Tailscale— es del ordenador
 * por definición, y decirlo claro es mejor que fallar con un error de red.
 */
const soloEnElOrdenador = (que) => () =>
  Promise.reject(Object.assign(new Error(`«${que}» solo se puede desde el ordenador.`), { status: 501 }))

const apiDrive = {
  health: async () => ({ ok: true, drive: true }),
  getConfig: async () => ({ here: false, drive: true, baseDir: 'Google Drive' }),

  getDb: () => drive.getDb(),
  dbStamp: async () => ({ stamp: (await drive.getDb())._stamp || 0, future: null }),
  sendOps: (ops) => drive.sendOps(ops),
  // Guardar la base entera desde la tablet machacaría lo del ordenador: no existe.
  putDb: soloEnElOrdenador('Guardar la base entera'),

  list: (p) => drive.list(p),
  tree: (p) => drive.tree(p),
  mkdir: (p) => drive.mkdir(p),
  readText: (p) => drive.readText(p),
  writeText: (p, content) => drive.writeText(p, content),
  rename: (p, name) => drive.rename(p, name),
  move: (p, to) => drive.move(p, to),
  remove: (p) => drive.remove(p),
  extract: (p) => drive.extract(p),
  search: (q, p, leibles) => drive.search(q, p, leibles),
  upload: (p, files) => drive.upload(p, files),

  // Sin servidor no hay URL que valga: hay que traerse los bytes.
  raw: () => '',
  rawUrl: (p) => drive.rawUrl(p),

  setConfig: soloEnElOrdenador('Cambiar el directorio de trabajo'),
  syncRoots: soloEnElOrdenador('Ver las carpetas de la nube'),
  codeStatus: soloEnElOrdenador('VS Code'),
  codeAccept: soloEnElOrdenador('VS Code'),
  codeStart: soloEnElOrdenador('VS Code'),
  codeStop: soloEnElOrdenador('VS Code'),
  getRemote: soloEnElOrdenador('El acceso desde otros aparatos'),
  setRemote: soloEnElOrdenador('El acceso desde otros aparatos'),
  tailscaleStatus: soloEnElOrdenador('Tailscale'),
  tailscaleServe: soloEnElOrdenador('Tailscale'),
  aiStatus: soloEnElOrdenador('El ayudante'),
  aiChat: soloEnElOrdenador('El ayudante'),
  // El calendario lo sincroniza el ordenador, que es el único escritor del
  // calendario de Google igual que lo es del db.json. Lo que apuntes en la
  // tablet llega a Google cuando el ordenador se abre.
  gcalConfig: soloEnElOrdenador('Google Calendar'),
  gcalLogin: soloEnElOrdenador('Google Calendar'),
  gcalLogout: soloEnElOrdenador('Google Calendar'),
  gcalMostrar: soloEnElOrdenador('Google Calendar'),
  gcalSync: soloEnElOrdenador('Google Calendar'),
  gcalStatus: async () => ({ ok: true, configurado: false, conectado: false, calendarios: [], soloOrdenador: true }),
  gcalEvents: async () => ({ ok: true, items: [] }),
  openPath: soloEnElOrdenador('Abrir la carpeta'),
  openInCode: soloEnElOrdenador('VS Code'),
  reveal: soloEnElOrdenador('Abrir la carpeta'),
  // Abrir un enlace fuera sí vale: lo hace el propio navegador del aparato.
  openUrl: async (url) => { window.open(url, '_blank', 'noopener'); return { ok: true } },
}

export const api = enDrive ? apiDrive : apiServidor
