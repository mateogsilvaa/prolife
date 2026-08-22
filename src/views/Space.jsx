import React from 'react'
import Icon from '../components/Icon.jsx'
import Workspace from '../components/Workspace.jsx'
import { useStore, AREAS, slug } from '../lib/store.jsx'
import { useTrackingContext } from '../lib/tracker.jsx'
import { api } from '../lib/api.js'
import { dur } from '../lib/date.js'

/**
 * El sitio donde se trabaja de verdad: una asignatura, un proyecto o una tarea
 * con su carpeta real abierta. Mientras esta pantalla esté delante y estés
 * activo, el tiempo se atribuye aquí.
 */
export default function Space({ kind, id }) {
  const { db, toast } = useStore()

  const entity =
    kind === 'uni' ? db.subjects.find((s) => s.id === id)
    : kind === 'trabajo' ? db.projects.find((p) => p.id === id)
    : db.tasks.find((t) => t.id === id)

  const area = kind === 'uni' ? 'uni' : kind === 'trabajo' ? 'work' : entity?.area || 'life'
  const refId = kind === 'tarea' ? entity?.refId || null : id
  const taskId = kind === 'tarea' ? id : null

  useTrackingContext(
    entity ? { area, refId, taskId, label: entity.name || entity.title } : null
  )

  if (!entity) {
    return (
      <div className="ws-shell">
        <div className="ws-blank">
          <div className="display">Eso ya no existe</div>
          <a className="btn" href="#/">Volver al inicio</a>
        </div>
      </div>
    )
  }

  const name = entity.name || entity.title
  const folder = entity.folder
  const back = kind === 'uni' ? `#/uni/${id}` : kind === 'trabajo' ? `#/trabajo/${id}` : '#/tareas'
  const spent = db.sessions
    .filter((s) => (taskId ? s.taskId === taskId : s.refId === refId))
    .reduce((a, s) => a + s.seconds, 0)

  if (!folder) return <CreateFolder entity={entity} kind={kind} back={back} />


  return (
    <div className="ws-shell">
      <header className="ws-head">
        <a className="btn ghost icon" href={back} title="Volver a la ficha"><Icon name="chevronL" size={15} /></a>
        <span className="dot" style={{ background: entity.color || AREAS[area]?.color }} />
        <h2>{name}</h2>
        <span className="badge">{kind === 'uni' ? 'asignatura' : kind === 'trabajo' ? 'proyecto' : 'tarea'}</span>
        <span className="mono dim" style={{ fontSize: 11 }}>{dur(spent)} acumuladas</span>
        <div className="spacer" />
        {entity.portalUrl && (
          <button className="btn sm ghost" onClick={() => api.openUrl(entity.portalUrl)}><Icon name="external" size={12} /> Campus</button>
        )}
        <button
          className="btn sm ghost"
          title="Abrir la carpeta en VS Code"
          onClick={() => api.openInCode(entity.repoPath || folder).then(() => toast('Abriendo VS Code…')).catch((e) => toast(e.message, 'err'))}
        >
          <Icon name="code" size={12} /> VS Code
        </button>
      </header>
      <Workspace root={folder} />
    </div>
  )
}

/** Una tarea recién creada aún no tiene carpeta: se crea aquí, donde toca. */
function CreateFolder({ entity, kind, back }) {
  const { db, update, toast } = useStore()
  const name = entity.name || entity.title

  const parent =
    (entity.area === 'uni' && db.subjects.find((s) => s.id === entity.refId)?.folder) ||
    (entity.area === 'work' && db.projects.find((p) => p.id === entity.refId)?.folder) ||
    (kind === 'uni' ? 'Universidad' : kind === 'trabajo' ? 'Trabajo' : 'Tareas')
  const target = `${parent}/${slug(name)}`

  const create = async () => {
    try {
      await api.mkdir(target)
      update((d) => {
        const list = kind === 'uni' ? d.subjects : kind === 'trabajo' ? d.projects : d.tasks
        const found = list.find((x) => x.id === entity.id)
        if (found) found.folder = target
      })
      toast('Carpeta creada')
    } catch (e) {
      toast(e.message, 'err')
    }
  }

  return (
    <div className="ws-shell">
      <div className="ws-blank">
        <div className="display">Sin carpeta todavía</div>
        <p className="dim" style={{ maxWidth: '42ch' }}>
          Se creará <span className="mono">{target}</span> dentro de tu directorio, y ahí irán
          enunciados, entregas y cualquier documento de esto.
        </p>
        <div className="row" style={{ gap: 8 }}>
          <a className="btn ghost" href={back}>Volver</a>
          <button className="btn primary" onClick={create}><Icon name="folder" size={13} /> Crear la carpeta</button>
        </div>
      </div>
    </div>
  )
}
