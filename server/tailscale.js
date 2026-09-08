import { execFile } from 'node:child_process'

/**
 * Puente con el propio Tailscale, instalado aparte.
 *
 * Hasta ahora, dejar la tablet lista para usarla fuera de casa era un ritual de
 * terminal: entrar en Tailscale, activar los certificados en su web, lanzar
 * `tailscale serve`, copiar la dirección que devuelve, pegarle detrás la clave
 * a mano... Todo eso se puede preguntar y hacer desde aquí, porque es
 * exactamente lo mismo que teclearía el usuario. Lo único que sigue siendo
 * manual es entrar en Tailscale la primera vez (`tailscale up`), que abre un
 * navegador y no tiene sentido automatizar.
 */

const CLI = 'tailscale'

function run(args, timeout = 6000) {
  return new Promise((resolve) => {
    execFile(CLI, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, error: err.code === 'ENOENT' ? 'not-installed' : (stderr || err.message).trim() })
      resolve({ ok: true, out: String(stdout) })
    })
  })
}

/**
 * Dónde está el ordenador dentro de su propia red de Tailscale, y si ya hay un
 * `serve` publicando este puerto. Todo de una vez, para no encadenar llamadas
 * desde la interfaz mientras el usuario espera mirando un spinner.
 */
export async function status(port) {
  const st = await run(['status', '--json'])
  if (!st.ok) return { installed: st.error !== 'not-installed', loggedIn: false, dnsName: '', serving: false, error: st.error }

  let parsed
  try {
    parsed = JSON.parse(st.out)
  } catch {
    return { installed: true, loggedIn: false, dnsName: '', serving: false, error: 'Respuesta de Tailscale ilegible' }
  }

  // `BackendState` vale "Running" cuando está dentro de la red; "NeedsLogin" o
  // "Stopped" son las dos formas de estar fuera.
  const loggedIn = parsed.BackendState === 'Running'
  const dnsName = String(parsed.Self?.DNSName || '').replace(/\.$/, '')

  let serving = false
  if (loggedIn) {
    const sv = await run(['serve', 'status', '--json'])
    if (sv.ok) {
      try {
        const cfg = JSON.parse(sv.out)
        // Se busca el puerto propio en cualquiera de las webs publicadas: con
        // HTTPS y MagicDNS listos, `serve` cuelga de 443 aunque el destino sea otro.
        const web = cfg?.Web || {}
        serving = Object.values(web).some((host) =>
          Object.values(host?.Handlers || {}).some((h) => h?.Proxy === `http://127.0.0.1:${port}`)
        )
      } catch {
        /* si no se puede leer, se asume que no está publicado */
      }
    }
  }

  return { installed: true, loggedIn, dnsName, serving, error: null }
}

/** El equivalente exacto de teclear `tailscale serve --bg <puerto>`. */
export async function serve(port) {
  const r = await run(['serve', '--bg', String(port)], 15000)
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true }
}
