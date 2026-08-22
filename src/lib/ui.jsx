import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

const Ctx = createContext(null)
export const useUI = () => useContext(Ctx)

const read = (k, def) => {
  try {
    const v = localStorage.getItem(k)
    return v === null ? def : JSON.parse(v)
  } catch {
    return def
  }
}

/** Estado de la interfaz que decide cuánto sitio queda para trabajar. */
export function UIProvider({ children }) {
  const [sidebar, setSidebar] = useState(() => read('prolife.ui.sidebar', true))
  const [zen, setZen] = useState(false)
  const [dock, setDock] = useState(false)
  const [dockWidth, setDockWidth] = useState(() => read('prolife.ui.dockw', 430))

  useEffect(() => { localStorage.setItem('prolife.ui.sidebar', JSON.stringify(sidebar)) }, [sidebar])
  useEffect(() => { localStorage.setItem('prolife.ui.dockw', JSON.stringify(dockWidth)) }, [dockWidth])

  // en modo concentración desaparece todo lo que no sea el trabajo
  useEffect(() => {
    document.documentElement.classList.toggle('zen', zen)
    return () => document.documentElement.classList.remove('zen')
  }, [zen])

  const value = useMemo(
    () => ({
      sidebar, setSidebar, toggleSidebar: () => setSidebar((v) => !v),
      zen, setZen, toggleZen: () => setZen((v) => !v),
      dock, setDock, toggleDock: () => setDock((v) => !v),
      dockWidth, setDockWidth,
    }),
    [sidebar, zen, dock, dockWidth]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
