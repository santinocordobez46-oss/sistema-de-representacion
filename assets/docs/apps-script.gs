/**
 * PARCIALITO — backend en Google Apps Script.
 *
 * QUÉ HACE:
 *  - Guarda cada respuesta enviada desde take.html como una fila en esta planilla.
 *  - Antes de guardar, revisa si ese alumno (N° de alumno + comisión) ya respondió
 *    ESE mismo formulario, y si es así, la rechaza (evita que se lo copien / repitan).
 *  - Expone un endpoint para que la página de "Resultados" traiga las respuestas
 *    de un formulario (opcionalmente filtradas por comisión), ya ordenadas por
 *    N° de alumno.
 *
 * CÓMO INSTALARLO (una sola vez, lo hace el profesor):
 *  1) Creá una Google Sheet nueva y llamala, por ejemplo, "Parcialitos - Respuestas".
 *  2) Extensiones → Apps Script.
 *  3) Borrá lo que haya en el editor y pegá TODO este archivo.
 *  4) Arriba a la derecha, "Implementar" → "Nueva implementación".
 *  5) Tipo: "Aplicación web". Ejecutar como: "Yo". Quién tiene acceso: "Cualquier usuario".
 *  6) Autorizá los permisos que pida (es tu propia cuenta de Google).
 *  7) Copiá la URL que te da (termina en /exec). Esa es la URL que pegás en el
 *     constructor, en la pestaña "Publicar", campo "URL de Google Sheets (Apps Script)".
 *  8) Si más adelante editás este código, tenés que hacer "Nueva implementación" de nuevo
 *     (o "Administrar implementaciones" → editar → nueva versión) para que los cambios
 *     se reflejen en la URL /exec.
 */

const SHEET_NAME = "Respuestas";

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      "FormID", "Formulario", "Comisión", "N° Alumno", "Nombre",
      "Puntaje", "Puntaje Máximo", "Fecha/Hora", "Cambios de pantalla detectados",
      "Detalle (pregunta -> respuesta -> correcta)"
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doGet(e) {
  const action = e.parameter.action;
  if (action === "check") {
    return jsonOut_(checkSubmitted_(e.parameter.formId, e.parameter.numeroAlumno, e.parameter.comision));
  }
  if (action === "results") {
    return jsonOut_(getResults_(e.parameter.formId, e.parameter.comision));
  }
  return jsonOut_({ ok: false, error: "Acción no reconocida" });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === "submit") return jsonOut_(submitResponse_(data));
    return jsonOut_({ ok: false, error: "Acción no reconocida" });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function checkSubmitted_(formId, numeroAlumno, comision) {
  const sheet = getSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(formId) &&
        String(rows[i][3]).trim() === String(numeroAlumno).trim() &&
        String(rows[i][2]).trim() === String(comision).trim()) {
      return { ok: true, submitted: true };
    }
  }
  return { ok: true, submitted: false };
}

function submitResponse_(data) {
  const already = checkSubmitted_(data.formId, data.numeroAlumno, data.comision);
  if (already.submitted) {
    return { ok: false, error: "Este número de alumno ya tiene una respuesta registrada para este parcialito en esta comisión." };
  }
  const sheet = getSheet_();
  sheet.appendRow([
    data.formId,
    data.formTitle,
    data.comision,
    data.numeroAlumno,
    data.nombre,
    data.score,
    data.totalPoints,
    new Date(),
    data.tabSwitches || 0,
    JSON.stringify(data.detail || []),
  ]);
  return { ok: true };
}

function getResults_(formId, comision) {
  const sheet = getSheet_();
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[0]) !== String(formId)) continue;
    if (comision && String(r[2]).trim() !== String(comision).trim()) continue;
    out.push({
      comision: r[2], numeroAlumno: r[3], nombre: r[4],
      score: r[5], totalPoints: r[6], fecha: r[7],
      tabSwitches: r[8], detail: safeParse_(r[9]),
    });
  }
  out.sort((a, b) => {
    const na = parseInt(a.numeroAlumno, 10), nb = parseInt(b.numeroAlumno, 10);
    if (isNaN(na) || isNaN(nb)) return String(a.numeroAlumno).localeCompare(String(b.numeroAlumno));
    return na - nb;
  });
  return { ok: true, rows: out };
}

function safeParse_(s) {
  try { return JSON.parse(s); } catch (e) { return []; }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
