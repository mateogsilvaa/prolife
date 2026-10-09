const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('prolife', {
  isDesktop: true,
  /** { idleSeconds, focused, state } — idle medido por el sistema operativo. */
  activity: () => ipcRenderer.invoke('activity:state'),
  info: () => ipcRenderer.invoke('app:info'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  onFocus: (fn) => ipcRenderer.on('win:focus', fn),
  onBlur: (fn) => ipcRenderer.on('win:blur', fn),
  /** Garmin Connect: se entra en la página oficial de Garmin, en una ventana de la app. */
  garmin: {
    estado: () => ipcRenderer.invoke('garmin:estado'),
    entrar: () => ipcRenderer.invoke('garmin:entrar'),
    sincronizar: () => ipcRenderer.invoke('garmin:sincronizar'),
    salir: () => ipcRenderer.invoke('garmin:salir'),
  },
})
