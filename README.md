# Parcialito — sistema de cuestionarios de cátedra

Constructor de parcialitos estilo Google Forms / Microsoft Forms, con QR para
proyectar en el aula, bloqueo de reingreso, temporizador, y resultados
centralizados en una planilla de Google Sheets (que se descarga como Excel
cuando quieras). Todo corre gratis en **GitHub Pages**, sin servidores que
mantener.

## Estructura del sistema

| Página | Para qué es |
|---|---|
| `index.html` | Panel principal: lista todos tus parcialitos, crear/editar/duplicar/borrar |
| `editor.html` | Armar un parcialito: título, comisiones, tiempo, preguntas y puntaje |
| `take.html` | La pantalla que ve el alumno al escanear el QR |
| `resultados.html` | Ver y exportar a Excel las respuestas de un parcialito, filtradas por comisión |
| `docs/apps-script.gs` | Código para conectar una Google Sheet como base de respuestas |

## Paso 1 — Publicar el sitio en GitHub Pages

1. Subí toda esta carpeta a un repositorio de GitHub (podés crear uno nuevo).
2. Settings → Pages → Source → rama `main`, carpeta `/ (root)` → Guardar.
3. GitHub te da una URL tipo `https://tu-usuario.github.io/tu-repo/`. Esa es
   la dirección de tu panel (`index.html`).

## Paso 2 — Conectar Google Sheets (una sola vez, para siempre)

Esto es lo que permite que las respuestas de **todos** los alumnos, desde
**sus propios celulares**, terminen en una única planilla — y lo que hace
posible bloquear que alguien responda dos veces.

1. Creá una Google Sheet nueva (ej: "Parcialitos - Respuestas").
2. **Extensiones → Apps Script**.
3. Borrá el contenido de ejemplo y pegá el código completo de
   `docs/apps-script.gs`.
4. **Implementar → Nueva implementación** → tipo "Aplicación web" → ejecutar
   como "Yo" → acceso "Cualquier usuario".
5. Autorizá los permisos (son de tu propia cuenta).
6. Copiá la URL que termina en `/exec`.
7. En el panel: `editor.html` de tu parcialito → pestaña **"03 · Publicar /
   QR"** → pegala en "URL de Google Apps Script (/exec)".
8. (Opcional) pegá también el link normal de la planilla, para poder abrirla
   directo desde "Resultados".

**Podés usar la misma planilla para todos tus parcialitos** — cada uno se
identifica solo por su propio ID, así que las respuestas de todos quedan
ordenadas juntas y no se mezclan entre sí.

Si más adelante modificás `apps-script.gs`, tenés que volver a implementar
("Administrar implementaciones" → editar → nueva versión) para que se
actualice la URL `/exec`.

## Paso 3 — Armar un parcialito

1. Entrá al panel (`index.html`) → "Nuevo parcialito en blanco" (o cargá el
   ejemplo precargado para ver cómo funciona).
2. Editor: cargá título, subtítulo, las comisiones (ej: "Comisión A",
   "Comisión B", "Comisión C" — **un solo QR después sirve para las tres**,
   porque el alumno la elige al empezar), y el tiempo límite si querés.
3. Agregá secciones y preguntas: opción múltiple, verdadero/falso, respuesta
   corta o desarrollo, numérica — cada una con su puntaje y (si corresponde)
   la respuesta correcta.
4. "02 · Vista previa" para probar la corrección antes de publicar.
5. "03 · Publicar / QR": ahí conectás la planilla (paso 2) y aparece el QR +
   enlace para proyectar en el aula.

## Qué pasa cuando el alumno escanea el QR

1. Carga nombre, N° de alumno y elige su comisión.
2. El sistema chequea contra la planilla si ya respondió — si ya lo hizo, no
   lo deja entrar de nuevo.
3. Ve un temporizador (si lo configuraste) y responde.
4. Al enviar (o si se acaba el tiempo), ve su puntaje al instante y la
   respuesta queda guardada en la planilla, junto con cuántas veces cambió de
   pantalla durante el examen.

## Resultados

Desde el panel → "Resultados" de cada parcialito: tabla ordenada por N° de
alumno, filtrable por comisión o por nombre, con botón para descargar todo en
un `.xlsx` listo para abrir en Excel. Como cada fila ya tiene nombre + N° de
alumno + comisión, esa misma planilla te sirve como lista de asistencia del
día del parcialito.

## Sobre las configuraciones anti-copia — qué sí y qué no

- ✅ **Bloqueo de reingreso**: implementado (por N° de alumno + comisión + parcialito).
- ✅ **Temporizador con envío automático**: implementado.
- ✅ **Un solo QR para varias comisiones**: implementado (la comisión se
  elige dentro del formulario).
- ⚠️ **Evitar capturas de pantalla**: no existe forma de bloquear esto en una
  página web (ninguna plataforma web puede hacerlo, incluyendo Google Forms
  y Microsoft Forms). Lo que sí hicimos como disuasivo:
  - marca de agua con nombre y N° de alumno superpuesta en toda la pantalla
    del examen (si circula una captura, se sabe de quién salió),
  - se registra cuántas veces el alumno cambió de pestaña/app durante el
    examen (columna "Cambios de pantalla" en resultados),
  - clic derecho y selección de texto deshabilitados (frena copiar y pegar
    casual, no una foto con el celular).

## Nota de seguridad

El corrector vive en el navegador del alumno (para poder mostrarle el
puntaje al instante), así que las respuestas correctas viajan dentro del
enlace/QR. Para un parcialito de aula esto es un riesgo bajo, pero un alumno
con conocimientos técnicos podría inspeccionar el código de la página y
encontrarlas. Si en algún momento querés blindarlo del todo, el siguiente
paso sería mover la corrección a un servidor propio (ahí sí conviene sumar
una base de datos en Vercel en vez de Google Sheets).
