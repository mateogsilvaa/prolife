# Actualizar prolife sin perder nada

**Resumen: actualizar la app no puede borrarte nada, porque tus datos no están dentro de
la app.** El instalador solo sustituye el programa. Tus documentos, tu `db.json`, tus
ajustes y la clave de la tablet viven fuera de él y ni se tocan.

## Por qué es seguro

```
La app (esto se sustituye al actualizar)
  C:\Users\<tú>\AppData\Local\Programs\prolife\     ← Windows
  /Applications/prolife.app                          ← macOS

Tus cosas (esto NO se toca nunca)
  Documentos\ProLife\                    documentos, apuntes, PDFs, prácticas
  Documentos\ProLife\.prolife\db.json    la base de datos entera
  Documentos\ProLife\.prolife\backups\   copia diaria, las 14 últimas
  C:\Users\<tú>\.prolife\config.json     qué carpeta usar, el puerto y la clave
```

`config.json` está en tu carpeta de usuario, no junto al programa, justo para esto: en la
app empaquetada el código va dentro de un archivo de solo lectura, así que la
configuración no podría estar ahí aunque quisiera.

Y hay una segunda red debajo: **la base de datos vieja se lee, pero no se reescribe hasta
que guardas algo**. Si una versión nueva no arranca, el `db.json` sigue exactamente como
lo dejó la versión anterior; vuelves a instalar la vieja y sigues donde estabas.

## Actualizar (Windows)

1. **Cierra prolife.** Del todo: si tiene icono al lado del reloj, ciérralo también desde
   ahí. Con la app abierta el instalador no puede sustituir el programa.
2. Comprueba que tienes la copia de hoy: abre `Documentos\ProLife\.prolife\backups\` y
   mira que haya un `db-AAAA-MM-DD.json` con la fecha de hoy. La hace la app sola, pero
   mirar cuesta cinco segundos.
3. Genera el instalador nuevo desde el proyecto:

   ```bash
   git pull
   npm install
   npm run dist
   ```

   Deja el `.exe` en `release\`.
4. Ejecútalo y **instala encima, en la misma carpeta que te propone**. No desinstales la
   versión anterior antes: no hace falta, y desinstalar es la única operación que podría
   preguntarte por datos.
5. Abre prolife. Debería aparecer todo como estaba: mismas asignaturas, mismas faltas,
   mismas horas.

En macOS es lo mismo con el `.dmg`: arrastra el nuevo `prolife.app` a Aplicaciones y
acepta sustituir. En Linux, sustituye el `AppImage` por el nuevo.

## Los dos ordenadores

Actualiza **los dos**, sin prisa pero sin dejar pasar semanas.

Mientras uno esté en la versión vieja y el otro en la nueva, no pasa nada malo: la carpeta
sincronizada es la misma y el formato de la base de datos no ha cambiado en esta
actualización. Si alguna vez actualizas a una versión que sí cambie el formato, el
ordenador viejo te lo dirá con un aviso rojo —«este db.json lo escribió una versión más
nueva»— y dejará de guardar por su cuenta hasta que lo actualices. No estropea nada: se
planta a propósito.

Lo que sí conviene: **no tener los dos ordenadores abiertos a la vez durante la
actualización**. Cierra prolife en los dos, actualiza uno, ábrelo, espera a que Drive
termine de subir (el icono deja de girar), y luego el otro.

## La tablet

No hay nada que instalar. La tablet se actualiza sola la próxima vez que abra la app con
el ordenador encendido y a tiro: pide la portada por la red antes que a su copia guardada,
y con la portada nueva vienen los archivos nuevos.

Si después de actualizar la ves rara —a medias, o como estaba antes—, es su copia
guardada:

1. Ábrela con el ordenador encendido.
2. Baja del todo y vuelve a subir para forzar una recarga; si no, ciérrala y ábrela otra
   vez desde el icono.
3. Si sigue igual: Chrome → `⋮` → Configuración → Configuración de sitios → Datos
   almacenados → busca la dirección de prolife → *Borrar datos*. Solo tira su copia; tus
   datos están en el ordenador.

La clave de emparejamiento **no se renueva** al actualizar, así que no hay que volver a
emparejarla.

## Si falla al generar el instalador

Estos dos no tocan tus datos para nada: pasan antes de que exista el `.exe`.

**«remove …\release\win-unpacked\d3dcompiler_47.dll: Access is denied»**

Algo tiene ese archivo abierto y electron-builder no puede vaciar la carpeta para volver a
llenarla. Casi siempre es la propia prolife corriendo desde ahí, o el antivirus, que acaba
de escanear el DLL y todavía no lo ha soltado. Con la app cerrada —también el icono de
junto al reloj—:

```powershell
taskkill /F /IM prolife.exe 2>$null
taskkill /F /IM electron.exe 2>$null
Remove-Item -Recurse -Force release
npm run dist
```

Si `Remove-Item` también dice que no puede, reinicia el ordenador y repítelo: entonces era
el antivirus. Borrar `release\` no pierde nada — es la carpeta donde se fabrica el
instalador, no donde viven tus datos.

**«Could not find any Visual Studio installation to use»**

Versión vieja del proyecto. `git pull` y otra vez: desde la actualización de los festivos,
el empaquetado ya no compila módulos nativos y no hace falta Visual Studio.

## Si algo va mal

Todo esto se arregla desde la carpeta de datos, que sigue intacta:

| Qué ves | Qué hacer |
|---|---|
| La app abre vacía, sin asignaturas | Ajustes → Directorio de trabajo: está apuntando a otra carpeta. Ponle la buena y reinicia. |
| Falta lo de los últimos días | Copia un `.json` de `.prolife\backups\` encima de `.prolife\db.json`, con la app cerrada. |
| «Este db.json lo escribió una versión más nueva» | Ese ordenador se ha quedado atrás. Actualízalo y ya. |
| La app no arranca | Reinstala la versión anterior. Tus datos no se han movido. |

Y la salida de emergencia de siempre: **copia `Documentos\ProLife\.prolife\db.json` a
cualquier sitio antes de empezar**. Es un JSON de texto, legible; con ese archivo y una
instalación limpia lo tienes todo otra vez.
