# prolife

App de escritorio para gestionar el curso: universidad, RFEA, atletismo y todo lo demás.
Corre en local, guarda los documentos en una **carpeta real de tu ordenador** y mide sola
el tiempo que dedicas a cada cosa.

## Arrancar

```bash
npm install
npm run dev
```

Abre la app con recarga en caliente. Para usarla como app normal:

```bash
npm start
```

Y para generar un instalador (`.exe` en Windows):

```bash
npm run dist
```

**Actualizar una instalación que ya tienes en marcha, sin perder nada:**
[ACTUALIZAR.md](ACTUALIZAR.md). En resumen: los datos no están dentro de la app, así que
instalar encima no se lleva nada por delante.

## Dónde vive todo

Por defecto en `Documentos/ProLife`, cambiable en **Ajustes → Directorio de trabajo**.

```
ProLife/
  Universidad/<Asignatura>/   apuntes, PDFs, prácticas
  Trabajo/<Proyecto>/         documentación, entregas
  Tareas/<Tarea>/             documentos de tareas sueltas
  Deporte/                    planes de entrenamiento, series, vídeos de técnica
                              (botón «Documentos» en Atletismo)
  Personal/
  .prolife/db.json            la base de datos entera, en JSON legible
  .prolife/logo.png           el logo de la app, si has puesto uno
  .prolife/backups/           copia diaria, las 14 últimas (también si la dejas abierta días)
```

Borrar algo en la app no borra tus archivos del disco. Y al revés: la app **no crea
carpetas por el hecho de mirarlas**. Si mueves o renombras la carpeta de una asignatura
desde el explorador, su espacio te dirá que ya no está —con la ruta exacta que esperaba—
en vez de enseñarte una carpeta nueva y vacía como si no hubiera pasado nada.

## Dos ordenadores, el mismo trabajo

Pon el directorio en una carpeta que sincronice sola —Google Drive, OneDrive,
Dropbox— y tendrás lo mismo en casa y en la universidad. **Ajustes → Directorio de
trabajo** detecta las que tengas montadas y las pone a un botón.

No hay integración con la API de Google, y es a propósito: la app apunta a la carpeta
que *Google Drive para escritorio* ya sincroniza. Sin cuentas, sin permisos de nube,
funciona sin internet y tus archivos siguen siendo archivos normales del disco.

> **No la abras en los dos ordenadores a la vez.** Los dos escriben el mismo
> `db.json` y el último en guardar gana. Ciérrala en uno, deja que Drive termine,
> y ábrela en el otro. Si la app detecta que el fichero ha cambiado por fuera, te
> ofrece recargar en vez de pisarlo.
>
> Si abres un `db.json` escrito por una versión **más nueva** de prolife que la instalada en
> ese ordenador, la app lo detecta, te lo dice y **no guarda nada** hasta que la actualices:
> es preferible perder una tarde de apuntes a que se corrompa la base entera.

Con `PROLIFE_DIR=/otra/ruta` se abre contra otro directorio sin tocar la configuración.

## En la tablet o el móvil

No hay app en la Play Store, y no hace falta: la interfaz de prolife es una página web que
sirve el propio ordenador, así que la tablet puede abrirla y **ver exactamente los mismos
archivos y la misma base de datos**. No es una copia que haya que sincronizar —es el mismo
`db.json`, contestado por el mismo ordenador—, así que no hay nada que se pueda desincronizar.

Se activa en **Ajustes → Abrir en la tablet o el móvil**. A partir de ahí:

- El servidor deja de escuchar solo en `127.0.0.1` y **exige una clave** a todo lo que no venga
  del propio ordenador. La clave se genera sola, vive en `~/.prolife/config.json` (no viaja con
  la carpeta sincronizada) y se puede renovar, lo que echa a los aparatos ya emparejados.
- El **enlace de emparejamiento** lleva la clave dentro. Se abre una vez en la tablet: la app la
  guarda y la borra de la barra de direcciones. No lo reenvíes por chat: quien lo tenga, entra.

**Para que se instale como una app de verdad** —con su icono, y capaz de abrir sin el ordenador
delante— la dirección tiene que ser `https`. Por `http://192.168.x.x` el navegador no lo permite,
y eso no es algo que la app pueda saltarse. La forma sensata de conseguirlo es
[Tailscale](https://tailscale.com), que además es lo que la hace funcionar fuera de casa, y esta
pantalla lo monta por ti: instala Tailscale, entra con tu cuenta —eso sí es un paso tuyo, abre un
navegador— y en **Ajustes → Abrir en la tablet o el móvil** aparece un botón, **«Activar acceso
fuera de casa»**, que hace exactamente lo que antes había que teclear.

Con eso activado, la propia pantalla enseña un **código QR**: apunta la cámara de la tablet y
listo, sin copiar ni pegar nada. También hay un enlace de texto por si lo prefieres. **No abras
puertos del router**: eso pondría tus apuntes en internet detrás de una sola clave, y no hace
falta — Tailscale ya te da la dirección segura entre tus propios aparatos.

Por la red local sin `https` la app funciona igual en el navegador; lo que no habrá es icono ni
modo sin conexión.

**Y desde la última versión, la tablet puede además ser una app instalada de verdad —un
APK— que habla directamente con Google Drive**, sin depender de que el ordenador esté
encendido. Los apuntes y los PDFs se leen y se escriben en la misma carpeta de Drive que
ya sincronizas; los cambios de la base (faltas, tareas, entrenos) se dejan en un buzón que
el ordenador recoge, para que nunca haya dos aparatos escribiendo el mismo `db.json`.

**Paso a paso para actualizar el ordenador e instalar el APK:**
[INSTALAR-TABLET.md](INSTALAR-TABLET.md).

**La forma antigua, contra el ordenador por Tailscale** (sigue funcionando, y es la única
que sirve si no quieres dar de alta nada en Google): [INSTALAR-ANDROID.md](INSTALAR-ANDROID.md).

**Sin el ordenador** (apagado, o tú fuera de su alcance) la app abre igualmente y enseña lo
último que vio. Además puedes seguir **apuntando tres cosas**: la asistencia a clase, tachar
tareas y el entreno del día. Es lo que se apunta lejos del ordenador, y se queda esperando en
la tablet hasta que vuelva a estar a tiro. Entonces se lo cuenta sola, y te ofrece recargar.

Lo demás —crear una asignatura, corregir el tiempo, cambiar ajustes— sigue sin poder tocarse
desde ahí, y te lo dice arriba en vez de aceptarlo y perderlo.

> La diferencia está en **cómo** se guarda cada cosa. Guardar normal manda el `db.json` entero,
> así que hacerlo desde una copia de hace tres horas machacaría lo que hubieras hecho en el
> ordenador entretanto. Esas tres, en cambio, viajan como «marca esta clase» o «tacha esta
> tarea» y se aplican sobre el `db.json` de cuando el ordenador vuelve: lo que hiciste allí
> mientras tanto sigue donde estaba. Se pueden aplicar dos veces sin duplicar nada, así que un
> corte a mitad de envío tampoco rompe nada.

Los archivos no se guardan solos en la tablet —un cuatrimestre de PDFs son cientos de megas—,
pero cada archivo abierto tiene un botón para guardarlo, y entonces sí se abre sin el ordenador.
En Ajustes se ve cuánto ocupan y se pueden vaciar.

En pantalla vertical la disposición se adapta sola: los paneles se apilan en filas y el árbol pasa
a ser un cajón que se retira al elegir. Las pestañas abiertas viajan entre aparatos; la geometría
de los paneles no, para que colocarlos en la tablet no te descoloque el portátil.

## Espacio de trabajo

Cada asignatura, proyecto y tarea tiene su **espacio**: el árbol real de su carpeta y hasta
**tres paneles** que pueden contener cosas distintas, en columnas o en filas. Es opcional:
medir el tiempo ya no obliga a trabajar aquí dentro.

**Qué cabe en un panel**

- **Archivos.** PDFs con el visor nativo de Chromium (zoom, búsqueda, páginas). Markdown,
  texto y código en CodeMirror con resaltado por lenguaje, `Ctrl+S` y autoguardado. Markdown
  en modo editor, vista previa o ambos. Imágenes, vídeo y audio.
- **Navegador.** Barra de direcciones, atrás/adelante, búsqueda si no escribes una URL, y
  accesos directos a tu campus y tus enlaces. Sesión propia y persistente.
- **VS Code.** El de verdad, empotrado — ver abajo.

**Aprovechar la pantalla** (pensado para portátiles de 14–16")

- Separadores **arrastrables** entre paneles; doble clic para igualarlos.
- Ocultar el árbol de archivos (`Ctrl+E`) y el menú lateral (`Ctrl+B`).
- **Modo concentración** (`Ctrl+Shift+Z`): desaparece todo menos el trabajo. `Esc` para salir.
- **Maximizar** un panel con doble clic en su barra de pestañas.
- Word, Excel y PowerPoint se abren directamente con su programa al pulsarlos en el árbol
  (igual que los `.zip`): convertirlos aquí destrozaría el formato.
- Se arrastran archivos sobre la ventana para subirlos. El filtro del árbol busca por nombre.
- Disposición, tamaños y pestañas se recuerdan por espacio, y viajan al otro ordenador
  dentro del `db.json`: abres la asignatura en la universidad y te encuentras los mismos
  paneles que dejaste en casa.

## VS Code dentro de la app

El panel de VS Code no es una imitación ni una copia descargada aparte: arranca
`code serve-web`, el servidor web **oficial de Microsoft que ya viene con tu instalación de
VS Code**. Eso significa tus extensiones, tu marketplace, tus ajustes y tus atajos, abierto
directamente en la carpeta de la asignatura o el proyecto.

Requisitos y condiciones, sin letra pequeña:

- Necesitas VS Code instalado. La app usa el comando `code` del sistema.
- Microsoft exige aceptar los [términos de licencia del servidor](https://aka.ms/vscode-server-license)
  y su [declaración de privacidad](https://privacy.microsoft.com/en-US/privacystatement).
  **La app no los acepta por ti**: hasta que lo confirmes en Ajustes, el panel no arranca.
- Escucha solo en `127.0.0.1`, con un testigo aleatorio distinto en cada arranque, y la
  telemetría desactivada.
- La primera vez descarga sus componentes de servidor (una sola vez, requiere internet).
- Se puede parar y retirar el consentimiento cuando quieras desde Ajustes.

## Medición del tiempo

Hay dos formas y conviven.

**Sesión de trabajo.** Pulsas **«Trabajar en…»** en la barra de arriba (o el ▶ de una
asignatura), eliges en qué, y cuenta hasta que la pares. Da igual la pantalla en la que
estés, si te vas al Word, si abres un PDF fuera o si trabajas con el libro en papel: es
un cronómetro, no una vigilancia. Sobrevive a cerrar la app y se retoma al volver. Si
llevas mucho sin tocar el ordenador te lo dice, y por seguridad la corta sola a los 30
minutos de inactividad (ajustable; 0 = nunca).

**Detección automática.** Si no hay ninguna sesión en marcha, se cae en el método de
siempre: el tiempo va al espacio de trabajo que tengas abierto y solo corre si la ventana
tiene el foco *y* el sistema registra actividad de teclado o ratón. Los tramos de menos de
un minuto se descartan.

En ambos casos, `Ctrl+J` abre la revisión del día: editar duración, reasignar de
asignatura, partir, borrar o añadir un tramo a mano.

Y si se te olvidó darle a «Trabajar en…» antes de ponerte, en la propia ficha de la
asignatura o el proyecto hay un botón **«Apuntar tiempo»**: solo pide cuánto y qué día,
sin tener que buscar de qué se trata en una lista — ya sabe dónde está.

## Trabajo semanal

Cada asignatura tiene unas **horas objetivo por semana** (si no las pones, se calculan por
créditos). El **porcentaje de trabajo semanal** mezcla las horas dedicadas con las entregas
que vencían esa semana: 100% es la semana hecha. Sale en el panel de inicio, en cada
asignatura y desglosado en Estadísticas.

## Ayudante local

`Ctrl+I` abre un ayudante que habla con [Ollama](https://ollama.com) corriendo en tu propio
ordenador. Nada de lo que le digas sale de la máquina.

Conoce tus asignaturas, tu horario, tus faltas, tus horas, tus proyectos, tus entrenos y
los documentos de tus carpetas, así que se le puede preguntar de verdad:

- *«¿cuántas faltas más me puedo permitir?»* → «llevas 1 de 8, quedan 21 clases y exigen el
  70%: puedes faltar a 7 más».
- *«¿cómo llevo la semana?»*, *«¿qué tengo para los próximos 7 días?»*
- *«resume el documento que tengo abierto»* → lee el archivo que tienes delante en el
  espacio de trabajo y te contesta sobre él.
- *«créame un proyecto que se llame Nautilos»*, *«pon la asistencia de Desarrollo web al
  80%»*, *«apunta series, 75 minutos, RPE 8»*, *«bórralo»*.

Puede consultar (asignaturas, proyectos, semana, agenda, horario, atletismo, documentos) y
puede escribir: tareas, exámenes, eventos, proyectos, asignaturas, tiempo, entrenos,
asistencia, los objetivos de Ajustes, y borrar lo que se haya equivocado.

**Lo que no sabe, lo pregunta.** Un modelo pequeño prefiere rellenar un hueco antes que
admitir que le falta un dato: si le dices *«añádeme una tarea para el viernes»* se inventa
que la tarea se llama «Tarea para el viernes» y la cuelga de la primera asignatura que ve.
Así que la comprobación no está en el modelo, que puede saltársela, sino en la propia
herramienta:

- Un título que, quitándole las fechas y el relleno, se queda en «tarea» o «cosa» no es un
  título: no se crea nada y se te pregunta cómo quieres llamarla.
- Falta el ámbito (uni, trabajo o personal) → se pregunta.
- Una asignatura o un proyecto que no aparecen por ninguna parte en lo que tú has escrito
  se descartan: los ha sacado de la lista del contexto, no de ti.

La pregunta la hace la herramienta y se te enseña tal cual, sin pasar por el modelo. Y no
todo necesita herramienta: una opinión, una duda de temario o ayuda a redactar se contestan
directamente.

Todo lo que crea, cambia o borra aparece en el chat con un botón de **deshacer** —también
los borrados, que se restauran enteros—, y en Ajustes se le puede quitar el permiso de
escribir.

Necesita Ollama instalado y un modelo descargado:

```bash
ollama pull llama3.1:8b
```

## Calendario

Vistas de **mes, semana y día**, y se queda en la que dejaste: si lo último que viste fue la
semana, la próxima vez es la semana, no siempre el día. La semana y el día son rejilla
horaria: las clases del horario, los exámenes, los eventos y las entregas caen en su hora.

- **Los eventos se arrastran.** Coge uno por la rejilla de semana o día y suéltalo en otra
  hora —o, en semana, en otro día— para moverlo; un clic sin arrastrar lo sigue abriendo
  para editarlo. Las clases, los exámenes y los eventos que se repiten no se arrastran: una
  clase la mueve el horario, y una repetición necesitaría decidir si se mueve la serie
  entera o solo esa vez, así que de momento esos se editan del modo de siempre.
- **Si dos cosas chocan en la misma hora**, se ven las dos, una al lado de la otra —como en
  cualquier calendario decente—, no una tapando a la otra sin que se note que hay dos.
- **El horario tiene fechas.** Cada clase vale entre un *desde* y un *hasta*; si los dejas
  vacíos hereda los del curso (Ajustes). Sin fecha de fin la clase se agendaría para siempre
  y no se podría contar cuántas faltas te puedes permitir, así que la app te lo avisa.
- **Exámenes y entregas evaluables** por asignatura, con hora, aula, peso sobre la nota y la
  nota sacada. De ahí sale la nota provisional y cuánto llevas ya jugado.
- **Faltas.** Pones la asistencia mínima exigida (general o por asignatura) y la app calcula
  cuántas clases tiene el cuatrimestre, cuántas has faltado y **cuántas te quedan**.
- **Categorías propias**: Salud, Conducir, Papeleo… con su color. Se crean sobre la marcha
  al añadir un evento o desde Ajustes.
- **Repeticiones**: diaria, semanal (con días concretos), mensual o anual, con intervalo y
  fecha de fin. Un día suelto se puede saltar sin romper la serie.

## Atletismo

Registro por sesión: si fuiste o no, tipo de entreno, duración, **RPE 1–10**, **CMJ pre y
post** y notas.

De ahí salen: adherencia semanal, **carga = RPE × minutos**, comparación con tu media de las
últimas semanas (avisa de saltos de más del 30%), evolución del CMJ previo y la caída
post-entreno como indicador de fatiga neuromuscular.

## Atajos

| Tecla | Acción |
|---|---|
| `Ctrl+B` | Ocultar o mostrar el menú lateral |
| `Ctrl+E` | Ocultar o mostrar el árbol de archivos *(dentro de un espacio de trabajo)* |
| `Ctrl+\` | Dividir en otro panel *(dentro de un espacio de trabajo)* |
| `Ctrl+Shift+Z` | Modo concentración |
| `Ctrl+I` | Ayudante |
| `Ctrl+K` | Enlaces y portales |
| `Ctrl+J` | Revisar y corregir el tiempo |
| `Ctrl+S` | Guardar el archivo abierto |
| `N` | Nueva tarea |
| `Esc` | Cerrar ventana o salir de concentración |

## Cómo está montado

Electron envuelve dos piezas: la interfaz en React (Vite) y un servidor Express local que
es el único que toca el disco, lanza VS Code y abre enlaces. El proceso principal expone
además el tiempo de inactividad del sistema, que es lo que hace fiable la medición.

El ayudante no rompe esa regla: el servidor solo hace de pasarela hacia Ollama —y solo
acepta direcciones locales—, mientras que las herramientas que el modelo pide se ejecutan
en la interfaz, que sigue siendo la única dueña del `db.json`.

El logo se cambia en **Ajustes → Perfil**. Se guarda como `.prolife/logo.png` dentro de tu
directorio, así que viaja con la nube a los dos ordenadores; sin él sale el nombre escrito.
