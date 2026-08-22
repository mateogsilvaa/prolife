import { uid } from './store.jsx'
import { today, iso, addDays, parseIso, startOfWeek, dur, DAYS_LONG, daysUntil } from './date.js'
import {
  subjectStats, attendanceBudget, subjectWeek, weekProgress, classesOn,
  upcomingExams, weeklyGoalHours, termWindow, classOccurrences,
} from './stats.js'

/**
 * Lo que el ayudante local puede hacer por ti.
 *
 * Las herramientas se ejecutan **aquí, en la interfaz**, contra la misma copia
 * de la base de datos que ves en pantalla. El modelo no toca el disco: propone
 * una llamada, esto la valida, la aplica y le devuelve el resultado en texto.
 * Nada sale del ordenador: Ollama también corre en local.
 */

/* ------------------------------------------------------------- utilidades */

/** Encuentra una asignatura por nombre, código o trozo de nombre. */
export function findSubject(db, name) {
  if (!name) return null
  const n = String(name).trim().toLowerCase()
  if (!n) return null
  // sin tildes: «matemáticas» y «matematicas» tienen que encontrarse igual
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const q = norm(n)
  return (
    db.subjects.find((s) => norm(s.name) === q) ||
    db.subjects.find((s) => norm(s.code) === q) ||
    db.subjects.find((s) => norm(s.name).includes(q)) ||
    db.subjects.find((s) => q.includes(norm(s.name)) && s.name.length > 3) ||
    // por iniciales: «poo» → Programación Orientada a Objetos
    db.subjects.find((s) => norm(s.name).split(/\s+/).map((w) => w[0]).join('') === q) ||
    null
  )
}

/** Acepta «2026-03-14», «mañana», «viernes», «el 14 de marzo». */
export function parseWhen(text) {
  if (!text) return ''
  const raw = String(text).trim().toLowerCase()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const base = parseIso(today())
  if (/^hoy$/.test(raw)) return today()
  if (/^mañana|manana$/.test(raw)) return iso(addDays(base, 1))
  if (/^pasado\s*mañana|pasado manana$/.test(raw)) return iso(addDays(base, 2))

  const weekly = DAYS_LONG.findIndex((d) => raw.includes(d.toLowerCase()))
  if (weekly >= 0) {
    // el próximo día de la semana con ese nombre, hoy no cuenta
    for (let i = 1; i <= 7; i++) {
      const d = addDays(base, i)
      if ((d.getDay() + 6) % 7 === weekly) return iso(d)
    }
  }

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const m = raw.match(/(\d{1,2})\s*(?:de\s*)?([a-zé]+)/)
  if (m) {
    const mi = MESES.findIndex((x) => x.startsWith(m[2].slice(0, 3)))
    if (mi >= 0) {
      const day = Number(m[1])
      const year = base.getFullYear() + (mi < base.getMonth() ? 1 : 0)
      return iso(new Date(year, mi, day))
    }
  }

  const dm = raw.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/)
  if (dm) {
    const year = dm[3] ? Number(dm[3].length === 2 ? '20' + dm[3] : dm[3]) : base.getFullYear()
    return iso(new Date(year, Number(dm[2]) - 1, Number(dm[1])))
  }
  return ''
}

const pctFmt = (x) => `${Math.round(x * 100)}%`
const list = (xs) => (xs.length ? xs.join('\n') : '(ninguno)')

/* -------------------------------------------------------- definiciones ---- */

/** Esquema en el formato que entiende Ollama (compatible con OpenAI). */
export const TOOL_SCHEMA = [
  {
    type: 'function',
    function: {
      name: 'listar_asignaturas',
      description: 'Lista las asignaturas del curso con su código, créditos y horario. Úsala si no sabes a qué asignatura se refiere el usuario.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'estado_asignatura',
      description:
        'Estado completo de una asignatura: asistencia, cuántas faltas más puede permitirse, horas dedicadas, progreso semanal, tareas pendientes y próximos exámenes.',
      parameters: {
        type: 'object',
        properties: { asignatura: { type: 'string', description: 'Nombre o código de la asignatura' } },
        required: ['asignatura'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resumen_semana',
      description: 'Resumen de la semana en curso: horas trabajadas, porcentaje del trabajo semanal hecho, entregas y exámenes que vienen.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'tareas_pendientes',
      description: 'Tareas sin terminar, opcionalmente filtradas por asignatura o por los próximos N días.',
      parameters: {
        type: 'object',
        properties: {
          asignatura: { type: 'string', description: 'Opcional. Nombre de la asignatura.' },
          dias: { type: 'number', description: 'Opcional. Solo las que vencen en los próximos N días.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'horario',
      description: 'Clases previstas en una fecha concreta.',
      parameters: {
        type: 'object',
        properties: { fecha: { type: 'string', description: 'Fecha AAAA-MM-DD, o "hoy" / "mañana" / un día de la semana.' } },
        required: ['fecha'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_tarea',
      description:
        'Crea una tarea. NO la llames si te falta el título o la fecha: pregúntaselos antes al usuario en tu respuesta.',
      parameters: {
        type: 'object',
        properties: {
          titulo: { type: 'string', description: 'Título corto y concreto de la tarea' },
          asignatura: { type: 'string', description: 'Nombre de la asignatura a la que pertenece' },
          fecha: { type: 'string', description: 'Fecha límite AAAA-MM-DD (o "viernes", "mañana")' },
          notas: { type: 'string', description: 'Descripción o detalles de la entrega' },
          prioridad: { type: 'string', enum: ['baja', 'normal', 'alta', 'urgente'] },
          estimacion_min: { type: 'number', description: 'Minutos que crees que llevará' },
        },
        required: ['titulo', 'fecha'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_examen',
      description:
        'Crea un examen o una entrega evaluable de una asignatura. NO la llames si te falta el título, la asignatura o la fecha: pregúntalos antes.',
      parameters: {
        type: 'object',
        properties: {
          titulo: { type: 'string', description: 'Por ejemplo "Parcial 1" o "Entrega práctica 3"' },
          asignatura: { type: 'string' },
          fecha: { type: 'string', description: 'AAAA-MM-DD' },
          hora: { type: 'string', description: 'HH:MM, opcional' },
          aula: { type: 'string' },
          peso: { type: 'number', description: 'Porcentaje sobre la nota final, 0–100' },
          tipo: { type: 'string', enum: ['examen', 'entrega'] },
          notas: { type: 'string', description: 'Temario que entra, condiciones…' },
        },
        required: ['titulo', 'asignatura', 'fecha'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'registrar_tiempo',
      description: 'Apunta minutos ya trabajados en una asignatura en una fecha. Para corregir o añadir tiempo a mano.',
      parameters: {
        type: 'object',
        properties: {
          asignatura: { type: 'string' },
          minutos: { type: 'number' },
          fecha: { type: 'string', description: 'AAAA-MM-DD, por defecto hoy' },
        },
        required: ['asignatura', 'minutos'],
      },
    },
  },
]

/** Las que escriben en la base de datos: se pueden desactivar en Ajustes. */
export const WRITE_TOOLS = new Set(['crear_tarea', 'crear_examen', 'registrar_tiempo'])

/* ---------------------------------------------------------- ejecución ---- */

const PRIO = { baja: 0, normal: 1, alta: 2, urgente: 3 }

/**
 * Ejecuta una llamada del modelo. Devuelve `{ text, action }`: `text` es lo que
 * se le manda de vuelta al modelo, `action` lo que la interfaz enseña y permite
 * deshacer.
 */
export function runTool(name, args = {}, { db, update }) {
  const A = args || {}

  switch (name) {
    /* ------------------------------------------------------------ consultas */

    case 'listar_asignaturas': {
      if (!db.subjects.length) return { text: 'No hay ninguna asignatura creada todavía.' }
      return {
        text: list(
          db.subjects.map((s) => {
            const horario = (s.schedule || [])
              .map((sl) => `${DAYS_LONG[sl.day]} ${sl.start}–${sl.end}${sl.room ? ` (${sl.room})` : ''}`)
              .join(', ')
            return `- ${s.name}${s.code ? ` [${s.code}]` : ''} · ${s.credits || '?'} ECTS${
              s.professor ? ` · ${s.professor}` : ''
            }${horario ? ` · ${horario}` : ' · sin horario'}`
          })
        ),
      }
    }

    case 'estado_asignatura': {
      const s = findSubject(db, A.asignatura)
      if (!s) {
        return {
          text: `No encuentro ninguna asignatura llamada "${A.asignatura}". Las que hay son: ${
            db.subjects.map((x) => x.name).join(', ') || 'ninguna'
          }.`,
        }
      }
      const st = subjectStats(db, s.id)
      const b = attendanceBudget(db, s.id)
      const w = subjectWeek(db, s.id)

      const asistencia = b.totalCounted
        ? [
            `Asistencia exigida: ${pctFmt(b.minRate)}.`,
            `Clases del curso que cuentan: ${b.totalCounted} (${b.past} ya pasadas, ${b.upcoming} por venir).`,
            `Has asistido a ${b.attended} y has faltado a ${b.absences}${b.excused ? ` (${b.excused} justificadas)` : ''}.`,
            `Te puedes permitir ${b.maxAbsences} faltas en total, así que te quedan ${b.left}.`,
            b.doomed ? 'AVISO: ya no llegas al mínimo aunque vayas a todas las que quedan.' : '',
            b.unmarked ? `Hay ${b.unmarked} clases pasadas sin marcar, así que el número puede cambiar.` : '',
            b.reliable ? '' : 'OJO: alguna clase del horario no tiene fecha de fin, así que el total de clases es una estimación.',
          ].filter(Boolean).join(' ')
        : 'Esta asignatura no tiene horario configurado, así que no se puede calcular la asistencia.'

      return {
        text: [
          `Asignatura: ${s.name}${s.code ? ` [${s.code}]` : ''}, ${s.credits || '?'} ECTS${s.professor ? `, profesor ${s.professor}` : ''}.`,
          asistencia,
          `Tiempo dedicado en total: ${dur(st.seconds, true)}.`,
          `Esta semana: ${dur(w.seconds, true)} de un objetivo de ${w.goal} h — ${w.pct}% del trabajo semanal hecho.`,
          `Tareas pendientes (${st.open.length}):`,
          list(st.open.map((t) => `  · ${t.title}${t.due ? ` — vence el ${t.due}` : ' — sin fecha'}`)),
          `Exámenes y entregas evaluables:`,
          list(
            st.exams.map((e) => `  · ${e.title} — ${e.date}${e.start ? ` a las ${e.start}` : ''}${e.weight ? ` (${e.weight}% de la nota)` : ''}`)
          ),
        ].join('\n'),
      }
    }

    case 'resumen_semana': {
      const wp = weekProgress(db)
      const exams = upcomingExams(db, 21)
      const soon = db.tasks
        .filter((t) => t.status !== 'done' && t.due && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 7)
        .sort((a, b) => a.due.localeCompare(b.due))
      const late = db.tasks.filter((t) => t.status !== 'done' && t.due && daysUntil(t.due) < 0)

      return {
        text: [
          `Semana del ${iso(startOfWeek(new Date()))}. Hoy es ${today()}.`,
          `Trabajo semanal hecho: ${wp.pct}% (${dur(wp.seconds, true)} de ${wp.goal} h objetivo; ${wp.tasksDone} de ${wp.tasks} entregas de esta semana).`,
          `Por asignatura:`,
          list(wp.rows.map((r) => `  · ${r.subject.name}: ${r.pct}% — ${dur(r.seconds)} de ${r.goal} h`)),
          late.length ? `Atrasadas (${late.length}): ${late.map((t) => t.title).join(', ')}` : 'No hay nada atrasado.',
          `Vence en 7 días:`,
          list(soon.map((t) => `  · ${t.title} — ${t.due}`)),
          `Exámenes en 3 semanas:`,
          list(exams.map((e) => `  · ${e.title} (${e.subject?.name || '?'}) — ${e.date}`)),
        ].join('\n'),
      }
    }

    case 'tareas_pendientes': {
      const s = A.asignatura ? findSubject(db, A.asignatura) : null
      if (A.asignatura && !s) return { text: `No encuentro la asignatura "${A.asignatura}".` }
      let rows = db.tasks.filter((t) => t.status !== 'done')
      if (s) rows = rows.filter((t) => t.refId === s.id)
      if (A.dias > 0) rows = rows.filter((t) => t.due && daysUntil(t.due) <= A.dias)
      rows = rows.sort((a, b) => (a.due || 'z').localeCompare(b.due || 'z'))
      return {
        text: rows.length
          ? list(rows.map((t) => {
              const sub = db.subjects.find((x) => x.id === t.refId)
              return `- ${t.title}${sub ? ` (${sub.name})` : ''}${t.due ? ` — vence el ${t.due}` : ' — sin fecha'}`
            }))
          : 'No hay tareas pendientes con esos criterios.',
      }
    }

    case 'horario': {
      const date = parseWhen(A.fecha) || today()
      const rows = classesOn(db, date)
      return {
        text: rows.length
          ? `Clases del ${date}:\n` + list(rows.map((c) => `- ${c.slot.start}–${c.slot.end} ${c.subject.name}${c.slot.room ? ` en ${c.slot.room}` : ''}`))
          : `El ${date} no hay clases en el horario.`,
      }
    }

    /* -------------------------------------------------------- modificaciones */

    case 'crear_tarea': {
      const title = String(A.titulo || '').trim()
      if (!title) return { text: 'Falta el título. Pregúntaselo al usuario antes de volver a intentarlo.' }
      const due = parseWhen(A.fecha)
      if (A.fecha && !due) return { text: `No entiendo la fecha "${A.fecha}". Pídesela al usuario en formato día/mes.` }

      const s = A.asignatura ? findSubject(db, A.asignatura) : null
      if (A.asignatura && !s) {
        return { text: `No encuentro la asignatura "${A.asignatura}". Las que hay: ${db.subjects.map((x) => x.name).join(', ')}.` }
      }

      const task = {
        id: uid('t'),
        title,
        notes: String(A.notas || ''),
        area: s ? 'uni' : 'life',
        refId: s?.id || null,
        due: due || '',
        priority: PRIO[String(A.prioridad || '').toLowerCase()] ?? 1,
        estimate: Number(A.estimacion_min) || 0,
        status: 'todo',
        createdAt: Date.now(),
        doneAt: null,
        folder: null,
        createdBy: 'assistant',
      }
      update((d) => d.tasks.unshift(task))

      return {
        text: `Tarea creada: "${title}"${s ? ` en ${s.name}` : ''}${due ? `, para el ${due}` : ', sin fecha'}. Confírmaselo al usuario en una frase.`,
        action: {
          kind: 'task',
          id: task.id,
          summary: `Tarea · ${title}${s ? ` · ${s.name}` : ''}${due ? ` · ${due}` : ''}`,
          href: s ? `#/uni/${s.id}` : '#/tareas',
        },
      }
    }

    case 'crear_examen': {
      const title = String(A.titulo || '').trim()
      const s = findSubject(db, A.asignatura)
      if (!title) return { text: 'Falta el título del examen. Pregúntaselo al usuario.' }
      if (!s) {
        return { text: `No encuentro la asignatura "${A.asignatura}". Las que hay: ${db.subjects.map((x) => x.name).join(', ')}.` }
      }
      const date = parseWhen(A.fecha)
      if (!date) return { text: `No entiendo la fecha "${A.fecha}". Pídesela al usuario.` }

      const exam = {
        id: uid('ex'),
        subjectId: s.id,
        title,
        kind: A.tipo === 'entrega' ? 'entrega' : 'examen',
        date,
        start: /^\d{1,2}:\d{2}$/.test(String(A.hora || '')) ? A.hora : '',
        end: '',
        room: String(A.aula || ''),
        weight: Number(A.peso) || 0,
        notes: String(A.notas || ''),
        grade: null,
        createdBy: 'assistant',
      }
      update((d) => { (d.exams ||= []).push(exam) })

      return {
        text: `${exam.kind === 'entrega' ? 'Entrega' : 'Examen'} creado: "${title}" de ${s.name} el ${date}${exam.start ? ` a las ${exam.start}` : ''}. Confírmaselo al usuario.`,
        action: {
          kind: 'exam',
          id: exam.id,
          summary: `${exam.kind === 'entrega' ? 'Entrega' : 'Examen'} · ${title} · ${s.name} · ${date}`,
          href: `#/uni/${s.id}`,
        },
      }
    }

    case 'registrar_tiempo': {
      const s = findSubject(db, A.asignatura)
      if (!s) return { text: `No encuentro la asignatura "${A.asignatura}".` }
      const minutes = Math.round(Number(A.minutos) || 0)
      if (minutes <= 0) return { text: 'Los minutos tienen que ser un número mayor que cero.' }
      const date = parseWhen(A.fecha) || today()

      const session = {
        id: uid('s'),
        area: 'uni',
        refId: s.id,
        taskId: null,
        label: s.name,
        date,
        start: parseIso(date).getTime(),
        end: parseIso(date).getTime() + minutes * 60000,
        seconds: minutes * 60,
        source: 'manual',
        createdBy: 'assistant',
      }
      update((d) => d.sessions.push(session))

      return {
        text: `Apuntados ${minutes} minutos en ${s.name} el ${date}.`,
        action: { kind: 'session', id: session.id, summary: `Tiempo · ${dur(minutes * 60)} · ${s.name} · ${date}`, href: `#/uni/${s.id}` },
      }
    }

    default:
      return { text: `No existe ninguna herramienta llamada "${name}".` }
  }
}

/** Deshacer lo que el ayudante acaba de crear. */
export function undoAction(action, update) {
  update((d) => {
    if (action.kind === 'task') d.tasks = d.tasks.filter((t) => t.id !== action.id)
    if (action.kind === 'exam') d.exams = (d.exams || []).filter((e) => e.id !== action.id)
    if (action.kind === 'session') d.sessions = d.sessions.filter((s) => s.id !== action.id)
  })
}

/* -------------------------------------------------------- contexto ------- */

/**
 * El modelo no puede consultar la base de datos por su cuenta, así que arranca
 * sabiendo dónde está parado: fecha, asignaturas y qué hay encima de la mesa.
 */
export function systemPrompt(db) {
  const wp = weekProgress(db)
  const { from, to } = termWindow(db)
  const hoy = parseIso(today())
  const clases = classesOn(db)
  const exams = upcomingExams(db, 30)

  return [
    'Eres el ayudante de prolife, la app con la que Mateo lleva la carrera, el trabajo y el atletismo.',
    'Corres en su propio ordenador: nada de lo que se diga aquí sale de la máquina.',
    '',
    `Hoy es ${DAYS_LONG[(hoy.getDay() + 6) % 7].toLowerCase()} ${today()}. El curso va del ${from} al ${to}.`,
    `Esta semana lleva hecho el ${wp.pct}% de su trabajo semanal (${dur(wp.seconds)} de ${wp.goal} h).`,
    clases.length
      ? `Hoy tiene clase de: ${clases.map((c) => `${c.subject.name} a las ${c.slot.start}`).join(', ')}.`
      : 'Hoy no tiene clases.',
    db.subjects.length
      ? `Asignaturas: ${db.subjects.map((s) => `${s.name}${s.code ? ` (${s.code})` : ''}`).join(', ')}.`
      : 'Todavía no hay asignaturas creadas.',
    exams.length ? `Exámenes próximos: ${exams.slice(0, 5).map((e) => `${e.title} de ${e.subject?.name} el ${e.date}`).join('; ')}.` : '',
    '',
    'Cómo trabajas:',
    '- Responde SIEMPRE en español, en segunda persona y sin rodeos. Dos o tres frases salvo que te pidan más.',
    '- Para cualquier dato concreto (faltas, horas, fechas, tareas) usa las herramientas. No te inventes números nunca.',
    '- Antes de crear una tarea o un examen necesitas título y fecha. Si te falta algo, PREGÚNTALO en tu respuesta y no llames a la herramienta todavía. Ejemplo: «Vale, te la añado. ¿Cómo la llamo y qué hay que hacer?».',
    '- Si el usuario ya te dio todo lo necesario, crea la cosa directamente y confírmalo en una frase.',
    '- Cuando hables de faltas, di cuántas lleva, cuántas le quedan y de cuántas clases sale el cálculo.',
    '- Si un dato no es fiable (clases sin fecha de fin, asistencia sin marcar), dilo.',
  ].filter(Boolean).join('\n')
}
