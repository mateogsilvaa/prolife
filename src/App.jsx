import React, { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import StatusBar from './components/StatusBar.jsx'
import TimeReview from './components/TimeReview.jsx'
import Assistant from './components/Assistant.jsx'
import Icon from './components/Icon.jsx'
import Modal from './components/Modal.jsx'
import Launcher from './components/Launcher.jsx'
import TaskEditor, { newTask } from './components/TaskEditor.jsx'
import ConectarDrive from './components/ConectarDrive.jsx'
import { useStore } from './lib/store.jsx'
import { enDrive } from './lib/api.js'
import { raizGuardada } from './lib/drive.js'
import { TrackerProvider } from './lib/tracker.jsx'
import { UIProvider, useUI } from './lib/ui.jsx'

import Dashboard from './views/Dashboard.jsx'
import Uni from './views/Uni.jsx'
import SubjectDetail from './views/SubjectDetail.jsx'
import Work from './views/Work.jsx'
import ProjectDetail from './views/ProjectDetail.jsx'
import Tasks from './views/Tasks.jsx'
import Training from './views/Training.jsx'
import Calendar from './views/Calendar.jsx'
import Stats from './views/Stats.jsx'
import Files from './views/Files.jsx'
import Settings from './views/Settings.jsx'
import Space from './views/Space.jsx'

function useRoute() {
  const read = () => {
    const path = (window.location.hash || '#/').slice(1).split('?')[0] || '/'
    return { path, parts: path.split('/').filter(Boolean).map(decodeURIComponent) }
  }
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => { setRoute(read()); document.querySelector('.view')?.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export default function App() {
  const { db, error } = useStore()

  /**
   * En el APK, mientras no se haya dicho con qué cuenta y en qué carpeta, no
   * hay nada que enseñar: la app no tiene datos propios, están todos en Drive.
   * Se comprueba antes que el error, porque «no hay carpeta elegida» no es un
   * fallo, es que todavía no se ha configurado.
   */
  const [conectado, setConectado] = useState(() => !!raizGuardada())
  if (enDrive && !conectado) return <ConectarDrive onListo={() => { setConectado(true); location.reload() }} />

  if (error) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 40, textAlign: 'center' }}>
        <div>
          <h2 className="display" style={{ fontSize: 30 }}>
            {error.auth ? 'Este aparato no está emparejado' : 'El servidor local no responde'}
          </h2>
          <p className="muted" style={{ maxWidth: '46ch' }}>
            {error.auth
              ? 'Para abrir prolife desde la tablet hace falta el enlace de emparejamiento, que se copia en el ordenador desde Ajustes → Abrir en la tablet o el móvil.'
              : 'prolife necesita su servidor interno para leer y escribir en tus carpetas.'}
          </p>
          <p className="dim mono" style={{ fontSize: 12 }}>{error.message}</p>
          <button className="btn primary" onClick={() => location.reload()}>Reintentar</button>
        </div>
      </div>
    )
  }

  if (!db) return <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}><span className="dim">cargando…</span></div>

  return (
    <TrackerProvider>
      <UIProvider>
        <Shell />
      </UIProvider>
    </TrackerProvider>
  )
}

function Shell() {
  const { toasts, remote, reload, dismissRemote, future, offline, back, unsaved, retryNow, queued, sendQueue } = useStore()
  const ui = useUI()
  const route = useRoute()
  const [palette, setPalette] = useState(false)
  const [adding, setAdding] = useState(null)
  const [review, setReview] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.closest?.('.cm-editor')
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); ui.toggleDock() }
      else if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); ui.toggleSidebar() }
      else if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true) }
      else if (mod && e.key.toLowerCase() === 'j') { e.preventDefault(); setReview(true) }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); ui.toggleZen() }
      else if (e.key === 'Escape' && ui.zen) { ui.setZen(false) }
      else if (!typing && !mod && e.key === 'n') { e.preventDefault(); setAdding(newTask()) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ui])

  const p = route.parts
  const isSpace = p[0] === 'espacio'
  // vistas que ocupan todo el alto y gestionan su propio desplazamiento
  const flush = isSpace || p[0] === 'archivos'
  let view
  if (p.length === 0) view = <Dashboard />
  else if (isSpace) view = <Space kind={p[1]} id={p[2]} />
  else if (p[0] === 'uni') view = p[1] ? <SubjectDetail id={p[1]} /> : <Uni />
  else if (p[0] === 'trabajo') view = p[1] ? <ProjectDetail id={p[1]} /> : <Work />
  else if (p[0] === 'tareas') view = <Tasks />
  else if (p[0] === 'atletismo') view = <Training />
  else if (p[0] === 'calendario') view = <Calendar />
  else if (p[0] === 'estadisticas') view = <Stats />
  else if (p[0] === 'archivos') view = <Files path={p.slice(1).join('/')} />
  else if (p[0] === 'ajustes') view = <Settings />
  else view = <Dashboard />

  return (
    <div className={`shell${ui.sidebar ? '' : ' no-sidebar'}${ui.zen ? ' zen' : ''}`}>
      {ui.sidebar && <Sidebar route={route} onAI={ui.toggleDock} dockOpen={ui.dock} />}

      <div className="main">
        <div className="topbar">
          {!ui.sidebar && (
            <button className="btn ghost icon" title="Mostrar menú (Ctrl+B)" onClick={ui.toggleSidebar}>
              <Icon name="chevronR" size={15} />
            </button>
          )}
          <StatusBar onReview={() => setReview(true)} />
          <div className="spacer" />
          <button className={`btn sm ${ui.dock ? 'primary' : 'ghost'}`} onClick={ui.toggleDock} title="Ayudante (Ctrl+I)">
            <Icon name="sparkle" size={14} /> Ayudante
          </button>
          <button className="btn sm primary" onClick={() => setAdding(newTask())}>
            <Icon name="plus" size={13} /> Tarea
          </button>
        </div>
        {offline && (
          <div className="notice bar">
            <Icon name="refresh" size={13} />
            <span>
              {back
                ? `El ordenador ha vuelto${queued ? '' : ' y ya tiene lo que apuntaste'}. Recarga para poder editarlo todo otra vez.`
                : 'Sin conexión con el ordenador: esto es lo último que se vio. Puedes consultarlo todo, y apuntar faltas, tareas y entrenos — se le cuentan cuando vuelva. Lo demás no se puede editar desde aquí.'}
            </span>
            {back && (
              <>
                <div className="spacer" />
                <button className="btn sm primary" onClick={() => location.reload()}>Recargar</button>
              </>
            )}
          </div>
        )}
        {future && (
          <div className="notice bar err">
            <Icon name="x" size={13} />
            <span>
              Este <span className="mono">db.json</span> lo escribió una versión más nueva de prolife
              {typeof future === 'number' ? ` (v${future})` : ''}. Para no estropear nada, aquí no se guarda
              nada hasta que actualices la app en este ordenador.
            </span>
          </div>
        )}
        {queued > 0 && (
          <div className="notice bar">
            <Icon name="clock" size={13} />
            <span>
              {queued === 1 ? 'Hay 1 cambio apuntado' : `Hay ${queued} cambios apuntados`} aquí que el ordenador
              todavía no sabe. Se le cuentan solos en cuanto vuelva a estar a tiro.
            </span>
            <div className="spacer" />
            <button className="btn sm primary" onClick={sendQueue}>Intentar ahora</button>
          </div>
        )}
        {unsaved && (
          <div className="notice bar err">
            <Icon name="clock" size={13} />
            <span>
              Lo último que has hecho <strong>todavía no está en el disco</strong>: el guardado no pasó
              y se sigue intentando. No cierres la app hasta que este aviso desaparezca.
            </span>
            <div className="spacer" />
            <button className="btn sm primary" onClick={retryNow}>Intentar ahora</button>
          </div>
        )}
        {remote && (
          <div className="notice bar">
            <Icon name="refresh" size={13} />
            <span>
              Los datos han cambiado fuera de esta ventana — normalmente porque los tocaste en el otro
              ordenador y Drive los ha traído. Recarga para verlos.
            </span>
            <div className="spacer" />
            <button className="btn sm primary" onClick={reload}>Recargar</button>
            <button className="btn sm ghost icon" onClick={dismissRemote}><Icon name="x" size={12} /></button>
          </div>
        )}
        <div className={`view${flush ? ' flush' : ''}`}>
          <div className="view-narrow">{view}</div>
        </div>
      </div>

      {ui.zen && (
        <button className="zen-exit" onClick={() => ui.setZen(false)} title="Salir del modo concentración (Esc)">
          <Icon name="x" size={13} /> concentración
        </button>
      )}

      <Assistant open={ui.dock} onClose={() => ui.setDock(false)} width={ui.dockWidth} setWidth={ui.setDockWidth} />

      {palette && (
        <Modal title="Accesos rápidos" onClose={() => setPalette(false)}>
          <Launcher onOpenDock={() => { setPalette(false); ui.setDock(true) }} />
        </Modal>
      )}
      {adding && <TaskEditor task={adding} onClose={() => setAdding(null)} />}
      {review && <TimeReview onClose={() => setReview(false)} />}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.kind === 'err' ? ' err' : ''}`}>
            <Icon name={t.kind === 'err' ? 'x' : 'check'} size={12} /> {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}
