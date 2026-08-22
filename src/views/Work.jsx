import React, { useState } from 'react'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import { useStore, uid, slug, PALETTE } from '../lib/store.jsx'
import { api } from '../lib/api.js'
import { dur, startOfWeek, addDays, iso } from '../lib/date.js'

export function emptyProject(n = 0, org = '') {
  return { id: uid('prj'), name: '', org, color: PALETTE[(n + 3) % PALETTE.length], folder: '', notes: '' }
}

export const projectStats = (db, id) => {
  const all = db.sessions.filter((s) => s.refId === id)
  const wk = iso(startOfWeek(new Date()))
  const week = all.filter((s) => s.date >= wk).reduce((a, s) => a + s.seconds, 0)
  const month = all.filter((s) => s.date.slice(0, 7) === iso().slice(0, 7)).reduce((a, s) => a + s.seconds, 0)
  return { total: all.reduce((a, s) => a + s.seconds, 0), week, month, open: db.tasks.filter((t) => t.refId === id && t.status !== 'done') }
}

export default function Work() {
  const { db } = useStore()
  const [form, setForm] = useState(null)

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Trabajo{db.settings.orgName ? ` · ${db.settings.orgName}` : ''}</div>
          <h2>Proyectos</h2>
          <p>Los proyectos que llevas en paralelo, cada uno con su carpeta y su tiempo aproximado.</p>
        </div>
        <button className="btn primary" onClick={() => setForm(emptyProject(db.projects.length, db.settings.orgName))}>
          <Icon name="plus" size={13} /> Proyecto
        </button>
      </div>

      {db.projects.length === 0 ? (
        <div className="empty">
          <div className="display">Sin proyectos todavía</div>
          <p style={{ maxWidth: '44ch', margin: '0 auto 16px' }}>
            Añade cada línea de trabajo que lleves en paralelo. Se creará su carpeta dentro de
            <span className="mono"> Trabajo/</span> y el tiempo se irá acumulando solo.
          </p>
          <button className="btn primary" onClick={() => setForm(emptyProject(0, db.settings.orgName))}><Icon name="plus" size={13} /> Crear el primero</button>
        </div>
      ) : (
        <div className="sub-grid">
          {db.projects.map((p) => {
            const st = projectStats(db, p.id)
            return (
              <a key={p.id} className="sub-card" href={`#/trabajo/${p.id}`} style={{ '--c': p.color, display: 'block', textDecoration: 'none' }}>
                <h4>{p.name}</h4>
                <div className="dim mono" style={{ fontSize: 11 }}>{p.org || '—'}</div>
                <div className="row" style={{ gap: 18, marginTop: 14 }}>
                  <div>
                    <div className="num" style={{ fontSize: 22 }}>{(st.week / 3600).toFixed(1)}h</div>
                    <div className="eyebrow">esta semana</div>
                  </div>
                  <div>
                    <div className="num" style={{ fontSize: 22 }}>{(st.month / 3600).toFixed(1)}h</div>
                    <div className="eyebrow">este mes</div>
                  </div>
                  <div>
                    <div className="num" style={{ fontSize: 22 }}>{(st.total / 3600).toFixed(0)}h</div>
                    <div className="eyebrow">acumulado</div>
                  </div>
                </div>
                {st.open.length > 0 && <span className="badge hot" style={{ marginTop: 12, display: 'inline-block' }}>{st.open.length} pendientes</span>}
              </a>
            )
          })}
        </div>
      )}

      {form && <ProjectForm project={form} onClose={() => setForm(null)} />}
    </>
  )
}

export function ProjectForm({ project, onClose }) {
  const { db, update, toast } = useStore()
  const [p, setP] = useState(project)
  const exists = db.projects.some((x) => x.id === p.id)
  const set = (patch) => setP((x) => ({ ...x, ...patch }))

  const save = async () => {
    if (!p.name.trim()) return toast('Ponle nombre al proyecto', 'err')
    const folder = p.folder || `Trabajo/${slug(p.name)}`
    try { await api.mkdir(folder) } catch (e) { toast(e.message, 'err') }
    update((d) => {
      const i = d.projects.findIndex((x) => x.id === p.id)
      const val = { ...p, folder }
      if (i >= 0) d.projects[i] = val
      else d.projects.push(val)
    })
    onClose()
  }

  const remove = () => {
    if (!confirm('¿Eliminar el proyecto? Sus archivos siguen en el disco.')) return
    update((d) => { d.projects = d.projects.filter((x) => x.id !== p.id) })
    location.hash = '#/trabajo'
    onClose()
  }

  return (
    <Modal
      title={exists ? 'Editar proyecto' : 'Nuevo proyecto'}
      onClose={onClose}
      foot={
        <>
          {exists && <button className="btn ghost danger" onClick={remove}><Icon name="trash" size={13} /> Eliminar</button>}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={save}>Guardar</button>
        </>
      }
    >
      <div className="stack">
        <div className="field"><label>Nombre</label><input className="input" autoFocus value={p.name} onChange={(e) => set({ name: e.target.value })} /></div>
        <div className="field">
          <label>Organización</label>
          <input className="input" value={p.org || ''} placeholder="RFEA" onChange={(e) => set({ org: e.target.value })} />
        </div>
        <div className="field">
          <label>Color</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {PALETTE.map((c) => (
              <button key={c} onClick={() => set({ color: c })} style={{ width: 22, height: 22, borderRadius: 4, background: c, outline: p.color === c ? '2px solid var(--ink)' : 'none', outlineOffset: 2 }} />
            ))}
          </div>
        </div>
        <div className="field"><label>Notas</label><textarea className="textarea" value={p.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
      </div>
    </Modal>
  )
}

export { dur }
