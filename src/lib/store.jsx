import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'
import { iso, today } from './date.js'

const Ctx = createContext(null)
export const useStore = () => useContext(Ctx)

export const uid = (p = 'x') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

export const PALETTE = [
  '#bf3f24', '#3c5a78', '#4f6b4a', '#a5711b', '#6b4a6b',
  '#2f6f6b', '#8c4a2f', '#43537a', '#77603a', '#5a5a52',
]

export const AREAS = {
  uni: { label: 'Universidad', color: '#3c5a78' },
  work: { label: 'Trabajo', color: '#bf3f24' },
  sport: { label: 'Atletismo', color: '#4f6b4a' },
  life: { label: 'Personal', color: '#a5711b' },
}

export const isDesktop = typeof window !== 'undefined' && !!window.prolife?.isDesktop

export function Provider({ children }) {
  const [db, setDb] = useState(null)
  const [config, setConfig] = useState(null)
  const [error, setError] = useState(null)
  const [toasts, setToasts] = useState([])

  const saveTimer = useRef(null)
  const pending = useRef(null)
  /** Marca del db.json que conocemos. Si cambia sola, lo tocó otro ordenador. */
  const stamp = useRef(0)
  const [remote, setRemote] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const [d, c] = await Promise.all([api.getDb(), api.getConfig()])
        stamp.current = d._stamp || 0
        setDb(d)
        setConfig(c)
      } catch (e) {
        setError(e.message)
      }
    })()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = db?.settings?.theme === 'ink' ? 'ink' : 'paper'
  }, [db?.settings?.theme])

  const toast = useCallback((msg, kind) => {
    const id = uid('t')
    setToasts((t) => [...t, { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 5200 : 2600)
  }, [])

  const flush = useCallback(async () => {
    if (!pending.current) return
    const data = pending.current
    pending.current = null
    try {
      const res = await api.putDb(data)
      stamp.current = res.stamp || stamp.current
    } catch (e) {
      toast('No se pudo guardar: ' + e.message, 'err')
    }
  }, [toast])

  /**
   * Con el directorio dentro de Google Drive, el otro ordenador puede haber
   * escrito el mismo fichero. No se resuelve solo: se avisa y se recarga, que
   * es lo honesto. Lo tuyo sin guardar se guarda antes de mirar.
   */
  useEffect(() => {
    if (!db) return
    const int = setInterval(async () => {
      if (pending.current || document.hidden) return
      try {
        const { stamp: disk } = await api.dbStamp()
        // margen de un segundo: el mtime del disco no es exacto
        if (disk && Math.abs(disk - stamp.current) > 1500) setRemote(true)
      } catch {
        /* el servidor ya se queja por otro lado */
      }
    }, 20000)
    return () => clearInterval(int)
  }, [db])

  const reload = useCallback(async () => {
    await flush()
    location.reload()
  }, [flush])

  /** update(draft => { ...mutar... }) — persiste con debounce. */
  const update = useCallback(
    (recipe) => {
      setDb((prev) => {
        if (!prev) return prev
        const next = structuredClone(prev)
        recipe(next)
        pending.current = next
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(flush, 400)
        return next
      })
    },
    [flush]
  )

  useEffect(() => {
    const onLeave = () => {
      if (pending.current) {
        navigator.sendBeacon?.('/api/db', new Blob([JSON.stringify(pending.current)], { type: 'application/json' }))
      }
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [])

  const value = useMemo(
    () => ({ db, config, setConfig, error, update, toast, toasts, remote, reload, dismissRemote: () => setRemote(false) }),
    [db, config, error, update, toast, toasts, remote, reload]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/* ------------------------------------------------------------- selectores */

export const totalSeconds = (sessions) => sessions.reduce((a, s) => a + (s.seconds || 0), 0)

export function entityOf(db, area, refId) {
  if (!refId) return null
  if (area === 'uni') return db.subjects.find((s) => s.id === refId) || null
  if (area === 'work') return db.projects.find((p) => p.id === refId) || null
  return null
}

export function refLabel(db, s) {
  const e = entityOf(db, s.area, s.refId)
  if (e) return e.name
  if (s.area === 'sport') return 'Atletismo'
  return s.label || AREAS[s.area]?.label || 'Otros'
}

export function refColor(db, s) {
  return entityOf(db, s.area, s.refId)?.color || AREAS[s.area]?.color || 'var(--ink-3)'
}

/** Nombre de carpeta seguro para el disco. */
export const slug = (s) =>
  String(s).trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').slice(0, 80) || 'sin-nombre'

export { iso, today }
