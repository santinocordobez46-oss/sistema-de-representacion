# Parcialito — sistema de cuestionarios de cátedra

Constructor de parcialitos estilo Google Forms / Microsoft Forms. Todo lo que
crea el profesor (parcialitos, comisiones, preguntas) y todo lo que responden
los alumnos vive en **una única Google Sheet** — no hay nada que descargar,
importar, ni mover a mano. Se entra a la página, se ve todo, se edita, y
queda guardado. Gratis, corriendo en **GitHub Pages**.

## Estructura del sistema

| Página | Para qué es | Quién la usa |
|---|---|---|
| `index.html` | Panel principal: todos los parcialitos, crear/editar/borrar | Profesor |
| `editor.html` | Armar un parcialito: comisiones, tiempo, preguntas, puntaje, QR | Profesor |
| `resultados.html` | Respuestas de un parcialito puntual, filtradas por comisión | Profesor |
| `notas.html` | Libro de notas: TODOS los parcialitos, un alumno por fila | Profesor |
| `take.html` | Pantalla para rendir el parcialito | Alumno (solo llega acá, vía QR) |
| `docs/apps-script.gs` | Backend: conecta todo a tu Google Sheet | Se instala una vez |

El alumno **nunca** ve `index.html`, `editor.html`, ni `resultados.html`: el
QR apunta directo a `take.html` y no hay ningún link de vuelta al resto del
sitio.

## Paso 1 — Publicar el sitio en GitHub Pages

1. Subí toda esta carpeta a un repositorio de GitHub.
2. Settings → Pages → Source → rama `main`, carpeta `/ (root)` → Guardar.
3. GitHub te da una URL tipo `https://tu-usuario.github.io/tu-repo/`.

## Paso 2 — Conectar la planilla (una sola vez, para siempre)

1. Creá una Google Sheet nueva (ej: "Parcialitos - Datos").
2. **Extensiones → Apps Script**, borrá el contenido de ejemplo, pegá todo el
   código de `docs/apps-script.gs`.
3. **Implementar → Nueva implementación** → tipo "Aplicación web" → ejecutar
   como "Yo" → acceso "Cualquier usuario". Autorizá los permisos.
4. Copiá la URL que termina en `/exec`.
5. Entrá a la URL de tu sitio (paso 1). La primera vez te va a pedir esa URL
   — pegala y listo. Desde ahí, **cualquier computadora** que abra tu sitio y
   pegue esa misma URL va a ver exactamente los mismos parcialitos y
   resultados — porque todo vive en la Sheet, no en el navegador.

Si más adelante modificás `apps-script.gs`, hay que volver a implementar
("Administrar implementaciones" → editar → nueva versión) para que se
actualice la URL `/exec`.

## Paso 3 — Armar un parcialito

1. Panel principal → "Nuevo parcialito en blanco" (se sugiere el nombre
   "Parcial 0", "Parcial 1", etc. según cuántos ya tengas — lo podés cambiar).
2. Editor: título, comisiones (un solo QR va a servir para todas — el alumno
   elige la suya al empezar), tiempo límite si querés.
3. Agregá secciones y preguntas: opción múltiple, verdadero/falso, respuesta
   corta o desarrollo, numérica, con puntaje y respuesta correcta.
4. Los cambios se guardan solos (mirá el indicador "Guardado ✓" arriba a la
   derecha) — no hay botón de guardar que apretar.
5. "03 · Publicar / QR" → ahí está el QR y el enlace, ya funcionando.

## Qué pasa cuando el alumno escanea el QR

Ahora cada comisión tiene **su propio QR** (los ves todos juntos en "03 ·
Publicar / QR" apenas agregás comisiones en el editor) — proyectás el que
corresponda según qué comisión esté rindiendo en ese momento. Como la
comisión ya viene incluida en ese QR puntual, el alumno no tiene que
elegirla: la ve fija en pantalla y solo completa nombre y N° de alumno.

1. El link trae el ID del parcialito y la comisión — `take.html` busca el
   contenido directo en la planilla en ese momento (por eso el QR es
   siempre chico, aunque el parcialito tenga imágenes).
2. Carga nombre y N° de alumno (la comisión ya viene fija).
3. Se chequea si ya respondió — si sí, no lo deja entrar de nuevo.
4. Responde (con temporizador si corresponde). Al enviar, ve su puntaje y
   queda guardado en la planilla.

## Resultados y libro de notas

- **`resultados.html?id=...`**: respuestas de un parcialito puntual, tabla
  ordenada por N° de alumno, filtrable por comisión o nombre, exportable a
  `.xlsx`.
- **`notas.html`**: la vista acumulada — un alumno por fila, una columna por
  cada parcialito ("Parcial 0", "Parcial 1", "Parcial 2"...), con su
  puntaje en cada uno y el total. También filtrable por comisión y
  exportable a Excel. Como cada fila ya tiene nombre + N° de alumno +
  comisión, esta misma tabla sirve como lista de asistencia general del curso.

## Sobre las configuraciones anti-copia — qué sí y qué no

- ✅ **Bloqueo de reingreso** (por N° de alumno + comisión + parcialito).
- ✅ **Temporizador con envío automático**.
- ✅ **QR independiente por comisión** — proyectás el que corresponda, el alumno ya lo ve con su comisión fija.
- ⚠️ **Evitar capturas de pantalla**: no existe forma de bloquear esto en una
  página web (tampoco lo puede hacer Google Forms ni Microsoft Forms). Como
  disuasivo: marca de agua con nombre y N° de alumno superpuesta en toda la
  pantalla del examen, y se registra cuántas veces el alumno cambió de
  pestaña/app durante el examen (columna "Cambios de pantalla" en
  resultados). Clic derecho y selección de texto están deshabilitados
  (frena copiar y pegar casual, no una foto con el celular).

## Nota de seguridad

El corrector vive en el navegador del alumno (para poder mostrarle el
puntaje al instante), así que las respuestas correctas viajan dentro de lo
que `take.html` recibe. Para un parcialito de aula esto es un riesgo bajo,
pero un alumno con conocimientos técnicos podría inspeccionar el código de
la página y encontrarlas. Blindarlo del todo requeriría mover la corrección
a un servidor propio con base de datos (en vez de Google Sheets) — si en
algún momento eso se vuelve prioridad, avisame y lo armamos.
