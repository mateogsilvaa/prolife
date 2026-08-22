import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn, exec } from 'node:child_process'
import express from 'express'
import cors from 'cors'
import multer from 'multer'

import { readConfig, writeConfig, ensureBase, safeJoin, cloudRoots, syncInfo, ROOT } from './config.js'
import { loadDb, saveDb, backupDb, dbPath } from './db.js'
import * as vscode from './code.js'
import * as assistant from './assistant.js'

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

export function createApp() {
  const app = express()
  app.use(cors({ origin: true }))
  app.use(express.json({ limit: '25mb' }))

  let cfg = readConfig()
  ensureBase(cfg.baseDir)
  backupDb(cfg.baseDir)

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } })

  const wrap = (fn) => (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      res.status(err.status || 500).json({ error: err.message || 'Error interno' })
    })
  }

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

  app.get('/api/config', (_req, res) => res.json({ ...cfg, sync: syncInfo(cfg.baseDir) }))

  app.put(
    '/api/config',
    wrap((req, res) => {
      const patch = {}
      if (typeof req.body.baseDir === 'string' && req.body.baseDir.trim()) {
        patch.baseDir = path.resolve(req.body.baseDir.trim())
      }
      cfg = writeConfig(patch)
      ensureBase(cfg.baseDir)
      res.json({ ...cfg, sync: syncInfo(cfg.baseDir) })
    })
  )

  /** Carpetas de nube detectadas, para poder trabajar desde dos ordenadores. */
  app.get('/api/sync/roots', (_req, res) =>
    res.json({ roots: cloudRoots(), current: syncInfo(cfg.baseDir), home: os.homedir() })
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

  app.get('/api/db', wrap((_req, res) => res.json({ ...loadDb(cfg.baseDir), _stamp: stamp() })))

  app.get('/api/db/stamp', (_req, res) => res.json({ stamp: stamp() }))

  app.put(
    '/api/db',
    wrap((req, res) => {
      const body = { ...req.body }
      delete body._stamp
      saveDb(cfg.baseDir, body)
      res.json({ ok: true, stamp: stamp() })
    })
  )

  /* ------------------------------------------------------ sistema archivos --- */

  app.get(
    '/api/fs/list',
    wrap((req, res) => {
      const rel = req.query.p || ''
      const abs = safeJoin(cfg.baseDir, rel)
      fs.mkdirSync(abs, { recursive: true })
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
      fs.mkdirSync(root, { recursive: true })

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
      const ext = path.extname(abs).toLowerCase()
      if (MIME[ext]) res.type(MIME[ext])
      if (req.query.download) res.attachment(path.basename(abs))
      else res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(abs))}"`)
      const stream = fs.createReadStream(abs)
      stream.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy() })
      stream.pipe(res)
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

  /* --------------------------------------------------- abrir cosas fuera --- */

  function openExternal(target) {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', target], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    } else if (process.platform === 'darwin') {
      spawn('open', [target], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn('xdg-open', [target], { detached: true, stdio: 'ignore' }).unref()
    }
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
        const child = spawn(cmd, [abs], { detached: true, stdio: 'ignore', shell: process.platform === 'win32' })
        child.on('error', () => {})
        child.unref()
        return res.json({ ok: true })
      }

      if (application === 'reveal') {
        if (process.platform === 'win32') exec(`explorer.exe /select,"${abs}"`)
        else if (process.platform === 'darwin') spawn('open', ['-R', abs], { detached: true, stdio: 'ignore' }).unref()
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
  return new Promise((resolve, reject) => {
    const server = app.listen(cfg.port, '127.0.0.1', () => resolve({ server, port: cfg.port, baseDir: cfg.baseDir }))
    server.on('error', reject)
  })
}
