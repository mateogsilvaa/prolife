import React, { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { buscarCarpetas, listarCarpetas, fijarRaiz, raizGuardada, haySesion } from '../lib/drive.js'
import { entrar, puedeEntrar, PETICION } from '../lib/google.js'

/**
 * La primera pantalla del APK: entrar con Google y decir cuál es la carpeta.
 *
 * Son dos cosas distintas y por eso van en dos pasos. Entrar da permiso para
 * mirar en Drive; elegir la carpeta dice DÓNDE mirar, porque en un Drive puede
 * haber muchas cosas y prolife solo tiene que tocar la suya. Se pregunta una
 * vez y se recuerda.
 *
 * Se reconocen solas las carpetas que llevan un `.prolife` dentro, que es lo
 * que el ordenador crea: así no hay que ir a buscar la ruta a mano.
 */
export default function ConectarDrive({ onListo }) {
  const [paso, setPaso] = useState(() => (raizGuardada() ? 'listo' : 'entrar'))
  const [carpetas, setCarpetas] = useState(null)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  // Cuando la búsqueda automática no da con ninguna, se pasa a buscar por
  // nombre. `aMano` guarda lo que se teclea; `sinPuente`, la carpeta que se ha
  // elegido y no tiene el `.prolife` dentro.
  const [aMano, setAMano] = useState('prolife')
  const [sinPuente, setSinPuente] = useState(null)

  // Si la sesión sigue viva de la última vez, se salta el primer paso.
  useEffect(() => {
    haySesion().then((si) => { if (si && paso === 'entrar') setPaso('carpeta') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (paso !== 'carpeta' || carpetas) return
    setOcupado(true)
    buscarCarpetas()
      // Si no aparece ninguna, se busca ya por nombre en vez de dejar la
      // pantalla vacía: casi siempre la carpeta está y lo que falla es otra
      // cosa, y verla en la lista es lo que lo dice.
      .then((cs) => (cs.length ? cs : listarCarpetas('prolife')))
      .then((cs) => setCarpetas(cs))
      .catch((e) => setError(e.message))
      .finally(() => setOcupado(false))
  }, [paso, carpetas])

  const buscarAMano = async () => {
    setError(null)
    setSinPuente(null)
    setOcupado(true)
    try {
      setCarpetas(await listarCarpetas(aMano))
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  const conGoogle = async () => {
    setError(null)
    setOcupado(true)
    try {
      await entrar()
      setPaso('carpeta')
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  const elegir = (carpeta) => {
    // Sin `.prolife` dentro no hay nada que leer: no es la carpeta buena, o
    // Drive todavía no la ha subido entera. Elegirla igualmente dejaría la app
    // en blanco sin explicar por qué.
    if (carpeta.prolife === false) return setSinPuente(carpeta)
    fijarRaiz(carpeta.id)
    onListo?.()
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 24 }}>
      <div style={{ maxWidth: '38rem', width: '100%' }}>
        <div className="eyebrow">prolife en la tablet</div>
        <h2 className="display" style={{ fontSize: 30, margin: '4px 0 10px' }}>
          {paso === 'entrar' ? 'Conecta tu Google Drive' : 'Elige tu carpeta'}
        </h2>

        {paso === 'entrar' && (
          <>
            <p className="muted" style={{ lineHeight: 1.6 }}>
              Aquí no hay servidor: la tablet lee y escribe en la misma carpeta de Drive que
              sincroniza tu ordenador. Por eso funciona con el ordenador apagado — pero necesita
              tu permiso para entrar en Drive.
            </p>
            {!puedeEntrar() && (
              <div className="notice err" style={{ margin: '14px 0' }}>
                <Icon name="x" size={13} />
                <span style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                  A esta compilación le falta el identificador de cliente de Google. Está explicado
                  en <span className="mono">INSTALAR-TABLET.md</span>.
                </span>
              </div>
            )}
            <button className="btn primary" onClick={conGoogle} disabled={ocupado || !puedeEntrar()}>
              <Icon name="link" size={13} /> {ocupado ? 'Esperando a Google…' : 'Entrar con Google'}
            </button>
            <p className="dim" style={{ fontSize: 12, lineHeight: 1.6, marginTop: 14 }}>
              Se abre Chrome para escribir la contraseña, no esta app: es lo correcto, y lo único
              que vuelve aquí es un permiso de acceso a tu carpeta.
            </p>
            <QueMandamos />
          </>
        )}

        {paso === 'carpeta' && (
          <>
            <p className="muted" style={{ lineHeight: 1.6 }}>
              Es la carpeta que sincroniza tu ordenador: la que tiene un <span className="mono">
              .prolife</span> dentro. Normalmente hay una sola.
            </p>
            {ocupado && <p className="dim">Mirando en tu Drive…</p>}

            {carpetas && carpetas.length === 0 && (
              <div className="notice err" style={{ margin: '14px 0' }}>
                <Icon name="x" size={13} />
                <span style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                  Ninguna carpeta con ese nombre en este Drive. Comprueba que has entrado con la
                  misma cuenta de Google que sincroniza el ordenador, y prueba con otro nombre
                  aquí abajo.
                </span>
              </div>
            )}

            <div className="stack" style={{ gap: 6, marginTop: 12 }}>
              {(carpetas || []).map((c) => (
                <button key={c.id} className="link-tile" onClick={() => elegir(c)}>
                  <span className="glyph" style={{
                    background: c.prolife === false ? 'var(--surface-2)' : 'var(--green-soft)',
                    color: c.prolife === false ? 'var(--ink-3)' : 'var(--green)',
                  }}>
                    <Icon name="folder" size={12} />
                  </span>
                  <span style={{ fontSize: 13 }}>{c.name}</span>
                  <span className="spacer" />
                  {c.prolife === false
                    ? <span className="dim" style={{ fontSize: 11 }}>sin .prolife</span>
                    : (
                      <span className="badge"
                        style={{ background: 'var(--green-soft)', color: 'var(--green)', borderColor: 'transparent' }}>
                        es esta
                      </span>
                    )}
                </button>
              ))}
            </div>

            {sinPuente && (
              <div className="notice err" style={{ marginTop: 14 }}>
                <Icon name="x" size={13} />
                <span style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                  En <b>{sinPuente.name}</b> no hay ninguna carpeta <span className="mono">
                  .prolife</span>, y es ahí donde vive todo. O no es esta carpeta, o Google Drive
                  no la ha subido: empieza por punto, y la copia de seguridad de carpetas del
                  ordenador se salta los archivos ocultos si está configurada así. En el ordenador,
                  Ajustes → Directorio de trabajo te dice cuál es la buena.
                </span>
              </div>
            )}

            <div className="row" style={{ gap: 6, marginTop: 16, alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: 1, margin: 0 }}>
                <label>Buscarla por su nombre</label>
                <input className="input" value={aMano} placeholder="prolife"
                  onChange={(e) => setAMano(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && buscarAMano()} />
              </div>
              <button className="btn" onClick={buscarAMano} disabled={ocupado}>
                <Icon name="search" size={12} /> Buscar
              </button>
            </div>
            <button className="btn ghost sm" style={{ marginTop: 10 }}
              onClick={() => { setSinPuente(null); setCarpetas(null) }}>
              <Icon name="refresh" size={12} /> Volver a mirar solo
            </button>
          </>
        )}

        {error && (
          <div className="notice err" style={{ marginTop: 16 }}>
            <Icon name="x" size={13} />
            <span style={{ fontSize: 12.5, lineHeight: 1.6 }}>{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Los tres datos que Google compara con lo que hay dado de alta en la consola.
 *
 * Cuando dice «la solicitud de prolife no es válida» no cuenta cuál de ellos le
 * chirría, así que la única forma de salir del bucle es tenerlos delante para
 * ponerlos al lado de la ficha del cliente. Va plegado porque el día que todo
 * funciona no le importan a nadie.
 */
function QueMandamos() {
  const [abierto, setAbierto] = useState(false)
  const filas = [
    ['ID de cliente', PETICION.clientId],
    ['Paquete', PETICION.paquete],
    ['Redirección', PETICION.redireccion],
  ]
  return (
    <div style={{ marginTop: 18 }}>
      <button className="btn ghost sm" onClick={() => setAbierto((x) => !x)}>
        <Icon name={abierto ? 'x' : 'search'} size={12} />
        {abierto ? 'Ocultar' : 'Si Google te dice que no'}
      </button>
      {abierto && (
        <div className="stack" style={{ gap: 10, marginTop: 12 }}>
          <p className="dim" style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>
            Esto es lo que la app le pide a Google. Tiene que coincidir, letra por letra, con la
            ficha del cliente Android en{' '}
            <span className="mono">console.cloud.google.com/auth/clients</span>. Y ahí mismo,
            abajo del todo, <b>Configuración avanzada → Habilitar esquema de URI personalizado</b>
            {' '}tiene que estar activado: viene desactivado de fábrica y sin él sale
            «Acceso bloqueado».
          </p>
          {filas.map(([k, v]) => (
            <div key={k}>
              <div className="eyebrow">{k}</div>
              <div className="mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
