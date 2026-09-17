# prolife en el navegador

La misma app, sin instalar nada, desde cualquier móvil u ordenador con conexión:

```
https://mateogsilvaa.github.io/prolife/
```

Es **el mismo prolife** que el APK de la tablet, compilado para el navegador: lee y escribe
en la misma carpeta de Google Drive que sincroniza tu ordenador. Puedes consultarlo todo y
apuntar lo que quieras; los cambios de la base los recoge el ordenador la próxima vez que
abras la app en él, igual que ya hace con la tablet.

Lo que **no** hay ahí, porque son del ordenador por definición: el ayudante (Ollama corre en
tu máquina), VS Code, el directorio de trabajo y la sincronización con Google Calendar.

---

## Lo que hay que hacer una vez

### Paso 1 — Hacer público el repositorio

GitHub Pages **no funciona en repositorios privados** salvo con GitHub Pro. En
`github.com/mateogsilvaa/prolife` → *Settings* → abajo del todo, *Danger Zone* →
**Change repository visibility** → *Make public*.

> **Qué se hace público y qué no.** Tus datos **no están en el repositorio**: viven en
> `Documentos\ProLife` y en tu Drive. Lo que queda a la vista es el código, los manuales, tu
> identificador de cliente de Google —que es público por diseño, Google lo trata así— y el
> almacén de claves de depuración de Android, cuya contraseña (`android`) ya es pública y
> viene en la documentación de Google. Nada de eso da acceso a tu cuenta ni a tus cosas.

### Paso 2 — Activar Pages

*Settings* → *Pages* → en **Source**, elige **GitHub Actions**. No hay que elegir rama.

### Paso 3 — Un cliente de OAuth para la web

El de Android no vale: Google separa los tipos, y el de Android va atado al paquete y a la
huella de firma, cosas que una página no tiene. En
[console.cloud.google.com/auth/clients](https://console.cloud.google.com/auth/clients), en tu
proyecto de siempre:

- *Crear cliente* → tipo **Aplicación web** → nombre `prolife web`.
- En **Orígenes autorizados de JavaScript**, añade:
  ```
  https://mateogsilvaa.github.io
  ```
  Solo el origen: sin `/prolife/` ni barra final, o Google lo rechaza.
- *Crear*. Copia el **ID de cliente**. El secreto **no hace falta**: en un navegador no puede
  haber secretos, y por eso la web usa el flujo de testigo de Google Identity Services.

### Paso 4 — Poner ese identificador en el proyecto

En el ordenador, abre `src/lib/google.config.js` y sustituye la línea de `WEB_CLIENT_ID` por
el tuyo. Después:

```bash
git add src/lib/google.config.js
git commit -m "Mi identificador de cliente web"
git push
```

El `git push` a `main` ya lanza la publicación. En un par de minutos la página está en pie.

### Paso 5 — Abrirla en el móvil

Entra en `https://mateogsilvaa.github.io/prolife/`, dale a **Entrar con Google**, elige tu
carpeta y ya está.

**Instálala como app**: en Chrome, menú → *Añadir a la pantalla de inicio*; en iPhone,
Compartir → *Añadir a pantalla de inicio*. Queda con su icono, a pantalla completa y sin la
barra del navegador.

---

## Cómo se actualiza

Sola. Cada vez que algo llega a `main`, GitHub la recompila y la publica. No hay que
instalar nada ni acordarse de nada.

---

## Si algo falla

| Qué ves | Qué pasa |
|---|---|
| Página en blanco | Falta `VITE_BASE`. Mira la pestaña *Actions* → *Web en GitHub Pages*: el paso de compilar tiene que llevarla puesta. |
| «A esta versión web le falta el identificador de cliente» | El paso 4 no ha llegado a la página. Comprueba que hiciste `git push` y que la publicación terminó en verde. |
| Al entrar: *origin_mismatch* o «Acceso bloqueado» | El origen del paso 3 no coincide. Tiene que ser exactamente `https://mateogsilvaa.github.io`, sin ruta ni barra final. |
| Entra pero no encuentra carpetas | Busca la tuya por el nombre en esa misma pantalla, como en la tablet. Y comprueba que has entrado con la cuenta que sincroniza el ordenador. |
| Pide entrar cada vez | Normal si tienes las cookies de terceros bloqueadas: sin sesión de Google en el navegador no se puede renovar el acceso en silencio. |
| Lo que apunto no aparece en el ordenador | Es lo esperado hasta que abras la app allí: va al buzón, como en la tablet. |

---

## Por qué no reemplaza al ordenador

La carpeta de verdad está en tu disco y el `db.json` lo escribe el ordenador y nadie más.
La web, como la tablet, deja los cambios en el buzón de Drive y el ordenador los recoge. Es
lo que hace que dos aparatos no puedan pisarse el trabajo — y la razón de que esto sea
cómodo en vez de peligroso.
