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
  /** Versión del db.json cuando la escribió una app más nueva que esta. */
  const [future, setFuture] = useState(null)
  const futureRef = useRef(null)
  useEffect(() => { futureRef.current = future }, [future])
  /**
   * La app abierta en la tablet sin el ordenador delante: lo que se ve es la
   * última copia que guardó el service worker. Se puede consultar todo, pero no
   * se escribe nada — guardar en una copia vieja sería perder trabajo.
   */
  const [offline, setOffline] = useState(false)
  const offlineRef = useRef(false)
  useEffect(() => { offlineRef.current = offline }, [offline])
  const [back, setBack] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        // Solo la base es imprescindible para pintar algo. La configuración es
        // del ordenador y no se cachea, así que sin él no llega: pedirlas juntas
        // hacía que la tablet sin conexión enseñara «el servidor no responde»
        // en vez de lo último que sí tenía guardado.
        const d = await api.getDb()
        stamp.current = d._stamp || 0
        setFuture(d._future || null)
        setOffline(!!d._stale)
        setDb(d)
      } catch (e) {
        setError(e.status === 401 ? { auth: true, message: e.message } : { message: e.message })
        return
      }
      api.getConfig().then(setConfig).catch(() => {})
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
    // Con un fichero de una versión más nueva el servidor rechaza cada guardado:
    // insistir solo llenaría la pantalla de avisos. El cartel de arriba ya lo dice.
    if (futureRef.current || offlineRef.current) return
    try {
      const res = await api.putDb(data)
      stamp.current = res.stamp || stamp.current
    } catch (e) {
      // El servidor se niega a escribir encima de un fichero de una versión más
      // nueva: no es un fallo pasajero, así que se avisa arriba y no se reintenta.
      if (/versión más nueva/i.test(e.message)) setFuture((v) => v || true)
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
        const { stamp: disk, future: diskFuture } = await api.dbStamp()
        if (diskFuture) setFuture(diskFuture)
        // Volvió el ordenador: no se recarga solo por si estabas leyendo algo,
        // pero se ofrece, que es lo mismo que se hace con los cambios de fuera.
        if (offlineRef.current) setBack(true)
        // margen de un segundo: el mtime del disco no es exacto
        else if (disk && Math.abs(disk - stamp.current) > 1500) setRemote(true)
      } catch {
        /* seguimos sin ordenador; el aviso de arriba ya lo dice */
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
      if (offlineRef.current) {
        toast('Sin conexión con el ordenador: ahora mismo solo se puede consultar.', 'err')
        return
      }
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
    [flush, toast]
  )

  useEffect(() => {
    const onLeave = () => {
      if (!pending.current) return
      // `sendBeacon` no admite cabeceras, así que desde la tablet moriría con un
      // 401 en silencio. `keepalive` sí las lleva y sobrevive igual al cierre;
      // su límite de 64 KB es el mismo que tenía el beacon, así que no se pierde
      // nada que antes funcionara.
      api.putDb(pending.current, { keepalive: true }).catch(() => {})
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [])

  const value = useMemo(
    () => ({
      db, config, setConfig, error, update, toast, toasts, remote, reload,
      dismissRemote: () => setRemote(false),
      future, offline, back,
    }),
    [db, config, error, update, toast, toasts, remote, reload, future, offline, back]
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
