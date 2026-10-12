/**
 * De lo que devuelve Garmin Connect a lo que guarda prolife. Funciones puras,
 * aparte de `electron/garmin.js`, para poder probarlas sin Electron ni cuenta.
 * Vive en `server/` porque el instalador empaqueta esta carpeta.
 */

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const limpio = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined))

/** Un registro pequeño por día. */
export function resumirDia(fecha, resumen, sueno, hrv) {
  const r = resumen || {}
  const dto = sueno?.dailySleepDTO || {}
  const s = limpio({
    seconds: num(dto.sleepTimeSeconds),
    deep: num(dto.deepSleepSeconds),
    light: num(dto.lightSleepSeconds),
    rem: num(dto.remSleepSeconds),
    awake: num(dto.awakeSleepSeconds),
    start: num(dto.sleepStartTimestampLocal),
    end: num(dto.sleepEndTimestampLocal),
    score: num(dto.sleepScores?.overall?.value),
    restless: num(sueno?.restlessMomentsCount),
    respiration: num(dto.averageRespirationValue),
    stress: num(dto.avgSleepStress),
    spo2: num(dto.averageSpO2Value),
    spo2Min: num(dto.lowestSpO2Value),
    bbGain: num(sueno?.bodyBatteryChange),
    restingHr: num(sueno?.restingHeartRate),
    need: num(dto.sleepNeed?.actual ?? dto.sleepNeed),
  })
  const dia = limpio({
    date: fecha,
    steps: num(r.totalSteps),
    stepGoal: num(r.dailyStepGoal),
    distance: num(r.totalDistanceMeters),
    kcal: num(r.totalKilocalories),
    activeKcal: num(r.activeKilocalories),
    restingHr: num(r.restingHeartRate),
    minHr: num(r.minHeartRate),
    maxHr: num(r.maxHeartRate),
    stress: num(r.averageStressLevel) >= 0 ? num(r.averageStressLevel) : null,
    maxStress: num(r.maxStressLevel) >= 0 ? num(r.maxStressLevel) : null,
    bbHigh: num(r.bodyBatteryHighestValue),
    bbWake: num(r.bodyBatteryAtWakeTime),
    bbNow: num(r.bodyBatteryMostRecentValue),
    bbLow: num(r.bodyBatteryLowestValue),
    bbCharged: num(r.bodyBatteryChargedValue),
    bbDrained: num(r.bodyBatteryDrainedValue),
    floors: num(r.floorsAscended),
    intensity: num(r.moderateIntensityMinutes) !== null || num(r.vigorousIntensityMinutes) !== null
      ? (num(r.moderateIntensityMinutes) || 0) + 2 * (num(r.vigorousIntensityMinutes) || 0)
      : null,
  })
  // VFC nocturna: la media de anoche y el estado que calcula Garmin, si el reloj lo da.
  const h = hrv?.hrvSummary
  if (h) {
    const v = limpio({ hrv: num(h.lastNightAvg), hrvWeek: num(h.weeklyAvg), hrvStatus: h.status || null })
    Object.assign(dia, v)
  }
  if (Object.keys(s).length) dia.sleep = s
  // Un día sin nada medido (el reloj no se llevó) no merece registro.
  return Object.keys(dia).length > 1 ? dia : null
}

export function resumirActividad(a, zonas) {
  const fecha = String(a.startTimeLocal || '').slice(0, 10)
  if (!a.activityId || !fecha) return null
  return limpio({
    id: String(a.activityId),
    date: fecha,
    start: String(a.startTimeLocal || '').slice(11, 16) || null,
    name: a.activityName || null,
    type: a.activityType?.typeKey || null,
    seconds: num(a.duration),
    moving: num(a.movingDuration),
    distance: num(a.distance),
    avgHr: num(a.averageHR),
    maxHr: num(a.maxHR),
    kcal: num(a.calories),
    speed: num(a.averageSpeed),
    elevation: num(a.elevationGain),
    cadence: num(a.averageRunningCadenceInStepsPerMinute),
    aerobicTE: num(a.aerobicTrainingEffect),
    anaerobicTE: num(a.anaerobicTrainingEffect),
    laps: num(a.lapCount),
    // Segundos en cada zona de pulso de Garmin (1 a 5), para la carga ECOs.
    zones: Array.isArray(zonas) && zonas.length
      ? [1, 2, 3, 4, 5].map((k) => num(zonas.find((z) => Number(z.zoneNumber) === k)?.secsInZone) || 0)
      : null,
  })
}


/**
 * Lo que corre DENTRO de la página de Garmin: mismas cookies, mismo origen y
 * misma huella de navegador que si lo pidieras tú desde allí.
 */
export const SCRIPT = (fechas, conZonas = []) => `(async (fechas, conZonas) => {
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content
  if (!csrf) return { sinSesion: true }
  const g = async (p) => {
    const r = await fetch('/gc-api/' + p, { headers: { 'connect-csrf-token': csrf, Accept: '*/*' }, credentials: 'include' })
    if (r.status === 401 || r.status === 403) throw new Error('SIN_SESION ' + r.status)
    if (r.status === 204) return null
    if (!r.ok) throw new Error(r.status + ' en ' + p.split('?')[0])
    const t = await r.text()
    return t ? JSON.parse(t) : null
  }
  try {
    const ajustes = await g('userprofile-service/userprofile/settings')
    const nombre = ajustes && ajustes.displayName
    if (!nombre) return { error: 'Garmin no ha devuelto el perfil' }
    const dias = {}
    const fallos = []
    for (const d of fechas) {
      const [resumen, sueno, hrv] = await Promise.all([
        g('usersummary-service/usersummary/daily/' + encodeURIComponent(nombre) + '?calendarDate=' + d).catch((e) => { fallos.push(d + ' resumen: ' + e.message); return null }),
        g('sleep-service/sleep/dailySleepData?date=' + d + '&nonSleepBufferMinutes=60').catch((e) => { fallos.push(d + ' sueño: ' + e.message); return null }),
        // No todos los relojes dan VFC (HRV): si no hay, se queda en null sin ruido.
        g('hrv-service/hrv/' + d).catch(() => null),
      ])
      dias[d] = { resumen, sueno, hrv }
    }
    const actividades = await g('activitylist-service/activities/search/activities?limit=60&start=0').catch((e) => { fallos.push('actividades: ' + e.message); return [] })
    // El tiempo en cada zona de pulso: es lo que hace falta para la carga
    // objetiva (ECOs). Solo de las que aún no lo tienen guardado.
    const zonas = {}
    for (const a of (actividades || []).slice(0, 60)) {
      if (!a || !a.activityId || conZonas.includes(String(a.activityId))) continue
      const z = await g('activity-service/activity/' + a.activityId + '/hrTimeInZones').catch(() => null)
      if (Array.isArray(z)) zonas[a.activityId] = z
    }
    return { nombre, dias, actividades, zonas, fallos }
  } catch (e) {
    return String(e.message).startsWith('SIN_SESION') ? { sinSesion: true } : { error: e.message }
  }
})(${JSON.stringify(fechas)}, ${JSON.stringify(conZonas)})`
