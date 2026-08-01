/**
 * PARCIALITO — backend en Google Apps Script (v2).
 *
 * Ahora esta única planilla guarda DOS cosas:
 *  - "Formularios": cada parcialito que crea el profesor (para que el panel
 *    web no dependa del navegador/computadora — se ve igual desde cualquier lado).
 *  - "Respuestas": cada respuesta enviada por los alumnos.
 *
 * Con esto también se arma el LIBRO DE NOTAS ACUMULADO: como cada respuesta
 * ya trae el N° de alumno, nombre y comisión, se puede armar una tabla de
 * "cómo le fue a cada alumno en cada parcialito" sin trabajo extra.
 *
 * INSTALACIÓN (una sola vez):
 *  1) Creá una Google Sheet nueva (ej: "Parcialitos - Datos").
 *  2) Extensiones → Apps Script → borrá el contenido de ejemplo → pegá TODO este archivo.
 *  3) Implementar → Nueva implementación → tipo "Aplicación web" → ejecutar
 *     como "Yo" → acceso "Cualquier usuario".
 *  4) Autorizá los permisos (son de tu propia cuenta).
 *  5) Copiá la URL que termina en /exec.
 *  6) Pegá esa URL UNA sola vez en la página principal del sitio (te la va a
 *     pedir la primera vez que entrás). A partir de ahí todo el sitio ya
 *     sabe dónde guardar y buscar los datos.
 *
 * Si editás este código más adelante, tenés que volver a "Implementar" (nueva
 * versión) para que se reflejen los cambios en la URL /exec.
 */

const SHEET_RESPUESTAS = "Respuestas";
const SHEET_FORMULARIOS = "Formularios";

function getRespuestasSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_RESPUESTAS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_RESPUESTAS);
    sheet.appendRow([
      "FormID", "Formulario", "Comisión", "N° Alumno", "Nombre",
      "Puntaje", "Puntaje Máximo", "Fecha/Hora", "Cambios de pantalla detectados",
      "Detalle (pregunta -> respuesta -> correcta)"
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getFormulariosSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_FORMULARIOS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_FORMULARIOS);
    sheet.appendRow(["FormID", "JSON", "CreatedAt", "UpdatedAt"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doGet(e) {
  const action = e.parameter.action;
  if (action === "check") return jsonOut_(checkSubmitted_(e.parameter.formId, e.parameter.numeroAlumno, e.parameter.comision));
  if (action === "results") return jsonOut_(getResults_(e.parameter.formId, e.parameter.comision));
  if (action === "notas") return jsonOut_(getNotas_(e.parameter.comision));
  if (action === "listforms") return jsonOut_(listForms_());
  if (action === "getform") return jsonOut_(getFormById_(e.parameter.formId));
  return jsonOut_({ ok: false, error: "Acción no reconocida" });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === "submit") return jsonOut_(submitResponse_(data));
    if (data.action === "saveform") return jsonOut_(saveForm_(data.form));
    if (data.action === "deleteform") return jsonOut_(deleteForm_(data.formId));
    return jsonOut_({ ok: false, error: "Acción no reconocida" });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

/* ---------------- Formularios ---------------- */

function listForms_() {
  const sheet = getFormulariosSheet_();
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    try {
      const form = JSON.parse(rows[i][1]);
      out.push(form);
    } catch (e) { /* fila corrupta, se ignora */ }
  }
  out.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  return { ok: true, forms: out };
}

function getFormById_(formId) {
  const sheet = getFormulariosSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(formId)) {
      return { ok: true, form: JSON.parse(rows[i][1]) };
    }
  }
  return { ok: false, error: "Formulario no encontrado" };
}

function saveForm_(form) {
  if (!form || !form.id) return { ok: false, error: "Formulario inválido" };
  const sheet = getFormulariosSheet_();
  const rows = sheet.getDataRange().getValues();
  const now = new Date().toISOString();
  form.updatedAt = now;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(form.id)) {
      sheet.getRange(i + 1, 2).setValue(JSON.stringify(form));
      sheet.getRange(i + 1, 4).setValue(now);
      return { ok: true };
    }
  }
  form.createdAt = form.createdAt || now;
  sheet.appendRow([form.id, JSON.stringify(form), form.createdAt, now]);
  return { ok: true };
}

function deleteForm_(formId) {
  const sheet = getFormulariosSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(formId)) { sheet.deleteRow(i + 1); break; }
  }
  return { ok: true };
}

/* ---------------- Respuestas ---------------- */

function checkSubmitted_(formId, numeroAlumno, comision) {
  const sheet = getRespuestasSheet_();
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
  const formCheck = getFormById_(data.formId);
  if (!formCheck.ok) {
    return { ok: false, error: "No se encontró el parcialito." };
  }
  if (formCheck.form.examStatus !== "abierto") {
    return { ok: false, error: "El profesor todavía no inició el parcial, o ya lo finalizó. No se guardó la respuesta." };
  }
  const already = checkSubmitted_(data.formId, data.numeroAlumno, data.comision);
  if (already.submitted) {
    return { ok: false, error: "Este número de alumno ya tiene una respuesta registrada para este parcialito en esta comisión." };
  }
  const sheet = getRespuestasSheet_();
  sheet.appendRow([
    data.formId, data.formTitle, data.comision, data.numeroAlumno, data.nombre,
    data.score, data.totalPoints, new Date(), data.tabSwitches || 0, JSON.stringify(data.detail || []),
  ]);
  return { ok: true };
}

function getResults_(formId, comision) {
  const sheet = getRespuestasSheet_();
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[0]) !== String(formId)) continue;
    if (comision && String(r[2]).trim() !== String(comision).trim()) continue;
    out.push({
      comision: r[2], numeroAlumno: r[3], nombre: r[4],
      score: r[5], totalPoints: r[6], fecha: r[7], tabSwitches: r[8], detail: safeParse_(r[9]),
    });
  }
  sortByNumero_(out);
  return { ok: true, rows: out };
}

/* libro de notas: TODOS los parcialitos, pivotado por alumno */
function getNotas_(comision) {
  const sheet = getRespuestasSheet_();
  const rows = sheet.getDataRange().getValues();
  const forms = listForms_().forms.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); // cronológico: Parcial 0, 1, 2...
  const order = {};
  forms.forEach((f, idx) => { order[f.id] = { title: f.title, idx }; });

  const students = {}; // key = numeroAlumno + "|" + comision
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const com = String(r[2]).trim();
    if (comision && com !== String(comision).trim()) continue;
    const key = String(r[3]).trim() + "|" + com;
    if (!students[key]) {
      students[key] = { numeroAlumno: r[3], nombre: r[4], comision: com, parciales: {} };
    }
    students[key].parciales[r[0]] = { formTitle: r[1], score: r[5], totalPoints: r[6] };
  }

  const list = Object.values(students);
  sortByNumero_(list);
  return { ok: true, students: list, forms: forms.map((f) => ({ id: f.id, title: f.title })) };
}

function sortByNumero_(arr) {
  arr.sort((a, b) => {
    const na = parseInt(a.numeroAlumno, 10), nb = parseInt(b.numeroAlumno, 10);
    if (isNaN(na) || isNaN(nb)) return String(a.numeroAlumno).localeCompare(String(b.numeroAlumno));
    return na - nb;
  });
}

function safeParse_(s) { try { return JSON.parse(s); } catch (e) { return []; } }
function jsonOut_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
