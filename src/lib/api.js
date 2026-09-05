const base = ''
const KEY = 'prolife.key'

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

export const api = {
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
  remove: (p) => req('/api/fs/delete', { method: 'POST', body: { p } }),

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

  aiStatus: (url) => req(`/api/ai/status?url=${encodeURIComponent(url || '')}`),
  aiChat: (body) => req('/api/ai/chat', { method: 'POST', body }),

  openUrl: (url) => req('/api/open', { method: 'POST', body: { url } }),
  openPath: (p) => req('/api/open', { method: 'POST', body: { p } }),
  openInCode: (p) => req('/api/open', { method: 'POST', body: { p, app: 'code' } }),
  reveal: (p) => req('/api/open', { method: 'POST', body: { p, app: 'reveal' } }),
}
