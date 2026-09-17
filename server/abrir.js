/**
 * Con qué se abre algo fuera de la app, según el sistema.
 *
 * Está aquí fuera, y devolviendo el comando en vez de ejecutarlo, para poder
 * comprobar lo de abajo sin un Windows delante.
 *
 * EL FALLO QUE JUSTIFICA ESTE FICHERO. En Windows lo natural parece
 * `cmd /c start "" <url>`, y es lo que había. Pero `cmd` trata el `&` como
 * separador de comandos: una dirección con parámetros —cualquier enlace de
 * OAuth, o un enlace del campus con dos parámetros— le llega cortada por el
 * primer `&`, y el resto lo intenta ejecutar como si fueran otros comandos. El
 * navegador abría Google con el `client_id` y nada más, y Google contestaba
 * «Required parameter is missing: response_type» — un error que no apunta a
 * ninguna parte, porque el parámetro SÍ estaba: se lo comió el intérprete.
 *
 * `rundll32 url.dll,FileProtocolHandler` no pasa por ningún intérprete: los
 * argumentos llegan tal cual. Para archivos y carpetas, `explorer.exe` hace lo
 * mismo que hacía `start`.
 */
export function comandoParaAbrir(target, plataforma = process.platform) {
  const esUrl = /^https?:\/\//i.test(target)

  if (plataforma === 'win32') {
    return esUrl
      ? { cmd: 'rundll32', args: ['url.dll,FileProtocolHandler', target], opts: { windowsHide: true } }
      : { cmd: 'explorer.exe', args: [target], opts: { windowsHide: true } }
  }
  if (plataforma === 'darwin') return { cmd: 'open', args: [target], opts: {} }
  return { cmd: 'xdg-open', args: [target], opts: {} }
}
