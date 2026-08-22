import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useStore, uid, isDesktop } from './store.jsx'
import { today } from './date.js'

const Ctx = createContext(null)
export const useTracker = () => useContext(Ctx)

/** Si dos tramos del mismo sitio caen a menos de esto, se fusionan en uno. */
const MERGE_GAP_MS = 10 * 60 * 1000

/** La sesión en marcha sobrevive a un cierre accidental de la app. */
const FOCUS_KEY = 'prolife.focus'

const readFocus = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(FOCUS_KEY) || 'null')
    return raw && raw.key ? raw : null
  } catch {
    return null
  }
}

/**
 * Medición del tiempo, por dos caminos que conviven.
 *
 * 1. **Sesión de trabajo** (`start` / `stop`). La eliges tú, dura hasta que la
 *    pares y no le importa en qué pantalla estés ni si la app tiene el foco:
 *    puedes estar en el Word, en un PDF fuera, en clase o con el libro. Es lo
 *    que hace que medir no te obligue a trabajar dentro de la app.
 *
 * 2. **Detección automática**, la de siempre: si NO hay sesión en marcha, el
 *    tiempo se atribuye al espacio de trabajo abierto, y solo mientras la
 *    ventana tenga el foco y el sistema registre actividad.
 *
 * Todo lo registrado por cualquiera de los dos caminos se corrige después.
 */
export function TrackerProvider({ children }) {
  const { db, update } = useStore()

  const [focus, setFocusState] = useState(readFocus)
  const [viewContext, setViewContext] = useState(null)
  const [engaged, setEngaged] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [paused, setPaused] = useState(false)
  const [stale, setStale] = useState(false)

  const ctxRef = useRef(null)
  const focusRef = useRef(focus)
  const viewRef = useRef(null)
  const secondsRef = useRef(focus?.accumulated || 0)
  const startedRef = useRef(focus ? focus.startedAt : null)
  const committedRef = useRef(focus?.accumulated || 0)
  const domActivity = useRef(Date.now())
  const domFocus = useRef(true)

  const settings = db?.settings
  const idleLimit = settings?.idleTimeoutSec ?? 180
  const minSegment = settings?.minSegmentSec ?? 60
  // Una sesión elegida a mano aguanta mucho más sin actividad: puedes estar
  // leyendo en papel. 0 = no pararla nunca.
  const manualIdle = settings?.manualIdleSec ?? 1800
  const enabled = settings?.autoTrack !== false

  ctxRef.current = focus || viewContext

  /* --------------------------------------------------- señales de actividad */

  useEffect(() => {
    const mark = () => { domActivity.current = Date.now() }
    const evs = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll']
    evs.forEach((e) => window.addEventListener(e, mark, { passive: true }))
    const onFocus = () => { domFocus.current = true; mark() }
    const onBlur = () => { domFocus.current = false }
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => {
      evs.forEach((e) => window.removeEventListener(e, mark))
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  /**
   * En escritorio se pregunta al sistema operativo: así también cuenta la
   * actividad dentro de un PDF o de otro programa, que corren en otro proceso
   * y cuyos eventos nunca llegan a este documento.
   */
  const readActivity = useCallback(async () => {
    if (isDesktop) {
      try {
        const a = await window.prolife.activity()
        return { focused: a.focused, idle: a.idleSeconds }
      } catch {
        /* si falla el puente, se usa el método del navegador */
      }
    }
    return {
      focused: domFocus.current && document.visibilityState === 'visible' && document.hasFocus(),
      idle: (Date.now() - domActivity.current) / 1000,
    }
  }, [])

  /* ------------------------------------------------------------- persistir */

  const commit = useCallback(
    (ctx, secs) => {
      if (!ctx || secs <= 0) return
      const startedAt = startedRef.current || Date.now()
      update((d) => {
        const day = today()
        const prev = [...d.sessions]
          .reverse()
          .find(
            (s) =>
              s.source === (ctx.manual ? 'focus' : 'auto') &&
              s.date === day &&
              s.area === ctx.area &&
              (s.refId || null) === (ctx.refId || null) &&
              (s.taskId || null) === (ctx.taskId || null) &&
              Date.now() - (s.end || 0) < MERGE_GAP_MS
          )
        if (prev) {
          prev.seconds += secs
          prev.end = Date.now()
        } else {
          d.sessions.push({
            id: uid('s'),
            area: ctx.area,
            refId: ctx.refId || null,
            taskId: ctx.taskId || null,
            label: ctx.label,
            date: day,
            start: startedAt,
            end: Date.now(),
            seconds: secs,
            source: ctx.manual ? 'focus' : 'auto',
          })
        }
      })
    },
    [update]
  )

  /**
   * Persiste lo que falte del tramo actual. `committedRef` recuerda cuánto se
   * escribió ya, para que los volcados periódicos no dupliquen ni descarten:
   * el mínimo de duración se aplica al tramo entero, no a cada volcado.
   * Una sesión elegida a mano no tiene mínimo: si la paraste, la querías.
   */
  const persistPending = useCallback(() => {
    const ctx = ctxRef.current
    const total = secondsRef.current
    if (!ctx) return
    if (!ctx.manual && total < minSegment) return
    const delta = total - committedRef.current
    if (delta <= 0) return
    commit(ctx, delta)
    committedRef.current = total
    if (ctx.manual) {
      const next = { ...focusRef.current, accumulated: total }
      focusRef.current = next
      localStorage.setItem(FOCUS_KEY, JSON.stringify(next))
    }
  }, [commit, minSegment])

  const reset = useCallback(() => {
    secondsRef.current = 0
    committedRef.current = 0
    startedRef.current = null
    setSeconds(0)
    setStale(false)
  }, [])

  /* -------------------------------------------------- sesión elegida a mano */

  /** Empieza a contar en algo concreto y no pares hasta que te lo digan. */
  const start = useCallback(
    (target) => {
      if (!target) return
      persistPending()
      reset()
      const next = {
        ...target,
        manual: true,
        key: `${target.area}:${target.refId || '-'}:${target.taskId || '-'}`,
        startedAt: Date.now(),
        accumulated: 0,
      }
      focusRef.current = next
      startedRef.current = next.startedAt
      localStorage.setItem(FOCUS_KEY, JSON.stringify(next))
      setFocusState(next)
      setPaused(false)
    },
    [persistPending, reset]
  )

  /** Para la sesión y devuelve lo que ha durado. */
  const stop = useCallback(() => {
    persistPending()
    const total = secondsRef.current
    focusRef.current = null
    localStorage.removeItem(FOCUS_KEY)
    setFocusState(null)
    reset()
    return total
  }, [persistPending, reset])

  /** El contexto lo declara la vista abierta; null = nada productivo. */
  const setContext = useCallback(
    (next) => {
      const cur = viewRef.current
      if ((cur?.key || null) === (next?.key || null)) {
        viewRef.current = next // mismo sitio, etiqueta quizá actualizada
        return
      }
      // Con una sesión en marcha, cambiar de pantalla no interrumpe nada.
      if (!focusRef.current) {
        persistPending()
        reset()
        startedRef.current = next ? Date.now() : null
      }
      viewRef.current = next
      setViewContext(next)
    },
    [persistPending, reset]
  )

  /* ------------------------------------------------------------ latido 1 s */

  useEffect(() => {
    let alive = true
    const tick = async () => {
      const { focused, idle } = await readActivity()
      if (!alive) return
      const ctx = ctxRef.current

      const active = ctx?.manual
        ? enabled && !paused && (manualIdle === 0 || idle < manualIdle)
        : enabled && !paused && focused && idle < idleLimit

      setEngaged(active)
      // Con la sesión a mano avisamos de que llevas un rato sin tocar nada,
      // por si te la dejaste puesta; no la paramos por eso.
      if (ctx?.manual) setStale(idle > 300 && idle < (manualIdle || Infinity))
      if (!active || !ctx) return

      secondsRef.current += 1
      setSeconds(secondsRef.current)

      // se vuelca a disco cada 15 s para no perder nada si se cierra de golpe
      if (secondsRef.current % 15 === 0) persistPending()
    }
    const int = setInterval(tick, 1000)
    return () => { alive = false; clearInterval(int) }
  }, [readActivity, enabled, paused, idleLimit, manualIdle, persistPending])

  // guardar lo pendiente al cerrar; la sesión a mano se retoma al volver
  useEffect(() => {
    const onLeave = () => persistPending()
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [persistPending])

  const value = useMemo(
    () => ({
      context: focus || viewContext,
      focus,
      viewContext,
      engaged, seconds, paused, stale,
      setPaused, setContext, start, stop,
      flush: persistPending,
      enabled,
    }),
    [focus, viewContext, engaged, seconds, paused, stale, setContext, start, stop, persistPending, enabled]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/**
 * Declara desde una vista qué se está haciendo. Se limpia al desmontar, así que
 * salir de la pantalla detiene el conteo automáticamente. Si hay una sesión de
 * trabajo en marcha, manda ella.
 */
export function useTrackingContext(ctx) {
  const tracker = useTracker()
  const key = ctx ? `${ctx.area}:${ctx.refId || '-'}:${ctx.taskId || '-'}` : null
  const label = ctx?.label

  useEffect(() => {
    if (!tracker) return
    tracker.setContext(key ? { ...ctx, key } : null)
    return () => tracker.setContext(null)
    // el contexto se identifica por `key`; la etiqueta puede cambiar sin reiniciar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, label])
}
