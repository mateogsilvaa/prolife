import { app, BrowserWindow, powerMonitor, ipcMain, shell, Menu, dialog, session } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer } from '../server/app.js'
import { readConfig } from '../server/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEV_URL = 'http://localhost:5199'

let win = null
let serverPort = 4321

/**
 * Chrome real en el user-agent del navegador empotrado. Con el de Electron
 * muchos sitios sirven una versión rota o bloquean el login.
 */
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/**
 * Dos prolife a la vez no pueden: querrían el mismo puerto y el mismo `db.json`.
 * Sin esto, el segundo no conseguía escuchar, el fallo reventaba antes de crear
 * la ventana y nadie lo recogía: se quedaba vivo, sin ventana y sin decir nada.
 * Ahora le pasa el turno al que ya estaba.
 */
const primeraInstancia = app.requestSingleInstanceLock()
if (!primeraInstancia) app.quit()

app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#f5f3ee',
    show: false,
    autoHideMenuBar: true,
    // El instalador ya lleva el icono de verdad (ver `build.icon` en package.json,
    // que electron-builder graba dentro del .exe); esto es lo que evita que la
    // ventana en sí —barra de tareas, Alt+Tab— enseñe el átomo de Electron
    // mientras se desarrolla o se corre sin empaquetar.
    icon: path.join(__dirname, 'icon.png'),
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
  if (!primeraInstancia) return

  let info
  try {
    info = await startServer()
  } catch (err) {
    // El puerto lo puede tener cogido cualquier otro programa, no solo otro
    // prolife. Callarse y no abrir la ventana no es una opción: hasta ahora el
    // proceso se quedaba vivo sin nada en pantalla y sin manera de saber por qué.
    const puerto = readConfig().port
    // También por la consola: en una app empaquetada el cuadro es lo que ve el
    // usuario, pero esto es lo que queda si alguien mira el registro.
    console.error(`prolife no ha podido arrancar el servidor en el puerto ${puerto}:`, err.message)
    dialog.showErrorBox(
      'prolife no ha podido arrancar',
      err.code === 'EADDRINUSE'
        ? `Ya hay algo escuchando en el puerto ${puerto} de este ordenador.\n\n` +
          `Si es otro prolife, usa esa ventana. Si es otro programa, cambia el puerto ` +
          `en el archivo de configuración (${path.join(app.getPath('home'), '.prolife', 'config.json')}) y vuelve a abrir.`
        : `No se ha podido arrancar el servidor interno:\n\n${err.message}`
    )
    app.quit()
    return
  }
  serverPort = info.port

  /**
   * El user-agent va sobre la partición del navegador empotrado, que es la
   * única que sale a internet. Estaba puesto sobre `session.defaultSession`, y
   * un <webview> con `partition` tiene su propia sesión: allí no llegaba nunca
   * —comprobado— y solo afectaba a las peticiones de la propia ventana, que no
   * pasan de las tipografías de Google.
   *
   * `setUserAgent` en vez de un filtro de cabeceras porque cambia también
   * `navigator.userAgent`, y muchos sitios miran eso desde JavaScript.
   *
   * `persist:vscode` se queda como está: habla con un `code serve-web` local.
   */
  session.fromPartition('persist:browser').setUserAgent(CHROME_UA)

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
