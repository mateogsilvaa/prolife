/**
 * Hablar con Google Drive directamente, para cuando la tablet trabaja sola.
 *
 * En el ordenador, prolife tiene un servidor detrás que lee y escribe en una
 * carpeta de verdad. En la tablet, con la app instalada como APK, ese servidor
 * no existe: lo que hay es la misma carpeta, pero vista desde el otro lado de
 * Google Drive. Este módulo hace de servidor contra la API de Drive, con los
 * mismos nombres de función que `api.js`, para que el resto de la app no tenga
 * que enterarse de por dónde le llegan los datos.
 *
 * Dos cosas que conviene tener claras, porque explican casi todo el diseño:
 *
 * 1. **Drive no tiene rutas, tiene padres.** «Universidad/Cálculo/apuntes.md»
 *    no existe como tal: hay que buscar la carpeta «Universidad» dentro de la
 *    raíz, luego «Cálculo» dentro de esa, y luego el archivo. Son tres viajes
 *    por ruta, así que lo resuelto se guarda en `cacheIds` y no se repite.
 *
 * 2. **La tablet NO escribe el `db.json`.** Escribirlo entero desde aquí
 *    machacaría lo que hubieras hecho en el ordenador desde la última vez que
 *    la tablet lo leyó. Lo que hace es dejar operaciones sueltas en
 *    `.prolife/ops/`, que el ordenador vacía cuando arranca (ver `ops.js` y
 *    `drainOps` en `db.js`). Los documentos sí se escriben directamente: son
 *    archivos independientes y ahí no hay nada que fusionar, salvo que edites
 *    el mismo apunte a la vez en los dos sitios.
 */

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const CARPETA = 'application/vnd.google-apps.folder'

const RAIZ_KEY = 'prolife.drive.raiz'
const TOKEN_KEY = 'prolife.drive.token'

/* --------------------------------------------------------------- sesión --- */

/**
 * El testigo de acceso lo consigue quien sepa hacerlo —en la tablet, el
 * arranque nativo con la cuenta de Google— y lo deja aquí. Este módulo no sabe
 * de pantallas de login: solo lo usa y avisa cuando ha caducado.
 */
let dameToken = async () => {
  try {
    const guardado = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null')
    if (guardado?.access_token && guardado.expira > Date.now()) return guardado.access_token
  } catch {
    /* sin sesión guardada */
  }
  return null
}

export function usarSesion(fn) {
  dameToken = fn
}

export function guardarToken({ access_token, expires_in }) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    access_token,
    // Un minuto de margen: más vale renovar de más que fallar a mitad de guardar.
    expira: Date.now() + (Number(expires_in) || 3600) * 1000 - 60_000,
  }))
}

export const haySesion = async () => !!(await dameToken())

export function cerrarSesion() {
  localStorage.removeItem(TOKEN_KEY)
  cacheIds.clear()
}

/* --------------------------------------------------------------- llamadas -- */

class DriveError extends Error {
  constructor(mensaje, status) {
    super(mensaje)
    this.status = status
  }
}

async function pedir(url, opts = {}) {
  const token = await dameToken()
  if (!token) throw new DriveError('No hay sesión de Google Drive en este aparato.', 401)

  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  })

  if (res.status === 401) {
    cerrarSesion()
    throw new DriveError('La sesión de Google Drive ha caducado. Vuelve a entrar.', 401)
  }
  if (!res.ok) {
    const detalle = await res.json().catch(() => null)
    throw new DriveError(detalle?.error?.message || `Drive ha contestado ${res.status}`, res.status)
  }
  return res
}

const json = (url, opts) => pedir(url, opts).then((r) => r.json())

/** Las comillas simples parten la consulta de Drive, así que se escapan. */
const escapar = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")

/* ------------------------------------------------------------- rutas ------ */

/**
 * Ruta → id de Drive. Se guarda lo resuelto porque cada nivel es un viaje: sin
 * esto, pintar un árbol de una asignatura serían decenas de peticiones para
 * volver a averiguar lo mismo.
 */
const cacheIds = new Map()

export function olvidarRuta(ruta = '') {
  if (!ruta) return cacheIds.clear()
  for (const clave of [...cacheIds.keys()]) {
    if (clave === ruta || clave.startsWith(ruta + '/')) cacheIds.delete(clave)
  }
}

/** La carpeta de prolife dentro de Drive. Se elige una vez y se recuerda. */
export const raizGuardada = () => localStorage.getItem(RAIZ_KEY) || ''
export function fijarRaiz(id) {
  localStorage.setItem(RAIZ_KEY, id)
  cacheIds.clear()
}

/**
 * Las carpetas candidatas: las que tienen un `.prolife` dentro son las buenas.
 *
 * Se busca el `.prolife`, no la carpeta que lo contiene, y se sube al padre.
 * Al revés no funcionaba: pedir las carpetas del Drive y mirar dentro de cada
 * una obliga a cortar la lista por algún sitio, y la carpeta de prolife se
 * quedaba fuera. Su fecha de modificación en Drive solo cambia cuando se le
 * añade o se le quita un hijo directo —crear una asignatura, no editar un
 * apunte de dentro—, así que en un Drive con trabajo de todos los días caía al
 * fondo de la lista y no llegaba a mirarse. Buscando el `.prolife` hay un solo
 * candidato posible y no hay lista que recortar.
 */
export async function buscarCarpetas() {
  const r = await json(
    `${API}/files?q=${encodeURIComponent(`name = '.prolife' and mimeType = '${CARPETA}' and trashed = false`)}` +
      '&fields=files(id,parents)&pageSize=100'
  )
  const padres = [...new Set((r.files || []).flatMap((f) => f.parents || []))]
  const salida = []
  for (const id of padres) {
    const carpeta = await json(`${API}/files/${id}?fields=id,name,modifiedTime`).catch(() => null)
    if (carpeta) salida.push({ ...carpeta, prolife: true })
  }
  return salida
}

/**
 * Carpetas por nombre, para elegir a mano cuando la búsqueda automática no da
 * con ninguna.
 *
 * Dice de cada una si tiene el `.prolife` dentro en vez de esconder las que no
 * lo tienen. Es a propósito: si Mateo ve su carpeta en la lista y marcada como
 * incompleta, ya sabe que el problema no es la app sino que Drive no ha subido
 * esa parte —empieza por punto, y hay copias de seguridad configuradas para
 * saltarse los archivos ocultos—. Una lista vacía no habría dicho nada.
 */
export async function listarCarpetas(nombre = '') {
  const filtro = nombre.trim() ? `name contains '${escapar(nombre.trim())}' and ` : ''
  const r = await json(
    `${API}/files?q=${encodeURIComponent(`${filtro}mimeType = '${CARPETA}' and trashed = false`)}` +
      '&fields=files(id,name,modifiedTime)&pageSize=100&orderBy=name'
  )
  const salida = []
  // Los propios `.prolife` casan con la búsqueda y no son candidatos: lo que se
  // elige es la carpeta que los contiene.
  const candidatas = (r.files || []).filter((c) => !c.name.startsWith('.')).slice(0, 40)
  for (const carpeta of candidatas) {
    const dentro = await hijo(carpeta.id, '.prolife').catch(() => null)
    salida.push({ ...carpeta, prolife: !!dentro })
  }
  return salida
}

/**
 * ¿Este archivo cuelga de la carpeta de prolife?
 *
 * Drive no tiene rutas, así que la única forma de saberlo es subir por los
 * padres hasta dar con la raíz. `vistos` va guardando los que ya se sabe que
 * sí, para que buscar doscientos archivos no sean doscientas escaladas.
 */
async function bajoLaRaiz(f, vistos, saltos = 0) {
  if (saltos > 8) return false
  for (const padre of f.parents || []) {
    if (vistos.has(padre)) return true
    const info = await json(`${API}/files/${padre}?fields=id,parents`).catch(() => null)
    if (info && (await bajoLaRaiz(info, vistos, saltos + 1))) {
      vistos.add(padre)
      return true
    }
  }
  return false
}

/** Un hijo concreto de una carpeta, por nombre. `null` si no está. */
async function hijo(padreId, nombre) {
  const q = `name = '${escapar(nombre)}' and '${padreId}' in parents and trashed = false`
  const r = await json(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,modifiedTime)&pageSize=1`)
  return r.files?.[0] || null
}

/**
 * Resuelve una ruta relativa a la carpeta de prolife. Devuelve el archivo o
 * carpeta de Drive, o `null` si algún tramo no existe.
 */
export async function resolver(ruta) {
  const raiz = raizGuardada()
  if (!raiz) throw new DriveError('Todavía no has elegido la carpeta de prolife en Drive.', 412)

  const limpia = String(ruta || '').replace(/^\/+|\/+$/g, '')
  if (!limpia) return { id: raiz, name: '', mimeType: CARPETA }
  if (cacheIds.has(limpia)) return cacheIds.get(limpia)

  let actual = raiz
  let encontrado = null
  const tramos = limpia.split('/')
  for (let i = 0; i < tramos.length; i++) {
    const parcial = tramos.slice(0, i + 1).join('/')
    const guardado = cacheIds.get(parcial)
    if (guardado) { encontrado = guardado; actual = guardado.id; continue }

    encontrado = await hijo(actual, tramos[i])
    if (!encontrado) return null
    cacheIds.set(parcial, encontrado)
    actual = encontrado.id
  }
  return encontrado
}

/** Como `resolver`, pero creando las carpetas que falten por el camino. */
async function resolverCreando(ruta) {
  const raiz = raizGuardada()
  if (!raiz) throw new DriveError('Todavía no has elegido la carpeta de prolife en Drive.', 412)
  const limpia = String(ruta || '').replace(/^\/+|\/+$/g, '')
  if (!limpia) return { id: raiz, mimeType: CARPETA }

  let actual = raiz
  let encontrado = { id: raiz, mimeType: CARPETA }
  const tramos = limpia.split('/')
  for (let i = 0; i < tramos.length; i++) {
    const parcial = tramos.slice(0, i + 1).join('/')
    let paso = cacheIds.get(parcial) || (await hijo(actual, tramos[i]))
    if (!paso) {
      paso = await json(`${API}/files?fields=id,name,mimeType`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tramos[i], mimeType: CARPETA, parents: [actual] }),
      })
    }
    cacheIds.set(parcial, paso)
    actual = paso.id
    encontrado = paso
  }
  return encontrado
}

/* -------------------------------------------------------------- lectura --- */

const esCarpeta = (f) => f.mimeType === CARPETA

const KIND = {
  pdf: /\.pdf$/i, image: /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i,
  video: /\.(mp4|webm|mov|mkv)$/i, audio: /\.(mp3|wav|m4a|ogg)$/i,
  markdown: /\.(md|markdown)$/i, text: /\.(txt|csv|log)$/i,
  code: /\.(js|jsx|mjs|cjs|ts|tsx|py|java|c|h|cpp|hpp|cs|go|rs|rb|php|sql|html|css|scss|json|ya?ml|sh|xml|toml|r)$/i,
  office: /\.(docx?|xlsx?|pptx?|odt|ods)$/i, archive: /\.(zip|rar|7z|tar)$/i,
}
const kindOf = (name) => Object.keys(KIND).find((k) => KIND[k].test(name)) || 'file'
const editable = (k) => k === 'markdown' || k === 'text' || k === 'code'

/** Un archivo de Drive con la misma forma que devuelve el servidor local. */
const comoEntrada = (f, ruta) => ({
  name: f.name,
  path: ruta,
  dir: esCarpeta(f),
  size: Number(f.size) || 0,
  modified: f.modifiedTime ? Date.parse(f.modifiedTime) : 0,
  kind: esCarpeta(f) ? 'folder' : kindOf(f.name),
  editable: !esCarpeta(f) && editable(kindOf(f.name)),
  ext: (f.name.match(/\.[^.]+$/) || [''])[0].toLowerCase(),
})

async function listarHijos(padreId, rutaBase) {
  const salida = []
  let token = ''
  do {
    const q = `'${padreId}' in parents and trashed = false`
    const r = await json(
      `${API}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime)` +
        `&pageSize=200${token ? `&pageToken=${token}` : ''}`
    )
    for (const f of r.files || []) {
      if (f.name.startsWith('.')) continue
      const ruta = rutaBase ? `${rutaBase}/${f.name}` : f.name
      cacheIds.set(ruta, f)
      salida.push(comoEntrada(f, ruta))
    }
    token = r.nextPageToken || ''
  } while (token)

  return salida.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, 'es') : a.dir ? -1 : 1))
}

async function arbol(padreId, rutaBase, profundidad = 0) {
  const items = await listarHijos(padreId, rutaBase)
  if (profundidad >= 4) return items
  for (const it of items) {
    if (!it.dir) continue
    const f = cacheIds.get(it.path)
    it.children = await arbol(f.id, it.path, profundidad + 1)
  }
  return items
}

const descargar = (id) => pedir(`${API}/files/${id}?alt=media`)

/* -------------------------------------------------------------- escritura - */

/**
 * Subir contenido a un archivo, creándolo si no existe. Drive quiere el
 * contenido en una petición aparte de los metadatos salvo que se use envío
 * multiparte, que es lo que se hace aquí para dejarlo en un solo viaje.
 */
async function escribir(ruta, cuerpo, tipo = 'text/plain') {
  const partes = String(ruta).split('/')
  const nombre = partes.pop()
  const carpeta = await resolverCreando(partes.join('/'))
  const existente = await hijo(carpeta.id, nombre)

  const limite = '-------prolife' + Math.random().toString(36).slice(2)
  const meta = existente ? { name: nombre } : { name: nombre, parents: [carpeta.id] }
  const cabecera =
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${limite}\r\nContent-Type: ${tipo}\r\n\r\n`
  const cierre = `\r\n--${limite}--`

  const blob = new Blob([cabecera, cuerpo, cierre], { type: `multipart/related; boundary=${limite}` })
  const url = existente
    ? `${UPLOAD}/files/${existente.id}?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime`
    : `${UPLOAD}/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime`

  const f = await json(url, { method: existente ? 'PATCH' : 'POST', body: blob })
  cacheIds.set(ruta, f)
  return f
}

/* ------------------------------------------------------ la misma api ------ */

/** Un nombre para el buzón que no choque con el de otro aparato ni consigo mismo. */
function nombreDeLote() {
  // AAAAMMDDhhmmss, sin el punto de los milisegundos: los lotes se aplican por
  // orden alfabético, así que el nombre tiene que ordenar por tiempo.
  const ahora = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  return `${ahora}-${aparato()}-${Math.random().toString(36).slice(2, 7)}.json`
}

function aparato() {
  let id = localStorage.getItem('prolife.drive.aparato')
  if (!id) {
    id = 'tablet-' + Math.random().toString(36).slice(2, 7)
    localStorage.setItem('prolife.drive.aparato', id)
  }
  return id
}

/**
 * Las mismas funciones que expone `api.js` contra el servidor local, para que
 * el resto de la app no distinga con quién está hablando.
 */
export const drive = {
  /** ¿Está esto listo para usarse? */
  listo: async () => !!raizGuardada() && (await haySesion()),

  getDb: async () => {
    const f = await resolver('.prolife/db.json')
    if (!f) throw new DriveError('No se encuentra .prolife/db.json en esa carpeta de Drive.', 404)
    const db = await descargar(f.id).then((r) => r.json())
    return { ...db, _stamp: Date.parse(f.modifiedTime) || 0, _drive: true }
  },

  /**
   * La tablet no escribe el `db.json`: deja las operaciones en el buzón. El
   * ordenador las aplica sobre su copia, que es la buena, cuando arranque.
   */
  sendOps: async (ops) => {
    const lote = { device: aparato(), at: Date.now(), ops }
    await escribir(`.prolife/ops/${nombreDeLote()}`, JSON.stringify(lote, null, 2), 'application/json')
    return { ok: true, queued: ops.length, buzon: true }
  },

  tree: async (p = '') => {
    const f = await resolver(p)
    if (!f) return { path: p, missing: true, items: [] }
    return { path: p, items: await arbol(f.id, p) }
  },

  list: async (p = '') => {
    const f = await resolver(p)
    if (!f) return { path: p, missing: true, items: [] }
    return { path: p, items: await listarHijos(f.id, p) }
  },

  readText: async (p) => {
    const f = await resolver(p)
    if (!f) throw new DriveError(`No se encuentra ${p}`, 404)
    return { path: p, content: await descargar(f.id).then((r) => r.text()) }
  },

  writeText: async (p, content) => {
    await escribir(p, content, 'text/plain; charset=utf-8')
    return { ok: true }
  },

  mkdir: async (p) => {
    await resolverCreando(p)
    return { ok: true }
  },

  upload: async (p, files) => {
    const subidos = []
    for (const file of files) {
      const f = await escribir(`${p ? p + '/' : ''}${file.name}`, file, file.type || 'application/octet-stream')
      subidos.push({ name: f.name, size: Number(f.size) || 0 })
    }
    return { ok: true, files: subidos }
  },

  remove: async (p) => {
    const f = await resolver(p)
    if (!f) return { ok: true }
    // A la papelera, no borrado del todo: desde una tablet es demasiado fácil
    // darle sin querer, y en Drive la papelera es recuperable.
    await json(`${API}/files/${f.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    })
    olvidarRuta(p)
    return { ok: true }
  },

  rename: async (p, name) => {
    const f = await resolver(p)
    if (!f) throw new DriveError(`No se encuentra ${p}`, 404)
    await json(`${API}/files/${f.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    olvidarRuta(p)
    return { ok: true }
  },

  /** Cambiar de carpeta. En Drive no es mover: es cambiarle el padre. */
  move: async (p, to) => {
    const f = await resolver(p)
    if (!f) throw new DriveError(`No se encuentra ${p}`, 404)
    const destino = await resolver(to || '')
    if (!destino) throw new DriveError(`No se encuentra la carpeta ${to}`, 404)
    const padres = await json(`${API}/files/${f.id}?fields=parents`)
    await json(
      `${API}/files/${f.id}?addParents=${destino.id}` +
        `&removeParents=${encodeURIComponent((padres.parents || []).join(','))}&fields=id,parents`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    )
    olvidarRuta(p)
    olvidarRuta(to)
    return { ok: true, path: `${to ? to + '/' : ''}${f.name}` }
  },

  /**
   * Buscar por nombre. Aquí sale gratis: Drive tiene índice y contesta él.
   *
   * Se acota a la carpeta de prolife recorriendo hacia arriba los padres de
   * cada resultado, porque la consulta de Drive busca en todo el Drive y ahí
   * hay mucho que no es de la app.
   */
  search: async (q, dentro = '') => {
    const texto = String(q || '').trim()
    if (!texto) return { ok: true, items: [] }
    const base = dentro ? await resolver(dentro) : { id: raizGuardada() }
    if (!base) return { ok: true, items: [] }
    const r = await json(
      `${API}/files?q=${encodeURIComponent(`name contains '${escapar(texto)}' and trashed = false`)}` +
        '&fields=files(id,name,mimeType,size,modifiedTime,parents)&pageSize=200'
    )
    const dentroDe = new Set([base.id])
    const items = []
    for (const f of r.files || []) {
      if (f.name.startsWith('.')) continue
      if (!(await bajoLaRaiz(f, dentroDe))) continue
      items.push({
        name: f.name,
        path: f.name,
        dir: f.mimeType === CARPETA,
        size: Number(f.size) || 0,
        modified: Date.parse(f.modifiedTime) || 0,
      })
    }
    return { ok: true, items }
  },

  /** En la tablet no hay motor de PDF: se lee lo que sea texto y ya. */
  extract: async (p) => {
    const f = await resolver(p)
    if (!f) throw new DriveError(`No se encuentra ${p}`, 404)
    if (/\.(pdf|docx)$/i.test(p)) {
      throw new DriveError('Los PDF y los Word solo se pueden leer desde el ordenador.', 415)
    }
    return { ok: true, path: p, texto: await descargar(f.id).then((r) => r.text()), recortado: false }
  },

  /**
   * Los bytes de un archivo, como URL utilizable en un `<img>` o un visor.
   *
   * Contra el servidor local esto era una URL y ya está; aquí hay que traerse
   * el archivo y envolverlo en un `blob:`. Quien la pida se encarga de soltarla
   * con `URL.revokeObjectURL` cuando termine.
   */
  rawUrl: async (p) => {
    const f = await resolver(p)
    if (!f) throw new DriveError(`No se encuentra ${p}`, 404)
    const blob = await descargar(f.id).then((r) => r.blob())
    return URL.createObjectURL(blob)
  },
}
