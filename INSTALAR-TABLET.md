# Actualizar el ordenador e instalar prolife en la tablet

Este manual cubre las dos cosas, en este orden, porque el segundo depende del primero:

1. **Actualizar prolife en los dos ordenadores** — 10 minutos cada uno.
2. **Instalar la app en la tablet**, ya como APK de verdad, que funciona con el ordenador
   apagado — la primera vez lleva unos 40 minutos, casi todos de papeleo con Google.

> **Nada de esto borra nada.** Tus datos no están dentro de la app: viven en la carpeta de
> Drive (`db.json`, apuntes, PDFs) y en `~/.prolife/config.json`. El instalador solo
> sustituye el programa.

---

## Parte 1 — Actualizar el ordenador

### 1. Cierra prolife del todo

También el icono junto al reloj, si lo tiene. Con la app abierta el instalador no puede
sustituir el programa.

### 2. Comprueba que tienes la copia de hoy

Abre `Documentos\ProLife\.prolife\backups\` y mira que haya un `db-AAAA-MM-DD.json` con la
fecha de hoy. La hace la app sola; mirarlo cuesta cinco segundos.

### 3. Genera el instalador

En la carpeta del proyecto:

```bash
git pull
npm install
npm run dist
```

Te deja el `.exe` en `release\`.

### 4. Instala encima, en la misma carpeta

Acepta la ruta que te propone. **No desinstales la versión anterior**: no hace falta, y
desinstalar es la única operación que podría preguntarte por tus datos.

### 5. Ábrela y comprueba tres cosas

Que están tus asignaturas, que las faltas son las de siempre y que las horas no se han
movido. Si algo baila, para aquí y mira la tabla del final.

### 6. Repite en el segundo ordenador

De uno en uno: actualiza el primero, ábrelo, **espera a que Drive termine de subir** (el
icono deja de girar) y luego ve al segundo.

**Qué hay de nuevo en esta versión:** el apartado de **Voluntariado** —jornadas con sus
horas y sus fotos, para poder justificarlas—, apuntar tiempo a mano en una asignatura o un
proyecto, arrastrar los eventos por el horario, la vista del calendario que se queda donde
la dejaste, los eventos que chocan puestos uno al lado del otro, el icono nuevo, y un
ayudante que pregunta en vez de inventarse las cosas.

> **Esta vez hay que actualizar los DOS ordenadores, no vale dejarlo a medias.** El
> voluntariado añade datos nuevos al `db.json` y con ello sube el formato de la v4 a la v5.
> El ordenador que se quede sin actualizar lo detectará, te lo dirá con un aviso rojo y
> **dejará de guardar** para no estropear nada — que es lo que tiene que hacer, pero mejor
> saberlo antes que encontrárselo.

---

## Parte 2 — La tablet

### Qué cambia respecto a antes

Hasta ahora la tablet abría una página web que servía el ordenador: si el portátil estaba
apagado, no había nada. Ahora es una **app instalada** que habla directamente con Google
Drive, la misma carpeta que ya sincronizas.

|  | Antes | Ahora |
|---|---|---|
| Qué se instala | Un acceso directo del navegador | Un APK de verdad |
| Hace falta que el ordenador esté encendido | **Sí** | No |
| Hace falta internet | Sí | Sí (Drive está en la nube) |
| Hace falta Tailscale | Sí | **No** |

> **Ojo con esto:** quita la dependencia del *ordenador*, no la de *internet*. En clase
> seguirás necesitando wifi o datos. Sin ninguna conexión, la tablet sigue enseñando lo
> último que vio y apuntando lo que hagas para más tarde.

### Qué se puede hacer en la tablet

**Lo mismo que en el ordenador.** Crear asignaturas, proyectos y exámenes; editar horarios;
marcar faltas; crear, editar y borrar tareas y eventos; apuntar entrenos, tiempo y jornadas
de voluntariado; cambiar ajustes y categorías; subir y leer apuntes, PDFs y fotos.

Lo único que no está es lo que **es** del ordenador y no tendría sentido allí:

| Qué | Por qué |
|---|---|
| El directorio de trabajo | Es una carpeta de un disco concreto |
| El ayudante (Ollama) | El modelo corre en el ordenador |
| El editor VS Code | Igual |
| Abrir carpetas del disco, Tailscale, el enlace de emparejamiento | Del ordenador por definición |

En la tablet esos cuadros no se enseñan siquiera, para que no haya botones que solo puedan
dar un error.

### Cómo se reparte el trabajo (por qué no se pisan)

Esto es lo único técnico que conviene entender, porque explica el aviso que verás a diario:

- **Los apuntes, los PDFs y las fotos** se escriben directos en Drive. Son archivos sueltos;
  solo chocarían si editas el mismo apunte a la vez en la tablet y en el ordenador.
- **La base de datos** la tablet **no la escribe nunca entera**. Aplica el cambio sobre su
  copia, mira qué ha quedado distinto y deja *solo eso* en un buzón, `.prolife/ops/`. El
  ordenador lo recoge y lo aplica sobre su base la próxima vez que lo abras. Por eso la
  tablet dice *«guardado en Drive · el ordenador lo recoge al abrirse»* y no *«hecho»*.

Así sigue habiendo **un solo escritor** del `db.json`: el ordenador. Si escribieran los dos,
Drive no sabría fusionarlos y ganaría el último en subir.

> **La única regla que hay que tener en la cabeza:** si tocas **el mismo registro** —la
> misma tarea, la misma asignatura— en los dos aparatos antes de sincronizar, gana el
> último. Registros distintos nunca se pisan: la tarea que creaste en clase y la que creó
> el ordenador conviven las dos.

---

### Paso 1 — Dar de alta la app en Google (una vez en la vida)

Google no deja que ninguna app toque tu Drive sin credenciales propias. Es papeleo, pero se
hace una vez. En [console.cloud.google.com](https://console.cloud.google.com):

1. **Crea un proyecto.** Arriba a la izquierda, el desplegable de proyectos → *Proyecto
   nuevo* → nombre `prolife` → *Crear*. Espera a que lo seleccione.

2. **Habilita la API de Drive.** Menú ☰ → *APIs y servicios* → *Biblioteca* → busca
   `Google Drive API` → **Habilitar**.

3. **Pantalla de consentimiento.** ☰ → *APIs y servicios* → *Pantalla de consentimiento de
   OAuth*:
   - Tipo de usuario: **Externo** → *Crear*.
   - Nombre de la aplicación: `prolife`. Correo de asistencia y de contacto: el tuyo.
   - *Guardar y continuar* por las pantallas siguientes sin tocar nada.
   - Al final, en el resumen, dale a **PUBLICAR APLICACIÓN** y confirma.

   > **Publicarla es importante.** Si la dejas en «Prueba», Google caduca la sesión cada 7
   > días y tendrías que volver a entrar en la tablet todas las semanas.

4. **Crea las credenciales.** ☰ → *APIs y servicios* → *Credenciales* → *Crear
   credenciales* → *ID de cliente de OAuth*:
   - Tipo de aplicación: **Android**
   - Nombre: `prolife tablet`
   - Nombre del paquete: `com.mateo.prolife`
   - Huella digital del certificado SHA-1:
     ```
     E8:F6:3B:D1:D0:E4:B8:EB:BC:7C:58:AE:01:75:7F:62:F5:53:48:69
     ```
   - *Crear*. Te da un **ID de cliente** que acaba en `.apps.googleusercontent.com`.
     Cópialo.

5. **Activa el esquema de URI personalizado.** Este paso es imprescindible y no es evidente:
   desde 2024, Google **desactiva por defecto** ese método en los clientes Android nuevos, y sin
   él la app no puede volver del navegador después de entrar.

   Google ha movido esta pantalla de sitio: los clientes de OAuth ya no viven en *APIs y
   servicios → Credenciales*, sino en **Plataforma de Auth de Google → Clientes**. Ve directo:

   ```
   https://console.cloud.google.com/auth/clients
   ```

   - Comprueba arriba que el proyecto seleccionado es el tuyo (`prolife`).
   - En la lista, **haz clic en el nombre** del cliente Android — en el nombre, no en el icono
     de copiar el ID. Se abre su ficha.
   - **Baja del todo.** Debajo del paquete y de la huella SHA-1 hay una sección plegada
     **Configuración avanzada** (*Advanced Settings*). Despliégala.
   - Marca **«Habilitar esquema de URI personalizado»** (*Enable Custom URI Scheme*) y
     **Guardar**.
   - Tarda unos minutos en surtir efecto. Si al volver a probar sale lo mismo, cierra la app
     de la tablet del todo y espera cinco minutos.

   > Si te saltas esto, al pulsar «Entrar con Google» sale
   > **«Acceso bloqueado: la solicitud de prolife no es válida»**, con un *Error 400*.

   **Si no ves «Configuración avanzada» por ningún lado**, casi siempre es una de estas tres:

   | Qué pasa | Cómo se ve | Solución |
   |---|---|---|
   | Estás en el proyecto equivocado | La lista de clientes está vacía o sale otro | Cambia de proyecto en el desplegable de arriba |
   | El cliente no es de tipo **Android** | En la ficha pone *Aplicación web* o *Escritorio* | Ese tipo no tiene la opción. Crea uno nuevo de tipo Android (paso 4) y usa **su** ID |
   | Estás en la pantalla vieja | La URL pone `/apis/credentials` | Entra por `console.cloud.google.com/auth/clients` |

   Y si aun estando en la ficha de un cliente Android del proyecto correcto la sección no
   aparece: **borra ese cliente y créalo otra vez** (mismo paquete, misma huella). Los
   clientes recién creados siempre traen la sección; si el ID cambia, hay que actualizar
   `src/lib/google.config.js` y volver a compilar el APK.

### Paso 2 — Poner ese identificador en el proyecto

En el ordenador, abre `src/lib/google.config.js` y sustituye la línea:

```js
export const CLIENT_ID = 'PON-AQUI-TU-ID-DE-CLIENTE.apps.googleusercontent.com'
```

por tu identificador de verdad. Luego:

```bash
git add src/lib/google.config.js
git commit -m "Mi identificador de cliente de Google"
git push
```

> No es un secreto: en una app instalada no puede haberlos, porque el APK está en el
> aparato y cualquiera podría abrirlo. Lo que protege tu cuenta es que Google solo acepta la
> entrada si la app viene firmada con esa huella SHA-1 de arriba.

### Paso 3 — Compilar el APK (lo hace GitHub, no tú)

Así no tienes que instalar Android Studio ni nada.

1. Ve a tu repositorio en GitHub → pestaña **Actions**.
2. En la lista de la izquierda, **APK de la tablet**.
3. Botón **Run workflow** → *Run workflow*.
4. Espera unos 5 minutos a que salga el ✓ verde.
5. Entra en esa ejecución y, abajo del todo, descarga **prolife-tablet-apk**. Es un `.zip`
   con el APK dentro.

### Paso 4 — Instalarlo en la tablet

1. Pásale el `.zip` a la tablet (Drive, correo, cable — como te sea más cómodo) y
   descomprímelo.
2. Toca el archivo `.apk`. Android te dirá que **no permite instalar apps de orígenes
   desconocidos**: dale a *Ajustes*, activa el permiso para la app desde la que estás
   abriendo el archivo, y vuelve.
3. *Instalar*. Aparecerá prolife en el cajón de aplicaciones, con su icono.

### Paso 5 — Conectarla con tu Drive

1. Abre prolife en la tablet. Te pide **Entrar con Google**.
2. Se abre Chrome (no la app: es lo correcto, la contraseña se teclea donde te fías).
   Elige tu cuenta.
3. Saldrá **«Google no ha verificado esta aplicación»**. Es normal en una app personal que
   no está en la Play Store: *Configuración avanzada* → *Ir a prolife (no seguro)*.
4. Acepta el permiso de Drive. Vuelve sola a la app.
5. Te enseña las carpetas de tu Drive que tienen datos de prolife dentro — normalmente una.
   Tócala.
6. Ya está: tus asignaturas, tus apuntes y tus PDFs, con el ordenador apagado.

---

## Comprobación final

- [ ] Los dos ordenadores actualizados y abiertos, con sus datos de siempre
- [ ] Drive ha terminado de subir en los dos
- [ ] El APK instalado y abierto en la tablet
- [ ] Ves tus asignaturas de verdad, no una lista vacía
- [ ] **Apaga el ordenador** y abre la app en la tablet: tiene que seguir funcionando
- [ ] Edita un apunte en la tablet, enciende el ordenador y comprueba que está ahí
- [ ] Marca una falta en la tablet, abre la app en el ordenador y comprueba que aparece

Ese último punto es el que prueba el buzón: la falta no se aplica al instante, se aplica
cuando el ordenador abre la app.

---

## Si algo falla

| Qué ves | Qué pasa |
|---|---|
| «A esta compilación le falta el identificador de cliente» | El paso 2 no llegó al APK. Comprueba que hiciste `git push` **antes** de lanzar el workflow, y vuelve a lanzarlo. |
| «Acceso bloqueado: la solicitud de prolife no es válida», *Error 400* | Falta activar el **esquema de URI personalizado** en la configuración avanzada del cliente Android (paso 1.5). Es lo más probable, porque Google lo trae desactivado de fábrica. Despliega *Detalles del error* en esa misma pantalla de Google: la línea `error=` dice cuál de los dos casos es. |
| Al entrar: *Error 400: redirect_uri_mismatch* | El nombre del paquete o la huella SHA-1 no coinciden con lo que pusiste en Google Cloud. Repasa el paso 1.4 — tienen que ser exactamente `com.mateo.prolife` y la huella de arriba. |
| Al entrar: *Acceso bloqueado* / *app no verificada* sin opción de continuar | Falta publicar la pantalla de consentimiento (paso 1.3, el botón *PUBLICAR APLICACIÓN*). |
| «No se encuentra ninguna carpeta de prolife en este Drive» | Busca la carpeta por su nombre en esa misma pantalla. Si sale marcada como «sin .prolife», la carpeta está pero Drive no ha subido la parte oculta —empieza por punto—; si no sale ninguna, o entraste con otra cuenta de Google, o el directorio de trabajo del ordenador no está dentro de Drive. Míralo en Ajustes → Directorio de trabajo. |
| «La sesión de Google Drive ha caducado» | Vuelve a entrar. Si pasa cada semana, la pantalla de consentimiento se quedó en «Prueba»: publícala. |
| Lo que apunto en la tablet no aparece en el ordenador | Es lo esperado hasta que abras la app en el ordenador: el buzón se vacía al abrirla. Si ya la has abierto y sigue sin salir, mira si hay algo en `.prolife\ops\rechazadas\`. |
| La app abre vacía en el ordenador | Ajustes → Directorio de trabajo: está apuntando a otra carpeta. |
| Falta lo de los últimos días | Con la app cerrada, copia un `.json` de `.prolife\backups\` encima de `.prolife\db.json`. |

**La salida de emergencia de siempre:** copia `Documentos\ProLife\.prolife\db.json` a
cualquier sitio antes de empezar. Es un JSON de texto legible; con ese archivo y una
instalación limpia lo tienes todo otra vez.

---

## Cuando haya futuras actualizaciones

- **El ordenador:** la parte 1 entera, otra vez.
- **La tablet:** solo los pasos 3 y 4 (lanzar el workflow, descargar, instalar encima). El
  paso 1 y el 2 no se repiten nunca, y al instalar encima **no pierdes la sesión ni la
  carpeta elegida** — mientras la firma no cambie, que es justo lo que garantiza tener la
  clave fija en el repositorio.
