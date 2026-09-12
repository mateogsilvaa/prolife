import { uid, PALETTE } from './store.jsx'
import { today, iso, addDays, parseIso, startOfWeek, dur, DAYS_LONG, daysUntil } from './date.js'
import { api } from './api.js'
import {
  subjectStats, attendanceBudget, subjectWeek, weekProgress, classesOn,
  upcomingExams, termWindow, classOccurrences,
} from './stats.js'

/**
 * Lo que el ayudante local puede hacer por ti.
 *
 * Las herramientas se ejecutan **aquí, en la interfaz**, contra la misma copia
 * de la base de datos que ves en pantalla. El modelo no toca el disco: propone
 * una llamada, esto la valida, la aplica y le devuelve el resultado en texto.
 * Nada sale del ordenador: Ollama también corre en local.
 *
 * Dos reglas gobiernan todo lo que escribe:
 *
 * 1. **Lo que falta se pregunta, no se inventa.** Cuando una herramienta ve que
 *    le faltan datos devuelve `ask` con la pregunta ya escrita, y la interfaz
 *    la enseña tal cual sin dejar seguir al modelo. Un modelo pequeño se salta
 *    la instrucción de preguntar; esto no puede saltárselo.
 * 2. **Nada que el usuario no haya dicho.** Si el modelo rellena una asignatura
 *    o un proyecto que no aparece por ningún lado en la conversación, se tira
 *    el dato: es una alucinación, no una elección.
 */

/* ------------------------------------------------------------- utilidades */

/** Sin tildes ni mayúsculas: «matemáticas» y «matematicas» son lo mismo. */
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

const iniciales = (s) => norm(s).split(/\s+/).map((w) => w[0] || '').join('')

/** Busca por nombre exacto, código, trozo de nombre o iniciales. */
function porNombre(items, name, extra = () => '') {
  const q = norm(name)
  if (!q) return null
  return (
    items.find((x) => norm(x.name) === q) ||
    items.find((x) => norm(extra(x)) && norm(extra(x)) === q) ||
    items.find((x) => norm(x.name).includes(q) && q.length > 2) ||
    items.find((x) => q.includes(norm(x.name)) && String(x.name).length > 3) ||
    items.find((x) => iniciales(x.name) === q && q.length > 1) ||
    null
  )
}

export const findSubject = (db, name) => (name ? porNombre(db.subjects, name, (s) => s.code) : null)
export const findProject = (db, name) => (name ? porNombre(db.projects, name, (p) => p.org) : null)

/**
 * ¿El usuario ha nombrado esto de verdad?
 *
 * `dicho` es todo lo que el usuario ha escrito en la conversación. Si el nombre
 * que trae la herramienta no aparece por ninguna parte, el modelo se lo ha
 * sacado del contexto del sistema —donde están listadas las asignaturas— para
 * rellenar un hueco. Eso no es un dato: es ruido, y se descarta.
 */
function loHaDicho(dicho, entidad) {
  if (!dicho) return true
  const d = norm(dicho)
  const nombre = norm(entidad?.name || entidad)
  if (!nombre) return false
  if (d.includes(nombre)) return true
  if (entidad?.code && d.includes(norm(entidad.code))) return true
  if (iniciales(nombre).length > 1 && new RegExp(`\\b${iniciales(nombre)}\\b`).test(d)) return true
  // basta con una palabra larga del nombre: «desarrollo» vale por «Desarrollo web»
  return nombre.split(/\s+/).filter((w) => w.length > 4).some((w) => d.includes(w))
}

/** Acepta «2026-03-14», «mañana», «viernes», «el 14 de marzo». */
export function parseWhen(text) {
  if (!text) return ''
  const raw = String(text).trim().toLowerCase()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const base = parseIso(today())
  if (/^hoy$/.test(raw)) return today()
  if (/^(mañana|manana)$/.test(raw)) return iso(addDays(base, 1))
  if (/^pasado\s*(mañana|manana)$/.test(raw)) return iso(addDays(base, 2))

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

/**
 * ¿Este título es de verdad un título, o es la frase del usuario reciclada?
 *
 * «Añádeme una tarea para el viernes» no dice cómo se llama la tarea. Un modelo
 * pequeño rellena el hueco con «Tarea para el viernes» y se queda tan ancho.
 * Se le quitan al título las palabras de relleno y las fechas: si lo que sobra
 * es un sustantivo genérico, ahí no hay título ninguno.
 */
const GENERICO = /^(una?\s+)?(tarea|cosa|algo|recordatorio|nota|apunte|pendiente|entrega|trabajo|evento|cita|proyecto|examen|prueba)s?$/
export function tituloVago(titulo) {
  const limpio = norm(titulo)
    .replace(/[¿?¡!.,;:"']/g, ' ')
    .replace(/\b(para|por|de|del|el|la|lo|los|las|un|una|este|esta|proxim[oa]s?|que viene|nuev[oa]|mi|me)\b/g, ' ')
    .replace(/\b(hoy|manana|pasado|lunes|martes|miercoles|jueves|viernes|sabado|domingo|semana|finde|mes|dia|dias|\d[\d/-]*)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return !limpio || limpio.length < 3 || GENERICO.test(limpio)
}

const pctFmt = (x) => `${Math.round(x * 100)}%`
const list = (xs) => (xs.length ? xs.join('\n') : '(ninguno)')
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null)

/** «80», «80%» y «0.8» son lo mismo: una tasa entre 0 y 1. */
function tasa(v) {
  const n = num(String(v).replace('%', ''))
  if (n == null || n <= 0) return null
  const r = n > 1 ? n / 100 : n
  return r > 1 ? null : r
}

/* -------------------------------------------------------- definiciones ---- */

const P = (properties, required = []) => ({ type: 'object', properties, required })
const S = (description, extra = {}) => ({ type: 'string', description, ...extra })
const N = (description) => ({ type: 'number', description })

const AMBITO = { type: 'string', enum: ['uni', 'trabajo', 'personal'], description: 'A qué parte de la vida pertenece' }
const FECHA = S('AAAA-MM-DD, o "hoy" / "mañana" / un día de la semana')

/** Esquema en el formato que entiende Ollama (compatible con OpenAI). */
export const TOOL_SCHEMA = [
  /* ------------------------------------------------------------- consultas */
  {
    type: 'function',
    function: {
      name: 'listar_asignaturas',
      description: 'Las asignaturas del curso, con código, créditos y horario.',
      parameters: P({}),
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_proyectos',
      description: 'Los proyectos de trabajo, con su organización y el tiempo dedicado.',
      parameters: P({}),
    },
  },
  {
    type: 'function',
    function: {
      name: 'estado_asignatura',
      description: 'Todo de una asignatura: asistencia, faltas que le quedan, horas, tareas y exámenes.',
      parameters: P({ asignatura: S('Nombre o código') }, ['asignatura']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'estado_proyecto',
      description: 'Todo de un proyecto de trabajo: horas dedicadas y tareas abiertas.',
      parameters: P({ proyecto: S('Nombre del proyecto') }, ['proyecto']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'resumen_semana',
      description: 'Cómo va la semana: horas, porcentaje del objetivo, asistencia, entregas, exámenes y entrenos.',
      parameters: P({}),
    },
  },
  {
    type: 'function',
    function: {
      name: 'tareas_pendientes',
      description: 'Tareas sin terminar, con filtros opcionales.',
      parameters: P({
        asignatura: S('Opcional'),
        proyecto: S('Opcional'),
        ambito: AMBITO,
        dias: N('Solo las que vencen en los próximos N días'),
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'horario',
      description: 'Clases previstas en una fecha.',
      parameters: P({ fecha: FECHA }, ['fecha']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agenda',
      description: 'Qué hay en el calendario —eventos, exámenes y entregas— en los próximos días.',
      parameters: P({ dias: N('Cuántos días mirar, 14 por defecto') }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'resumen_atletismo',
      description: 'Entrenamientos recientes: sesiones, minutos, carga y cómo va la semana.',
      parameters: P({ semanas: N('Cuántas semanas atrás, 2 por defecto') }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'resumen_voluntariado',
      description: 'Horas de voluntariado, jornadas y cuáles no tienen foto que las acredite.',
      parameters: P({ entidad: S('Opcional, para una sola entidad') }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_documentos',
      description:
        'Qué hay dentro de una carpeta. Sin argumentos, la carpeta que el usuario está mirando ahora mismo.',
      parameters: P({
        carpeta: S('Ruta de la carpeta, por ejemplo "Universidad/Cálculo". Vacío = la que está mirando.'),
        asignatura: S('Opcional, en vez de la ruta'),
        proyecto: S('Opcional, en vez de la ruta'),
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_archivos',
      description:
        'Busca un archivo o una carpeta por su nombre en TODO el directorio. Úsalo siempre que el usuario nombre un documento sin decir dónde está, en vez de responder que no sabes dónde está.',
      parameters: P({
        texto: S('Trozo del nombre que busca'),
        carpeta: S('Opcional, para buscar solo dentro de una carpeta'),
      }, ['texto']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'leer_documento',
      description:
        'Lee un documento para resumirlo, corregirlo, opinar o responder sobre él. Vale para apuntes, .md, .txt, código, PDF y Word (.docx). Si solo sabes el nombre, pásalo: lo busca solo. Sin argumentos lee el que el usuario tiene delante.',
      parameters: P({
        nombre: S('Nombre o ruta del archivo. Vacío = el documento que tiene abierto.'),
        asignatura: S('Opcional, para buscarlo dentro de su carpeta'),
        proyecto: S('Opcional'),
      }),
    },
  },

  /* -------------------------------------------------------- modificaciones */
  {
    type: 'function',
    function: {
      name: 'crear_tarea',
      description: 'Apunta una tarea. Pasa solo lo que el usuario haya dicho: lo que falte se le pregunta.',
      parameters: P({
        titulo: S('Cómo la llama el usuario. No lo inventes.'),
        ambito: AMBITO,
        asignatura: S('Si es de la uni y ha dicho cuál'),
        proyecto: S('Si es del trabajo y ha dicho cuál'),
        fecha: FECHA,
        notas: S('Detalles'),
        prioridad: S('', { enum: ['baja', 'normal', 'alta', 'urgente'] }),
        estimacion_min: N('Minutos que llevará'),
      }, ['titulo']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'completar_tarea',
      description: 'Da una tarea por hecha, o la reabre.',
      parameters: P({ tarea: S('Título de la tarea'), hecha: { type: 'boolean', description: 'false para reabrirla' } }, ['tarea']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_proyecto',
      description: 'Crea un proyecto en el apartado de Trabajo.',
      parameters: P({ nombre: S('Nombre del proyecto'), organizacion: S('RFEA, cliente…'), notas: S('') }, ['nombre']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_asignatura',
      description: 'Crea una asignatura vacía. El horario se pone luego a mano en la app.',
      parameters: P({ nombre: S(''), codigo: S(''), profesor: S(''), creditos: N('ECTS') }, ['nombre']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_examen',
      description: 'Crea un examen o una entrega evaluable de una asignatura.',
      parameters: P({
        titulo: S('«Parcial 1», «Entrega práctica 3»…'),
        asignatura: S(''),
        fecha: FECHA,
        hora: S('HH:MM'),
        aula: S(''),
        peso: N('Porcentaje sobre la nota final'),
        tipo: S('', { enum: ['examen', 'entrega'] }),
        notas: S('Temario que entra…'),
      }, ['titulo']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_evento',
      description: 'Apunta algo en el calendario: una cita, una reunión, un viaje.',
      parameters: P({
        titulo: S(''),
        fecha: FECHA,
        hora: S('HH:MM'),
        hora_fin: S('HH:MM'),
        categoria: S('Universidad, Trabajo, Atletismo, Salud, Personal…'),
        notas: S(''),
      }, ['titulo']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'registrar_tiempo',
      description: 'Apunta minutos ya trabajados en una asignatura o un proyecto.',
      parameters: P({ asignatura: S(''), proyecto: S(''), minutos: N(''), fecha: FECHA }, ['minutos']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'registrar_entreno',
      description: 'Apunta un entrenamiento de atletismo.',
      parameters: P({
        tipo: S('Series, Rodaje, Gimnasio, Técnica, Competición, Recuperación'),
        minutos: N(''),
        rpe: N('Esfuerzo percibido del 1 al 10'),
        fecha: FECHA,
        notas: S(''),
      }, ['minutos']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'marcar_asistencia',
      description: 'Marca si fue a clase de una asignatura un día concreto.',
      parameters: P({
        asignatura: S(''),
        fecha: FECHA,
        estado: S('', { enum: ['present', 'absent', 'late', 'excused'] }),
      }, ['asignatura', 'fecha', 'estado']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'ajustar_asignatura',
      description:
        'Cambia los datos de una asignatura: la asistencia mínima que le exigen, los créditos, el profesor o las horas de estudio por semana.',
      parameters: P({
        asignatura: S(''),
        asistencia_minima: N('El mínimo exigido, en porcentaje (80 = 80%)'),
        creditos: N('ECTS'),
        profesor: S(''),
        objetivo_horas: N('Horas de estudio por semana'),
      }, ['asignatura']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'ajustar_objetivos',
      description: 'Cambia los objetivos generales de la app, los que valen para todo.',
      parameters: P({
        asistencia_minima: N('Mínimo exigido por defecto, en porcentaje'),
        horas_semana: N('Horas de trabajo por semana que cuentan como el 100%'),
        entrenos_semana: N('Entrenamientos por semana'),
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_carpeta',
      description:
        'Crea una carpeta. Si la ruta lleva varios niveles ("Universidad/Cálculo/Tema 3"), crea los que falten.',
      parameters: P({
        ruta: S('Dónde y cómo se llama, por ejemplo "Universidad/Cálculo/Tema 3"'),
        dentro_de: S('Opcional: carpeta donde meterla, si en "ruta" solo va el nombre'),
      }, ['ruta']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'mover_archivo',
      description:
        'Mueve un archivo o una carpeta a otra carpeta. Úsalo cuando te pida ordenar o guardar algo en su sitio.',
      parameters: P({
        que: S('Nombre o ruta de lo que hay que mover'),
        a_carpeta: S('Carpeta de destino'),
      }, ['que', 'a_carpeta']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'guardar_nota',
      description:
        'Escribe un archivo de texto con lo que le has preparado: un resumen, un esquema, un borrador. Pasa el contenido entero.',
      parameters: P({
        nombre: S('Cómo se llama el archivo, con o sin .md'),
        contenido: S('El texto completo del archivo'),
        carpeta: S('Dónde guardarlo. Vacío = donde está mirando.'),
      }, ['nombre', 'contenido']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'borrar',
      description: 'Borra algo que ya existe. Se puede deshacer desde la tarjeta que aparece.',
      parameters: P({
        tipo: S('', { enum: ['tarea', 'proyecto', 'examen', 'evento', 'entreno'] }),
        nombre: S('Título o nombre de lo que hay que borrar'),
      }, ['tipo', 'nombre']),
    },
  },
]

/** Las que escriben en la base de datos: se pueden desactivar en Ajustes. */
export const WRITE_TOOLS = new Set([
  'crear_tarea', 'completar_tarea', 'crear_proyecto', 'crear_asignatura', 'crear_examen',
  'crear_evento', 'registrar_tiempo', 'registrar_entreno', 'marcar_asistencia',
  'ajustar_asignatura', 'ajustar_objetivos', 'borrar',
  'crear_carpeta', 'mover_archivo', 'guardar_nota',
])

/* ---------------------------------------------------------- ejecución ---- */

const PRIO = { baja: 0, normal: 1, alta: 2, urgente: 3 }
const LISTA = { tarea: 'tasks', proyecto: 'projects', examen: 'exams', evento: 'events', entreno: 'training' }

/** Lo que el usuario ve en la tarjeta, y lo que hace falta para deshacerlo. */
const creado = (list, item, summary, href) => ({ op: 'crear', list, id: item.id, summary, href })
const borrado = (list, item, index, summary, href) => ({ op: 'borrar', list, id: item.id, item, index, summary, href })
const editado = (list, item, before, summary, href) => ({ op: 'editar', list, id: item.id, before, summary, href })

/**
 * Ejecuta una llamada del modelo.
 *
 * Devuelve `{ text, action, ask }`: `text` es lo que se le manda de vuelta al
 * modelo, `action` lo que la interfaz enseña y permite deshacer, y `ask` una
 * pregunta que se le hace al usuario **sin pasar por el modelo** cuando faltan
 * datos, que es la única manera de que un modelo pequeño no se los invente.
 */
export async function runTool(name, args = {}, ctx) {
  const { db, update, dicho = '', doc = null } = ctx
  const A = args || {}

  /** El nombre que trae el modelo solo vale si el usuario lo ha dicho. */
  const suyo = (valor, buscar) => {
    if (!valor) return null
    const hit = buscar(db, valor)
    return hit && loHaDicho(dicho, hit) ? hit : null
  }

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

    case 'listar_proyectos': {
      if (!db.projects.length) return { text: 'No hay ningún proyecto de trabajo creado todavía.' }
      return {
        text: list(
          db.projects.map((p) => {
            const secs = db.sessions.filter((s) => s.refId === p.id).reduce((a, s) => a + s.seconds, 0)
            const abiertas = db.tasks.filter((t) => t.refId === p.id && t.status !== 'done').length
            return `- ${p.name}${p.org ? ` (${p.org})` : ''} · ${dur(secs, true)} dedicadas · ${abiertas} tareas abiertas`
          })
        ),
      }
    }

    case 'estado_asignatura': {
      const s = findSubject(db, A.asignatura)
      if (!s) return { text: sinAsignatura(db, A.asignatura) }
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
        : 'Esta asignatura no tiene horario configurado, así que no se puede calcular la asistencia. Dile que lo rellene en la ficha de la asignatura.'

      return {
        text: [
          `Asignatura: ${s.name}${s.code ? ` [${s.code}]` : ''}, ${s.credits || '?'} ECTS${s.professor ? `, profesor ${s.professor}` : ''}.`,
          asistencia,
          `Tiempo dedicado en total: ${dur(st.seconds, true)}.`,
          `Esta semana: ${dur(w.seconds, true)} de un objetivo de ${w.goal} h — ${w.pct}% del trabajo semanal hecho.`,
          `Tareas pendientes (${st.open.length}):`,
          list(st.open.map((t) => `  · ${t.title}${t.due ? ` — vence el ${t.due}` : ' — sin fecha'}`)),
          'Exámenes y entregas evaluables:',
          list(
            st.exams.map((e) => `  · ${e.title} — ${e.date}${e.start ? ` a las ${e.start}` : ''}${e.weight ? ` (${e.weight}% de la nota)` : ''}`)
          ),
        ].join('\n'),
      }
    }

    case 'estado_proyecto': {
      const p = findProject(db, A.proyecto)
      if (!p) {
        return { text: `No encuentro ningún proyecto llamado "${A.proyecto}". Los que hay: ${db.projects.map((x) => x.name).join(', ') || 'ninguno'}.` }
      }
      const rows = db.sessions.filter((s) => s.refId === p.id)
      const wk = iso(startOfWeek(new Date()))
      const abiertas = db.tasks.filter((t) => t.refId === p.id && t.status !== 'done')
      return {
        text: [
          `Proyecto: ${p.name}${p.org ? ` (${p.org})` : ''}.`,
          `Tiempo dedicado: ${dur(rows.reduce((a, s) => a + s.seconds, 0), true)} en total, ${dur(rows.filter((s) => s.date >= wk).reduce((a, s) => a + s.seconds, 0), true)} esta semana.`,
          `Tareas abiertas (${abiertas.length}):`,
          list(abiertas.map((t) => `  · ${t.title}${t.due ? ` — vence el ${t.due}` : ''}`)),
          p.notes ? `Notas: ${p.notes}` : '',
        ].filter(Boolean).join('\n'),
      }
    }

    case 'resumen_semana': {
      const wp = weekProgress(db)
      const exams = upcomingExams(db, 21)
      const soon = db.tasks
        .filter((t) => t.status !== 'done' && t.due && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 7)
        .sort((a, b) => a.due.localeCompare(b.due))
      const late = db.tasks.filter((t) => t.status !== 'done' && t.due && daysUntil(t.due) < 0)
      const wk = iso(startOfWeek(new Date()))
      const entrenos = (db.training || []).filter((t) => t.done && t.date >= wk)

      // La asistencia solo se puede resumir de las asignaturas con horario.
      const conHorario = db.subjects.filter((s) => (s.schedule || []).length)
      const faltas = conHorario.map((s) => ({ s, b: attendanceBudget(db, s.id) })).filter((x) => x.b.totalCounted)

      if (!db.subjects.length && !db.projects.length && !db.sessions.length) {
        return { text: 'La app está vacía: no hay asignaturas, ni proyectos, ni tiempo registrado. No hay nada que resumir todavía; dile que empiece creando sus asignaturas.' }
      }

      return {
        text: [
          `Semana del ${wk}. Hoy es ${today()}.`,
          `Trabajo semanal hecho: ${wp.pct}% (${dur(wp.seconds, true)} de ${wp.goal} h objetivo; ${wp.tasksDone} de ${wp.tasks} entregas de esta semana).`,
          'Por asignatura:',
          list(wp.rows.map((r) => `  · ${r.subject.name}: ${r.pct}% — ${dur(r.seconds)} de ${r.goal} h`)),
          faltas.length
            ? 'Asistencia:\n' + list(faltas.map(({ s, b }) => `  · ${s.name}: ${b.absences} faltas, le quedan ${b.left} de ${b.maxAbsences}${b.doomed ? ' — YA NO LLEGA AL MÍNIMO' : ''}`))
            : 'Asistencia: ninguna asignatura tiene horario con fechas, así que no hay faltas que contar.',
          `Atletismo: ${entrenos.length} entrenos esta semana de un objetivo de ${db.settings.weeklyTrainingGoal || 0}.`,
          late.length ? `Atrasadas (${late.length}): ${late.map((t) => t.title).join(', ')}` : 'No hay nada atrasado.',
          'Vence en 7 días:',
          list(soon.map((t) => `  · ${t.title} — ${t.due}`)),
          'Exámenes en 3 semanas:',
          list(exams.map((e) => `  · ${e.title} (${e.subject?.name || '?'}) — ${e.date}`)),
        ].join('\n'),
      }
    }

    case 'tareas_pendientes': {
      const s = A.asignatura ? findSubject(db, A.asignatura) : null
      const p = A.proyecto ? findProject(db, A.proyecto) : null
      if (A.asignatura && !s) return { text: sinAsignatura(db, A.asignatura) }
      let rows = db.tasks.filter((t) => t.status !== 'done')
      if (s) rows = rows.filter((t) => t.refId === s.id)
      if (p) rows = rows.filter((t) => t.refId === p.id)
      if (A.ambito) rows = rows.filter((t) => t.area === areaDe(A.ambito))
      if (A.dias > 0) rows = rows.filter((t) => t.due && daysUntil(t.due) <= A.dias)
      rows = rows.sort((a, b) => (a.due || 'z').localeCompare(b.due || 'z'))
      return {
        text: rows.length
          ? list(rows.map((t) => `- ${t.title}${etiquetaDe(db, t)}${t.due ? ` — vence el ${t.due}` : ' — sin fecha'}`))
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

    case 'agenda': {
      const dias = num(A.dias) > 0 ? Math.min(120, num(A.dias)) : 14
      const hasta = iso(addDays(new Date(), dias))
      const evs = (db.events || [])
        .filter((e) => e.date >= today() && e.date <= hasta)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || ''))
      const exs = upcomingExams(db, dias)
      return {
        text: [
          `Del ${today()} al ${hasta}:`,
          'Eventos:',
          list(evs.map((e) => `  · ${e.date}${e.start ? ` ${e.start}` : ''} — ${e.title}`)),
          'Exámenes y entregas:',
          list(exs.map((e) => `  · ${e.date} — ${e.title} (${e.subject?.name || 'sin asignatura'})`)),
        ].join('\n'),
      }
    }

    case 'resumen_atletismo': {
      const semanas = num(A.semanas) > 0 ? Math.min(12, num(A.semanas)) : 2
      const desde = iso(addDays(startOfWeek(new Date()), -7 * (semanas - 1)))
      const rows = (db.training || []).filter((t) => t.date >= desde).sort((a, b) => a.date.localeCompare(b.date))
      if (!rows.length) return { text: `No hay ningún entrenamiento apuntado desde el ${desde}.` }
      const hechos = rows.filter((t) => t.done)
      const carga = hechos.reduce((a, t) => a + (Number(t.rpe) || 0) * (Number(t.minutes) || 0), 0)
      return {
        text: [
          `Desde el ${desde}: ${hechos.length} entrenos, ${hechos.reduce((a, t) => a + (Number(t.minutes) || 0), 0)} minutos, carga total ${carga}.`,
          `Objetivo semanal: ${db.settings.weeklyTrainingGoal || 0} entrenos.`,
          list(rows.map((t) => `  · ${t.date} — ${t.type}, ${t.minutes} min, RPE ${t.rpe}${t.done ? '' : ' (no hecho)'}${t.notes ? ` — ${t.notes}` : ''}`)),
        ].join('\n'),
      }
    }

    case 'resumen_voluntariado': {
      const entidades = db.volunteering || []
      if (!entidades.length) return { text: 'No hay ninguna entidad de voluntariado dada de alta.' }
      const una = A.entidad ? porNombre(entidades, A.entidad, (v) => v.org) : null
      const cuales = una ? [una] : entidades
      const filas = cuales.map((v) => {
        const dias = (db.volunteerDays || []).filter((d) => d.volunteerId === v.id)
        const min = dias.reduce((a, d) => a + (Number(d.minutes) || 0), 0)
        const sinFoto = dias.filter((d) => !d.photos?.length).length
        const ultima = [...dias].sort((a, b) => b.date.localeCompare(a.date))[0]
        return `  · ${v.name}${v.org ? ` (${v.org})` : ''}: ${(min / 60).toFixed(1)} h en ${dias.length} ${
          dias.length === 1 ? 'jornada' : 'jornadas'
        }${v.hoursGoal ? ` de las ${v.hoursGoal} h comprometidas` : ''}${
          sinFoto ? ` · ${sinFoto} sin foto que las acredite` : ''
        }${ultima ? ` · última el ${ultima.date}` : ''}`
      })
      const totalMin = (db.volunteerDays || []).reduce((a, d) => a + (Number(d.minutes) || 0), 0)
      return { text: [`Voluntariado — ${(totalMin / 60).toFixed(1)} h en total:`, list(filas)].join('\n') }
    }

    case 'listar_documentos': {
      // Sin carpeta se mira donde él está mirando, y si tampoco hay, la raíz.
      // Antes se rendía con «no sé en qué carpeta mirar» en cuanto la pregunta
      // no nombraba una asignatura, que es casi siempre.
      const carpeta = carpetaDe(db, A) || doc?.dir || ''
      const r = await api.tree(carpeta).catch((e) => ({ error: e.message }))
      if (r.error) return { text: `No he podido leer la carpeta: ${r.error}` }
      if (r.missing) return { text: `La carpeta "${carpeta}" no existe en el disco.` }
      const plano = aplanar(r.items || [])
      const donde = carpeta || 'el directorio de trabajo'
      if (!plano.length) return { text: `${donde} está vacío.` }
      const recorte = plano.length > 200
      return {
        text: `En ${donde} hay ${plano.length} elementos${recorte ? ' (enseño los 200 primeros)' : ''}:\n` +
          list(plano.slice(0, 200).map((f) => `  · ${f.path}${f.dir ? '/' : ''}`)),
      }
    }

    case 'buscar_archivos': {
      const texto = String(A.texto || '').trim()
      if (!texto) return { ask: '¿Qué archivo buscas? Dime aunque sea un trozo del nombre.' }
      const dentro = carpetaDe(db, A)
      const r = await api.search(texto, dentro).catch((e) => ({ error: e.message }))
      if (r.error) return { text: `No he podido buscar: ${r.error}` }
      const hits = r.items || []
      if (!hits.length) {
        return { text: `No hay ningún archivo ni carpeta que se llame algo parecido a "${texto}"${dentro ? ` dentro de ${dentro}` : ''}.` }
      }
      return {
        text: `${hits.length} resultado${hits.length === 1 ? '' : 's'} para "${texto}":\n` +
          list(hits.slice(0, 40).map((f) => `  · ${f.path}${f.dir ? '/ (carpeta)' : ''}`)),
      }
    }

    case 'leer_documento': {
      const ruta = await resolverArchivo(db, A, doc)
      if (ruta.ask) return ruta
      const r = await api.extract(ruta.path).catch((e) => ({ error: e.message }))
      if (r.error || typeof r.texto !== 'string') {
        return { text: `No he podido leer "${ruta.path}": ${r.error || 'formato desconocido'}.` }
      }
      if (!r.texto.trim()) {
        return {
          text: `"${ruta.path}" no tiene texto que se pueda sacar. Si es un PDF escaneado, son imágenes de las páginas y haría falta reconocimiento de texto.`,
        }
      }
      const cabecera = [
        `Contenido de ${ruta.path}`,
        r.paginas ? `${r.paginas} páginas` : '',
        r.recortado ? 'recortado, es largo' : '',
      ].filter(Boolean).join(' · ')
      return { text: `${cabecera}:\n\n${r.texto}` }
    }

    /* -------------------------------------------------------- modificaciones */

    case 'crear_tarea': {
      const titulo = String(A.titulo || '').trim()
      const s = suyo(A.asignatura, findSubject)
      const p = suyo(A.proyecto, findProject)
      const due = A.fecha ? parseWhen(A.fecha) : ''
      let ambito = A.ambito
      if (s) ambito = 'uni'
      else if (p) ambito = 'trabajo'

      const falta = []
      if (!titulo || tituloVago(titulo)) falta.push('cómo la llamo')
      if (!ambito) falta.push('si es de la uni, del trabajo o personal')
      if (!A.fecha) falta.push('para cuándo es')
      else if (!due) falta.push(`qué día es "${A.fecha}"`)
      if (falta.length) return { ask: pregunta('la tarea', falta) }

      const task = {
        id: uid('t'),
        title: titulo,
        notes: String(A.notas || ''),
        area: areaDe(ambito),
        refId: s?.id || p?.id || null,
        due,
        priority: PRIO[String(A.prioridad || '').toLowerCase()] ?? 1,
        estimate: num(A.estimacion_min) || 0,
        status: 'todo',
        createdAt: Date.now(),
        doneAt: null,
        folder: null,
        createdBy: 'assistant',
      }
      update((d) => d.tasks.unshift(task))
      const donde = s ? ` en ${s.name}` : p ? ` en ${p.name}` : ` en ${NOMBRE_AMBITO[ambito]}`
      return {
        text: `Hecho: tarea "${titulo}"${donde}, para el ${due}. Confírmaselo en una frase, sin repetir la lista entera.`,
        action: creado('tasks', task, `Tarea · ${titulo}${donde} · ${due}`, s ? `#/uni/${s.id}` : p ? `#/trabajo/${p.id}` : '#/tareas'),
      }
    }

    case 'completar_tarea': {
      const t = porNombre(db.tasks.filter((x) => x.status !== 'done'), A.tarea, (x) => x.title)
        || porNombre(db.tasks, A.tarea, (x) => x.title)
      const hit = t || db.tasks.find((x) => norm(x.title).includes(norm(A.tarea)))
      if (!hit) return { text: `No encuentro ninguna tarea que se llame "${A.tarea}".` }
      const hecha = A.hecha !== false
      const before = { status: hit.status, doneAt: hit.doneAt }
      update((d) => {
        const x = d.tasks.find((y) => y.id === hit.id)
        if (x) { x.status = hecha ? 'done' : 'todo'; x.doneAt = hecha ? Date.now() : null }
      })
      return {
        text: `"${hit.title}" queda ${hecha ? 'hecha' : 'otra vez pendiente'}.`,
        action: editado('tasks', hit, before, `${hecha ? 'Hecha' : 'Reabierta'} · ${hit.title}`, '#/tareas'),
      }
    }

    case 'crear_proyecto': {
      const nombre = String(A.nombre || '').trim()
      if (!nombre || tituloVago(nombre)) return { ask: pregunta('el proyecto', ['cómo se llama']) }
      if (findProject(db, nombre) && norm(findProject(db, nombre).name) === norm(nombre)) {
        return { text: `Ya existe un proyecto llamado "${nombre}". Dile que ya lo tiene.` }
      }
      const prj = {
        id: uid('prj'),
        name: nombre,
        org: String(A.organizacion || ''),
        color: PALETTE[(db.projects.length + 3) % PALETTE.length],
        folder: '',
        notes: String(A.notas || ''),
        createdBy: 'assistant',
      }
      update((d) => d.projects.push(prj))
      return {
        text: `Proyecto "${nombre}" creado en Trabajo. Dile que le falta elegirle carpeta desde su ficha si quiere guardar archivos ahí.`,
        action: creado('projects', prj, `Proyecto · ${nombre}${prj.org ? ` · ${prj.org}` : ''}`, `#/trabajo/${prj.id}`),
      }
    }

    case 'crear_asignatura': {
      const nombre = String(A.nombre || '').trim()
      if (!nombre || tituloVago(nombre)) return { ask: pregunta('la asignatura', ['cómo se llama']) }
      const sub = {
        id: uid('sub'),
        name: nombre,
        code: String(A.codigo || ''),
        professor: String(A.profesor || ''),
        credits: num(A.creditos) || 6,
        color: PALETTE[db.subjects.length % PALETTE.length],
        portalUrl: '', isProgramming: false, repoPath: '', folder: '',
        schedule: [], weeklyGoalHours: 0, attendanceMin: null,
        createdBy: 'assistant',
      }
      update((d) => d.subjects.push(sub))
      return {
        text: `Asignatura "${nombre}" creada. Dile que el horario hay que ponerlo a mano en su ficha: sin horario no se pueden contar faltas.`,
        action: creado('subjects', sub, `Asignatura · ${nombre}`, `#/uni/${sub.id}`),
      }
    }

    case 'crear_examen': {
      const titulo = String(A.titulo || '').trim()
      const s = suyo(A.asignatura, findSubject)
      const date = A.fecha ? parseWhen(A.fecha) : ''
      const falta = []
      if (!titulo || tituloVago(titulo)) falta.push('cómo se llama')
      if (!s) falta.push('de qué asignatura es')
      if (!A.fecha) falta.push('qué día es')
      else if (!date) falta.push(`qué día es "${A.fecha}"`)
      if (falta.length) return { ask: pregunta('el examen', falta) }

      const exam = {
        id: uid('ex'),
        subjectId: s.id,
        title: titulo,
        kind: A.tipo === 'entrega' ? 'entrega' : 'examen',
        date,
        start: /^\d{1,2}:\d{2}$/.test(String(A.hora || '')) ? A.hora : '',
        end: '',
        room: String(A.aula || ''),
        weight: num(A.peso) || 0,
        notes: String(A.notas || ''),
        grade: null,
        createdBy: 'assistant',
      }
      update((d) => { (d.exams ||= []).push(exam) })
      return {
        text: `${exam.kind === 'entrega' ? 'Entrega' : 'Examen'} "${titulo}" de ${s.name} el ${date}${exam.start ? ` a las ${exam.start}` : ''}. Confírmaselo.`,
        action: creado('exams', exam, `${exam.kind === 'entrega' ? 'Entrega' : 'Examen'} · ${titulo} · ${s.name} · ${date}`, `#/uni/${s.id}`),
      }
    }

    case 'crear_evento': {
      const titulo = String(A.titulo || '').trim()
      const date = A.fecha ? parseWhen(A.fecha) : ''
      const falta = []
      if (!titulo || tituloVago(titulo)) falta.push('cómo lo llamo')
      if (!A.fecha) falta.push('qué día')
      else if (!date) falta.push(`qué día es "${A.fecha}"`)
      if (falta.length) return { ask: pregunta('el evento', falta) }

      const cat = A.categoria ? porNombre(db.categories, A.categoria) : null
      const hora = (v) => (/^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v) : '')
      const ev = {
        id: uid('ev'),
        title: titulo,
        date,
        start: hora(A.hora),
        end: hora(A.hora_fin),
        categoryId: cat?.id || db.categories[0]?.id || null,
        notes: String(A.notas || ''),
        repeat: null,
        exceptions: [],
        createdBy: 'assistant',
      }
      update((d) => d.events.push(ev))
      return {
        text: `Evento "${titulo}" el ${date}${ev.start ? ` a las ${ev.start}` : ''}${cat ? ` en ${cat.name}` : ''}. Confírmaselo.`,
        action: creado('events', ev, `Evento · ${titulo} · ${date}${ev.start ? ` ${ev.start}` : ''}`, `#/calendario`),
      }
    }

    case 'registrar_tiempo': {
      const s = A.asignatura ? findSubject(db, A.asignatura) : null
      const p = A.proyecto ? findProject(db, A.proyecto) : null
      if (!s && !p) return { ask: '¿En qué lo apunto: en una asignatura o en un proyecto? Dime cuál.' }
      const minutes = Math.round(num(A.minutos) || 0)
      if (minutes <= 0) return { ask: '¿Cuántos minutos apunto?' }
      const date = parseWhen(A.fecha) || today()
      const ref = s || p

      const session = {
        id: uid('s'),
        area: s ? 'uni' : 'work',
        refId: ref.id,
        taskId: null,
        label: ref.name,
        date,
        start: parseIso(date).getTime(),
        end: parseIso(date).getTime() + minutes * 60000,
        seconds: minutes * 60,
        source: 'manual',
        createdBy: 'assistant',
      }
      update((d) => d.sessions.push(session))
      return {
        text: `Apuntados ${minutes} minutos en ${ref.name} el ${date}.`,
        action: creado('sessions', session, `Tiempo · ${dur(minutes * 60)} · ${ref.name} · ${date}`, s ? `#/uni/${s.id}` : `#/trabajo/${p.id}`),
      }
    }

    case 'registrar_entreno': {
      const minutes = Math.round(num(A.minutos) || 0)
      if (minutes <= 0) return { ask: '¿Cuántos minutos ha durado el entrenamiento?' }
      const tipos = db.settings.trainingTypes || []
      const tipo = (A.tipo && tipos.find((t) => norm(t) === norm(A.tipo))) || (A.tipo ? String(A.tipo) : tipos[0] || 'Rodaje')
      const date = parseWhen(A.fecha) || today()
      const tr = {
        id: uid('tr'),
        date,
        done: true,
        type: tipo,
        minutes,
        rpe: Math.min(10, Math.max(1, Math.round(num(A.rpe) || 5))),
        cmjPre: '', cmjPost: '',
        notes: String(A.notas || ''),
        createdBy: 'assistant',
      }
      // La pantalla de Atletismo es de un entreno por día: si ya hay uno, se pisa.
      const previo = (db.training || []).find((t) => t.date === date)
      update((d) => {
        d.training ||= []
        const i = d.training.findIndex((t) => t.date === date)
        if (i >= 0) d.training[i] = { ...d.training[i], ...tr, id: d.training[i].id }
        else d.training.push(tr)
      })
      return {
        text: `Entreno apuntado: ${tipo}, ${minutes} min, RPE ${tr.rpe}, el ${date}.${previo ? ' Ha sustituido al que ya había ese día.' : ''}`,
        action: previo
          ? editado('training', previo, { ...previo }, `Entreno · ${tipo} · ${minutes} min · ${date}`, '#/atletismo')
          : creado('training', tr, `Entreno · ${tipo} · ${minutes} min · ${date}`, '#/atletismo'),
      }
    }

    case 'marcar_asistencia': {
      const s = findSubject(db, A.asignatura)
      if (!s) return { text: sinAsignatura(db, A.asignatura) }
      const date = parseWhen(A.fecha)
      if (!date) return { ask: `¿Qué día quieres marcar en ${s.name}?` }
      const clases = classOccurrences(db, s, date, date)
      if (!clases.length) return { text: `El ${date} no hay clase de ${s.name} en el horario, así que no hay nada que marcar.` }
      const estado = ['present', 'absent', 'late', 'excused'].includes(A.estado) ? A.estado : null
      if (!estado) return { ask: `¿Qué pongo en la clase de ${s.name} del ${date}: fuiste, faltaste, llegaste tarde o está justificada?` }

      const antes = clases.map((o) => db.attendance.find((a) => a.subjectId === s.id && a.date === o.date && a.slot === o.slotIndex) || null)
      update((d) => {
        for (const o of clases) {
          const i = d.attendance.findIndex((a) => a.subjectId === s.id && a.date === o.date && a.slot === o.slotIndex)
          if (i >= 0) d.attendance[i].status = estado
          else d.attendance.push({ id: uid('at'), subjectId: s.id, date: o.date, slot: o.slotIndex, status: estado })
        }
      })
      const NOMBRE = { present: 'asistió', absent: 'faltó', late: 'llegó tarde', excused: 'justificada' }
      return {
        text: `Marcado en ${s.name} el ${date}: ${NOMBRE[estado]}. ${resumenFaltas(db, s)}`,
        action: {
          op: 'asistencia', id: `${s.id}-${date}`, subjectId: s.id, clases: clases.map((o) => o.slotIndex), date, antes,
          summary: `Asistencia · ${s.name} · ${date} · ${NOMBRE[estado]}`, href: `#/uni/${s.id}`,
        },
      }
    }

    case 'ajustar_asignatura': {
      const s = findSubject(db, A.asignatura)
      if (!s) return { text: sinAsignatura(db, A.asignatura) }
      const patch = {}
      const dicho2 = []
      const r = A.asistencia_minima != null ? tasa(A.asistencia_minima) : null
      if (A.asistencia_minima != null && r == null) return { text: `"${A.asistencia_minima}" no es un porcentaje válido. Pídeselo entre 0 y 100.` }
      if (r != null) { patch.attendanceMin = r; dicho2.push(`asistencia mínima ${pctFmt(r)}`) }
      if (num(A.creditos) > 0) { patch.credits = num(A.creditos); dicho2.push(`${patch.credits} ECTS`) }
      if (A.profesor) { patch.professor = String(A.profesor); dicho2.push(`profesor ${patch.professor}`) }
      if (num(A.objetivo_horas) > 0) { patch.weeklyGoalHours = num(A.objetivo_horas); dicho2.push(`${patch.weeklyGoalHours} h/semana`) }
      if (!dicho2.length) return { ask: `¿Qué quieres cambiar de ${s.name}: la asistencia mínima, los créditos, el profesor o las horas por semana?` }

      const before = Object.fromEntries(Object.keys(patch).map((k) => [k, s[k]]))
      update((d) => { const x = d.subjects.find((y) => y.id === s.id); if (x) Object.assign(x, patch) })

      const extra = patch.attendanceMin != null ? ' ' + resumenFaltas({ ...db, subjects: db.subjects.map((x) => (x.id === s.id ? { ...x, ...patch } : x)) }, s) : ''
      return {
        text: `${s.name}: ${dicho2.join(', ')}.${extra}`,
        action: editado('subjects', s, before, `${s.name} · ${dicho2.join(' · ')}`, `#/uni/${s.id}`),
      }
    }

    case 'ajustar_objetivos': {
      const patch = {}
      const dicho2 = []
      const r = A.asistencia_minima != null ? tasa(A.asistencia_minima) : null
      if (r != null) { patch.attendanceMin = r; dicho2.push(`asistencia mínima general ${pctFmt(r)}`) }
      if (num(A.horas_semana) > 0) { patch.weeklyGoalHours = num(A.horas_semana); dicho2.push(`${patch.weeklyGoalHours} h de trabajo por semana`) }
      if (num(A.entrenos_semana) > 0) { patch.weeklyTrainingGoal = num(A.entrenos_semana); dicho2.push(`${patch.weeklyTrainingGoal} entrenos por semana`) }
      if (!dicho2.length) return { ask: '¿Qué objetivo quieres cambiar: la asistencia mínima, las horas de trabajo por semana o los entrenos por semana?' }

      const before = Object.fromEntries(Object.keys(patch).map((k) => [k, db.settings[k]]))
      update((d) => Object.assign(d.settings, patch))
      return {
        text: `Objetivos actualizados: ${dicho2.join(', ')}. Esto vale para todo lo que no tenga su propio número.`,
        action: { op: 'ajustes', id: uid('cfg'), before, summary: `Ajustes · ${dicho2.join(' · ')}`, href: '#/ajustes' },
      }
    }

    /* ------------------------------------------------- archivos y carpetas */

    case 'crear_carpeta': {
      const limpio = (x) => String(x || '').split('/').map((t) => t.trim().replace(/[\\:*?"<>|]/g, '-')).filter(Boolean).join('/')
      const ruta = [limpio(A.dentro_de), limpio(A.ruta)].filter(Boolean).join('/')
      if (!ruta) return { ask: '¿Cómo quieres que se llame la carpeta, y dónde la meto?' }
      const r = await api.mkdir(ruta).catch((e) => ({ error: e.message }))
      if (r.error) return { text: `No he podido crear la carpeta: ${r.error}` }
      return {
        text: `Creada la carpeta ${ruta}.`,
        action: { op: 'carpeta', id: uid('fs'), summary: `Carpeta · ${ruta}`, href: `#/archivos/${ruta}` },
      }
    }

    case 'mover_archivo': {
      const origen = await resolverArchivo(db, { ...A, nombre: A.que }, doc)
      if (origen.ask) return origen
      const destino = String(A.a_carpeta || '').trim().replace(/^\/+|\/+$/g, '')
      if (!destino) return { ask: `¿A qué carpeta muevo "${origen.path}"?` }
      // La carpeta destino puede no existir todavía: crearla es lo que él
      // querría, y es lo que hace cualquiera al arrastrar algo a un sitio nuevo.
      await api.mkdir(destino).catch(() => {})
      const r = await api.move(origen.path, destino).catch((e) => ({ error: e.message }))
      if (r.error) return { text: `No he podido mover "${origen.path}": ${r.error}` }
      return {
        text: `Movido ${origen.path} a ${destino}/.`,
        action: {
          op: 'mover', id: uid('fs'), de: origen.path, a: r.path,
          summary: `Movido · ${origen.path.split('/').pop()} → ${destino}/`,
          href: `#/archivos/${destino}`,
        },
      }
    }

    case 'guardar_nota': {
      const contenido = String(A.contenido || '')
      if (!contenido.trim()) return { ask: '¿Qué quieres que escriba dentro?' }
      let nombre = String(A.nombre || '').trim().replace(/[\\/:*?"<>|]/g, '-')
      if (!nombre) return { ask: '¿Cómo llamo al archivo?' }
      if (!/\.[a-z0-9]{1,5}$/i.test(nombre)) nombre += '.md'
      const carpeta = String(A.carpeta || carpetaDe(db, A) || doc?.dir || '').replace(/^\/+|\/+$/g, '')
      if (carpeta) await api.mkdir(carpeta).catch(() => {})
      const ruta = carpeta ? `${carpeta}/${nombre}` : nombre
      const r = await api.writeText(ruta, contenido).catch((e) => ({ error: e.message }))
      if (r.error) return { text: `No he podido guardarlo: ${r.error}` }
      return {
        text: `Guardado en ${ruta}.`,
        action: { op: 'archivo', id: uid('fs'), summary: `Guardado · ${ruta}`, href: `#/archivos/${carpeta}` },
      }
    }

    case 'borrar': {
      const lista = LISTA[A.tipo]
      if (!lista) return { text: `No sé borrar cosas del tipo "${A.tipo}".` }
      const campo = A.tipo === 'proyecto' ? 'name' : A.tipo === 'entreno' ? 'type' : 'title'
      const items = db[lista] || []
      const hit = items.find((x) => norm(x[campo]) === norm(A.nombre))
        || items.filter((x) => norm(x[campo]).includes(norm(A.nombre)))[0]
      if (!hit) return { text: `No encuentro ningún ${A.tipo} que se llame "${A.nombre}". Lo que hay: ${items.map((x) => x[campo]).join(', ') || 'nada'}.` }
      const index = items.indexOf(hit)
      update((d) => { d[lista] = (d[lista] || []).filter((x) => x.id !== hit.id) })
      return {
        text: `Borrado el ${A.tipo} "${hit[campo]}". Dile que puede deshacerlo desde la tarjeta si se ha equivocado.`,
        action: borrado(lista, hit, index, `Borrado · ${A.tipo} · ${hit[campo]}`, '#/'),
      }
    }

    default:
      return { text: `No existe ninguna herramienta llamada "${name}". Contéstale con lo que ya sabes, sin herramientas.` }
  }
}

/* ------------------------------------------------------------ auxiliares -- */

const NOMBRE_AMBITO = { uni: 'Universidad', trabajo: 'Trabajo', personal: 'tus cosas' }
const areaDe = (ambito) => (ambito === 'trabajo' ? 'work' : ambito === 'personal' ? 'life' : 'uni')

const etiquetaDe = (db, t) => {
  const ref = db.subjects.find((x) => x.id === t.refId) || db.projects.find((x) => x.id === t.refId)
  return ref ? ` (${ref.name})` : t.area === 'work' ? ' (trabajo)' : t.area === 'life' ? ' (personal)' : ''
}

const sinAsignatura = (db, nombre) =>
  `No encuentro ninguna asignatura llamada "${nombre}". Las que hay son: ${db.subjects.map((x) => x.name).join(', ') || 'ninguna'}. Pregúntale a cuál se refiere.`

function resumenFaltas(db, s) {
  const b = attendanceBudget(db, s.id)
  if (!b.totalCounted) return ''
  const falta = b.absences === 1 ? '1 falta' : `${b.absences} faltas`
  return `Ahora lleva ${falta} y le ${b.left === 1 ? 'queda 1' : `quedan ${b.left}`} de ${b.maxAbsences}.`
}

/** La pregunta que se le hace al usuario cuando el modelo no traía los datos. */
function pregunta(que, faltan) {
  if (faltan.length === 1) return `Antes de crear ${que} necesito saber ${faltan[0]}.`
  const ultimo = faltan[faltan.length - 1]
  return `Antes de crear ${que} necesito un par de cosas: ${faltan.slice(0, -1).join(', ')} y ${ultimo}.`
}

/**
 * De «el PDF de integrales» a una ruta de verdad.
 *
 * Antes solo valía el nombre exacto dentro de la carpeta de la asignatura, y el
 * ayudante contestaba que no lo encontraba a cosas que estaban ahí. Ahora se
 * mira, por este orden: la ruta tal cual, la carpeta que se le indique, la que
 * está mirando, y por último una búsqueda en todo el directorio.
 */
async function resolverArchivo(db, A, doc) {
  const pedido = String(A.nombre || A.que || '').trim()
  if (!pedido) {
    if (doc?.path) return { path: doc.path }
    return { ask: '¿Qué documento? Dime el nombre, o ábrelo y vuelve a preguntarme.' }
  }

  // Una ruta completa que existe no hay que buscarla.
  if (pedido.includes('/')) {
    const existe = await api.list(pedido.split('/').slice(0, -1).join('/')).catch(() => null)
    const hit = (existe?.items || []).find((f) => norm(f.name) === norm(pedido.split('/').pop()))
    if (hit) return { path: hit.path }
  }

  const cerca = [carpetaDe(db, A), doc?.dir].filter(Boolean)
  for (const carpeta of cerca) {
    const r = await api.tree(carpeta).catch(() => null)
    const todos = aplanar(r?.items || []).filter((f) => !f.dir)
    const hit = todos.find((f) => norm(f.name) === norm(pedido)) || todos.find((f) => norm(f.name).includes(norm(pedido)))
    if (hit) return { path: hit.path }
  }

  const sinExt = pedido.replace(/\.[^.]+$/, '')
  const r = await api.search(sinExt, carpetaDe(db, A)).catch(() => null)
  const hits = (r?.items || []).filter((f) => !f.dir)
  if (hits.length === 1) return { path: hits[0].path }
  if (hits.length > 1) {
    const exacto = hits.find((f) => norm(f.name) === norm(pedido))
    if (exacto) return { path: exacto.path }
    return {
      ask: `Hay varios que se llaman parecido a "${pedido}". ¿Cuál?\n` +
        hits.slice(0, 8).map((f) => `· ${f.path}`).join('\n'),
    }
  }
  return { ask: `No encuentro ningún archivo que se llame "${pedido}". ¿Cómo se llama exactamente, o en qué carpeta está?` }
}

function carpetaDe(db, A) {
  if (A.carpeta) return String(A.carpeta)
  const s = A.asignatura ? findSubject(db, A.asignatura) : null
  if (s?.folder) return s.folder
  const p = A.proyecto ? findProject(db, A.proyecto) : null
  return p?.folder || ''
}

/** El árbol viene anidado; para listarlo y buscar en él va mejor plano. */
function aplanar(items, out = []) {
  for (const it of items) {
    out.push(it)
    if (it.children) aplanar(it.children, out)
  }
  return out
}

/** Qué tarjetas del ayudante se pueden deshacer. */
export const sePuedeDeshacer = (a) => a.op !== 'carpeta' && a.op !== 'archivo'

/**
 * Deshacer lo que el ayudante acaba de hacer.
 *
 * Es asíncrona porque mover un archivo se deshace moviéndolo de vuelta, y eso
 * es un viaje al disco. Crear una carpeta o escribir un archivo no se deshacen:
 * borrar cosas del disco «por si acaso» es exactamente lo que no debe hacer una
 * app con tus apuntes dentro.
 */
export async function undoAction(a, update) {
  if (a.op === 'mover') {
    const volver = a.de.split('/').slice(0, -1).join('/')
    await api.move(a.a, volver)
    return
  }
  update((d) => {
    if (a.op === 'crear') d[a.list] = (d[a.list] || []).filter((x) => x.id !== a.id)
    else if (a.op === 'borrar') {
      d[a.list] ||= []
      d[a.list].splice(Math.min(a.index, d[a.list].length), 0, a.item)
    } else if (a.op === 'editar') {
      const x = (d[a.list] || []).find((y) => y.id === a.id)
      if (x) Object.assign(x, a.before)
    } else if (a.op === 'ajustes') Object.assign(d.settings, a.before)
    else if (a.op === 'asistencia') {
      for (let i = 0; i < a.clases.length; i++) {
        const slot = a.clases[i]
        const previo = a.antes[i]
        const j = d.attendance.findIndex((x) => x.subjectId === a.subjectId && x.date === a.date && x.slot === slot)
        if (j >= 0) d.attendance.splice(j, 1)
        if (previo) d.attendance.push(previo)
      }
    }
  })
}

/* -------------------------------------------------------- contexto ------- */

/**
 * El modelo no puede consultar la base de datos por su cuenta, así que arranca
 * sabiendo dónde está parado: fecha, asignaturas y qué hay encima de la mesa.
 */
const horasVoluntariado = (db) =>
  ((db.volunteerDays || []).reduce((a, d) => a + (Number(d.minutes) || 0), 0) / 60).toFixed(1)

export function systemPrompt(db, { doc = null } = {}) {
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
    db.projects.length ? `Proyectos de trabajo: ${db.projects.map((p) => p.name).join(', ')}.` : '',
    (db.volunteering || []).length
      ? `Voluntariado: colabora con ${db.volunteering.map((v) => v.name).join(', ')}, ${horasVoluntariado(db)} h apuntadas.`
      : '',
    exams.length ? `Exámenes próximos: ${exams.slice(0, 5).map((e) => `${e.title} de ${e.subject?.name} el ${e.date}`).join('; ')}.` : '',
    '',
    'Sus archivos:',
    '- Todo vive en carpetas dentro de su directorio de trabajo. PUEDES leerlas, buscar en ellas, crear carpetas, mover archivos y escribir notas.',
    '- Sabes leer texto, apuntes, código, PDF y Word. Un PDF escaneado no, porque son imágenes.',
    doc?.dir !== undefined && doc?.dir !== null
      ? `- Ahora mismo está en la carpeta "${doc.dir || 'la raíz del directorio'}". Cuando diga «aquí», es esa.`
      : '',
    doc?.path
      ? `- Y tiene delante el documento "${doc.name}" (${doc.path}). Cuando diga «este documento» o «esto», es ese: léelo con leer_documento sin argumentos.`
      : '',
    '',
    'Cómo trabajas:',
    '- Responde SIEMPRE en español, en segunda persona y sin rodeos. Dos o tres frases salvo que te pidan más.',
    '- No todo necesita herramienta. Una opinión, una duda de temario, ayuda a redactar o una charla se contestan directamente, con tu propio criterio. NUNCA digas «no tengo una función para eso»: si no hay herramienta, contesta igual.',
    '- Para cualquier dato concreto de su vida (faltas, horas, fechas, tareas, entrenos, voluntariado) sí usa las herramientas. No te inventes números nunca.',
    '- Si nombra un documento y no sabes dónde está, BÚSCALO con buscar_archivos antes de decir nada. Que no sepas la ruta no es motivo para decirle que no puedes.',
    '- Si te pide ordenar, guardar algo en su sitio o hacer sitio para algo, hazlo: crear_carpeta y mover_archivo están para eso.',
    '- NO RELLENES NINGÚN CAMPO QUE ÉL NO TE HAYA DICHO. Si no ha dicho la asignatura, no pongas asignatura. Si no ha dicho el título, no te lo inventes a partir de su frase: deja el campo vacío y la herramienta te dirá qué preguntar.',
    '- Cuando una herramienta te pida datos que faltan, hazle esa pregunta y espera. No vuelvas a llamar a la herramienta hasta que te conteste.',
    '- Cuando hables de faltas, di cuántas lleva, cuántas le quedan y de cuántas clases sale el cálculo.',
    '- Si un dato no es fiable (clases sin fecha de fin, asistencia sin marcar), dilo.',
  ].filter(Boolean).join('\n')
}
