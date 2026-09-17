/**
 * El identificador de cliente de Google para el APK de la tablet.
 *
 * Esto NO es un secreto y por eso está aquí y no en un fichero aparte: en una
 * app instalada no puede haberlos —el APK está en el aparato y cualquiera
 * podría abrirlo—, así que Google lo trata como público. Lo que de verdad
 * protege la cuenta es que Google solo acepta el código si la app viene firmada
 * con la huella SHA-1 registrada junto a este identificador.
 *
 * Se saca de console.cloud.google.com → Credenciales → ID de cliente de OAuth →
 * Android. Está explicado paso a paso en INSTALAR-TABLET.md.
 */
export const CLIENT_ID = '641970655049-4cmegapml8sl1s41fsm966525ffukc28.apps.googleusercontent.com'

/**
 * El cliente de la versión web, que tiene que ser distinto del de Android.
 *
 * Google separa los tipos: el de Android va atado al paquete y a la huella de
 * firma, y una página no tiene ni lo uno ni lo otro. El de la web es de tipo
 * «Aplicación web» y va atado a los ORÍGENES autorizados —aquí, el de GitHub
 * Pages—. No lleva secreto: en el navegador no puede haberlo, y por eso la web
 * usa el flujo de testigo de Google Identity Services, que da un acceso de una
 * hora y ninguno duradero.
 */
export const WEB_CLIENT_ID = '641970655049-k0l4e1nr7vptohnluvglf12uo087vpu7.apps.googleusercontent.com'
