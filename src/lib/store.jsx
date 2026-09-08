import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, enDrive } from './api.js'
import { iso, today } from './date.js'
import { saveDbSnapshot } from './offline.js'
import { applyOp } from '../../server/ops.js'
import { cola, enCola, encolar, quitar } from './queue.js'

const Ctx = createContext(null)
export const useStore = () => useContext(Ctx)

export const uid = (p = 'x') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

/** Primera espera antes de reintentar un guardado que ha fallado. */
const RETRY_MS = 2000
/** Se dobla en cada intento hasta este escalón: 2 s, 4 s … 64 s. */
const RETRY_MAX_STEP = 6

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
  /**
   * Hay algo escrito que todavía no ha llegado al disco porque el guardado
   * falló. Se enseña arriba y fijo: un aviso que se va solo dejaría la pantalla
   * enseñando como guardado algo que no lo está.
   */
  const [unsaved, setUnsaved] = useState(false)
  const retryTimer = useRef(null)
  const flushRef = useRef(null)
  /** Racha de fallos en curso: sirve para avisar una vez, no una por intento. */
  const failing = useRef(false)
  const attempt = useRef(0)
  /** Cambios apuntados sin el ordenador que esperan a poder contárselo. */
  const [queued, setQueued] = useState(() => enCola())
  const enviarColaRef = useRef(null)

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
        // Lo que acaba de llegar del ordenador es lo que se enseñará cuando no
        // esté. Lo guarda la página porque en la primera visita el service
        // worker aún no está al mando y esa carga se le escapa.
        if (!d._stale) {
          saveDbSnapshot(d)
          // Lo apuntado en otra sesión sin ordenador sigue en la cola: se cuenta
          // ahora, que es la primera oportunidad de hacerlo.
          if (enCola()) await enviarColaRef.current?.()
        }
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
    /**
     * Dos casos en los que el cambio se descarta a propósito y no se reintenta:
     * con un fichero de una versión más nueva el servidor va a rechazar cada
     * guardado, y en modo consulta lo que hay en pantalla salió de una copia que
     * puede estar vieja — escribirla encima sería pisar lo que tenga el
     * ordenador. Los dos tienen su cartel fijo arriba diciéndolo.
     */
    if (futureRef.current || offlineRef.current) return
    try {
      const res = await api.putDb(data)
      stamp.current = res.stamp || stamp.current
      attempt.current = 0
      // La copia para consultar sin el ordenador se queda al día con lo que
      // acaba de entrar. Si solo se guardara al cargar, una tarde entera de
      // trabajo en la tablet no se vería al abrirla luego sin el ordenador.
      saveDbSnapshot(data)
      if (failing.current) {
        failing.current = false
        setUnsaved(false)
        toast('Guardado: ya está todo en el disco')
      }
    } catch (e) {
      // El servidor se niega a escribir encima de un fichero de una versión más
      // nueva: no es un fallo pasajero, así que se avisa arriba y no se reintenta.
      if (/versión más nueva/i.test(e.message)) {
        setFuture((v) => v || true)
        toast('No se pudo guardar: ' + e.message, 'err')
        return
      }
      /**
       * Cualquier otro fallo puede ser pasajero —un parpadeo de la wifi desde la
       * tablet es el caso normal—. Lo que no puede pasar es que el cambio se
       * quede solo en la pantalla: vuelve a la cola, para que lo recoja el
       * reintento y también el guardado de última hora al cerrar. Si mientras
       * tanto has tocado algo, eso ya lleva esto dentro y manda lo nuevo.
       */
      if (!pending.current) pending.current = data
      // Se espera un poco más en cada intento, hasta un tope: si el ordenador
      // está apagado de verdad, insistir cada segundo no lo va a encender.
      attempt.current = Math.min(attempt.current + 1, RETRY_MAX_STEP)
      clearTimeout(retryTimer.current)
      retryTimer.current = setTimeout(() => flushRef.current?.(), RETRY_MS * 2 ** (attempt.current - 1))
      // Un aviso por racha, no uno por intento.
      if (!failing.current) {
        failing.current = true
        setUnsaved(true)
        toast('No se ha podido guardar: ' + e.message + '. Se sigue intentando.', 'err')
      }
    }
  }, [toast])

  useEffect(() => { flushRef.current = flush }, [flush])
  useEffect(() => () => clearTimeout(retryTimer.current), [])

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
        // Volvió el ordenador: lo primero, contarle lo apuntado mientras no
        // estaba — antes de ofrecer recargar, o la recarga traería su base sin
        // esos cambios y parecería que se han perdido. No se recarga solo, por
        // si estabas leyendo algo: se ofrece, igual que con los cambios de fuera.
        if (offlineRef.current) {
          await enviarColaRef.current?.()
          setBack(true)
        }
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
      // Con la app contra Drive no hay servidor al que mandarle la base entera,
      // y subirla desde aquí machacaría lo que hubieras hecho en el ordenador.
      // Lo que sí se puede apuntar va por `applyChange`, como cambio suelto.
      if (enDrive) {
        toast('Desde la tablet esto no se puede cambiar: hazlo en el ordenador.', 'err')
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

  /**
   * Manda a la cola lo que se pueda apuntar sin el ordenador.
   *
   * Sin conexión, `update()` se niega y hace bien: manda la base entera, y
   * escribirla desde una copia vieja machacaría lo que hayas hecho en el
   * ordenador. Una operación es otra cosa —«marca esta clase», «tacha esta
   * tarea»— y se aplica sobre el `db.json` de cuando el ordenador vuelva, sin
   * tocar nada más. Aquí se pinta ya, para que la app responda como siempre.
   *
   * Con el ordenador delante no se encola nada: se guarda por el camino de
   * siempre, que ya funciona. Menos caminos, menos sitios donde equivocarse.
   */
  const applyChange = useCallback(
    (op) => {
      // Contra Drive nunca se guarda la base entera: todo va como operación al
      // buzón, esté o no la tablet con conexión en ese momento.
      if (!offlineRef.current && !enDrive) {
        update((d) => applyOp(d, op))
        return
      }
      const entera = { ...op, id: uid('op'), at: Date.now() }
      setDb((prev) => {
        if (!prev) return prev
        const next = structuredClone(prev)
        const error = applyOp(next, entera)
        if (error) { toast(error, 'err'); return prev }
        encolar(entera)
        setQueued(enCola())
        // Sin ordenador la cola espera a que vuelva; contra Drive, en cambio,
        // el buzón está a un viaje de distancia y no hay por qué esperar.
        if (enDrive) setTimeout(() => enviarColaRef.current?.(), 0)
        return next
      })
    },
    [update, toast]
  )

  /**
   * Le cuenta al ordenador lo apuntado mientras no estaba. Se quitan de la cola
   * por id y no vaciándola: entre que se manda y que contesta puedes haber
   * apuntado otra cosa, y esa todavía no ha salido.
   */
  const enviarCola = useCallback(async () => {
    const ops = cola()
    if (!ops.length) return null
    try {
      const r = await api.sendOps(ops)
      quitar(ops.map((o) => o.id))
      setQueued(enCola())
      stamp.current = r.stamp || stamp.current
      // Contra Drive nada se ha aplicado todavía: se ha dejado en el buzón, y
      // lo aplicará el ordenador la próxima vez que abra la app. Decir «hecho
      // en el ordenador» ahí sería mentira, y encima `applied` no existe.
      if (r.buzon) {
        const n = r.queued || ops.length
        toast(`${n} ${n === 1 ? 'cambio guardado' : 'cambios guardados'} en Drive · el ordenador lo recoge al abrirse`)
      } else {
        const perdidas = r.skipped?.length || 0
        toast(
          `${r.applied} ${r.applied === 1 ? 'cambio apuntado' : 'cambios apuntados'} en el ordenador` +
            (perdidas ? ` · ${perdidas} ya no valían` : '')
        )
      }
      return r
    } catch (e) {
      // La cola se queda como estaba: se vuelve a intentar al próximo latido.
      toast('No se han podido enviar los cambios: ' + e.message, 'err')
      return null
    }
  }, [toast])

  useEffect(() => { enviarColaRef.current = enviarCola }, [enviarCola])

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
      future, offline, back, unsaved,
      retryNow: () => flushRef.current?.(),
      applyChange, queued,
      sendQueue: () => enviarColaRef.current?.(),
    }),
    [db, config, error, update, toast, toasts, remote, reload, future, offline, back, unsaved, applyChange, queued]
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
