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
export const CLIENT_ID = 'PON-AQUI-TU-ID-DE-CLIENTE.apps.googleusercontent.com'
