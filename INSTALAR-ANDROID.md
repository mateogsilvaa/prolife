# Instalar prolife en Android

Guía completa para tener prolife en la tablet (o el móvil) con su icono, viendo los mismos
archivos y las mismas notas que en el ordenador.

**Antes de empezar, lo que conviene entender**, porque cambia lo que puedes esperar:

prolife no es una app de Android. Es una app de escritorio cuya interfaz ya es una página web
que sirve tu propio ordenador. Lo que instalas en la tablet es esa página, y **quien tiene los
datos y los archivos sigue siendo el ordenador**. Eso tiene una ventaja grande y una pega clara:

- **Ventaja:** no hay copia que sincronizar. Es literalmente el mismo `db.json` y la misma
  carpeta. Nada puede quedar «desincronizado» porque no hay dos cosas que sincronizar.
- **Pega:** para trabajar de verdad, **el ordenador tiene que estar encendido** y tu tablet
  tiene que poder alcanzarlo. Sin él, la app abre y te deja consultar lo último que vio, y
  apuntar tres cosas —asistencia, tareas y entrenos— que se le cuentan al volver. Lo demás no
  se puede editar desde ahí.

No hay nada que descargar de la Play Store, y no hace falta root ni instalar ningún `.apk`.

---

## Índice

1. [Qué necesitas](#1-qué-necesitas)
2. [Encender el acceso en el ordenador](#2-encender-el-acceso-en-el-ordenador)
3. [La forma rápida: solo en casa, sin instalar](#3-la-forma-rápida-solo-en-casa-sin-instalar)
4. [La forma buena: instalada y también fuera de casa](#4-la-forma-buena-instalada-y-también-fuera-de-casa)
5. [Emparejar la tablet](#5-emparejar-la-tablet)
6. [Instalar el icono en la pantalla de inicio](#6-instalar-el-icono-en-la-pantalla-de-inicio)
7. [Qué funciona y qué no sin el ordenador](#7-qué-funciona-y-qué-no-sin-el-ordenador)
8. [Seguridad: lo que debes y no debes hacer](#8-seguridad-lo-que-debes-y-no-debes-hacer)
9. [Si algo falla](#9-si-algo-falla)

---

## 1. Qué necesitas

- El ordenador donde ya usas prolife, encendido y con la app abierta.
- La tablet Android con **Chrome** (vale cualquier navegador basado en Chromium; Firefox no
  ofrece la instalación igual).
- Los dos aparatos en la misma wifi — o, si quieres usarla también fuera de casa,
  [Tailscale](https://tailscale.com) instalado en ambos (es gratis para uso personal).

---

## 2. Encender el acceso en el ordenador

Por defecto prolife solo se escucha a sí mismo: nadie más en la red puede verlo. Hay que
autorizarlo a mano.

1. En el ordenador, abre prolife → **Ajustes**.
2. Baja hasta **«Abrir en la tablet o el móvil»**.
3. Marca **«Permitir el acceso desde otros aparatos de la red»**.
4. **Cierra prolife y vuelve a abrirla.** El cambio de escucha solo entra al arrancar.

Al encenderlo se genera una **clave de acceso**. A partir de ese momento, cualquier petición que
no venga del propio ordenador tiene que traerla. La clave se guarda en
`~/.prolife/config.json` — en el ordenador, no en la carpeta de Drive, así que cada máquina
tiene la suya.

---

## 3. La forma rápida: solo en casa, sin instalar

Si te vale con usarla desde el sofá y no te importa que sea una pestaña del navegador:

1. En Ajustes, junto a la dirección `http://192.168.x.x:4321/`, pulsa
   **«Copiar enlace de emparejamiento»**.
2. Pásate ese enlace a la tablet (por ejemplo, con «Enviar a tus dispositivos» de Chrome) y
   ábrelo **una sola vez**.
3. Ya está: la app carga con todos tus datos.

**Lo que no tendrás por esta vía:** icono en la pantalla de inicio, ni poder abrirla sin el
ordenador. El motivo está en el punto siguiente.

---

## 4. La forma buena: instalada y también fuera de casa

Para que Android ofrezca «Instalar app» —y para que la app abra sin el ordenador delante— la
dirección tiene que ser **`https`**. Con `http://192.168.x.x` a secas el navegador se niega, y no
es algo que prolife pueda saltarse: es una regla del navegador para no dejar que cualquier página
de una red no cifrada se instale en tu aparato.

La forma sensata de conseguir `https` en casa es **Tailscale**, que además resuelve de paso lo de
usarla fuera. Tailscale monta una red privada entre tus aparatos: no expone nada a internet.

1. Instala Tailscale en el ordenador y en la tablet, y entra con la misma cuenta en los dos.
2. En el ordenador, ejecuta una vez:

   ```bash
   tailscale serve --bg 4321
   ```

3. Te dirá una dirección del estilo `https://mi-portatil.tu-tailnet.ts.net/`. Esa es la buena:
   tiene certificado de verdad y funciona desde cualquier sitio con internet, no solo en casa.

Si prefieres no usar Tailscale, cualquier otra vía que te dé `https` sirve (un proxy inverso con
certificado propio, por ejemplo), pero **no abras el puerto en el router**: ver el punto 8.

---

## 5. Emparejar la tablet

La tablet necesita la clave una vez. El enlace de emparejamiento la lleva dentro.

- **Si usas Tailscale:** en Ajustes, pulsa **«Ver la clave»**, cópiala, y en la tablet abre
  tu dirección `https://…ts.net/?k=LA_CLAVE`.
- **Si estás en la red local:** usa directamente el botón **«Copiar enlace de emparejamiento»**,
  que ya la incluye.

Nada más abrirlo, la app guarda la clave y **la borra de la barra de direcciones**, para que no
acabe en el historial ni la compartas sin querer al enviar el enlace.

A partir de ahí, la tablet entra sola. No hay que repetirlo.

---

## 6. Instalar el icono en la pantalla de inicio

Con la dirección `https` abierta en Chrome:

1. Menú de Chrome (los tres puntos) → **«Añadir a pantalla de inicio»** o **«Instalar app»**.
2. Confirma. Aparecerá el icono de prolife junto al resto de tus apps.
3. Ábrela desde ahí: se abre a pantalla completa, sin barra de direcciones.

**¿No te aparece la opción?** Entra en **Ajustes** desde la propia tablet: hay una tarjeta
**«Instalar en este aparato»** que te dice si la dirección que estás usando sirve o no, y por qué.

---

## 7. Qué funciona y qué no sin el ordenador

Con el ordenador encendido y alcanzable, **funciona todo**: tareas, calendario, horario, notas,
tiempo, entrenamientos, y el árbol de archivos con sus PDFs y apuntes.

Si el ordenador está apagado, o estás sin cobertura:

| | Sin el ordenador |
|---|---|
| Abrir la app | Sí |
| Consultar tareas, horario, exámenes, notas, estadísticas | Sí, tal como estaban la última vez |
| Marcar la asistencia a una clase | **Sí**, se le cuenta al ordenador cuando vuelva |
| Tachar (o destachar) una tarea | **Sí**, igual |
| Apuntar el entreno del día | **Sí**, igual |
| Lo demás: crear asignaturas, corregir el tiempo, ajustes… | **No.** Te avisa arriba y rechaza el cambio |
| Abrir un PDF o un archivo | Solo los que hayas **guardado** antes (ver abajo) |

### Por qué unas cosas sí y otras no

No es capricho. Guardar normal manda el `db.json` **entero**: hacerlo desde una copia de hace
tres horas machacaría lo que hubieras hecho en el ordenador mientras tanto. Por eso lo demás se
rechaza — aceptarlo y no poder guardarlo sería perder trabajo sin avisar.

Esas tres, en cambio, no mandan la base: mandan **«marca esta clase»**, **«tacha esta tarea»**,
**«apunta este entreno»**. Se guardan en la tablet y se aplican sobre el `db.json` de cuando el
ordenador vuelve, tocando solo ese registro. Lo que hiciste en el ordenador entretanto sigue
donde estaba.

Mientras haya algo esperando, la app lo dice arriba con cuántos cambios son. Se envían solos en
cuanto el ordenador aparece —también si has cerrado la app entremedias, porque la lista se
guarda en la tablet—, y hay un botón para intentarlo a mano. Cuando ya está, te ofrece recargar.

Dos detalles que conviene saber:

- Si apuntas el entreno de un día en la tablet y también lo apuntaste en el ordenador, **manda
  el de la tablet**: la pantalla de Atletismo es de un entreno por día.
- Si algo apuntado ya no tiene sentido al volver —tachaste una tarea que entretanto borraste en
  el ordenador—, se salta y te lo dice, en vez de recrearla.

### Llevarte archivos sueltos

Los archivos no se guardan solos en la tablet, y es deliberado: un cuatrimestre de PDFs son
cientos de megas, y llenarte el almacenamiento con cosas que quizá no vas a mirar no es una
decisión que deba tomar la app.

Se guardan **uno a uno**, cuando tú quieras:

1. Abre el archivo en la tablet, con el ordenador encendido.
2. En la barra de la pestaña, pulsa el botón de **descarga**. Se pone un tic verde.
3. En el árbol, ese archivo queda marcado con un punto verde.

A partir de ahí se abre aunque el ordenador esté apagado. En **Ajustes → Archivos guardados en
este aparato** ves cuántos hay, cuánto ocupan y puedes vaciarlos de golpe.

Ojo: se guarda la versión de ese momento. Si luego lo cambias en el ordenador, la tablet seguirá
enseñando la copia guardada mientras esté sin conexión.

---

## 8. Seguridad: lo que debes y no debes hacer

Estás abriendo a la red un programa que tiene acceso a tus apuntes, tus notas y tus archivos.
Merece dos minutos de atención:

- **No abras puertos del router hacia el puerto 4321.** Eso pone tus documentos en internet
  detrás de una única clave, al alcance de cualquier escáner automático. Tailscale hace lo que
  quieres sin exponer nada.
- **No reenvíes el enlace de emparejamiento** por WhatsApp, correo ni chat. Lleva la clave
  dentro: quien lo tenga entra a todo.
- **Si pierdes la tablet o compartes la clave sin querer**, en Ajustes → «Renovar clave». Los
  aparatos emparejados dejan de entrar en el acto y hay que volver a emparejarlos.
- Mientras el acceso está encendido, quien esté en tu misma wifi **sin la clave** no ve nada: la
  app le dice que el aparato no está emparejado y no le sirve ni datos ni archivos.
- Puedes apagar el acceso cuando quieras desde la misma casilla; al reiniciar, prolife vuelve a
  escucharse solo a sí misma.

Y lo que hace la app por su parte, sin que tengas que configurar nada:

- **Ninguna web puede leer tus datos**, aunque la tengas abierta en el mismo navegador. Solo se
  atiende a la propia interfaz de prolife.
- Un dominio de atacante que apunte a tu ordenador (reenlace de DNS) **no hereda** el permiso que
  tiene el ordenador sobre sí mismo: se le pide la clave como a cualquiera.
- La clave nunca sale en la cabecera `Referer` hacia sitios externos.
- Un `.html` o un `.svg` de tu propia carpeta se abre aislado, sin poder ejecutar nada ni leer la
  clave guardada en el navegador.

---

## 9. Si algo falla

**«Este aparato no está emparejado».** La clave no ha llegado o se renovó. Vuelve a abrir el
enlace de emparejamiento (punto 5).

**No carga nada, ni siquiera la pantalla de error.** El ordenador no es alcanzable: comprueba que
prolife está abierta, que reiniciaste después de marcar la casilla, y que los dos aparatos están
en la misma red (o los dos conectados a Tailscale).

**Carga pero dice «Sin conexión con el ordenador».** La app está enseñándote su copia. Es lo
esperado si el ordenador se apagó; si está encendido, revisa la red.

**No sale «Añadir a pantalla de inicio».** Estás entrando por `http`. Mira la tarjeta «Instalar
en este aparato» en Ajustes, y ve al punto 4.

**Cambié la clave y la tablet sigue entrando.** Reinicia prolife en el ordenador: la clave nueva
se aplica al arrancar.

**La dirección `192.168.x.x` cambió.** Es normal, el router las reparte y las cambia. Con
Tailscale la dirección es fija y no pasa esto.
