import { app, BrowserWindow, powerMonitor, ipcMain, shell, Menu } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer } from '../server/app.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEV_URL = 'http://localhost:5199'

let win = null
let serverPort = 4321

/**
 * Chrome real en el user-agent de los paneles de IA. Con el UA por defecto de
 * Electron muchos sitios sirven una versión rota o bloquean el login.
 */
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#f5f3ee',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Necesario para empotrar las IAs: <webview> es un proceso aparte, así que
      // no le afectan X-Frame-Options ni frame-ancestors.
      webviewTag: true,
    },
  })

  win.once('ready-to-show', () => win.show())

  // Cualquier target=_blank (enlaces dentro de los paneles de IA) va al navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Si Vite está levantado se usa (recarga en caliente); si no, la build servida
  // por el servidor interno. Así valen igual `npm run dev` y `npm start`.
  const url = (await devServerUp()) ? DEV_URL : `http://127.0.0.1:${serverPort}`
  await loadWithRetry(url)

  const notify = (channel) => () => win?.webContents.send(channel)
  win.on('focus', notify('win:focus'))
  win.on('blur', notify('win:blur'))
}

/** ¿Hay un Vite escuchando? Se le dan unos segundos porque tarda en arrancar. */
async function devServerUp() {
  if (app.isPackaged) return false
  // Con `npm run dev` merece la pena esperar; con `npm start` solo se comprueba
  // por si ya hubiera un Vite abierto en otra terminal.
  const attempts = process.env.PROLIFE_DEV === '1' ? 24 : 2
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(DEV_URL, { signal: AbortSignal.timeout(600) })
      if (res.ok) return true
    } catch {
      /* todavía no está */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

/** En desarrollo Vite puede tardar un par de segundos en levantar. */
async function loadWithRetry(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      await win.loadURL(url)
      return
    } catch {
      await new Promise((r) => setTimeout(r, 400))
    }
  }
  win.loadURL(`data:text/html,<h1>No se pudo cargar ${url}</h1>`)
}

app.whenReady().then(async () => {
  const info = await startServer()
  serverPort = info.port

  // El user-agent solo se cambia en las particiones de los paneles de IA.
  const { session } = await import('electron')
  session.defaultSession.webRequest.onBeforeSendHeaders((details, cb) => {
    if (details.webContentsId && details.url.startsWith('http') && !details.url.includes('127.0.0.1')) {
      details.requestHeaders['User-Agent'] = CHROME_UA
    }
    cb({ requestHeaders: details.requestHeaders })
  })

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'prolife',
        submenu: [
          { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
          { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
          { type: 'separator' }, { role: 'quit', label: 'Salir' },
        ],
      },
      { label: 'Editar', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    ])
  )

  await createWindow()
})

app.on('window-all-closed', () => app.quit())
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

/* --------------------------------------------------------------- puente IPC --- */

/**
 * Segundos desde la última interacción del usuario con el ORDENADOR. A diferencia
 * de escuchar eventos del DOM, esto también ve la actividad dentro de un PDF o de
 * un panel de IA, que viven en otro proceso.
 */
ipcMain.handle('activity:state', () => ({
  idleSeconds: powerMonitor.getSystemIdleTime(),
  focused: win?.isFocused() ?? false,
  state: powerMonitor.getSystemIdleState(60),
}))

ipcMain.handle('app:info', () => ({ electron: true, port: serverPort, version: app.getVersion() }))
ipcMain.handle('shell:openExternal', (_e, url) => (/^https?:\/\//i.test(url) ? shell.openExternal(url) : null))
