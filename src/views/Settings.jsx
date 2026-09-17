import React, { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import Icon from '../components/Icon.jsx'
import { LOGO_PATH, bumpLogo } from '../components/Brand.jsx'
import { useStore, uid, PALETTE, isDesktop } from '../lib/store.jsx'
import { api, enDrive } from '../lib/api.js'
import { canStore, usage, clearAll } from '../lib/offline.js'
import { classesBetween } from '../lib/stats.js'
import { today } from '../lib/date.js'

/**
 * Los archivos que se han guardado en ESTE aparato para poder abrirlos sin el
 * ordenador. Se enseña cuánto ocupan porque es lo único que hace que la decisión
 * de guardar sea informada.
 */
function OfflineFiles() {
  const { toast } = useStore()
  const [state, setState] = useState(null)

  const refresh = () => usage().then(setState)
  useEffect(() => { refresh() }, [])

  if (!canStore() || !state || state.files === 0) return null

  const size =
    state.bytes < 1024 ? `${state.bytes} B`
    : state.bytes < 1048576 ? `${Math.round(state.bytes / 1024)} KB`
    : `${(state.bytes / 1048576).toFixed(1)} MB`
  return (
    <div className="card">
      <div className="card-head">
        <h3>Archivos guardados en este aparato</h3>
        <span className="badge">{state.files}</span>
      </div>
      <p className="dim" style={{ fontSize: 12.5, marginTop: 0, lineHeight: 1.6 }}>
        Se pueden abrir aunque el ordenador esté apagado. Ocupan{' '}
        <strong>{size}</strong> del
        almacenamiento de este aparato. Se guardan uno a uno, desde el botón de cada archivo abierto.
      </p>
      <button
        className="btn sm danger"
        onClick={async () => {
          await clearAll()
          await refresh()
          toast('Vaciado')
        }}
      >
        <Icon name="trash" size={12} /> Vaciar
      </button>
    </div>
  )
}

/**
 * Si esta pantalla se está viendo desde el aparato que se quiere instalar, dice
 * directamente si va a poder instalarse o no, que es más útil que explicarlo.
 */
function SecureHint() {
  const secure = typeof window !== 'undefined' && window.isSecureContext
  const sw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  const local = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)

  // En el ordenador esto no aporta nada: la app ya está donde tiene que estar.
  if (local) return null

  const ok = secure && sw
  return (
    <div className="card">
      <div className="card-head">
        <h3>Instalar en este aparato</h3>
        {ok && <span className="badge">se puede</span>}
      </div>
      <div className={`notice${ok ? '' : ' err'}`}>
        <Icon name={ok ? 'check' : 'x'} size={13} />
        <span style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          {ok
            ? 'Esta dirección es segura. Usa «Añadir a pantalla de inicio» en el menú del navegador y prolife quedará instalada, con su icono y capaz de abrir aunque el ordenador no esté.'
            : 'Esta dirección no es segura (http a secas), así que el navegador no deja instalarla ni guardar nada para consultar sin conexión. La app funciona igual, pero solo mientras el ordenador esté encendido y a tu alcance.'}
        </span>
      </div>
      {!ok && (
        <p className="dim" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 0 }}>
          Para arreglarlo, ve <strong>al ordenador</strong> → Ajustes → «Abrir en la tablet o el
          móvil»: ahí abajo hay un botón, <strong>«Activar acceso fuera de casa»</strong>, que monta
          la dirección <span className="mono">https://…ts.net</span> y te enseña un código QR para
          abrirla aquí. Es lo mismo que hace que funcione desde la universidad. Lo único que tienes
          que haber hecho tú antes es entrar en Tailscale con tu cuenta en los dos aparatos.
        </p>
      )}
    </div>
  )
}

/**
 * Todo el ritual de Tailscale, hecho desde aquí en vez de contado en un manual.
 *
 * Antes había que: instalar Tailscale, entrar con la cuenta, activar los
 * certificados en su web, teclear `tailscale serve --bg`, copiar la dirección
 * que devuelve y pegarle detrás la clave a mano. De todo eso, lo único que de
 * verdad tiene que pasar por un humano es entrar en Tailscale la primera vez
 * —abre un navegador, no tiene sentido automatizarlo—; el resto es exactamente
 * lo mismo que haría un comando, así que lo hace este botón.
 */
function TailscaleSetup({ port, token }) {
  const { toast } = useStore()
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState(null)

  const check = () =>
    api.tailscaleStatus().then(setStatus).catch(() => setStatus({ installed: false, error: 'no se ha podido comprobar' }))

  useEffect(() => { check() }, [])

  const activar = async () => {
    setBusy(true)
    try {
      setStatus(await api.tailscaleServe())
    } catch (e) {
      toast(e.message, 'err')
    } finally {
      setBusy(false)
    }
  }

  const copy = (text) =>
    navigator.clipboard?.writeText(text).then(() => toast('Copiado'), () => toast('No se ha podido copiar', 'err'))

  const url = status?.dnsName ? `https://${status.dnsName}/?k=${encodeURIComponent(token || '')}` : ''

  useEffect(() => {
    if (!url) return setQr(null)
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#1a1815', light: '#f5f3ee' } })
      .then(setQr)
      .catch(() => setQr(null))
  }, [url])

  if (!status) return <p className="dim" style={{ fontSize: 12.5 }}>Comprobando Tailscale…</p>

  if (!status.installed) {
    return (
      <div className="notice">
        <Icon name="link" size={13} />
        <span style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          No se encuentra Tailscale en este ordenador.{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); api.openUrl('https://tailscale.com/download') }} style={{ textDecoration: 'underline' }}>
            Instálalo
          </a>, entra con tu cuenta y vuelve a esta pantalla.
        </span>
      </div>
    )
  }

  if (!status.loggedIn) {
    return (
      <div className="notice">
        <Icon name="link" size={13} />
        <span style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          Tailscale está instalado pero <strong>no has entrado con tu cuenta todavía</strong>: es un paso
          aparte de instalarlo. Ábrelo desde el icono junto al reloj → <em>Log in</em>, o en una terminal{' '}
          <span className="mono">tailscale up</span>. En cuanto entres, dale a comprobar.
        </span>
        <div className="spacer" />
        <button className="btn sm" onClick={check}><Icon name="refresh" size={12} /> Comprobar</button>
      </div>
    )
  }

  if (!status.serving) {
    return (
      <>
        <p className="dim" style={{ fontSize: 12.5, marginTop: 0 }}>
          Tailscale ya está dentro de tu red. Falta un solo paso — es justo lo que teclearías tú, hecho
          desde aquí:
        </p>
        <button className="btn primary" onClick={activar} disabled={busy}>
          <Icon name="link" size={13} /> {busy ? 'Activando…' : 'Activar acceso fuera de casa'}
        </button>
        {status.error && (
          <p className="dim mono" style={{ fontSize: 11, marginBottom: 0 }}>
            {status.error.includes('cert') || status.error.includes('HTTPS')
              ? 'Falta activar MagicDNS y HTTPS Certificates, una vez, en login.tailscale.com/admin/dns.'
              : status.error}
          </p>
        )}
      </>
    )
  }

  return (
    <div className="row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
      {qr && (
        <img
          src={qr} width={128} height={128} alt="Código QR para abrir prolife en la tablet"
          style={{ borderRadius: 'var(--r)', border: '1px solid var(--line)', flexShrink: 0 }}
        />
      )}
      <div style={{ flex: 1, minWidth: 220 }}>
        <p className="dim" style={{ fontSize: 12.5, marginTop: 0 }}>
          Apunta la cámara de la tablet a este código — o copia el enlace y ábrelo ahí una sola vez:
        </p>
        <div className="row" style={{ gap: 8 }}>
          <span className="mono" style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{url}</span>
          <button className="btn sm" onClick={() => copy(url)}><Icon name="link" size={12} /> Copiar</button>
        </div>
        <p className="dim" style={{ fontSize: 11.5, marginBottom: 0 }}>
          Después, «Añadir a pantalla de inicio» en el menú del navegador la deja instalada, con su
          icono, y funcionando igual fuera de casa que en el salón.
        </p>
      </div>
    </div>
  )
}

/**
 * Abrir prolife en la tablet. La app se instala desde el navegador —no hay
 * Play Store de por medio— y habla con este mismo ordenador, así que ve los
 * mismos archivos y la misma base de datos, sin copias ni sincronizaciones.
 *
 * A cambio, el servidor deja de escuchar solo en 127.0.0.1, y por eso desde ese
 * momento exige una clave a todo lo que no venga de aquí.
 */
function Tablet() {
  const { toast } = useStore()
  const [state, setState] = useState(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    api.getRemote().then(setState).catch(() => setState({ unavailable: true }))
  }, [])

  const save = async (body) => {
    try {
      setState(await api.setRemote(body))
      toast('Guardado · reinicia prolife para que tome efecto')
    } catch (e) {
      toast(e.message, 'err')
    }
  }

  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(
      () => toast('Copiado'),
      () => toast('No se ha podido copiar', 'err')
    )
  }

  if (!state || state.unavailable) return null

  const links = (state.addresses || []).map((a) => ({
    ...a,
    url: `http://${a.address}:${state.port}/`,
    pair: `http://${a.address}:${state.port}/?k=${encodeURIComponent(state.token || '')}`,
  }))

  return (
    <div className="card">
      <div className="card-head">
        <h3>Abrir en la tablet o el móvil</h3>
        {state.enabled && <span className="badge hot">encendido</span>}
      </div>

      <p className="dim" style={{ fontSize: 12.5, marginTop: 0, lineHeight: 1.6 }}>
        Con esto encendido, prolife deja de escuchar solo en este ordenador y se puede abrir desde
        otro aparato de tu red. Ve <strong>los mismos archivos</strong>, porque es este mismo
        ordenador el que responde: no hay copia que sincronizar ni nada que se pueda desincronizar.
      </p>

      <label className="row" style={{ gap: 8, cursor: 'pointer', marginBottom: 4 }}>
        <input type="checkbox" checked={!!state.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
        <span style={{ fontSize: 13 }}>Permitir el acceso desde otros aparatos de la red</span>
      </label>

      {state.enabled && (
        <>
          <div className="notice" style={{ margin: '12px 0' }}>
            <Icon name="link" size={13} />
            <span style={{ fontSize: 12.5, lineHeight: 1.6 }}>
              El enlace de emparejamiento lleva la clave dentro: <strong>ábrelo una sola vez</strong> en la
              tablet y no lo reenvíes por chat. Quien lo tenga entra a todo. Para usarlo fuera de casa,
              no abras puertos del router: instala <strong>Tailscale</strong> en el ordenador y en la
              tablet y usa la dirección que empieza por 100.
            </span>
          </div>

          {links.length === 0 && (
            <p className="dim" style={{ fontSize: 12.5 }}>
              Este ordenador no tiene ninguna dirección de red ahora mismo. Conéctalo a la wifi.
            </p>
          )}

          <div className="stack" style={{ gap: 8 }}>
            {links.map((l) => (
              <div key={l.address} className="row" style={{ gap: 8 }}>
                <span className="mono" style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {l.url}
                </span>
                {l.vpn && <span className="badge">vale fuera de casa</span>}
                <button className="btn sm" onClick={() => copy(l.pair)}>
                  <Icon name="link" size={12} /> Copiar enlace de emparejamiento
                </button>
              </div>
            ))}
          </div>

          <hr className="hr" style={{ margin: '14px 0' }} />

          <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>Instalarla como app, con su icono</h4>
          <p className="dim" style={{ fontSize: 12.5, marginTop: 0, lineHeight: 1.6 }}>
            Para que Android ofrezca «Instalar app» —y para que abra sin el ordenador delante— hace
            falta que la dirección sea <strong>https</strong>, y esa parte es cosa de Tailscale, no de
            prolife. Lo que sigue lo hace esta pantalla por ti.
          </p>
          <TailscaleSetup port={state.port} token={state.token} />

          <hr className="hr" style={{ margin: '14px 0' }} />

          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm ghost" onClick={() => setShow(!show)}>
              <Icon name={show ? 'eye' : 'link'} size={12} /> {show ? 'Ocultar' : 'Ver'} la clave
            </button>
            {show && <span className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{state.token}</span>}
            <div className="spacer" />
            <button
              className="btn sm danger"
              title="Los aparatos ya emparejados dejarán de entrar"
              onClick={() => save({ renew: true })}
            >
              Renovar clave
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function Settings() {
  const { db, update, config, setConfig, toast } = useStore()
  const [dir, setDir] = useState(config?.baseDir || '')
  const s = db.settings

  // `config` se pide después del `db` (ver store.jsx), así que casi siempre
  // llega con esta pantalla ya montada: sin esto el cuadro se quedaba vacío
  // para siempre y «Cambiar» no hacía nada. Solo se rellena si no has escrito.
  useEffect(() => {
    if (config?.baseDir) setDir((d) => d || config.baseDir)
  }, [config?.baseDir])

  const setS = (patch) => update((d) => Object.assign(d.settings, patch))
  const setP = (patch) => update((d) => Object.assign(d.profile, patch))

  const totalSecs = db.sessions.reduce((a, x) => a + x.seconds, 0)

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Ajustes</div>
          <h2>Configuración</h2>
          <p>Todo vive en un JSON dentro de tu carpeta. Nada sale de tu ordenador.</p>
        </div>
      </div>

      <div className="stack" style={{ gap: 16, maxWidth: 780 }}>
        <div className="card">
          <div className="card-head"><h3>Perfil</h3></div>
          <div className="grid-3">
            <div className="field"><label>Nombre</label><input className="input" value={db.profile?.name || ''} placeholder="Mateo" onChange={(e) => setP({ name: e.target.value })} /></div>
            <div className="field"><label>Curso</label><input className="input" value={db.profile?.course || ''} onChange={(e) => setP({ course: e.target.value })} /></div>
            <div className="field"><label>Organización</label><input className="input" value={s.orgName || ''} placeholder="RFEA" onChange={(e) => setS({ orgName: e.target.value })} /></div>
          </div>
          <hr className="hr" style={{ margin: '14px 0' }} />
          <LogoPicker />
        </div>

        {/* Estas cuatro son del ordenador por definición —dónde vive la carpeta,
            el enlace para emparejar, Ollama, VS Code— y en la tablet no se
            enseñan: un cuadro que solo puede dar un error no es una función que
            falte, es un callejón. Lo que sí se puede hacer, se hace. */}
        {!enDrive && <Sync dir={dir} setDir={setDir} />}

        {!enDrive && <Tablet />}
        <SecureHint />
        <OfflineFiles />

        <div className="card">
          <div className="card-head"><h3>Medición automática del tiempo</h3></div>
          <label className="row" style={{ gap: 8, cursor: 'pointer', marginBottom: 12 }}>
            <input type="checkbox" checked={s.autoTrack !== false} onChange={(e) => setS({ autoTrack: e.target.checked })} />
            <span style={{ fontSize: 13 }}>Medir sola el tiempo de trabajo</span>
          </label>
          <div className="grid-4">
            <div className="field">
              <label>Objetivo diario (min)</label>
              <input className="input" type="number" step="30" value={s.dailyGoalMin} onChange={(e) => setS({ dailyGoalMin: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Horas por semana</label>
              <input className="input" type="number" step="1" min="1" value={s.weeklyGoalHours || 25} onChange={(e) => setS({ weeklyGoalHours: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Pausa por inactividad (s)</label>
              <input className="input" type="number" step="30" min="30" value={s.idleTimeoutSec} onChange={(e) => setS({ idleTimeoutSec: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Tramo mínimo (s)</label>
              <input className="input" type="number" step="15" min="15" value={s.minSegmentSec} onChange={(e) => setS({ minSegmentSec: Number(e.target.value) })} />
            </div>
          </div>

          <div className="field" style={{ maxWidth: 300, marginTop: 12 }}>
            <label>Cortar una sesión tras (min sin tocar el ordenador)</label>
            <input
              className="input"
              type="number"
              step="5"
              min="0"
              value={Math.round((s.manualIdleSec ?? 1800) / 60)}
              onChange={(e) => setS({ manualIdleSec: Math.max(0, Number(e.target.value)) * 60 })}
            />
            <span className="dim" style={{ fontSize: 11 }}>
              0 = no cortarla nunca. Solo afecta a las sesiones que empiezas tú.
            </span>
          </div>

          <p className="dim" style={{ fontSize: 12.5, margin: '14px 0 0', lineHeight: 1.6 }}>
            Hay dos formas de medir y conviven. Si pulsas <strong>«Trabajar en…»</strong>, la sesión
            cuenta hasta que la pares: da igual la pantalla en la que estés, si te vas al Word o si
            trabajas en papel. Si no hay ninguna sesión en marcha, se cae en la detección
            automática: el tiempo va al espacio de trabajo abierto y solo mientras la ventana tenga
            el foco y {isDesktop ? 'el sistema detecte' : 'haya'} actividad de teclado o ratón.
            Todo se corrige después desde <span className="kbd">Ctrl J</span>.
          </p>
        </div>

        {!enDrive && <Assistant />}

        <div className="card">
          <div className="card-head"><h3>Universidad</h3></div>
          <div className="stack">
            <div className="grid-2">
              <div className="field"><label>Nombre del portal</label><input className="input" value={s.portalName || ''} onChange={(e) => setS({ portalName: e.target.value })} /></div>
              <div className="field"><label>URL del portal</label><input className="input" value={s.portalUrl || ''} placeholder="https://…" onChange={(e) => setS({ portalUrl: e.target.value })} /></div>
            </div>
            <div className="grid-3">
              <div className="field"><label>Inicio del curso</label><input className="input" type="date" value={s.termStart || ''} onChange={(e) => setS({ termStart: e.target.value })} /></div>
              <div className="field"><label>Fin del curso</label><input className="input" type="date" value={s.termEnd || ''} onChange={(e) => setS({ termEnd: e.target.value })} /></div>
              <div className="field">
                <label>Asistencia mínima (%)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="100"
                  value={Math.round((s.attendanceMin ?? 0.7) * 100)}
                  onChange={(e) => setS({ attendanceMin: Number(e.target.value) / 100 })}
                />
              </div>
            </div>
            <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
              Las fechas del curso son las que hereda cada clase del horario que no tenga las suyas
              propias, y de ahí sale cuántas faltas te puedes permitir. Cada asignatura puede pisar
              el mínimo de asistencia.
            </p>
          </div>
        </div>

        <Cuatrimestres />
        <Festivos />
        {!enDrive && <GoogleCalendar />}

        {!enDrive && <VsCode />}

        <Categories />

        <div className="card">
          <div className="card-head"><h3>Atletismo</h3></div>
          <div className="field" style={{ maxWidth: 240, marginBottom: 14 }}>
            <label>Sesiones por semana (objetivo)</label>
            <input className="input" type="number" min="1" max="14" value={s.weeklyTrainingGoal || 5} onChange={(e) => setS({ weeklyTrainingGoal: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Tipos de entreno</label>
            <div className="row wrap" style={{ gap: 6 }}>
              {(s.trainingTypes || []).map((t, i) => (
                <span key={t} className="chip">
                  {t}
                  <button onClick={() => setS({ trainingTypes: s.trainingTypes.filter((_, j) => j !== i) })} style={{ opacity: 0.5 }}>
                    <Icon name="x" size={10} />
                  </button>
                </span>
              ))}
              <AddChip onAdd={(v) => setS({ trainingTypes: [...new Set([...(s.trainingTypes || []), v])] })} placeholder="Nuevo tipo…" />
            </div>
          </div>
        </div>

        <LinkEditor
          title="Otros enlaces"
          hint="Correo de la universidad, bibliografía, Notion, GitHub…"
          items={s.links || []}
          onChange={(links) => setS({ links })}
        />

        <div className="card">
          <div className="card-head"><h3>Datos</h3></div>
          <div className="row wrap" style={{ gap: 20, marginBottom: 14 }}>
            <Metric n={db.subjects.length} l="asignaturas" />
            <Metric n={db.projects.length} l="proyectos" />
            <Metric n={db.tasks.length} l="tareas" />
            <Metric n={(db.exams || []).length} l="exámenes" />
            <Metric n={db.training.length} l="entrenos" />
            <Metric n={`${(totalSecs / 3600).toFixed(0)}h`} l="registradas" />
          </div>
          {!enDrive && (
            <div className="row wrap" style={{ gap: 6 }}>
              <a className="btn sm" href={api.raw('.prolife/db.json', true)} download="prolife-db.json"><Icon name="download" size={12} /> Exportar copia</a>
              <button className="btn sm ghost" onClick={() => api.openPath('.prolife')}><Icon name="folder" size={12} /> Carpeta de datos</button>
            </div>
          )}
          <p className="dim" style={{ fontSize: 12, margin: '12px 0 0' }}>
            {enDrive
              ? 'Lo que cambies aquí se guarda en Drive y lo recoge el ordenador la próxima vez que abra la app. Las copias de seguridad las hace él, cada día, y guarda las últimas 14.'
              : 'Copia de seguridad automática cada día; se conservan las últimas 14.'}
          </p>
        </div>
      </div>
    </>
  )
}

const Metric = ({ n, l }) => (
  <div><div className="num" style={{ fontSize: 26 }}>{n}</div><div className="eyebrow">{l}</div></div>
)

/**
 * Dónde vive todo y cómo llegar a lo mismo desde dos ordenadores.
 *
 * No hay integración con la API de Google: la app apunta a la carpeta que Google
 * Drive para escritorio ya sincroniza sola. Es más simple, no pide permisos de
 * nube, funciona igual sin internet y los archivos siguen siendo archivos.
 */
function Sync({ dir, setDir }) {
  const { config, setConfig, toast } = useStore()
  const [roots, setRoots] = useState(null)
  const sync = config?.sync
  // La carpeta de trabajo se elige donde están los archivos. Desde la tablet el
  // servidor lo rechaza a propósito, así que aquí no se ofrece.
  const here = config?.here !== false

  useEffect(() => {
    if (!config || !here) return
    api.syncRoots().then(setRoots).catch(() => setRoots({ roots: [] }))
  }, [config, here])

  const move = async (target) => {
    if (!target?.trim()) return
    if (!confirm(`El directorio de trabajo pasará a:\n\n${target}\n\nNo se mueve nada: los archivos que ya tienes se quedan donde están. Si quieres llevártelos, cópialos tú a la carpeta nueva antes de reiniciar.\n\n¿Seguir?`)) return
    try {
      const c = await api.setConfig({ baseDir: target })
      setConfig(c)
      setDir(c.baseDir)
      toast('Directorio cambiado. Reinicia la app para releer los datos.')
    } catch (e) {
      toast(e.message, 'err')
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Directorio de trabajo y sincronización</h3>
        {sync?.synced && <span className="badge">se sincroniza · {sync.label}</span>}
      </div>

      <p className="dim" style={{ fontSize: 12.5, marginTop: 0, lineHeight: 1.6 }}>
        La carpeta real donde viven documentos, apuntes y la base de datos. Si la pones dentro de
        Google Drive, el mismo trabajo aparece en el ordenador de casa y en el de la universidad,
        sin cuentas ni permisos: lo sincroniza el propio Drive y los archivos siguen siendo archivos
        normales de tu disco.
      </p>

      <div className="row">
        <input
          className="input mono"
          style={{ fontSize: 12 }}
          value={dir}
          disabled={!here}
          onChange={(e) => setDir(e.target.value)}
        />
        {here && <button className="btn" onClick={() => move(dir)}>Cambiar</button>}
        <button className="btn ghost icon" title="Abrir en el explorador" onClick={() => api.openPath('')}><Icon name="external" size={14} /></button>
      </div>

      {!here && (
        <p className="dim" style={{ fontSize: 12.5, margin: '10px 0 0', lineHeight: 1.6 }}>
          Esta es la carpeta del ordenador que te está sirviendo la app, y se cambia desde él.
        </p>
      )}

      {config?.envDir && (
        <div className="notice" style={{ marginTop: 12 }}>
          <Icon name="folder" size={13} />
          <span>
            La app se ha abierto con <span className="mono">PROLIFE_DIR</span>, que manda sobre esto.
            Mientras esa variable esté puesta se trabaja en <span className="mono">{config.envDir}</span>{' '}
            aunque aquí elijas otra cosa: lo que guardes queda para la próxima vez que la abras sin ella.
          </span>
        </div>
      )}

      {roots && (
        <div style={{ marginTop: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Carpetas de nube detectadas</div>
          {roots.roots?.length ? (
            <div className="stack" style={{ gap: 5 }}>
              {roots.roots.map((r) => (
                <div className="link-tile" key={r.path} style={{ cursor: 'default' }}>
                  <span className="glyph" style={{ background: 'var(--blue)' }}><Icon name="folder" size={11} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5 }}>{r.label}</div>
                    <div className="mono dim" style={{ fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.suggested}</div>
                  </div>
                  <button className="btn sm" onClick={() => move(r.suggested)}>Usar</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="dim" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
              No se ve ninguna carpeta de Drive, OneDrive ni Dropbox montada. Instala{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); api.openUrl('https://www.google.com/intl/es/drive/download/') }} style={{ textDecoration: 'underline' }}>
                Google Drive para escritorio
              </a>{' '}
              en los dos ordenadores, deja que monte tu unidad, y vuelve aquí: aparecerá para
              elegirla con un botón.
            </p>
          )}
        </div>
      )}

      {sync?.synced && (
        <div className="notice" style={{ marginTop: 12 }}>
          <Icon name="clock" size={13} />
          <span>
            Con la carpeta compartida, <strong>no abras la app en los dos ordenadores a la vez</strong>:
            los dos escriben el mismo <span className="mono">db.json</span> y el último en guardar
            gana. Ciérrala en uno antes de abrirla en el otro y espera a que Drive termine de
            sincronizar. Hay copia diaria en <span className="mono">.prolife/backups</span> por si acaso.
          </span>
        </div>
      )}
    </div>
  )
}

/** El logo de la app. Se guarda en tu carpeta, así que también viaja con la nube. */
function LogoPicker() {
  const { toast } = useStore()
  const file = useRef(null)
  const [preview, setPreview] = useState(() => api.raw(LOGO_PATH) + `&v=${localStorage.getItem('prolife.logoV') || '0'}`)
  const [has, setHas] = useState(null)

  useEffect(() => {
    const img = new Image()
    img.src = preview
    img.onload = () => setHas(true)
    img.onerror = () => setHas(false)
  }, [preview])

  const upload = async (files) => {
    const f = files?.[0]
    if (!f) return
    if (!/^image\//.test(f.type)) return toast('Tiene que ser una imagen', 'err')
    try {
      // El nombre importa: la app siempre lee `.prolife/logo.png`.
      await api.remove(LOGO_PATH).catch(() => {})
      await api.upload('.prolife', [new File([f], 'logo.png', { type: f.type })])
      bumpLogo()
      setPreview(api.raw(LOGO_PATH) + `&v=${Date.now()}`)
      toast('Logo actualizado')
    } catch (e) {
      toast(e.message, 'err')
    }
  }

  const clear = async () => {
    try {
      await api.remove(LOGO_PATH)
      bumpLogo()
      setHas(false)
      toast('Logo quitado')
    } catch (e) {
      toast(e.message, 'err')
    }
  }

  return (
    <div className="field">
      <label>Logo</label>
      <div className="row" style={{ gap: 10 }}>
        <div
          style={{
            width: 74, height: 46, borderRadius: 'var(--r)', border: '1px dashed var(--line-strong)',
            display: 'grid', placeItems: 'center', background: 'var(--surface-2)', overflow: 'hidden', flex: '0 0 auto',
          }}
        >
          {has ? (
            <img src={preview} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          ) : (
            <span className="dim" style={{ fontSize: 10 }}>sin logo</span>
          )}
        </div>
        <div className="stack" style={{ gap: 5, flex: 1 }}>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => file.current?.click()}><Icon name="upload" size={12} /> Subir imagen</button>
            {has && <button className="btn sm ghost" onClick={clear}>Quitar</button>}
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files)} />
          </div>
          <span className="dim" style={{ fontSize: 11 }}>
            Sustituye al nombre escrito del menú lateral. Se guarda como{' '}
            <span className="mono">.prolife/logo.png</span> dentro de tu directorio, así que viaja
            con la nube a tus dos ordenadores. Un PNG con fondo transparente queda mejor.
          </span>
        </div>
      </div>
    </div>
  )
}

/** El ayudante local: qué Ollama y qué modelo, y hasta dónde le dejas llegar. */
function Assistant() {
  const { db, update, toast } = useStore()
  const a = db.settings.assistant || {}
  const [status, setStatus] = useState(null)
  const setA = (patch) => update((d) => { d.settings.assistant = { ...d.settings.assistant, ...patch } })

  const load = () => api.aiStatus(a.url).then(setStatus).catch((e) => setStatus({ running: false, models: [], error: e.message }))
  useEffect(() => { load() }, [a.url])

  return (
    <div className="card">
      <div className="card-head">
        <h3>Ayudante local</h3>
        <button className="btn sm ghost" onClick={load}><Icon name="refresh" size={12} /></button>
      </div>

      <p className="dim" style={{ fontSize: 12.5, marginTop: 0, lineHeight: 1.6 }}>
        El panel de <span className="kbd">Ctrl I</span> habla con un{' '}
        <a href="#" onClick={(e) => { e.preventDefault(); api.openUrl('https://ollama.com') }} style={{ textDecoration: 'underline' }}>Ollama</a>{' '}
        que corre en este mismo ordenador. Conoce tus asignaturas, tu horario, tus faltas y tus
        horas, y puede apuntarte tareas y exámenes. Nada de lo que le digas sale de la máquina.
      </p>

      <div className="row wrap" style={{ gap: 16, marginBottom: 12 }}>
        <div>
          <div className="num" style={{ fontSize: 22, color: status?.running ? 'var(--green)' : 'var(--ink-3)' }}>
            {!status ? '…' : status.running ? 'activo' : 'parado'}
          </div>
          <div className="eyebrow">ollama</div>
        </div>
        <div>
          <div className="num" style={{ fontSize: 22 }}>{status?.models?.length ?? '—'}</div>
          <div className="eyebrow">modelos</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label>Modelo</label>
          {status?.models?.length ? (
            <select className="select" value={a.model || ''} onChange={(e) => setA({ model: e.target.value })}>
              <option value="">— el primero disponible —</option>
              {status.models.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          ) : (
            <input className="input mono" style={{ fontSize: 12 }} placeholder="llama3.1:8b" value={a.model || ''} onChange={(e) => setA({ model: e.target.value })} />
          )}
        </div>
        <div className="field">
          <label>Dirección de Ollama</label>
          <input className="input mono" style={{ fontSize: 12 }} placeholder="http://127.0.0.1:11434" value={a.url || ''} onChange={(e) => setA({ url: e.target.value })} />
          <span className="dim" style={{ fontSize: 11 }}>Solo se permiten direcciones locales.</span>
        </div>
      </div>

      <label className="row" style={{ gap: 8, cursor: 'pointer', marginTop: 10 }}>
        <input type="checkbox" checked={a.allowWrite !== false} onChange={(e) => setA({ allowWrite: e.target.checked })} />
        <span style={{ fontSize: 13 }}>Dejarle crear tareas, exámenes y tramos de tiempo</span>
      </label>
      <p className="dim" style={{ fontSize: 12, margin: '6px 0 0' }}>
        Todo lo que cree aparece en el chat con un botón de deshacer. Sin esto, el ayudante solo
        consulta y responde.
      </p>

      {status && !status.running && (
        <pre className="mono" style={{ fontSize: 11.5, background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 6, margin: '12px 0 0' }}>
          ollama pull llama3.1:8b
        </pre>
      )}
      {status?.error && <p className="dim mono" style={{ fontSize: 11, marginTop: 8 }}>{status.error}</p>}
    </div>
  )
}

function AddChip({ onAdd, placeholder }) {
  const [v, setV] = useState('')
  return (
    <span className="row" style={{ gap: 4 }}>
      <input
        className="input"
        style={{ maxWidth: 150, padding: '3px 8px', fontSize: 12 }}
        placeholder={placeholder}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV('') } }}
      />
      <button className="btn sm ghost" disabled={!v.trim()} onClick={() => { onAdd(v.trim()); setV('') }}><Icon name="plus" size={11} /></button>
    </span>
  )
}

/** Editor integrado: estado del servidor y consentimiento de licencia. */
function VsCode() {
  const { toast } = useStore()
  const [s, setS] = useState(null)

  const load = () => api.codeStatus().then(setS).catch((e) => setS({ error: e.message }))
  useEffect(() => { load() }, [])

  const setAccepted = async (v) => {
    await api.codeAccept(v)
    toast(v ? 'Licencia aceptada' : 'Consentimiento retirado, editor detenido')
    load()
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Editor integrado (VS Code)</h3>
        <button className="btn sm ghost" onClick={load}><Icon name="refresh" size={12} /></button>
      </div>

      {!s ? (
        <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Comprobando…</p>
      ) : !s.installed ? (
        <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>
          No se encuentra VS Code en el sistema. El editor empotrado usa tu propia instalación.
        </p>
      ) : (
        <>
          <div className="row wrap" style={{ gap: 16, marginBottom: 12 }}>
            <div><div className="num" style={{ fontSize: 22 }}>{s.cli}</div><div className="eyebrow">versión detectada</div></div>
            <div>
              <div className="num" style={{ fontSize: 22, color: s.running ? 'var(--green)' : '' }}>{s.running ? 'activo' : 'parado'}</div>
              <div className="eyebrow">servidor</div>
            </div>
          </div>

          <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!s.accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span style={{ fontSize: 13 }}>Acepto los términos de licencia del servidor de VS Code</span>
          </label>

          <p className="dim" style={{ fontSize: 12.5, margin: '10px 0 0', lineHeight: 1.55 }}>
            Para abrir VS Code dentro de la app hay que arrancar <span className="mono">code serve-web</span>,
            el servidor web oficial de Microsoft que viene con tu instalación. Exigen aceptar sus{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); api.openUrl(s.licenseUrl) }} style={{ textDecoration: 'underline' }}>términos</a> y su{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); api.openUrl(s.privacyUrl) }} style={{ textDecoration: 'underline' }}>declaración de privacidad</a>.
            Escucha solo en 127.0.0.1, con un testigo aleatorio por sesión y la telemetría desactivada.
          </p>

          {s.running && (
            <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={() => api.codeStop().then(load)}>
              Detener el servidor
            </button>
          )}
          {s.error && <p className="dim mono" style={{ fontSize: 11.5, marginTop: 8 }}>{s.error}</p>}
        </>
      )}
    </div>
  )
}

function Categories() {
  const { db, update } = useStore()
  const cats = db.categories || []

  const set = (i, patch) => update((d) => Object.assign(d.categories[i], patch))
  const add = (name) => update((d) => d.categories.push({ id: uid('cat'), name, color: PALETTE[d.categories.length % PALETTE.length], area: 'life' }))
  const del = (id) => {
    if (db.events.some((e) => e.categoryId === id) && !confirm('Hay eventos con esta categoría. ¿Eliminarla igualmente?')) return
    update((d) => { d.categories = d.categories.filter((c) => c.id !== id) })
  }

  return (
    <div className="card">
      <div className="card-head"><h3>Categorías del calendario</h3></div>
      <div className="stack" style={{ gap: 6 }}>
        {cats.map((c, i) => (
          <div className="row" key={c.id}>
            <input type="color" value={c.color} onChange={(e) => set(i, { color: e.target.value })} style={{ width: 30, height: 30, padding: 2, border: '1px solid var(--line-strong)', borderRadius: 'var(--r)', background: 'var(--surface)' }} />
            <input className="input" value={c.name} onChange={(e) => set(i, { name: e.target.value })} />
            <span className="badge">{db.events.filter((e) => e.categoryId === c.id).length}</span>
            <button className="btn ghost icon" onClick={() => del(c.id)}><Icon name="x" size={13} /></button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <AddChip onAdd={add} placeholder="Nueva categoría…" />
      </div>
      <p className="dim" style={{ fontSize: 12, margin: '10px 0 0' }}>
        Salud, conducir, papeleo… lo que necesites. También se pueden crear al vuelo al añadir un evento.
      </p>
    </div>
  )
}

function LinkEditor({ title, hint, items, onChange }) {
  const set = (i, patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
        <button className="btn sm ghost" onClick={() => onChange([...items, { id: uid('l'), name: '', url: '' }])}>
          <Icon name="plus" size={12} /> Añadir
        </button>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        {items.map((it, i) => (
          <div className="row" key={it.id}>
            <input className="input" style={{ maxWidth: 170 }} placeholder="Nombre" value={it.name} onChange={(e) => set(i, { name: e.target.value })} />
            <input className="input mono" style={{ fontSize: 12 }} placeholder="https://…" value={it.url} onChange={(e) => set(i, { url: e.target.value })} />
            <button className="btn ghost icon" onClick={() => onChange(items.filter((_, j) => j !== i))}><Icon name="x" size={13} /></button>
          </div>
        ))}
        {items.length === 0 && <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>{hint}</p>}
      </div>
    </div>
  )
}


/**
 * Los cuatrimestres del curso.
 *
 * Existen para poder tener una asignatura anual sin repetir fechas en cada
 * clase del horario: se dicen una vez aquí —cuándo acaba el primero, cuándo
 * empieza el segundo— y luego cada clase dice a cuál pertenece. Entre uno y
 * otro, que es cuando hay exámenes y vacaciones, no se agenda nada.
 */
function Cuatrimestres() {
  const { db, update } = useStore()
  const terms = db.terms || []

  const set = (id, patch) =>
    update((d) => { d.terms = (d.terms || []).map((t) => (t.id === id ? { ...t, ...patch } : t)) })

  const add = () =>
    update((d) => {
      d.terms ||= []
      const n = d.terms.length + 1
      d.terms.push({
        id: uid('term'),
        name: n === 1 ? '1º cuatrimestre' : n === 2 ? '2º cuatrimestre' : `Periodo ${n}`,
        from: n === 1 ? d.settings.termStart || '' : '',
        to: n === 1 ? '' : d.settings.termEnd || '',
      })
    })

  const quitar = (id) =>
    update((d) => {
      d.terms = (d.terms || []).filter((t) => t.id !== id)
      // Las clases que apuntaban a él se quedan con las fechas del curso en vez
      // de con un periodo fantasma que ya no dice nada.
      d.subjects = d.subjects.map((sub) => ({
        ...sub,
        schedule: (sub.schedule || []).map((sl) => (sl.term === id ? { ...sl, term: '' } : sl)),
      }))
    })

  const usos = (id) =>
    db.subjects.reduce((a, sub) => a + (sub.schedule || []).filter((sl) => sl.term === id).length, 0)

  return (
    <div className="card">
      <div className="card-head">
        <h3>Cuatrimestres</h3>
        <div className="spacer" />
        <button className="btn sm ghost" onClick={add}><Icon name="plus" size={12} /> Añadir</button>
      </div>
      {terms.length === 0 ? (
        <p className="dim" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
          Sin cuatrimestres, cada clase del horario usa sus propias fechas o las del curso. Créalos
          si tienes asignaturas anuales: así una misma asignatura puede tener un horario en el
          primero y otro distinto en el segundo, y en medio —exámenes y vacaciones— no se agenda
          ninguna clase.
        </p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {terms.map((t) => (
            <div key={t.id} className="row" style={{ gap: 6 }}>
              <input className="input" style={{ flex: 1, minWidth: 110 }} value={t.name}
                placeholder="1º cuatrimestre" onChange={(e) => set(t.id, { name: e.target.value })} />
              <input className="input" style={{ width: 148 }} type="date" value={t.from || ''}
                onChange={(e) => set(t.id, { from: e.target.value })} />
              <span className="dim" style={{ fontSize: 11.5 }}>a</span>
              <input className="input" style={{ width: 148 }} type="date" value={t.to || ''}
                onChange={(e) => set(t.id, { to: e.target.value })} />
              <span className="badge" title="Clases del horario que usan este cuatrimestre">{usos(t.id)}</span>
              <button className="btn ghost icon" title="Quitar" onClick={() => quitar(t.id)}>
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
          <p className="dim" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.55 }}>
            En la ficha de cada asignatura, cada clase elige a qué cuatrimestre pertenece.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Festivos y vacaciones.
 *
 * Un día marcado aquí no tiene clase. No es que la clase salga y se perdone:
 * es que no existe, y por eso no se agenda, no se puede faltar a ella y no
 * entra en el cálculo de la asistencia.
 */
function Festivos() {
  const { db, update } = useStore()
  const dias = [...(db.holidays || [])].sort((a, b) => a.from.localeCompare(b.from))

  const set = (id, patch) =>
    update((d) => { d.holidays = (d.holidays || []).map((h) => (h.id === id ? { ...h, ...patch } : h)) })
  const add = () =>
    update((d) => { d.holidays ||= []; d.holidays.push({ id: uid('fest'), name: '', from: today(), to: today() }) })
  const quitar = (id) =>
    update((d) => { d.holidays = (d.holidays || []).filter((h) => h.id !== id) })

  const clases = (h) =>
    classesBetween(db, h.from, h.to || h.from)

  return (
    <div className="card">
      <div className="card-head">
        <h3>Festivos y vacaciones</h3>
        <div className="spacer" />
        <button className="btn sm ghost" onClick={add}><Icon name="plus" size={12} /> Añadir</button>
      </div>
      {dias.length === 0 ? (
        <p className="dim" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
          Un día marcado aquí no tiene clase: no sale en el calendario, no puedes faltar a ella y no
          cuenta para la asistencia. Sirve para un festivo suelto y para Navidad o Semana Santa
          enteras — es un día de principio y otro de fin. También se marca desde el calendario, en
          el día que estés mirando.
        </p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {dias.map((h) => (
            <div key={h.id} className="row" style={{ gap: 6 }}>
              <input className="input" style={{ flex: 1, minWidth: 110 }} value={h.name}
                placeholder="Festivo" onChange={(e) => set(h.id, { name: e.target.value })} />
              <input className="input" style={{ width: 148 }} type="date" value={h.from}
                onChange={(e) => set(h.id, { from: e.target.value })} />
              <span className="dim" style={{ fontSize: 11.5 }}>a</span>
              <input className="input" style={{ width: 148 }} type="date" value={h.to || h.from}
                onChange={(e) => set(h.id, { to: e.target.value })} />
              {/* Cuántas clases te quita: es el dato que dice si te has
                  equivocado de fecha, y se ve antes de guardar nada. */}
              <span className="badge" title="Clases que este festivo deja sin agendar">
                {clases(h)} {clases(h) === 1 ? 'clase' : 'clases'}
              </span>
              <button className="btn ghost icon" title="Quitar" onClick={() => quitar(h.id)}>
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


/**
 * Google Calendar.
 *
 * Lo sincroniza el ordenador y no la tablet, y es la misma regla de siempre: un
 * solo escritor. Dentro de tu cuenta se crea un calendario aparte llamado
 * «prolife» que gobierna la app entera —lo llena, lo corrige y borra de ahí lo
 * que ya no toca—; tu calendario personal solo se lee. Así no hay conflictos
 * que resolver, porque no hay dos manos escribiendo lo mismo.
 */
function GoogleCalendar() {
  const { db, update, toast } = useStore()
  const [st, setSt] = useState(null)
  const [id, setId] = useState('')
  const [secreto, setSecreto] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const mirar = useCallback(() => {
    api.gcalStatus().then(setSt).catch((e) => setSt({ error: e.message }))
  }, [])
  useEffect(() => { mirar() }, [mirar])

  const guardarCredenciales = async () => {
    try {
      await api.gcalConfig({ clientId: id.trim(), clientSecret: secreto.trim() })
      setId(''); setSecreto('')
      mirar()
      toast('Credenciales guardadas')
    } catch (e) { toast(e.message, 'err') }
  }

  const conectar = async () => {
    try {
      const r = await api.gcalLogin()
      await api.openUrl(r.url)
      toast('Se ha abierto el navegador. Vuelve aquí cuando acabes.')
    } catch (e) { toast(e.message, 'err') }
  }

  const sincronizar = async () => {
    setOcupado(true)
    try {
      const r = await api.gcalSync()
      const partes = [
        r.creados ? `${r.creados} nuevos` : '',
        r.cambiados ? `${r.cambiados} corregidos` : '',
        r.borrados ? `${r.borrados} retirados` : '',
      ].filter(Boolean)
      toast(partes.length ? `Google Calendar al día: ${partes.join(', ')}` : 'Google Calendar ya estaba al día')
      if (r.fallos?.length) toast(`${r.fallos.length} no han entrado: ${r.fallos[0].error}`, 'err')
      mirar()
    } catch (e) { toast(e.message, 'err') } finally { setOcupado(false) }
  }

  const alternar = async (calId) => {
    const ahora = st?.mostrar || []
    const ids = ahora.includes(calId) ? ahora.filter((x) => x !== calId) : [...ahora, calId]
    setSt((x) => ({ ...x, mostrar: ids }))
    await api.gcalMostrar(ids).catch((e) => toast(e.message, 'err'))
  }

  const setQue = (patch) => update((d) => { d.settings.gcal = { ...(d.settings.gcal || {}), ...patch } })
  const que = { classes: true, exams: true, events: true, tasks: false, training: false, ...(db.settings.gcal || {}) }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Google Calendar</h3>
        {st?.conectado && <span className="badge" style={{ background: 'var(--green-soft)', color: 'var(--green)', borderColor: 'transparent' }}>conectado</span>}
        <div className="spacer" />
        {st?.conectado && (
          <button className="btn sm" onClick={sincronizar} disabled={ocupado}>
            <Icon name="refresh" size={12} /> {ocupado ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
        )}
      </div>

      <p className="dim" style={{ fontSize: 12.5, margin: '0 0 12px', lineHeight: 1.6 }}>
        Tus clases, exámenes y eventos aparecen en el móvil. prolife crea un calendario suyo
        dentro de tu cuenta y solo escribe ahí: <b>tu calendario personal no se toca nunca</b>,
        solo se lee para poder verlo aquí dentro.
      </p>

      {!st ? (
        <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>Comprobando…</p>
      ) : !st.configurado ? (
        <>
          <div className="notice" style={{ marginBottom: 12 }}>
            <Icon name="clock" size={13} />
            <span style={{ fontSize: 12.5, lineHeight: 1.6 }}>
              Hace falta un cliente de OAuth de tipo <b>Aplicación de escritorio</b> en{' '}
              <span className="mono">console.cloud.google.com/auth/clients</span>, con la API de
              Google Calendar habilitada. Se queda en este ordenador, no en el repositorio.
            </span>
          </div>
          <div className="grid-2">
            <div className="field">
              <label>ID de cliente</label>
              <input className="input mono" style={{ fontSize: 11.5 }} value={id} placeholder="…apps.googleusercontent.com"
                onChange={(e) => setId(e.target.value)} />
            </div>
            <div className="field">
              <label>Secreto de cliente</label>
              <input className="input mono" style={{ fontSize: 11.5 }} type="password" value={secreto}
                placeholder="GOCSPX-…" onChange={(e) => setSecreto(e.target.value)} />
            </div>
          </div>
          <button className="btn" onClick={guardarCredenciales} disabled={!id.trim() || !secreto.trim()}>Guardar</button>
        </>
      ) : !st.conectado ? (
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary" onClick={conectar}><Icon name="link" size={13} /> Conectar con Google</button>
          <span className="dim" style={{ fontSize: 12 }}>Se abre el navegador; la contraseña se teclea allí.</span>
        </div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Qué se lleva a Google</div>
            <div className="row wrap" style={{ gap: 12 }}>
              {[
                ['classes', 'Clases'],
                ['exams', 'Exámenes y entregas'],
                ['events', 'Eventos'],
                ['tasks', 'Tareas con fecha'],
                ['training', 'Entrenos'],
              ].map(([k, label]) => (
                <label key={k} className="row" style={{ gap: 6, cursor: 'pointer', fontSize: 12.5 }}>
                  <input type="checkbox" checked={!!que[k]} onChange={(e) => setQue({ [k]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
            <p className="dim" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
              Las clases van como eventos que se repiten, con los festivos descontados. Lo que
              desmarques aquí se retira de Google en la siguiente sincronización.
            </p>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Qué calendarios tuyos se ven dentro de prolife</div>
            <div className="row wrap" style={{ gap: 6 }}>
              {(st.calendarios || []).filter((c) => c.id !== st.calendarId).map((c) => (
                <button key={c.id} className={`chip${(st.mostrar || []).includes(c.id) ? ' on' : ''}`} onClick={() => alternar(c.id)}>
                  <span className="dot" style={{ background: c.backgroundColor || 'var(--ink-3)' }} /> {c.summary}
                </button>
              ))}
              {!(st.calendarios || []).length && <span className="dim" style={{ fontSize: 12 }}>No se ha podido leer la lista.</span>}
            </div>
            <p className="dim" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
              Solo se leen: salen en el calendario en gris y no se pueden editar desde aquí.
            </p>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <span className="dim" style={{ fontSize: 11.5 }}>
              {st.ultima
                ? `Última vez: ${new Date(st.ultima.at).toLocaleString('es')} · ${st.ultima.creados} nuevos, ${st.ultima.cambiados} corregidos, ${st.ultima.borrados} retirados`
                : 'Todavía no se ha sincronizado nunca.'}
            </span>
            <div className="spacer" />
            <button className="btn ghost sm danger" onClick={async () => {
              await api.gcalLogout().catch(() => {})
              mirar()
              toast('Desconectado. Lo que ya está en Google se queda como está.')
            }}>Desconectar</button>
          </div>
        </div>
      )}
      {st?.error && <p className="dim" style={{ fontSize: 11.5, color: 'var(--accent)', margin: '10px 0 0' }}>{st.error}</p>}
    </div>
  )
}
