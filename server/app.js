import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn, exec } from 'node:child_process'
import express from 'express'
import cors from 'cors'
import multer from 'multer'

import {
  readConfig, writeConfig, ensureBase, safeJoin, cloudRoots, syncInfo, ROOT,
  ensureToken, newToken, tokenMatches, lanAddresses,
} from './config.js'
import { loadDb, saveDb, scheduleBackups, dbPath, readRaw, isFuture, versionOf, SCHEMA, drainOps } from './db.js'
import * as vscode from './code.js'
import * as assistant from './assistant.js'
import * as tailscale from './tailscale.js'
import { applyOp } from './ops.js'
import { extraerTexto, puedeLeer } from './leer.js'
import { comandoParaAbrir } from './abrir.js'
import * as gcal from './gcal.js'
import { sincronizar, AJUSTES_POR_DEFECTO } from './calsync.js'

const KIND = {
  '.pdf': 'pdf',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image',
  '.webp': 'image', '.svg': 'image', '.bmp': 'image', '.avif': 'image',
  '.mp4': 'video', '.webm': 'video', '.mov': 'video', '.mkv': 'video',
  '.mp3': 'audio', '.wav': 'audio', '.m4a': 'audio', '.ogg': 'audio',
  '.md': 'markdown', '.markdown': 'markdown',
  '.txt': 'text', '.csv': 'text', '.log': 'text',
  '.js': 'code', '.jsx': 'code', '.mjs': 'code', '.cjs': 'code',
  '.ts': 'code', '.tsx': 'code', '.py': 'code', '.java': 'code',
  '.c': 'code', '.h': 'code', '.cpp': 'code', '.hpp': 'code', '.cs': 'code',
  '.go': 'code', '.rs': 'code', '.rb': 'code', '.php': 'code', '.sql': 'code',
  '.html': 'code', '.css': 'code', '.scss': 'code', '.json': 'code',
  '.yml': 'code', '.yaml': 'code', '.sh': 'code', '.xml': 'code',
  '.toml': 'code', '.ipynb': 'code', '.r': 'code', '.m': 'code',
  '.docx': 'office', '.doc': 'office', '.xlsx': 'office', '.xls': 'office',
  '.pptx': 'office', '.ppt': 'office', '.odt': 'office', '.ods': 'office',
  '.zip': 'archive', '.rar': 'archive', '.7z': 'archive', '.tar': 'archive',
}

const MIME = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.avif': 'image/avif', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
  '.html': 'text/html; charset=utf-8',
}

const kindOf = (name) => KIND[path.extname(name).toLowerCase()] || 'file'
const isEditable = (k) => k === 'markdown' || k === 'text' || k === 'code'

/**
 * Un `Range: bytes=…` de un solo tramo, que es lo que pide el reproductor de
 * vídeo cada vez que mueves la barra —y el visor de PDF para pintar la página
 * que estás mirando sin tragarse los 30 MB enteros—.
 *
 * `null` = no hay cabecera, o hay varios tramos, o no se entiende: entonces se
 * sirve el archivo completo, que es una respuesta válida. `'unsatisfiable'` = el
 * tramo cae fuera del archivo, y eso sí hay que contestarlo con un 416.
 */
function parseRange(header, size) {
  if (!header || size <= 0) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim())
  if (!m) return null
  const [, rawStart, rawEnd] = m
  let start
  let end
  if (rawStart === '') {
    // «bytes=-500»: los últimos 500. Los últimos cero no existen.
    if (rawEnd === '') return null
    const suffix = Number(rawEnd)
    if (!suffix) return 'unsatisfiable'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start >= size || end < start) return 'unsatisfiable'
  return { start, end }
}

/** ¿Este nombre de servidor es el propio ordenador? */
const loopbackHost = (host) => {
  const h = String(host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase()
  return h === 'localhost' || h === '::1' || /^127\./.test(h)
}

/** Vite en desarrollo sirve la interfaz desde su propio puerto. */
const DEV_ORIGINS = new Set(['http://localhost:5199', 'http://127.0.0.1:5199'])

export function createApp() {
  const app = express()

  /**
   * `cors({ origin: true })` devolvía el visto bueno a CUALQUIER web. Con eso,
   * una página cualquiera abierta en el navegador del ordenador podía pedir
   * `/api/db` y leer la respuesta entera: como salía de 127.0.0.1, además se
   * saltaba la clave. Comprobado que funcionaba.
   *
   * Ahora solo se acepta la propia interfaz: mismo origen (sea por 127.0.0.1,
   * por la IP de la red o por Tailscale) o el Vite de desarrollo.
   */
  app.use(
    cors((req, cb) => {
      const origin = req.headers.origin
      // Sin origen: navegación directa, <img>, <iframe>, curl. No hay web ajena
      // que pueda leer la respuesta, así que no hay nada que negar.
      if (!origin) return cb(null, { origin: false })
      if (DEV_ORIGINS.has(origin)) return cb(null, { origin: true })
      let same = false
      try {
        same = new URL(origin).host === req.headers.host
      } catch {
        /* origen ilegible: no es de los nuestros */
      }
      cb(null, { origin: same })
    })
  )

  // La clave de acceso viaja en la URL de los archivos que se pintan en un
  // <iframe> o un <img>, donde no se pueden poner cabeceras. Sin esto, esa URL
  // se filtraría entera en el Referer de cualquier recurso externo.
  app.use((_req, res, next) => {
    res.set('Referrer-Policy', 'no-referrer')
    next()
  })

  app.use(express.json({ limit: '25mb' }))

  let cfg = readConfig()
  ensureBase(cfg.baseDir)
  // El directorio puede cambiar en caliente desde Ajustes: la copia mira siempre el actual.
  scheduleBackups(() => cfg.baseDir)

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } })

  /* ------------------------------------------------------------- acceso --- */

  /**
   * ¿La petición sale de este mismo ordenador, y va dirigida a él por su nombre?
   *
   * Las dos condiciones hacen falta. Con solo mirar el socket, un dominio de
   * atacante que apunte a 127.0.0.1 (reenlace de DNS) llegaría por loopback y se
   * saltaría la clave; exigiendo además que el `Host` sea el del propio
   * ordenador, ese truco deja de colar y pasa por la puerta con clave como todos.
   */
  const isLocal = (req) => {
    const ip = (req.socket?.remoteAddress || '').replace(/^::ffff:/, '')
    const fromHere = ip === '127.0.0.1' || ip === '::1' || ip === ''
    return fromHere && loopbackHost(req.headers.host)
  }

  /**
   * Los archivos de la interfaz son públicos —si no, la tablet no podría ni
   * cargar la pantalla para escribir la clave—, pero todo lo que toca tus datos
   * exige clave en cuanto la petición no venga del propio ordenador.
   *
   * Sin `remote` activado el servidor ni siquiera escucha fuera de 127.0.0.1;
   * esto es la segunda cerradura, para que activarlo no dependa de la red.
   */
  /**
   * Nada de la API se guarda en la caché del navegador. Son datos vivos: una
   * respuesta guardada por Chrome se sirve sin pasar por el service worker, con
   * lo que la app enseñaría el pasado creyéndolo el presente — y sin conexión
   * ni siquiera se daría cuenta de que no hay conexión.
   */
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  app.use('/api', (req, res, next) => {
    if (isLocal(req)) return next()
    const given = req.get('x-prolife-key') || req.query.k || ''
    if (tokenMatches(given, cfg.token)) return next()
    res.status(401).json({ error: 'Hace falta la clave de acceso de este ordenador.' })
  })

  /**
   * Todo error de una ruta sale como JSON con su motivo. Sin el `try` de fuera,
   * lo que se lanza de forma síncrona (`safeJoin`, `saveDb`…) se escapaba al
   * manejador por defecto de Express, que responde una página HTML: la interfaz
   * se quedaba con un «Error 403» pelado en vez de con la explicación.
   */
  const wrap = (fn) => (req, res) => {
    const fail = (err) => {
      if (res.headersSent) return
      res.status(err.status || 500).json({ error: err.message || 'Error interno' })
    }
    try {
      Promise.resolve(fn(req, res)).catch(fail)
    } catch (err) {
      fail(err)
    }
  }

  const exists = (abs) => {
    try {
      return fs.statSync(abs).isDirectory()
    } catch {
      return false
    }
  }

  /** Respuesta para una carpeta que la app espera pero que ya no está en el disco. */
  const gone = (rel, abs) => ({
    path: String(rel).split(path.sep).join('/'),
    absolute: abs,
    missing: true,
    items: [],
  })

  function entryInfo(abs, rel, name) {
    const st = fs.statSync(abs)
    return {
      name,
      path: rel.split(path.sep).join('/'),
      dir: st.isDirectory(),
      size: st.size,
      modified: st.mtimeMs,
      kind: st.isDirectory() ? 'folder' : kindOf(name),
      editable: !st.isDirectory() && isEditable(kindOf(name)),
      ext: path.extname(name).toLowerCase(),
    }
  }

  /* -------------------------------------------------------------- estado --- */

  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, baseDir: cfg.baseDir, platform: process.platform, home: os.homedir() })
  )

  /**
   * El token no se devuelve nunca: se enseña solo en el ordenador, en Ajustes.
   *
   * `here` dice si quien pregunta es el propio ordenador. Lo necesita la
   * interfaz para no ofrecer en la tablet botones que el servidor va a rechazar:
   * el directorio de trabajo se elige donde están los archivos.
   *
   * `envDir` es la ruta que impone `PROLIFE_DIR`, si la hay. Manda sobre lo
   * guardado, así que sin decirlo el ajuste parecería no funcionar: se guarda,
   * pero la app sigue abriendo contra la de la variable.
   */
  const publicCfg = (req, from = cfg) => {
    const { token, ...rest } = from
    return {
      ...rest,
      hasToken: !!token,
      sync: syncInfo(from.baseDir),
      here: isLocal(req),
      envDir: process.env.PROLIFE_DIR ? path.resolve(process.env.PROLIFE_DIR) : null,
    }
  }

  app.get('/api/config', (req, res) => res.json(publicCfg(req)))

  /**
   * Cambiar el directorio de trabajo. Solo desde el propio ordenador: `safeJoin`
   * encierra a todo el mundo dentro del directorio base, así que quien pueda
   * moverlo puede ponerlo en la raíz del disco y llevarse por delante esa única
   * frontera. La clave de la tablet da acceso a tus apuntes, no a tu disco.
   */
  app.put(
    '/api/config',
    wrap((req, res) => {
      onlyHere(req)
      const raw = typeof req.body?.baseDir === 'string' ? req.body.baseDir.trim() : ''
      if (!raw) throw Object.assign(new Error('Falta el directorio'), { status: 400 })
      if (!path.isAbsolute(raw)) {
        throw Object.assign(new Error('El directorio tiene que ser una ruta completa'), { status: 400 })
      }
      const dir = path.resolve(raw)
      // La carpeta se crea, pero la que la contiene tiene que existir ya. Si no,
      // una letra de unidad mal escrita («H:\Mi unidad», con Drive en la G) se
      // tragaría el cambio en silencio y fabricaría un árbol vacío en cualquier
      // sitio, con la app apuntando a él y tus apuntes en otra parte.
      const parent = path.dirname(dir)
      if (parent !== dir && !exists(parent)) {
        throw Object.assign(new Error(`No existe la carpeta que lo contiene: ${parent}`), { status: 400 })
      }
      ensureBase(dir)

      /**
       * El directorio en marcha NO se cambia en caliente. La interfaz tiene en
       * memoria el `db` de la carpeta vieja, y su siguiente guardado con retraso
       * lo escribiría en la nueva, encima del `db.json` que muy probablemente ya
       * está ahí puesto por el otro ordenador. Se guarda la configuración y el
       * cambio entra al reiniciar, que es lo que la interfaz ya avisa.
       */
      const stored = writeConfig({ baseDir: dir })
      res.json({ ...publicCfg(req, stored), restart: true })
    })
  )

  /**
   * Carpetas que se sincronizan solas y están montadas en ESTE ordenador. Poner
   * ahí el directorio de trabajo es todo lo que hace falta para tener lo mismo
   * en casa y en la universidad, así que se ofrecen a un botón.
   */
  app.get(
    '/api/sync/roots',
    wrap((req, res) => {
      onlyHere(req)
      res.json({ roots: cloudRoots(), current: cfg.baseDir })
    })
  )

  /* --------------------------------------------------- acceso desde fuera --- */

  /** Cómo está el acceso desde fuera, y con qué clave. */
  const remoteState = () => ({
    enabled: !!cfg.remote,
    port: cfg.port,
    token: cfg.token || null,
    addresses: lanAddresses(),
  })

  /**
   * Datos para emparejar la tablet. Solo desde el propio ordenador: es lo único
   * que enseña la clave, y quien ya la tiene no necesita pedirla.
   */
  const onlyHere = (req) => {
    if (!isLocal(req)) throw Object.assign(new Error('Solo desde el ordenador'), { status: 403 })
  }

  app.get('/api/remote', wrap((req, res) => { onlyHere(req); res.json(remoteState()) }))

  app.put(
    '/api/remote',
    wrap((req, res) => {
      onlyHere(req)
      const patch = {}
      if (typeof req.body.enabled === 'boolean') patch.remote = req.body.enabled
      // Renovar cambia la clave y echa a los aparatos ya emparejados, que es
      // justo para lo que sirve: la tablet perdida o el token compartido de más.
      if (req.body.renew === true) patch.token = newToken()
      cfg = writeConfig(patch)
      // Encender por primera vez necesita una clave con la que emparejar.
      if (cfg.remote && !cfg.token) {
        ensureToken()
        cfg = readConfig()
      }
      // El puerto ya está escuchando donde estaba: el cambio entra al reiniciar.
      res.json({ ...remoteState(), restart: true })
    })
  )

  /**
   * Todo lo que antes había que teclear a mano para usar la tablet fuera de
   * casa: si Tailscale está dentro de la red, su dirección `.ts.net`, y si ya
   * está publicando este puerto. Con eso la interfaz arma el enlace de
   * emparejamiento sola, sin que el usuario copie ni pegue nada.
   */
  app.get(
    '/api/tailscale/status',
    wrap(async (req, res) => {
      onlyHere(req)
      res.json(await tailscale.status(cfg.port))
    })
  )

  /** El botón «Activar acceso fuera de casa»: hace justo `tailscale serve --bg`. */
  app.post(
    '/api/tailscale/serve',
    wrap(async (req, res) => {
      onlyHere(req)
      const r = await tailscale.serve(cfg.port)
      if (!r.ok) throw Object.assign(new Error(r.error), { status: 502 })
      res.json(await tailscale.status(cfg.port))
    })
  )

  /* ---------------------------------------------------------- base datos --- */

  /** Marca de tiempo del db.json: así se detecta que otro ordenador lo cambió. */
  const stamp = () => {
    try {
      return Math.round(fs.statSync(dbPath(cfg.baseDir)).mtimeMs)
    } catch {
      return 0
    }
  }

  /** Versión del fichero en disco cuando es más nueva que la que entiende esta app. */
  const futureVersion = () => {
    const raw = readRaw(cfg.baseDir)
    return raw && isFuture(raw) ? versionOf(raw) : null
  }

  /** Solo se cuenta en la respuesta cuando de verdad ha entrado algo del buzón. */
  const loDelBuzon = (buzon) => (buzon.applied || buzon.skipped.length ? { _drained: buzon } : {})

  /**
   * Antes de servir los datos se vacía el buzón que deja la tablet cuando ha
   * trabajado contra Drive por su cuenta. Va aquí y no en un temporizador
   * porque este es justo el momento en que alguien va a mirar los datos: así
   * lo que apuntaste en clase ya está dentro la primera vez que abres la app,
   * sin esperar a ningún ciclo. Es un `readdir` de una carpeta casi siempre
   * vacía, y solo se toca el `db.json` si de verdad había algo.
   */
  app.get(
    '/api/db',
    wrap((_req, res) => {
      const buzon = drainOps(cfg.baseDir)
      if (buzon.applied || buzon.skipped.length) {
        console.log(`buzón de la tablet: ${buzon.applied} cambios aplicados` +
          (buzon.skipped.length ? `, ${buzon.skipped.length} descartados` : ''))
      }
      res.json({
        ...loadDb(cfg.baseDir),
        _stamp: stamp(), _schema: SCHEMA, _future: futureVersion(),
        // Para que la interfaz pueda decir «lo que apuntaste en la tablet ya está aquí».
        ...loDelBuzon(buzon),
      })
    })
  )

  app.get('/api/db/stamp', (_req, res) => res.json({ stamp: stamp(), future: futureVersion() }))

  app.put(
    '/api/db',
    wrap((req, res) => {
      const body = { ...req.body }
      delete body._stamp
      delete body._schema
      delete body._future
      delete body._stale
      saveDb(cfg.baseDir, body)
      res.json({ ok: true, stamp: stamp() })
    })
  )

  /**
   * Cambios sueltos apuntados en la tablet sin este ordenador delante.
   *
   * La diferencia con el `PUT` de arriba es todo el asunto: aquel manda la base
   * ENTERA, así que escribir desde una copia vieja machacaría lo que se haya
   * hecho aquí mientras tanto. Esto llega con «marca esta clase» o «tacha esta
   * tarea» y se aplica sobre el `db.json` de AHORA MISMO: lo demás no se toca.
   *
   * Se lee y se guarda en la misma llamada, sin `await` por medio, así que no
   * hay ventana para que otro guardado se cuele entre una cosa y la otra.
   */
  app.post(
    '/api/db/ops',
    wrap((req, res) => {
      const ops = Array.isArray(req.body?.ops) ? req.body.ops : null
      if (!ops) throw Object.assign(new Error('Faltan las operaciones'), { status: 400 })
      if (!ops.length) return res.json({ ok: true, stamp: stamp(), applied: 0, skipped: [] })
      if (ops.length > 1000) {
        throw Object.assign(new Error('Demasiadas operaciones de una vez'), { status: 413 })
      }

      const db = loadDb(cfg.baseDir)
      const skipped = []
      let applied = 0
      for (const op of ops) {
        const error = applyOp(db, op)
        if (error) skipped.push({ id: op?.id ?? null, error })
        else applied++
      }
      // Aunque no entre ninguna se guarda igual: `loadDb` migra y poda, y eso
      // merece quedarse escrito. Si el fichero es de una versión más nueva,
      // `saveDb` lanza un 409 y no se toca nada, como en el resto de la app.
      saveDb(cfg.baseDir, db)
      res.json({ ok: true, stamp: stamp(), applied, skipped })
    })
  )

  /* ------------------------------------------------------ sistema archivos --- */

  app.get(
    '/api/fs/list',
    wrap((req, res) => {
      const rel = req.query.p || ''
      const abs = safeJoin(cfg.baseDir, rel)
      if (!exists(abs)) return res.json({ ...gone(rel, abs) })
      const items = fs
        .readdirSync(abs, { withFileTypes: true })
        .filter((d) => !d.name.startsWith('.'))
        .map((d) => {
          try {
            return entryInfo(path.join(abs, d.name), path.join(rel, d.name), d.name)
          } catch {
            return null
          }
        })
        .filter(Boolean)
        .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, 'es') : a.dir ? -1 : 1))
      res.json({ path: String(rel).split(path.sep).join('/'), absolute: abs, items })
    })
  )

  /** Árbol completo de una carpeta, para el panel lateral del espacio de trabajo. */
  app.get(
    '/api/fs/tree',
    wrap((req, res) => {
      const rel = req.query.p || ''
      const root = safeJoin(cfg.baseDir, rel)
      // Leer NO crea. Cuando esto creaba la carpeta que faltaba, mover o renombrar
      // una carpeta desde el explorador dejaba a la app mirando una carpeta nueva
      // y vacía —con los archivos de verdad al lado— sin decir una palabra.
      if (!exists(root)) return res.json({ ...gone(rel, root) })

      const walk = (abs, relPath, depth) => {
        if (depth > 5) return []
        return fs
          .readdirSync(abs, { withFileTypes: true })
          .filter((d) => !d.name.startsWith('.'))
          .map((d) => {
            const childAbs = path.join(abs, d.name)
            try {
              const info = entryInfo(childAbs, path.join(relPath, d.name), d.name)
              if (info.dir) info.children = walk(childAbs, path.join(relPath, d.name), depth + 1)
              return info
            } catch {
              return null
            }
          })
          .filter(Boolean)
          .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, 'es') : a.dir ? -1 : 1))
      }

      res.json({ path: String(rel).split(path.sep).join('/'), absolute: root, items: walk(root, rel, 0) })
    })
  )

  app.post(
    '/api/fs/mkdir',
    wrap((req, res) => {
      const abs = safeJoin(cfg.baseDir, req.body.p)
      fs.mkdirSync(abs, { recursive: true })
      res.json({ ok: true, absolute: abs })
    })
  )

  app.post(
    '/api/fs/upload',
    upload.array('files', 60),
    wrap((req, res) => {
      const dirAbs = safeJoin(cfg.baseDir, req.body.p || '')
      fs.mkdirSync(dirAbs, { recursive: true })
      const saved = (req.files || []).map((f) => {
        const original = Buffer.from(f.originalname, 'latin1').toString('utf8')
        const name = original.replace(/[\\/:*?"<>|]/g, '_')
        let target = path.join(dirAbs, name)
        let i = 1
        while (fs.existsSync(target)) {
          const ext = path.extname(name)
          target = path.join(dirAbs, `${path.basename(name, ext)} (${i++})${ext}`)
        }
        fs.writeFileSync(target, f.buffer)
        return entryInfo(target, path.relative(cfg.baseDir, target), path.basename(target))
      })
      res.json({ ok: true, files: saved })
    })
  )

  app.get(
    '/api/fs/text',
    wrap((req, res) => {
      const abs = safeJoin(cfg.baseDir, req.query.p)
      res.json({ content: fs.readFileSync(abs, 'utf8'), modified: fs.statSync(abs).mtimeMs })
    })
  )

  app.put(
    '/api/fs/text',
    wrap((req, res) => {
      const abs = safeJoin(cfg.baseDir, req.body.p)
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, req.body.content ?? '', 'utf8')
      res.json({ ok: true, modified: fs.statSync(abs).mtimeMs })
    })
  )

  app.get(
    '/api/fs/raw',
    wrap((req, res) => {
      const abs = safeJoin(cfg.baseDir, req.query.p)
      // Sin esto, pedir un archivo que no existe mata el proceso entero: el
      // error del stream se emite fuera de la promesa que envuelve la ruta.
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        return res.status(404).json({ error: 'No existe' })
      }
      // Los archivos sí merecen caché, pero validada: un PDF de 30 MB no puede
      // volver a viajar entero cada vez que se pinta, y a la vez tiene que
      // notarse si lo has cambiado por fuera.
      const st = fs.statSync(abs)
      const lastModified = new Date(Math.floor(st.mtimeMs / 1000) * 1000).toUTCString()
      res.set('Cache-Control', 'no-cache')
      res.set('Last-Modified', lastModified)
      // Sin esto el navegador ni lo intenta: la barra de posición de un vídeo se
      // queda muerta y cada salto vuelve a pedir el archivo desde el principio.
      res.set('Accept-Ranges', 'bytes')
      if (req.get('if-modified-since') === lastModified) return res.status(304).end()

      const ext = path.extname(abs).toLowerCase()
      if (MIME[ext]) res.type(MIME[ext])
      res.set('X-Content-Type-Options', 'nosniff')
      // Un .html o un .svg de tu carpeta se sirven desde el mismo origen que la
      // app: sin esto, un archivo con un <script> dentro podría leer la clave de
      // acceso guardada en el navegador. `sandbox` los deja en un origen aparte
      // y sin poder ejecutar nada. No afecta a PDFs ni imágenes.
      if (ext === '.html' || ext === '.htm' || ext === '.svg' || ext === '.xml') {
        res.set('Content-Security-Policy', 'sandbox')
      }
      if (req.query.download) res.attachment(path.basename(abs))
      else res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(abs))}"`)

      const range = parseRange(req.get('range'), st.size)
      if (range === 'unsatisfiable') {
        res.set('Content-Range', `bytes */${st.size}`)
        return res.status(416).end()
      }
      const { start, end } = range || { start: 0, end: Math.max(0, st.size - 1) }
      if (range) {
        res.status(206)
        res.set('Content-Range', `bytes ${start}-${end}/${st.size}`)
      }
      res.set('Content-Length', String(st.size === 0 ? 0 : end - start + 1))

      const stream = fs.createReadStream(abs, range ? { start, end } : undefined)
      stream.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy() })
      stream.pipe(res)
    })
  )

  /**
   * El texto de un archivo, venga de donde venga: `.md`, `.txt`, código, un PDF
   * o un Word. Es lo que usa el ayudante para poder leer lo que tienes ahí.
   *
   * Aparte de `/api/fs/text` a propósito: aquel devuelve lo que hay escrito en
   * el fichero y se puede volver a guardar encima; esto devuelve una lectura, y
   * guardarla encima de un PDF lo destruiría.
   */
  app.get(
    '/api/fs/extract',
    wrap(async (req, res) => {
      const rel = req.query.p || ''
      const abs = safeJoin(cfg.baseDir, rel)
      // `exists` de aquí arriba pregunta si es una CARPETA, y esto son archivos.
      if (!fs.existsSync(abs)) throw Object.assign(new Error('Ese archivo no está'), { status: 404 })
      if (fs.statSync(abs).isDirectory()) throw Object.assign(new Error('Eso es una carpeta'), { status: 400 })
      const r = await extraerTexto(abs, path.basename(abs))
      res.json({ ok: true, path: String(rel).split(path.sep).join('/'), ...r })
    })
  )

  /**
   * Buscar por nombre en todo el directorio.
   *
   * Sin esto, encontrar algo exigía saber ya en qué carpeta estaba, que es justo
   * lo que no sabes cuando lo buscas. Se salta `.prolife` y las carpetas
   * ocultas, y corta a los 300 resultados: es una caja de búsqueda, no un
   * inventario.
   */
  app.get(
    '/api/fs/buscar',
    wrap((req, res) => {
      const q = String(req.query.q || '').trim().toLowerCase()
      const dentro = String(req.query.p || '')
      const soloTexto = req.query.leibles === '1'
      if (!q) return res.json({ ok: true, items: [] })

      const raiz = safeJoin(cfg.baseDir, dentro)
      if (!exists(raiz)) return res.json({ ok: true, items: [] })
      const items = []

      const walk = (abs, rel, depth) => {
        if (depth > 8 || items.length >= 300) return
        let hijos = []
        try { hijos = fs.readdirSync(abs, { withFileTypes: true }) } catch { return }
        for (const d of hijos) {
          if (d.name.startsWith('.')) continue
          if (items.length >= 300) return
          const childAbs = path.join(abs, d.name)
          const childRel = path.join(rel, d.name)
          let info = null
          try { info = entryInfo(childAbs, childRel, d.name) } catch { continue }
          if (d.name.toLowerCase().includes(q) && (!soloTexto || info.dir || puedeLeer(d.name))) items.push(info)
          if (info.dir) walk(childAbs, childRel, depth + 1)
        }
      }
      walk(raiz, dentro, 0)
      // Las carpetas primero y lo más reciente antes: buscando algo, lo de la
      // semana pasada es casi siempre lo que buscas.
      items.sort((a, b) => (a.dir === b.dir ? b.modified - a.modified : a.dir ? -1 : 1))
      res.json({ ok: true, items })
    })
  )

  /**
   * Mover algo a otra carpeta. Renombrar cambia el nombre en su sitio; esto
   * cambia de sitio.
   *
   * `fs.renameSync` no vale entre discos distintos —y el directorio de trabajo
   * puede estar en uno y la carpeta destino en otro dentro de la misma unidad
   * lógica, según cómo tenga montado Drive—, así que se reintenta copiando.
   */
  app.post(
    '/api/fs/move',
    wrap((req, res) => {
      const from = safeJoin(cfg.baseDir, req.body.p)
      const destDir = safeJoin(cfg.baseDir, req.body.to || '')
      if (path.resolve(from) === path.resolve(cfg.baseDir)) {
        throw Object.assign(new Error('No se puede mover la raíz'), { status: 403 })
      }
      if (!fs.existsSync(from)) throw Object.assign(new Error('Eso ya no está'), { status: 404 })
      if (!exists(destDir)) throw Object.assign(new Error('El destino no es una carpeta'), { status: 400 })
      // Meter una carpeta dentro de sí misma la haría desaparecer: el sistema
      // deja hacerlo en algunos casos y el resultado no tiene arreglo.
      const dentroDeSiMisma =
        fs.statSync(from).isDirectory() &&
        (path.resolve(destDir) === path.resolve(from) ||
          path.resolve(destDir).startsWith(path.resolve(from) + path.sep))
      if (dentroDeSiMisma) throw Object.assign(new Error('Una carpeta no puede ir dentro de sí misma'), { status: 400 })

      const nombre = path.basename(from)
      let destino = path.join(destDir, nombre)
      if (path.resolve(destino) === path.resolve(from)) {
        return res.json({ ok: true, path: String(req.body.p).split(path.sep).join('/'), sinCambios: true })
      }
      // Nunca se pisa lo que ya hubiera con ese nombre: se numera, igual que al subir.
      let i = 1
      while (fs.existsSync(destino)) {
        const ext = path.extname(nombre)
        const base = path.basename(nombre, ext)
        destino = path.join(destDir, `${base} (${i++})${ext}`)
      }
      try {
        fs.renameSync(from, destino)
      } catch (e) {
        if (e.code !== 'EXDEV') throw e
        fs.cpSync(from, destino, { recursive: true })
        fs.rmSync(from, { recursive: true, force: true })
      }
      res.json({ ok: true, path: path.relative(cfg.baseDir, destino).split(path.sep).join('/') })
    })
  )

  app.post(
    '/api/fs/rename',
    wrap((req, res) => {
      const from = safeJoin(cfg.baseDir, req.body.p)
      const to = safeJoin(cfg.baseDir, path.join(path.dirname(req.body.p), req.body.name))
      fs.renameSync(from, to)
      res.json({ ok: true, path: path.relative(cfg.baseDir, to).split(path.sep).join('/') })
    })
  )

  app.post(
    '/api/fs/delete',
    wrap((req, res) => {
      const abs = safeJoin(cfg.baseDir, req.body.p)
      if (path.resolve(abs) === path.resolve(cfg.baseDir)) throw Object.assign(new Error('No'), { status: 403 })
      fs.rmSync(abs, { recursive: true, force: true })
      res.json({ ok: true })
    })
  )

  /* ------------------------------------------------------ google calendar --- */

  /**
   * El calendario vive en el servidor y no en la interfaz porque el testigo de
   * refresco —lo único que de verdad da acceso a la cuenta— tiene que quedarse
   * en `~/.prolife/config.json`, del ordenador, y no en el navegador ni en la
   * carpeta que viaja por Drive.
   */
  app.get(
    '/api/gcal/status',
    wrap(async (_req, res) => {
      const base = {
        ok: true,
        configurado: gcal.configurado(),
        conectado: gcal.conectado(),
        calendarId: cfg.gcalCalendarId || '',
        mostrar: cfg.gcalMostrar || [],
        ultima: cfg.gcalUltima || null,
        ajustes: { ...AJUSTES_POR_DEFECTO, ...(loadDb(cfg.baseDir).settings?.gcal || {}) },
      }
      if (!base.conectado) return res.json({ ...base, calendarios: [] })
      // Que la lista de calendarios falle no puede dejar la pantalla en blanco:
      // el resto del estado sigue siendo verdad y es lo que explica el fallo.
      const calendarios = await gcal.listarCalendarios().catch((e) => ({ error: e.message }))
      if (calendarios.error) return res.json({ ...base, calendarios: [], error: calendarios.error })
      res.json({ ...base, calendarios })
    })
  )

  app.post(
    '/api/gcal/config',
    wrap((req, res) => {
      cfg = writeConfig({
        gcalClientId: String(req.body?.clientId || '').trim(),
        gcalClientSecret: String(req.body?.clientSecret || '').trim(),
      })
      res.json({ ok: true, configurado: gcal.configurado() })
    })
  )

  app.get(
    '/api/gcal/login',
    wrap((req, res) => {
      // El puerto sale de la propia petición: si la app se abrió en otro por
      // estar el 4321 ocupado, la vuelta tiene que ir a ese y no al de fábrica.
      const puerto = Number(req.socket.localPort) || cfg.port
      res.json({ ok: true, url: gcal.urlDeEntrada(puerto), redireccion: gcal.redireccion(puerto) })
    })
  )

  /** Aquí vuelve Google. Lo abre el navegador, así que contesta una página. */
  app.get(
    '/api/gcal/callback',
    wrap(async (req, res) => {
      const pagina = (titulo, detalle, color) => `<!doctype html><meta charset="utf-8">
<title>prolife · Google Calendar</title>
<body style="font:15px/1.6 system-ui,sans-serif;background:#f5f3ee;color:#1a1815;display:grid;place-items:center;height:100vh;margin:0">
<div style="max-width:30rem;padding:28px;text-align:center">
<div style="font-size:26px;color:${color};margin-bottom:8px">${titulo}</div>
<p style="color:#56524a">${detalle}</p>
<p style="color:#8d887c;font-size:13px">Ya puedes cerrar esta pestaña y volver a prolife.</p>
</div>`
      try {
        await gcal.terminarEntrada({ code: req.query.code, state: req.query.state, error: req.query.error })
        res.type('html').send(pagina('Conectado', 'prolife ya puede escribir en tu Google Calendar.', '#4f6b4a'))
      } catch (e) {
        res.status(e.status || 400).type('html').send(pagina('No ha podido ser', e.message, '#bf3f24'))
      }
    })
  )

  app.post(
    '/api/gcal/logout',
    wrap((_req, res) => {
      gcal.salir()
      cfg = readConfig()
      res.json({ ok: true })
    })
  )

  /** Qué calendarios tuyos se ven dentro de prolife. Solo se leen. */
  app.post(
    '/api/gcal/mostrar',
    wrap((req, res) => {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => typeof x === 'string').slice(0, 30) : []
      cfg = writeConfig({ gcalMostrar: ids })
      res.json({ ok: true, mostrar: ids })
    })
  )

  app.post(
    '/api/gcal/sync',
    wrap(async (_req, res) => {
      const r = await sincronizar(loadDb(cfg.baseDir))
      cfg = writeConfig({ gcalUltima: { at: r.at, creados: r.creados, cambiados: r.cambiados, borrados: r.borrados } })
      res.json(r)
    })
  )

  /**
   * Lo que hay en TUS calendarios entre dos fechas, para pintarlo dentro de
   * prolife. Solo lectura: lo que pongas en Google es tuyo y la app no lo toca
   * ni lo guarda en el `db.json`.
   */
  app.get(
    '/api/gcal/events',
    wrap(async (req, res) => {
      const desde = String(req.query.from || '')
      const hasta = String(req.query.to || '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
        throw Object.assign(new Error('Faltan las fechas'), { status: 400 })
      }
      const quiere = cfg.gcalMostrar || []
      if (!gcal.conectado() || !quiere.length) return res.json({ ok: true, items: [] })

      const propios = cfg.gcalCalendarId
      const items = []
      for (const id of quiere) {
        // El calendario de prolife no se pinta: sus eventos ya están en la app,
        // y verlos dos veces sería peor que no verlos.
        if (id === propios) continue
        const suyos = await gcal.eventosDe(id, desde, hasta).catch(() => [])
        for (const e of suyos) items.push({ ...e, calendarId: id })
      }
      res.json({ ok: true, items })
    })
  )

  /* --------------------------------------------------- abrir cosas fuera --- */

  /**
   * Un `spawn` que falla emite 'error' fuera de la promesa de la ruta: sin este
   * manejador, no encontrar el lanzador del sistema tumbaba el servidor entero
   * y con él la app. Abrir algo por fuera nunca puede costar tanto.
   */
  function launch(cmd, args, opts = {}) {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', ...opts })
    child.on('error', (err) => console.error(`No se pudo abrir con ${cmd}:`, err.message))
    child.unref()
    return child
  }

  /**
   * Abrir algo fuera de la app: una dirección en el navegador, o un archivo con
   * su programa.
   *
   * Dentro de Electron manda su propio `shell`, que es la vía buena y la que no
   * se equivoca con los caracteres raros. Fuera —con `npm run server` a pelo, o
   * en las pruebas— se cae al lanzador del sistema, que es donde hay que tener
   * cuidado: ver `comandoParaAbrir`.
   */
  function openExternal(target) {
    const esUrl = /^https?:\/\//i.test(target)
    if (process.versions.electron) {
      import('electron')
        .then(({ shell }) => (esUrl ? shell.openExternal(target) : shell.openPath(target)))
        .catch(() => { const c = comandoParaAbrir(target, process.platform); launch(c.cmd, c.args, c.opts) })
      return
    }
    const c = comandoParaAbrir(target, process.platform)
    launch(c.cmd, c.args, c.opts)
  }

  app.post(
    '/api/open',
    wrap((req, res) => {
      const { url, p, app: application } = req.body

      if (url) {
        if (!/^https?:\/\//i.test(url)) throw Object.assign(new Error('URL no válida'), { status: 400 })
        openExternal(url)
        return res.json({ ok: true })
      }

      const abs = safeJoin(cfg.baseDir, p ?? '')

      if (application === 'code') {
        const cmd = process.platform === 'win32' ? 'code.cmd' : 'code'
        launch(cmd, [abs], { shell: process.platform === 'win32' })
        return res.json({ ok: true })
      }

      if (application === 'reveal') {
        if (process.platform === 'win32') exec(`explorer.exe /select,"${abs}"`, () => {})
        else if (process.platform === 'darwin') launch('open', ['-R', abs])
        else openExternal(path.dirname(abs))
        return res.json({ ok: true })
      }

      openExternal(abs)
      res.json({ ok: true })
    })
  )

  /* ------------------------------------------------- editor integrado --- */

  app.get(
    '/api/code/status',
    wrap(async (_req, res) => res.json({ ...(await vscode.status()), accepted: !!cfg.vscodeLicenseAccepted }))
  )

  /** El usuario acepta (o retira) los términos de licencia del servidor. */
  app.post(
    '/api/code/accept',
    wrap((req, res) => {
      cfg = writeConfig({ vscodeLicenseAccepted: req.body.accepted !== false })
      if (!cfg.vscodeLicenseAccepted) vscode.stop()
      res.json({ accepted: cfg.vscodeLicenseAccepted })
    })
  )

  app.post(
    '/api/code/start',
    wrap(async (req, res) => {
      await vscode.start({ accepted: !!cfg.vscodeLicenseAccepted })
      const abs = req.body.folder != null ? safeJoin(cfg.baseDir, req.body.folder) : cfg.baseDir
      res.json({ url: vscode.urlFor(abs), folder: abs })
    })
  )

  app.post('/api/code/stop', wrap((_req, res) => res.json(vscode.stop())))

  /* ------------------------------------------------------ ayudante local --- */

  app.get('/api/ai/status', wrap(async (req, res) => res.json(await assistant.status(req.query.url))))

  /**
   * Pasarela hacia Ollama. Las herramientas que pida el modelo las ejecuta la
   * interfaz contra su propia copia del db: aquí no se escribe nada.
   */
  app.post(
    '/api/ai/chat',
    wrap(async (req, res) => {
      const { url, model, messages, tools, temperature } = req.body || {}
      if (!Array.isArray(messages) || !messages.length) {
        throw Object.assign(new Error('Conversación vacía'), { status: 400 })
      }
      res.json(await assistant.chat(url, { model, messages, tools, temperature }))
    })
  )

  /* ------------------------------------------------------- estáticos --- */

  const dist = path.join(ROOT, 'dist')
  if (fs.existsSync(dist)) {
    app.use(express.static(dist))
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
  }

  return { app, cfg }
}

export function startServer() {
  const { app, cfg } = createApp()
  // Por defecto solo se ve desde este ordenador. Escuchar en toda la red es una
  // decisión que se toma a mano en Ajustes, y va siempre con clave.
  const host = cfg.remote ? '0.0.0.0' : '127.0.0.1'
  return new Promise((resolve, reject) => {
    const server = app.listen(cfg.port, host, () =>
      resolve({ server, port: cfg.port, baseDir: cfg.baseDir, host, remote: !!cfg.remote })
    )
    server.on('error', reject)
  })
}
