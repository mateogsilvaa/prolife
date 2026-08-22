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

## Dónde vive todo

Por defecto en `Documentos/ProLife`, cambiable en **Ajustes → Directorio de trabajo**.

```
ProLife/
  Universidad/<Asignatura>/   apuntes, PDFs, prácticas
  Trabajo/<Proyecto>/         documentación, entregas
  Tareas/<Tarea>/             documentos de tareas sueltas
  Deporte/                    planes de entrenamiento, series, vídeos de técnica
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

## Trabajo semanal

Cada asignatura tiene unas **horas objetivo por semana** (si no las pones, se calculan por
créditos). El **porcentaje de trabajo semanal** mezcla las horas dedicadas con las entregas
que vencían esa semana: 100% es la semana hecha. Sale en el panel de inicio, en cada
asignatura y desglosado en Estadísticas.

## Ayudante local

`Ctrl+I` abre un ayudante que habla con [Ollama](https://ollama.com) corriendo en tu propio
ordenador. Nada de lo que le digas sale de la máquina.

Conoce tus asignaturas, tu horario, tus faltas, tus horas y tus exámenes, así que se le
puede preguntar de verdad:

- *«¿cuántas faltas más me puedo permitir?»* → «llevas 1 de 8, quedan 21 clases y exigen el
  70%: puedes faltar a 7 más».
- *«¿cómo llevo la semana?»*, *«¿qué tengo para los próximos 7 días?»*
- *«añádeme una tarea de cálculo para el viernes»* → «vale, ¿cómo la llamo y qué hay que
  hacer?». Con eso, la crea.

También apunta exámenes y tramos de tiempo. Todo lo que crea aparece en el chat con un
botón de **deshacer**, y en Ajustes se le puede quitar el permiso de escribir.

Necesita Ollama instalado y un modelo descargado:

```bash
ollama pull llama3.1:8b
```

## Calendario

Vistas de **mes, semana y día**. La semana y el día son rejilla horaria: las clases del
horario, los exámenes, los eventos y las entregas caen en su hora.

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
