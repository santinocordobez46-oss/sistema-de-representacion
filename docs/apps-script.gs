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
      "Detalle (pregunta -> respuesta -> correcta)", "Carrera", "Mail", "Campos extra (JSON)"
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
  if (action === "check") return jsonOut_(checkSubmitted_(e.parameter.formId, e.parameter.numeroAlumno));
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
    if (data.action === "deleteresponse") return jsonOut_(deleteResponse_(data.formId, data.numeroAlumno));
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

function checkSubmitted_(formId, numeroAlumno) {
  const sheet = getRespuestasSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(formId) &&
        String(rows[i][3]).trim() === String(numeroAlumno).trim()) {
      return { ok: true, submitted: true };
    }
  }
  return { ok: true, submitted: false };
}

/* Estado efectivo del examen: si hay horario programado, ese manda por sobre
   los botones manuales de Iniciar/Finalizar. Si no hay nada programado, manda
   el estado manual (examStatus). Debe reflejar exactamente la misma lógica
   que computeEffectiveExamStatus() en assets/common.js del frontend. */
function computeEffectiveExamStatus_(form) {
  const now = new Date();
  if (form.scheduledOpenAt || form.scheduledCloseAt) {
    const open = form.scheduledOpenAt ? new Date(form.scheduledOpenAt) : null;
    const close = form.scheduledCloseAt ? new Date(form.scheduledCloseAt) : null;
    if (open && now < open) return "cerrado";
    if (close && now > close) return "cerrado";
    return "abierto";
  }
  return form.examStatus === "abierto" ? "abierto" : "cerrado";
}

function submitResponse_(data) {
  const formCheck = getFormById_(data.formId);
  if (!formCheck.ok) {
    return { ok: false, error: "No se encontró el parcialito." };
  }
  if (computeEffectiveExamStatus_(formCheck.form) !== "abierto") {
    return { ok: false, error: "El profesor todavía no inició el parcial, o ya lo finalizó. No se guardó la respuesta." };
  }
  const already = checkSubmitted_(data.formId, data.numeroAlumno);
  if (already.submitted) {
    return { ok: false, error: "Este número de alumno ya tiene una respuesta registrada para este parcialito (en cualquier comisión)." };
  }
  const sheet = getRespuestasSheet_();
  sheet.appendRow([
    data.formId, data.formTitle, data.comision, data.numeroAlumno, data.nombre,
    data.score, data.totalPoints, new Date(), data.tabSwitches || 0, JSON.stringify(data.detail || []),
    data.carrera || "", data.mail || "", JSON.stringify(data.extra || {}),
  ]);
  return { ok: true };
}

function deleteResponse_(formId, numeroAlumno) {
  const sheet = getRespuestasSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) === String(formId) &&
        String(rows[i][3]).trim() === String(numeroAlumno).trim()) {
      sheet.deleteRow(i + 1);
    }
  }
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
      carrera: r[10] || "", mail: r[11] || "", extra: safeParse_(r[12] || "{}"),
    });
  }
  sortByNumero_(out);
  return { ok: true, rows: out };
}

/* libro de notas: TODOS los parcialitos, pivotado por alumno.
   El identificador es SOLO el N° de Alumno (no depende de la comisión), para
   que la misma persona quede vinculada a través del tiempo aunque haya
   rendido distintos parciales en distintas comisiones. Se muestra la
   comisión/carrera más reciente que declaró. */
function getNotas_(comision) {
  const sheet = getRespuestasSheet_();
  const rows = sheet.getDataRange().getValues();
  const forms = listForms_().forms.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); // cronológico: Parcial 0, 1, 2...
  const order = {};
  forms.forEach((f, idx) => { order[f.id] = { title: f.title, idx }; });

  const students = {}; // key = numeroAlumno (identificador único del sistema)
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const com = String(r[2]).trim();
    if (comision && com !== String(comision).trim()) continue;
    const key = String(r[3]).trim();
    if (!students[key]) {
      students[key] = { numeroAlumno: r[3], nombre: r[4], comision: com, carrera: r[10] || "", parciales: {} };
    } else {
      // se actualiza con lo último declarado, por si cambió de comisión/carrera entre parciales
      students[key].nombre = r[4] || students[key].nombre;
      students[key].comision = com || students[key].comision;
      students[key].carrera = r[10] || students[key].carrera;
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
