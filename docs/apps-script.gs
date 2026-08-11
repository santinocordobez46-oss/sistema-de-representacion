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
const SHEET_ALUMNOS_CONFIG = "ConfigAlumnos";
const SHEET_COMISIONES_ALUMNOS = "ComisionesAlumnos";

function normNum_(v) {
  const s = String(v == null ? "" : v).trim();
  return s.replace(/^0+(?=\d)/, "");
}

function normText_(v) {
  return String(v == null ? "" : v).trim().toLowerCase();
}

function getRespuestasSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_RESPUESTAS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_RESPUESTAS);
    sheet.appendRow([
      "FormID", "Formulario", "Comisión", "N° Alumno", "Nombre",
      "Puntaje", "Puntaje Máximo", "Fecha/Hora", "Cambios de pantalla detectados",
      "Detalle (pregunta -> respuesta -> correcta)", "Carrera", "Mail", "Campos extra (JSON)",
      "Nota (1-10)", "Color manual (vacío=automático, verde, rojo)"
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
  if (action === "lookupstudent") return jsonOut_(lookupStudent_(e.parameter.numeroAlumno, e.parameter.nombre, e.parameter.mail));
  if (action === "listalumnos") return jsonOut_(listAlumnos_());
  if (action === "getalumnosconfig") return jsonOut_({ ok: true, config: getAlumnosConfig_() });
  return jsonOut_({ ok: false, error: "Acción no reconocida" });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === "submit") return jsonOut_(submitResponse_(data));
    if (data.action === "saveform") return jsonOut_(saveForm_(data.form));
    if (data.action === "deleteform") return jsonOut_(deleteForm_(data.formId));
    if (data.action === "deleteformresponses") return jsonOut_(deleteAllResponsesForForm_(data.formId));
    if (data.action === "deleteresponse") return jsonOut_(deleteResponse_(data.formId, data.numeroAlumno));
    if (data.action === "deletestudent") return jsonOut_(deleteStudent_(data.numeroAlumno));
    if (data.action === "updateresponse") return jsonOut_(updateResponseStudent_(data.formId, data.numeroAlumnoOriginal, data.numeroAlumnoNuevo, data.nombreNuevo));
    if (data.action === "setresponsecolor") return jsonOut_(setResponseColor_(data.formId, data.numeroAlumno, data.color));
    if (data.action === "updatestudentinfo") return jsonOut_(updateStudentInfo_(data.numeroAlumnoOriginal, data.numeroAlumnoNuevo, data.nombreNuevo, data.mailNuevo));
    if (data.action === "setalumnosconfig") return jsonOut_(setAlumnosConfig_(data.sheetId, data.tabName));
    if (data.action === "setcomisionalumno") return jsonOut_(setComisionAlumno_(data.numeroAlumno, data.comision));
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

function deleteAllResponsesForForm_(formId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, error: "El sistema está ocupado en este momento, volvé a intentar en unos segundos." };
  }
  try {
    const sheet = getRespuestasSheet_();
    const rows = sheet.getDataRange().getValues();
    let deleted = 0;
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0]) === String(formId)) {
        sheet.deleteRow(i + 1);
        deleted++;
      }
    }
    return { ok: true, deleted };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- Respuestas ---------------- */

function checkSubmitted_(formId, numeroAlumno) {
  const sheet = getRespuestasSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(formId) &&
        normNum_(rows[i][3]) === normNum_(numeroAlumno)) {
      return { ok: true, submitted: true };
    }
  }
  return { ok: true, submitted: false };
}

function lookupStudent_(numeroAlumno, nombre, mail) {
  let campo = null;
  if (numeroAlumno) campo = "numero";
  else if (nombre) campo = "nombre";
  else if (mail) campo = "mail";
  if (!campo) return { ok: true, found: false, searchedBy: null };

  const sheet = getRespuestasSheet_();
  const rows = sheet.getDataRange().getValues();
  const numNorm = campo === "numero" ? normNum_(numeroAlumno) : null;
  const nombreNorm = campo === "nombre" ? normText_(nombre) : null;
  const mailNorm = campo === "mail" ? normText_(mail) : null;

  for (let i = rows.length - 1; i >= 1; i--) {
    const matches =
      (campo === "numero" && normNum_(rows[i][3]) === numNorm) ||
      (campo === "nombre" && normText_(rows[i][4]) === nombreNorm) ||
      (campo === "mail" && normText_(rows[i][11]) === mailNorm);
    if (matches) {
      return {
        ok: true, found: true, searchedBy: campo,
        numeroAlumno: rows[i][3] || "", nombre: rows[i][4] || "",
        carrera: rows[i][10] || "", mail: rows[i][11] || "",
      };
    }
  }
  return { ok: true, found: false, searchedBy: campo };
}

function updateResponseStudent_(formId, numeroAlumnoOriginal, numeroAlumnoNuevo, nombreNuevo) {
  if (!numeroAlumnoNuevo) return { ok: false, error: "El N° de alumno no puede quedar vacío." };
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, error: "El sistema está ocupado en este momento, volvé a intentar en unos segundos." };
  }
  try {
    const sheet = getRespuestasSheet_();
    const rows = sheet.getDataRange().getValues();
    let targetRow = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(formId) &&
          normNum_(rows[i][3]) === normNum_(numeroAlumnoOriginal)) {
        targetRow = i;
        break;
      }
    }
    if (targetRow === -1) return { ok: false, error: "No se encontró esa respuesta (puede que ya se haya actualizado)." };

    if (String(numeroAlumnoNuevo).trim() !== String(numeroAlumnoOriginal).trim()) {
      for (let i = 1; i < rows.length; i++) {
        if (i !== targetRow && String(rows[i][0]) === String(formId) &&
            normNum_(rows[i][3]) === normNum_(numeroAlumnoNuevo)) {
          return { ok: false, error: `Ya existe otra respuesta con el N° ${numeroAlumnoNuevo} en este mismo parcialito. Borrá esa antes, o elegí otro número.` };
        }
      }
    }

    sheet.getRange(targetRow + 1, 4).setValue(numeroAlumnoNuevo);
    if (nombreNuevo) sheet.getRange(targetRow + 1, 5).setValue(nombreNuevo);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function setResponseColor_(formId, numeroAlumno, color) {
  if (["", "verde", "rojo"].indexOf(color) === -1) {
    return { ok: false, error: 'El color tiene que ser "verde", "rojo" o vacío (automático).' };
  }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, error: "El sistema está ocupado en este momento, volvé a intentar en unos segundos." };
  }
  try {
    const sheet = getRespuestasSheet_();
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(formId) && normNum_(rows[i][3]) === normNum_(numeroAlumno)) {
        sheet.getRange(i + 1, 15).setValue(color);
        return { ok: true };
      }
    }
    return { ok: false, error: "No se encontró esa respuesta (puede que ya se haya borrado)." };
  } finally {
    lock.releaseLock();
  }
}

function updateStudentInfo_(numeroAlumnoOriginal, numeroAlumnoNuevo, nombreNuevo, mailNuevo) {
  if (!numeroAlumnoNuevo) return { ok: false, error: "El N° de alumno no puede quedar vacío." };
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, error: "El sistema está ocupado en este momento, volvé a intentar en unos segundos." };
  }
  try {
    const sheet = getRespuestasSheet_();
    const rows = sheet.getDataRange().getValues();
    const targetRows = [];
    for (let i = 1; i < rows.length; i++) {
      if (normNum_(rows[i][3]) === normNum_(numeroAlumnoOriginal)) targetRows.push(i);
    }
    if (targetRows.length === 0) return { ok: false, error: "No se encontró ningún alumno con ese N°." };

    const numeroCambia = normNum_(numeroAlumnoNuevo) !== normNum_(numeroAlumnoOriginal);
    if (numeroCambia) {
      const formIdsDeEste = new Set(targetRows.map((i) => String(rows[i][0])));
      for (let i = 1; i < rows.length; i++) {
        if (targetRows.indexOf(i) !== -1) continue;
        if (formIdsDeEste.has(String(rows[i][0])) && normNum_(rows[i][3]) === normNum_(numeroAlumnoNuevo)) {
          return { ok: false, error: `Ya existe otro alumno con el N° ${numeroAlumnoNuevo} en "${rows[i][1]}". Borrá esa respuesta antes, o elegí otro número.` };
        }
      }
    }

    targetRows.forEach((i) => {
      sheet.getRange(i + 1, 4).setValue(numeroAlumnoNuevo);
      if (nombreNuevo) sheet.getRange(i + 1, 5).setValue(nombreNuevo);
      if (mailNuevo) sheet.getRange(i + 1, 12).setValue(mailNuevo);
    });
    return { ok: true, updated: targetRows.length };
  } finally {
    lock.releaseLock();
  }
}

function getScheduleFor_(form, comision) {
  const perComision = comision && form.comisionSchedules ? form.comisionSchedules[comision] : null;
  if (perComision && (perComision.openAt || perComision.closeAt)) return perComision;
  if (form.scheduledOpenAt || form.scheduledCloseAt) {
    return { openAt: form.scheduledOpenAt, closeAt: form.scheduledCloseAt };
  }
  return null;
}
function computeEffectiveExamStatus_(form, comision) {
  const now = new Date();
  const sched = getScheduleFor_(form, comision);
  if (sched) {
    const open = sched.openAt ? new Date(sched.openAt) : null;
    const close = sched.closeAt ? new Date(sched.closeAt) : null;
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
  if (computeEffectiveExamStatus_(formCheck.form, data.comision) !== "abierto") {
    return { ok: false, error: "El profesor todavía no inició el parcial, o ya lo finalizó. No se guardó la respuesta." };
  }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, error: "El sistema está ocupado guardando otra respuesta en este momento. Esperá unos segundos y volvé a tocar Enviar." };
  }
  try {
    const already = checkSubmitted_(data.formId, data.numeroAlumno);
    if (already.submitted) {
      return { ok: false, error: "Este número de alumno ya tiene una respuesta registrada para este parcialito (en cualquier comisión)." };
    }
    const sheet = getRespuestasSheet_();
    sheet.appendRow([
      data.formId, data.formTitle, data.comision, data.numeroAlumno, data.nombre,
      data.score, data.totalPoints, new Date(), data.tabSwitches || 0, JSON.stringify(data.detail || []),
      data.carrera || "", data.mail || "", JSON.stringify(data.extra || {}), data.nota != null ? data.nota : "",
    ]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function deleteResponse_(formId, numeroAlumno) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, error: "El sistema está ocupado en este momento, volvé a intentar en unos segundos." };
  }
  try {
    const sheet = getRespuestasSheet_();
    const rows = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0]) === String(formId) &&
          normNum_(rows[i][3]) === normNum_(numeroAlumno)) {
        sheet.deleteRow(i + 1);
      }
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function deleteStudent_(numeroAlumno) {
  if (!numeroAlumno) return { ok: false, error: "Falta el N° de alumno." };
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, error: "El sistema está ocupado en este momento, volvé a intentar en unos segundos." };
  }
  try {
    const sheet = getRespuestasSheet_();
    const rows = sheet.getDataRange().getValues();
    let deleted = 0;
    for (let i = rows.length - 1; i >= 1; i--) {
      if (normNum_(rows[i][3]) === normNum_(numeroAlumno)) {
        sheet.deleteRow(i + 1);
        deleted++;
      }
    }
    if (deleted === 0) return { ok: false, error: "No se encontró ninguna respuesta con ese N° de alumno." };
    return { ok: true, deleted };
  } finally {
    lock.releaseLock();
  }
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
      nota: (r[13] !== undefined && r[13] !== "" && r[13] !== null) ? r[13] : null,
      colorManual: r[14] || "",
    });
  }
  sortByNumero_(out);
  return { ok: true, rows: out };
}

function getNotas_(comision) {
  const sheet = getRespuestasSheet_();
  const rows = sheet.getDataRange().getValues();
  const forms = listForms_().forms.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const order = {};
  forms.forEach((f, idx) => { order[f.id] = { title: f.title, idx }; });

  const students = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const com = String(r[2]).trim();
    if (comision && com !== String(comision).trim()) continue;
    const key = String(r[3]).trim();
    if (!students[key]) {
      students[key] = { numeroAlumno: r[3], nombre: r[4], comision: com, carrera: r[10] || "", mail: r[11] || "", parciales: {} };
    } else {
      students[key].nombre = r[4] || students[key].nombre;
      students[key].comision = com || students[key].comision;
      students[key].carrera = r[10] || students[key].carrera;
      students[key].mail = r[11] || students[key].mail;
    }
    students[key].parciales[r[0]] = {
      formTitle: r[1], score: r[5], totalPoints: r[6], tabSwitches: r[8] || 0,
      nota: (r[13] !== undefined && r[13] !== "" && r[13] !== null) ? r[13] : null,
      colorManual: r[14] || "",
    };
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

/* ================================================================
   ALUMNOS — buscador de N° de alumno, sincronizado EN VIVO con la
   planilla de respuestas del formulario de inscripción del profe
   (un Google Form aparte, no esta planilla).
   ================================================================

   No se copian ni guardan datos de esa otra planilla acá: cada vez
   que alguien pide la lista, este backend la abre y la lee en ese
   mismo momento. Si el profe corrige un N° de alumno directamente
   en las respuestas del formulario de inscripción, en la próxima
   consulta ya aparece corregido — no hace falta ningún paso manual.

   Lo único que SÍ vive en esta planilla (porque el formulario de
   inscripción no lo pregunta) es la Comisión de cada alumno: se
   guarda en la pestaña "ComisionesAlumnos" y se combina con los
   datos en vivo al armar la respuesta. */

function getAlumnosConfigSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_ALUMNOS_CONFIG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_ALUMNOS_CONFIG);
    sheet.appendRow(["Clave", "Valor"]);
    sheet.appendRow(["sheetId", ""]);
    sheet.appendRow(["tabName", ""]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getAlumnosConfig_() {
  const sheet = getAlumnosConfigSheet_();
  const rows = sheet.getDataRange().getValues();
  const config = { sheetId: "", tabName: "" };
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === "sheetId") config.sheetId = rows[i][1] || "";
    if (rows[i][0] === "tabName") config.tabName = rows[i][1] || "";
  }
  return config;
}

function extraerSheetId_(input) {
  const s = String(input || "").trim();
  const m = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : s;
}

function setAlumnosConfig_(sheetId, tabName) {
  if (!sheetId) return { ok: false, error: "Falta el ID de la planilla." };
  sheetId = extraerSheetId_(sheetId);
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { ok: false, error: "Ocupado, probá de nuevo en unos segundos." }; }
  try {
    // Prueba que se puede abrir antes de guardar, para no guardar un ID roto.
    try {
      const testSs = SpreadsheetApp.openById(sheetId);
      if (tabName && !testSs.getSheetByName(tabName)) {
        return { ok: false, error: 'Se pudo abrir la planilla, pero no existe una pestaña llamada "' + tabName + '".' };
      }
    } catch (e) {
      return { ok: false, error: "No se pudo abrir esa planilla. Revisá el ID y que esté compartida con la misma cuenta de Google que ejecuta este Apps Script (mínimo como lector)." };
    }
    const sheet = getAlumnosConfigSheet_();
    const rows = sheet.getDataRange().getValues();
    let foundSheetId = false, foundTabName = false;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === "sheetId") { sheet.getRange(i + 1, 2).setValue(sheetId); foundSheetId = true; }
      if (rows[i][0] === "tabName") { sheet.getRange(i + 1, 2).setValue(tabName || ""); foundTabName = true; }
    }
    if (!foundSheetId) sheet.appendRow(["sheetId", sheetId]);
    if (!foundTabName) sheet.appendRow(["tabName", tabName || ""]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function getComisionesAlumnosSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_COMISIONES_ALUMNOS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_COMISIONES_ALUMNOS);
    sheet.appendRow(["N° Alumno", "Comisión"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getComisionesMap_() {
  const sheet = getComisionesAlumnosSheet_();
  const rows = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    const nro = normNum_(rows[i][0]);
    if (nro) map[nro] = rows[i][1] || "";
  }
  return map;
}

/* Comisión real, tomada de las respuestas ya enviadas por los alumnos al
   rendir un parcialito (columna "Comisión" de la hoja "Respuestas") — el
   alumno la elige él mismo al empezar, así que es más confiable que una
   asignación manual. Si un alumno rindió más de un parcialito y en algún
   momento cambió de comisión, se queda con la ÚLTIMA que usó (recorre
   de abajo hacia arriba y para en la primera que encuentra). */
function getComisionesDesdeRespuestas_() {
  const sheet = getRespuestasSheet_();
  const rows = sheet.getDataRange().getValues();
  const map = {};
  for (let i = rows.length - 1; i >= 1; i--) {
    const nro = normNum_(rows[i][3]);
    const comision = String(rows[i][2] || "").trim();
    if (nro && comision && !map[nro]) map[nro] = comision;
  }
  return map;
}

function setComisionAlumno_(numeroAlumno, comision) {
  if (!numeroAlumno) return { ok: false, error: "Falta el N° de alumno." };
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { ok: false, error: "Ocupado, probá de nuevo en unos segundos." }; }
  try {
    const sheet = getComisionesAlumnosSheet_();
    const rows = sheet.getDataRange().getValues();
    const numNorm = normNum_(numeroAlumno);
    for (let i = 1; i < rows.length; i++) {
      if (normNum_(rows[i][0]) === numNorm) {
        sheet.getRange(i + 1, 2).setValue(comision || "");
        return { ok: true };
      }
    }
    sheet.appendRow([numeroAlumno, comision || ""]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* Busca en la primera fila (encabezados) de la planilla externa a qué
   columna corresponde cada dato, por palabras clave — así no depende de
   que la columna esté siempre en la misma letra, solo de que el título
   de la pregunta en el Google Form la mencione. */
function detectarColumnasAlumnos_(headerRow) {
  const header = headerRow.map((h) => normText_(h));
  const find = (mustInclude, mustExclude) => {
    for (let i = 0; i < header.length; i++) {
      const h = header[i];
      const okInclude = mustInclude.every((w) => h.indexOf(w) !== -1);
      const okExclude = !mustExclude || mustExclude.every((w) => h.indexOf(w) === -1);
      if (okInclude && okExclude) return i;
    }
    return -1;
  };
  return {
    numero: find(["alumno"], ["carrera"]),
    apellido: find(["apellido"]),
    nombres: find(["nombre"], ["apellido"]),
    condicion: find(["estado"]),
    carrera: find(["carrera"]),
  };
}

function listAlumnos_() {
  const config = getAlumnosConfig_();
  if (!config.sheetId) {
    return { ok: false, needsConfig: true, error: "Todavía no está configurada la planilla de inscripción." };
  }
  let ss;
  try {
    ss = SpreadsheetApp.openById(config.sheetId);
  } catch (e) {
    return { ok: false, needsConfig: true, error: "No se pudo abrir la planilla configurada. Revisá el ID y que esté compartida con la cuenta que ejecuta el Apps Script." };
  }
  const sheet = config.tabName ? ss.getSheetByName(config.tabName) : ss.getSheets()[0];
  if (!sheet) {
    return { ok: false, needsConfig: true, error: 'No se encontró la pestaña "' + config.tabName + '" en esa planilla.' };
  }
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return { ok: true, alumnos: [] };

  const idx = detectarColumnasAlumnos_(rows[0]);
  if (idx.apellido === -1 && idx.nombres === -1) {
    return { ok: false, needsConfig: true, error: "No se encontraron columnas de Apellido/Nombres en esa pestaña. Revisá el nombre de la pestaña configurada." };
  }

  const comisionesManual = getComisionesMap_();
  const comisionesReales = getComisionesDesdeRespuestas_();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const numero = idx.numero !== -1 ? String(row[idx.numero] || "").trim() : "";
    const apellido = idx.apellido !== -1 ? String(row[idx.apellido] || "").trim() : "";
    const nombres = idx.nombres !== -1 ? String(row[idx.nombres] || "").trim() : "";
    const condicion = idx.condicion !== -1 ? String(row[idx.condicion] || "").trim() : "";
    const carrera = idx.carrera !== -1 ? String(row[idx.carrera] || "").trim() : "";
    if (!apellido && !nombres) continue;
    const numeroFinal = numero || "000";
    const numNorm = normNum_(numeroFinal);
    // Prioridad: la comisión con la que el alumno ya rindió un parcialito
    // (la eligió él mismo, es un dato real) manda sobre la asignación manual.
    // Si todavía no rindió nada, se usa la manual (si el profe cargó una).
    const comisionReal = comisionesReales[numNorm];
    out.push({
      numeroAlumno: numeroFinal,
      apellido, nombres, condicion, carrera,
      comision: comisionReal || comisionesManual[numNorm] || "",
      comisionOrigen: comisionReal ? "parcialito" : (comisionesManual[numNorm] ? "manual" : ""),
    });
  }
  return { ok: true, alumnos: out };
}
