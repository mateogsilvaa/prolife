const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('prolife', {
  isDesktop: true,
  /** { idleSeconds, focused, state } — idle medido por el sistema operativo. */
  activity: () => ipcRenderer.invoke('activity:state'),
  info: () => ipcRenderer.invoke('app:info'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  onFocus: (fn) => ipcRenderer.on('win:focus', fn),
  onBlur: (fn) => ipcRenderer.on('win:blur', fn),
})
