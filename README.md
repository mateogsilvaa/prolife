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

> **No hace falta Visual Studio ni compilar nada nativo.** La app no usa ningún módulo
> nativo, así que el empaquetado lleva `npmRebuild: false` y electron-builder no llama a
> node-gyp. Importa porque `pdfjs-dist` —el motor que lee los PDF— arrastra `canvas` como
> dependencia *opcional*, que sí es nativa y sirve para **pintar** páginas; aquí solo se
> saca el texto y no se usa jamás. Sin esa línea, generar el instalador en un Windows sin
> Visual Studio se cae con *«Could not find any Visual Studio installation to use»* por un
> módulo que no hace falta. Tampoco se empaqueta.

**Actualizar una instalación que ya tienes en marcha, sin perder nada:**
[ACTUALIZAR.md](ACTUALIZAR.md). En resumen: los datos no están dentro de la app, así que
instalar encima no se lleva nada por delante.

## Hoy: lo que hay que mirar al abrir la app

En el ordenador las pantallas aprovechan el ancho —Hoy va en tres columnas, Ajustes en dos—
y las listas largas se desplazan dentro de su tarjeta, para ver casi todo sin hacer scroll.

La primera pantalla no cuenta horas: contesta *qué tengo hoy y qué se me está escapando*.

- **Agenda del día** en orden —clases, exámenes, eventos (también los que se repiten),
  entreno, voluntariado— con la de mañana debajo. Cada clase lleva tres botones: **✓ fui,
  ✕ falté, ⊘ cancelada**. Apuntar la asistencia en el momento es un toque, no un viaje a la
  ficha de la asignatura.
- **Ojo con esto**: entregas que vencen o que ya vencieron sin marcar, exámenes cercanos,
  asignaturas sin margen de faltas, clases pasadas sin marcar (si se acumulan, el cálculo de
  faltas deja de ser fiable), tareas atrasadas, una lesión abierta, una molestia que se repite
  y va a peor, un salto de carga de entreno, días sin entrenar y jornadas de voluntariado sin
  foto. Cada aviso lleva a donde se arregla; si no hay nada, lo dice.
- **Por hacer**: tareas y entregas evaluables de los próximos días, todo junto.
- **Entreno**: si no está apuntado, los tipos a un toque.

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

> **Ojo:** la pantalla para emparejar la tablet con el ordenador (el enlace con la clave, el
> QR de Tailscale) **ya no está en Ajustes**. El camino bueno es el APK o la versión web, que
> hablan con Drive directamente y no necesitan el ordenador encendido (ver más abajo). Lo de
> esta sección sigue funcionando si ya lo tenías montado —la configuración vive en
> `~/.prolife/config.json` y no se ha tocado—, pero ya no se activa desde la app.

Cuando estaba activado:

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
encendido, y **con las mismas funciones**: lo que se puede hacer en el ordenador se puede
hacer en la tablet. Los apuntes y los PDFs se leen y se escriben en la misma carpeta de
Drive que ya sincronizas; los cambios de la base no se suben como fichero entero sino como
registros sueltos a un buzón que el ordenador recoge, para que nunca haya dos aparatos
escribiendo el mismo `db.json` y para que el trabajo de uno no borre el del otro. Fuera
queda solo lo que **es** del ordenador: el directorio de trabajo.

**Paso a paso para actualizar el ordenador e instalar el APK:**
[INSTALAR-TABLET.md](INSTALAR-TABLET.md).

**Y hay versión web**, en `mateogsilvaa.github.io/prolife/`: la misma app compilada para el
navegador, contra la misma carpeta de Drive. Sin instalar nada, desde cualquier móvil u
ordenador, y se puede añadir a la pantalla de inicio como si fuera una app. Se publica sola
en cada cambio que llega a `main`. Paso a paso: [INSTALAR-WEB.md](INSTALAR-WEB.md).

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


## Medición del tiempo

**Sesión de trabajo.** Pulsas **«Trabajar en…»** en la barra de arriba (o el ▶ de una
asignatura), eliges en qué, y cuenta hasta que la pares. Da igual la pantalla en la que
estés, si te vas al Word, si abres un PDF fuera o si trabajas con el libro en papel: es
un cronómetro, no una vigilancia. Sobrevive a cerrar la app y se retoma al volver. Si
llevas mucho sin tocar el ordenador te lo dice, y por seguridad la corta sola a los 30
minutos de inactividad (ajustable; 0 = nunca).

`Ctrl+J` abre la revisión del día: editar duración, reasignar de
asignatura, partir, borrar o añadir un tramo a mano.

Y si se te olvidó darle a «Trabajar en…» antes de ponerte, en la propia ficha de la
asignatura o el proyecto hay un botón **«Apuntar tiempo»**: solo pide cuánto y qué día,
sin tener que buscar de qué se trata en una lista — ya sabe dónde está.

## Trabajo semanal

Cada asignatura tiene unas **horas objetivo por semana** (si no las pones, se calculan por
créditos). El **porcentaje de trabajo semanal** mezcla las horas dedicadas con las entregas
que vencían esa semana: 100% es la semana hecha. Sale en el panel de inicio, en cada
asignatura y desglosado en Estadísticas.

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
- **Cuatrimestres.** Se definen una vez en Ajustes —cuándo acaba el primero, cuándo empieza
  el segundo— y luego cada clase del horario dice a cuál pertenece. Así una **asignatura
  anual** se apunta una sola vez y puede tener un horario en el primer cuatrimestre y otro
  distinto en el segundo, sin repetir fechas en cada fila. Entre uno y otro, que es cuando
  hay exámenes y vacaciones, no se agenda ninguna clase.
- **Festivos y vacaciones.** Un día marcado como festivo **no tiene clase**: no es que la
  clase salga y se perdone, es que no existe. No se agenda, no puedes faltar a ella y no
  entra en el cálculo de la asistencia. Se marca desde el propio calendario, en el día que
  estés mirando —y el botón te dice cuántas clases te quita antes de pulsarlo—, o en Ajustes
  para rangos enteros como Navidad o Semana Santa. En el mes se ven rayados y con su nombre.
- **Clase cancelada.** Si el profesor no viene o avisa de que no hay clase, se marca como
  cancelada —desde Hoy, desde el día en el calendario o en la asistencia de la asignatura, y
  también por adelantado—. Es como un festivo de una sola clase: no cuenta ni como ida ni
  como falta, sale del total y desaparece también de Google Calendar.
- **Exámenes y entregas evaluables** por asignatura, con hora, aula, peso sobre la nota y la
  nota sacada. De ahí sale la nota provisional y cuánto llevas ya jugado.
- **Faltas.** Pones la asistencia mínima exigida (general o por asignatura) y la app calcula
  cuántas clases tiene el cuatrimestre, cuántas has faltado y **cuántas te quedan** — ya
  descontados los festivos, con la ficha diciéndote cuántas clases se llevaron, para que no
  parezca que se han perdido.
- **Categorías propias**: Salud, Conducir, Papeleo… con su color. Se crean sobre la marcha
  al añadir un evento o desde Ajustes.
- **Repeticiones**: diaria, semanal (con días concretos), mensual o anual, con intervalo y
  fecha de fin. Un día suelto se puede saltar sin romper la serie.

## En el móvil

Por debajo de 640 px la columna lateral desaparece y manda una **barra de abajo** con cinco
sitios —Hoy, Tareas, Agenda, Uni y *Más*—, que es donde llega el pulgar. Cinco y no diez:
cabe el nombre, el dedo acierta, y lo que no cabe está a un toque. En el mes del calendario
los títulos no caben, así que las cosas se quedan en rayas del color de cada una: dicen
«aquí hay algo» sin mentir sobre qué. Las franjas del sistema —la barra de gestos del
iPhone— se respetan.

## Google Calendar

Tus clases, exámenes y eventos, en el móvil. Se conecta desde **Ajustes → Google Calendar**.

La regla es la de siempre: **un solo escritor**. Dentro de tu cuenta se crea un calendario
aparte llamado `prolife` que gobierna la app entera —lo llena, lo corrige y borra de ahí lo
que ya no toca—. **Tu calendario personal no se toca nunca**; solo se lee, y únicamente los
que tú marques, para poder verlos dentro del calendario de prolife en gris.

- **Sincronizar es reconciliar**, no ir apuntando cambios: se calcula cómo tendría que estar
  el calendario según el `db.json` de ahora, se mira cómo está y se corrige la diferencia.
  Por eso sincronizar dos veces seguidas no cambia nada la segunda, y por eso da igual que
  la app haya estado cerrada dos semanas.
- **Los dos ordenadores pueden sincronizar.** El identificador de cada evento se deduce de
  la cosa que representa, así que los dos calculan el mismo y el segundo actualiza en vez de
  duplicar. No hay ninguna tabla de equivalencias que mantener.
- **Las clases van como eventos que se repiten**, con su regla semanal y la fecha de fin de
  su cuatrimestre — no como cientos de eventos sueltos. Los festivos entran como excepciones
  de esa repetición: el día que marcas festivo, la clase desaparece también del móvil.
- **Eliges qué se lleva**: clases, exámenes, eventos y, si quieres, las tareas con fecha y
  los entrenos. Lo que desmarcas se retira de Google en la siguiente pasada.
- Se sincroniza solo al abrir la app, un minuto después de dejar de tocar cosas y cuando
  entra algo de la tablet —también con la ventana minimizada, porque lo programa el servidor—,
  más el botón de *Sincronizar ahora*.
- **Si Google retira el permiso, se dice.** Hoy y Ajustes avisan en rojo de que está
  desconectado y desde cuándo, o del último fallo. Un fallo de red ya no desconecta: solo un
  `invalid_grant` de Google (permiso caducado o revocado). Si caduca cada semana, la pantalla
  de consentimiento del proyecto sigue en «Prueba»: publícala. El rato importa: cambiar un horario son diez ediciones seguidas y
  no tiene sentido mandar diez tandas para acabar en el mismo sitio.

Hace falta un cliente de OAuth propio, igual que para Drive en la tablet: en
[console.cloud.google.com/auth/clients](https://console.cloud.google.com/auth/clients), tipo
**Aplicación de escritorio**, con la **Google Calendar API** habilitada. El identificador y
el secreto se pegan en Ajustes y se quedan en `~/.prolife/config.json` de ese ordenador —no
en el repositorio y no en la carpeta que viaja por Drive—. El testigo de acceso también.

Lo sincroniza el ordenador, no la tablet: lo que apuntes en la tablet llega a Google cuando
abres la app en el ordenador, por la misma razón por la que el `db.json` lo escribe él solo.

## Voluntariado

Un apartado propio para las horas de voluntariado, pensado no para medirlas sino para
**poder demostrarlas**, que es lo que te piden cuando hay que justificarlas.

La unidad no es la entidad, es la **jornada**: un día concreto, sus horas, qué hiciste y
**las fotos de ese día**. Las fotos van a `Voluntariado/<Entidad>/<fecha>/` dentro de tu
carpeta de siempre —archivos normales, que se abren desde el explorador y viajan por Drive
como todo lo demás—, no dentro del `db.json`.

- Cada entidad lleva su total de horas y, si te has comprometido a un número, cuánto llevas.
- Las jornadas **sin ninguna foto se marcan**, porque son las que costará justificar.
- Las horas cuentan como tiempo dedicado, igual que un entreno: el tramo va atado al id de
  la jornada, así que corregirla no duplica nada.
- Desde la ficha se pone una salida o un turno **en el calendario**, ya con su categoría.
- Las jornadas aparecen en el calendario junto a las clases y los entrenos.
- Si colaboras con **una sola entidad**, «Voluntariado» entra directo en ella, sin lista
  intermedia. Las jornadas se ven por meses, con el día bien grande y las fotos en tira.

## Tareas y entregas evaluables

Las prácticas, entregas y presentaciones que apuntas en una asignatura (o en el calendario)
**salen solas en Tareas y en Hoy**, mezcladas con las tareas por fecha, y se tachan igual:
marcar una como entregada la marca en la asignatura, porque es el mismo registro. Los
exámenes, que no se entregan, salen aparte en «Exámenes que vienen».

## Estadísticas

Seis pestañas: **la semana** (la de siempre), **Universidad** (horas, asistencia real, faltas
y margen, nota provisional y entregas, asignatura a asignatura), **Atletismo**, **Tiempo y
hábitos** (mes a mes por áreas, qué día y a qué hora rindes más, mejor día, racha más larga),
**Tareas** (a tiempo o tarde, ritmo, creadas frente a cerradas) y **Voluntariado**.

## Informe completo

**Ajustes → Informe completo** genera un documento con absolutamente todo: cada asignatura
con su horario, su asistencia clase a clase, sus notas y entregas; todos los eventos y
festivos; todas las tareas; el tiempo mes a mes y día a día; cada entreno con sus molestias;
las lesiones; cada jornada de voluntariado con sus fotos; los ajustes; y en un apéndice, cada
tramo de tiempo. Es un único HTML sin nada de fuera: se guarda en `Informes/` dentro de tu
carpeta (así viaja por Drive), se abre en cualquier navegador y desde ahí se imprime a PDF.
En la tablet se guarda en la misma carpeta de Drive; también hay un botón para descargarlo.

## Salud: el reloj Garmin

**Ajustes → Garmin → Conectar Garmin** abre la página oficial de Garmin Connect en una ventana
de la app y entras allí, como en cualquier navegador. **prolife no ve ni guarda tu
contraseña**: solo la sesión, en una partición propia de este ordenador, igual que un
navegador que recuerda que entraste. A partir de ahí se pone al día sola al abrir la app y
cada dos horas (el reloj tiene que haber sincronizado antes con la app de Garmin del móvil).
La primera vez trae los últimos dos meses.

Qué se trae, por día: **sueño** (total, fases, hora de acostarse y de levantarse, puntuación
si el reloj la da), **pasos** y su objetivo, **pulso en reposo**, estrés medio, **Body
Battery**, calorías y minutos de intensidad. Y las **actividades** del reloj.

Dónde se ve:
- **Salud**: arriba, **cómo llegas hoy** (0–100, juntando la noche frente a tu media, el pulso
  frente a tu base, la Body Battery y la carga de la semana) y **cuánto duermes frente a cómo
  entrenas** (RPE y molestias según la noche anterior); debajo, tus entrenos con cómo
  llegabas a cada uno, medias de 7 y 30 días, la última noche por fases, sueño por noche, pasos por día,
  la evolución del pulso en reposo, qué día de la semana duermes y te mueves más, y si dormir
  menos de 7 h te sube el RPE o te trae más molestias.
- **Hoy**: «Tu cuerpo» (la noche, los pasos, el pulso) y dos avisos: noche de menos de 6 h y
  pulso en reposo 6 o más por encima de tu base.
- **Atletismo**: al apuntar un entreno, si el reloj grabó algo ese día sale arriba con un botón
  **Usar** que pone la duración y los datos (distancia, ritmo, pulso) en las notas. Desde Salud,
  cada actividad se apunta como entreno con un toque, con el tipo ya propuesto.
- El **informe completo** lleva la salud día a día.

Por qué así y no con usuario y contraseña: Garmin no tiene API para uso personal, y desde
marzo de 2026 bloquea los inicios de sesión que no vienen de un navegador real, así que las
librerías que lo hacían ya no sirven. La app de escritorio *es* un navegador real, y por eso
la conexión vive en el ordenador. Los datos viajan en el `db.json` como todo lo demás, así que
la tablet y la web también los ven. Si Garmin cambia su web interna, esto puede romperse: la
app lo dice en Ajustes y en Salud en vez de quedarse callada.

## Atletismo

Registro por sesión: si fuiste o no, tipo de entreno, duración, **RPE 1–10**, **CMJ pre y
post**, molestias y notas; y, según el tipo, **los pesos del gimnasio** o **los tiempos de
las series**. Arriba del formulario sale con qué llegabas a ese entreno: la noche anterior,
el pulso en reposo y la Body Battery del reloj. Seis pestañas:

- **Semana**: adherencia, carga (RPE × minutos) frente a tu media, CMJ y últimos entrenos.
- **Calendario**: el mes entero con lo que hiciste cada día.
- **Gimnasio**:
  - **Importar PDF** de tu plan: lee la tabla (Orden · Ejercicio · Series · Repet. ·
    Indicación · Tempo · Técnica · Material · Vídeo), con los bloques, las celdas de varias
    líneas y el enlace al vídeo de cada ejercicio. Cada PDF es un día; los de un mismo plan
    se juntan en una rutina. Antes de guardar se revisa y se corrige lo que haga falta.
  - Al apuntar una sesión de gimnasio eliges rutina y día, y por cada ejercicio apuntas kg y
    repeticiones, las series de **calentamiento** aparte (W), si **te lo saltaste** y una
    nota. Al lado sale lo que hiciste la última vez, los pesos vienen propuestos, y una
    **★** marca cada serie que es récord.
  - **Marcas personales** por ejercicio (máximo y 1RM estimado), su evolución, volumen del
    mes y lo que más te saltas.
  - Exportar en **CSV de Hevy** (sus mismas columnas, con superseries por bloque) y en
    formato **Strong**, que es el que Hevy acepta al importar.
- **Series**: metros, tiempo y descanso de cada repetición. **Marcas por distancia** (mejor
  tiempo, ritmo, media) y cómo bajan sesión a sesión.
- **Estadísticas**: marcas de gimnasio y de pista, qué tipo haces más, qué días vas, mes a
  mes, rachas y récords.
- **Molestias y lesiones**: zona, lado, dolor, tipo y cuándo; tendencia por zona y lesiones
  con seguimiento hasta el alta.

## Trabajo

Una pantalla con todo a la vista:
- **Diario**: dos líneas de qué hiciste cada día, con su proyecto si quieres. Se busca.
- **Metas**: qué quieres conseguir, partido en pasos, con fecha y porcentaje.
- **Ideas y notas**: lo que se te ocurre; una idea pasa a ser tarea con un toque.
- **Proyectos**, en pequeño, con la última entrada del diario de cada uno.

## Atajos

| Tecla | Acción |
|---|---|
| `Ctrl+B` | Ocultar o mostrar el menú lateral |
| `Ctrl+Shift+Z` | Modo concentración |
| `Ctrl+K` | Enlaces y portales |
| `Ctrl+J` | Revisar y corregir el tiempo |
| `N` | Nueva tarea |
| `Esc` | Cerrar ventana o salir de concentración |

## Cómo está montado

Electron envuelve dos piezas: la interfaz en React (Vite) y un servidor Express local que
es el único que toca el disco y abre enlaces. El proceso principal expone
además el tiempo de inactividad del sistema, que es lo que hace fiable la medición.

El logo se cambia en **Ajustes → Perfil**. Se guarda como `.prolife/logo.png` dentro de tu
directorio, así que viaja con la nube a los dos ordenadores; sin él sale el nombre escrito.
