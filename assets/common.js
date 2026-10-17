/* ============================================================
   PARCIALITO — funciones compartidas (v2, con backend central)
   ============================================================ */

const GLOBAL_URL_KEY = "parcialito_api_url_v1";

function uid(prefix = "id") { return prefix + "_" + Math.random().toString(36).slice(2, 9); }

function getApiUrl() { return localStorage.getItem(GLOBAL_URL_KEY) || ""; }
function setApiUrl(url) { localStorage.setItem(GLOBAL_URL_KEY, url.trim()); }

/* ---------- llamadas al backend ---------- */
async function fetchJsonWithRetry_(url, options, attempts = 4) {
  const delays = [1200, 2500, 4500, 7000];
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (parseErr) {
        lastError = new Error("El servidor no devolvió una respuesta válida (puede estar saturado).");
      }
    } catch (networkErr) {
      lastError = networkErr;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delays[i] || 7000));
    }
  }
  return { ok: false, error: "El sistema está muy ocupado en este momento. Esperá unos segundos e intentá de nuevo. (" + (lastError ? lastError.message : "sin detalle") + ")" };
}

async function apiGet(action, extraParams = {}) {
  const url = new URL(getApiUrl());
  url.searchParams.set("action", action);
  Object.entries(extraParams).forEach(([k, v]) => url.searchParams.set(k, v));
  return fetchJsonWithRetry_(url.toString());
}
async function apiPost(body) {
  return fetchJsonWithRetry_(getApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
}

async function apiListForms() { return apiGet("listforms"); }
async function apiGetForm(id) { return apiGet("getform", { formId: id }); }
async function apiSaveForm(form) { return apiPost({ action: "saveform", form }); }
async function apiDeleteForm(id) { return apiPost({ action: "deleteform", formId: id }); }
async function apiDeleteAllResponsesForForm(formId) { return apiPost({ action: "deleteformresponses", formId }); }
async function apiCheck(formId, numeroAlumno, comision) { return apiGet("check", { formId, numeroAlumno, comision }); }
async function apiSubmit(payload) { return apiPost({ action: "submit", ...payload }); }
async function apiResults(formId, comision) { return apiGet("results", comision ? { formId, comision } : { formId }); }
async function apiNotas(comision) { return apiGet("notas", comision ? { comision } : {}); }
async function apiDeleteResponse(formId, numeroAlumno, comision) { return apiPost({ action: "deleteresponse", formId, numeroAlumno, comision }); }
async function apiDeleteStudent(numeroAlumno) { return apiPost({ action: "deletestudent", numeroAlumno }); }
async function apiLookupStudent(numeroAlumno) { return apiGet("lookupstudent", { numeroAlumno }); }
async function apiUpdateResponse(formId, numeroAlumnoOriginal, numeroAlumnoNuevo, nombreNuevo) {
  return apiPost({ action: "updateresponse", formId, numeroAlumnoOriginal, numeroAlumnoNuevo, nombreNuevo });
}
async function apiSetResponseColor(formId, numeroAlumno, color) {
  return apiPost({ action: "setresponsecolor", formId, numeroAlumno, color });
}
async function apiUpdateStudentInfo(numeroAlumnoOriginal, numeroAlumnoNuevo, nombreNuevo, mailNuevo) {
  return apiPost({ action: "updatestudentinfo", numeroAlumnoOriginal, numeroAlumnoNuevo, nombreNuevo, mailNuevo });
}

/* ---------- buscador de N° de alumno (roster sincronizado en vivo) ---------- */
async function apiListAlumnos() { return apiGet("listalumnos"); }
async function apiGetAlumnosConfig() { return apiGet("getalumnosconfig"); }
async function apiSetAlumnosConfig(sheetId, tabName) { return apiPost({ action: "setalumnosconfig", sheetId, tabName }); }
async function apiSetComisionAlumno(numeroAlumno, comision) { return apiPost({ action: "setcomisionalumno", numeroAlumno, comision }); }
async function apiListAlumnosPublic(apiUrl) { return apiGetExplicit(apiUrl, "listalumnos"); }

/* ---------- variante para páginas públicas ---------- */
async function apiGetExplicit(apiUrl, action, extraParams = {}) {
  const url = new URL(apiUrl);
  url.searchParams.set("action", action);
  Object.entries(extraParams).forEach(([k, v]) => url.searchParams.set(k, v));
  return fetchJsonWithRetry_(url.toString());
}
async function apiNotasPublic(apiUrl, comision) {
  return apiGetExplicit(apiUrl, "notas", comision ? { comision } : {});
}

/* ---------- normalización para corrección ---------- */
function normalizeText(s) {
  return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normalizeNumber(s) {
  const cleaned = String(s || "").trim().replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

/* ---------- corrección de una pregunta ---------- */
function scoreQuestionAnswer(q, given) {
  if (q.type === "short_text") {
    if (q.matchMode === "keywords" && (q.keywords || []).length) {
      const givenNorm = normalizeText(given);
      const matches = (q.keywords || []).filter((k) => k && givenNorm.includes(normalizeText(k))).length;
      const totalKeywords = (q.keywords || []).length;
      const minRequired = q.minKeywordMatches != null && q.minKeywordMatches !== ""
        ? Math.min(Number(q.minKeywordMatches) || totalKeywords, totalKeywords)
        : totalKeywords;
      const correct = matches >= minRequired;
      return { correct, puntos: correct ? (Number(q.points) || 0) : 0 };
    }
    const correct = (q.acceptedAnswers || []).some((a) => normalizeText(a) === normalizeText(given));
    return { correct, puntos: correct ? (Number(q.points) || 0) : 0 };
  }
  if (q.type === "number") {
    const g = normalizeNumber(given);
    const correct = g !== null && (q.acceptedAnswers || []).some((a) => normalizeNumber(a) === g);
    return { correct, puntos: correct ? (Number(q.points) || 0) : 0 };
  }
  if (q.multiSelect) {
    const givenIds = Array.isArray(given) ? given : [];
    const correctIds = q.correctOptionIds || [];
    const totalPoints = Number(q.points) || 0;
    let pointsMap = q.optionPoints || {};
    if (!pointsMap || Object.keys(pointsMap).length === 0) {
      const n = correctIds.length || 1;
      pointsMap = {};
      correctIds.forEach((id) => { pointsMap[id] = totalPoints / n; });
    }
    let puntos = 0;
    givenIds.forEach((id) => {
      if (correctIds.includes(id) && pointsMap[id] != null) puntos += Number(pointsMap[id]) || 0;
    });
    puntos = Math.max(0, Math.min(puntos, totalPoints));
    puntos = Math.round(puntos * 100) / 100;
    const correct = givenIds.length === correctIds.length && correctIds.every((id) => givenIds.includes(id));
    return { correct, puntos };
  }
  if (q.type === "multiple_choice") {
    const correct = given === q.correctOptionId;
    return { correct, puntos: correct ? (Number(q.points) || 0) : 0 };
  }
  if (q.type === "fill_blank") {
    const blanks = q.blanks || [];
    const givenArr = Array.isArray(given) ? given : [];
    let puntos = 0;
    let allCorrect = blanks.length > 0;
    blanks.forEach((b, i) => {
      const givenVal = givenArr[i] != null ? givenArr[i] : "";
      const esCorrecta = (b.acceptedAnswers || []).some((a) => normalizeText(a) === normalizeText(givenVal));
      if (esCorrecta) puntos += Number(b.points) || 0;
      else allCorrect = false;
    });
    puntos = Math.round(puntos * 100) / 100;
    return { correct: allCorrect, puntos };
  }
  return { correct: false, puntos: 0 };
}

/* ---------- "Duplicar Palabras Claves" — frase con casilleros numerados ---------- */
function parseFillBlankLabel(label) {
  const parts = [];
  const regex = /\{(\d+)\}/g;
  const raw = String(label || "");
  let lastIndex = 0, match;
  while ((match = regex.exec(raw)) !== null) {
    if (match.index > lastIndex) parts.push({ type: "text", value: raw.slice(lastIndex, match.index) });
    parts.push({ type: "blank", n: parseInt(match[1], 10) });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < raw.length) parts.push({ type: "text", value: raw.slice(lastIndex) });
  return parts;
}
function maxBlankNumber(label) {
  const nums = Array.from(String(label || "").matchAll(/\{(\d+)\}/g)).map((m) => parseInt(m[1], 10));
  return nums.length ? Math.max(...nums) : 0;
}
function syncBlanksWithLabel(q) {
  const maxN = maxBlankNumber(q.label);
  q.blanks = q.blanks || [];
  while (q.blanks.length < maxN) q.blanks.push({ id: uid("blank"), acceptedAnswers: [], points: 1 });
  while (q.blanks.length > maxN) q.blanks.pop();
}

/* ---------- ordenamiento compartido: primero por comisión, después por N° de alumno ---------- */
function sortByComisionYNumero(list) {
  return list.slice().sort((a, b) => {
    const ca = String(a.comision || "").trim(), cb = String(b.comision || "").trim();
    if (ca !== cb) return ca.localeCompare(cb, "es");
    const na = parseInt(a.numeroAlumno, 10), nb = parseInt(b.numeroAlumno, 10);
    if (isNaN(na) || isNaN(nb)) return String(a.numeroAlumno).localeCompare(String(b.numeroAlumno));
    return na - nb;
  });
}

/* ---------- estado efectivo del examen: manual + horario programado (opcional) ---------- */
function getScheduleFor(form, comision) {
  const perComision = comision && form.comisionSchedules ? form.comisionSchedules[comision] : null;
  if (perComision && (perComision.openAt || perComision.closeAt)) return perComision;
  if (form.scheduledOpenAt || form.scheduledCloseAt) {
    return { openAt: form.scheduledOpenAt, closeAt: form.scheduledCloseAt };
  }
  return null;
}
function computeEffectiveExamStatus(form, comision) {
  const now = new Date();
  const sched = getScheduleFor(form, comision);
  if (sched) {
    const open = sched.openAt ? new Date(sched.openAt) : null;
    const close = sched.closeAt ? new Date(sched.closeAt) : null;
    if (open && now < open) return "cerrado";
    if (close && now > close) return "cerrado";
    return "abierto";
  }
  return form.examStatus === "abierto" ? "abierto" : "cerrado";
}

function totalPointsOf(form) {
  return form.sections.flatMap((s) => s.questions).reduce((a, q) => a + (Number(q.points) || 0), 0);
}
function questionCountOf(form) {
  return form.sections.flatMap((s) => s.questions).length;
}

/* ---------- imagen de ejemplo (tablero de distancias) ---------- */
function buildSampleTableImage() {
  const cells = [
    ["A", "1 h"], ["B", "1,2 h"], ["C", "1,4 h"],
    ["D", "1,6 h"], ["E", "1,8 h"], ["F", "2 h"],
    ["G", "2,2 h"], ["H", "2,7 h"], ["I", "3 h"],
  ];
  const w = 60, h = 46, cols = 3;
  const svgW = w * cols, svgH = h * 3;
  let rects = "";
  cells.forEach((c, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = col * w, y = row * h;
    rects += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f7e4d3" stroke="#14232b" stroke-width="1.5"/>
      <text x="${x + w / 2}" y="${y + 19}" font-family="Space Grotesk, sans-serif" font-size="15" font-weight="700" fill="#14232b" text-anchor="middle">${c[0]}</text>
      <text x="${x + w / 2}" y="${y + 34}" font-family="IBM Plex Mono, monospace" font-size="10" fill="#445459" text-anchor="middle">${c[1]}</text>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">${rects}</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function defaultIntroConfig() {
  return {
    welcomeMessage: "Antes de empezar, completá tus datos.",
    showApellidoNombre: true,
    showMail: false,
    customFields: [],
  };
}
function makeBlankCustomField(type) {
  const base = { id: uid("f"), type, label: "" };
  if (type === "choice") return { ...base, options: [{ id: uid("o"), text: "" }] };
  return base;
}

function defaultExampleForm() {
  const form = {
    id: uid("form"),
    title: "PARCIALITO LAMINA Nro. 0",
    subtitle: "Rotulado y escritura normalizada",
    carreras: ["I. Biomed.", "I. Elect.", "I. Comp."],
    comisiones: ["Mañana", "Tarde", "Noche"],
    timeLimitMinutes: 15,
    examStatus: "cerrado",
    scheduledOpenAt: null,
    scheduledCloseAt: null,
    introConfig: defaultIntroConfig(),
    createdAt: new Date().toISOString(),
    sections: [
      {
        id: uid("sec"), title: "Pregunta 1 _ Escribir solamente un Número de 2 Dígitos",
        questions: [
          { id: uid("q"), type: "number", points: 1, required: true,
            label: "Mencione UNO DE LOS DOS ángulos de inclinación de las Letras que admite la Norma de aplicación (solamente escribir N° de 2 Dígitos)",
            acceptedAnswers: ["90", "75"] },
          { id: uid("q"), type: "number", points: 1, required: true,
            label: "Mencione EL OTRO ángulo de inclinación de las Letras que admite la Norma de aplicación (solamente escribir los 2 Dígitos)",
            acceptedAnswers: ["90", "75"] },
        ],
      },
      {
        id: uid("sec"), title: "Pregunta 2 _ Escribir una Palabra",
        questions: [
          { id: uid("q"), type: "short_text", points: 2, required: true, caseInsensitive: true,
            label: "En escritura Normalizada, h es la altura de la letra .....? (Escribir respuesta en singular)",
            acceptedAnswers: ["mayuscula", "mayúscula"] },
        ],
      },
      {
        id: uid("sec"), title: "Pregunta 3 _ Escribir Número de dos dígitos, separados por una coma (Parte entera, Decimal)",
        questions: [
          { id: uid("q"), type: "number", points: 2, required: true,
            label: "Si la altura de la Letra Mayúscula es h, a que altura debe hacerse la letra Minúscula (Proporción o N° no entero)",
            acceptedAnswers: ["0.7", "0,7"] },
        ],
      },
      {
        id: uid("sec"), title: "Pregunta 5 _ Multiple Choice",
        questions: [
          { id: uid("q"), type: "multiple_choice", points: 2, required: true, label: "Pregunta",
            options: ["1 h", "1,2 h", "1,4 h", "1,6 h", "1,8 h", "2 h"].map((t) => ({ id: uid("o"), text: t })) },
        ],
      },
      {
        id: uid("sec"), title: "Pregunta 6",
        questions: [
          { id: uid("q"), type: "multiple_choice", points: 2, required: true,
            label: "Según el siguiente tablero, seleccione la Letra que corresponde a la distancia correcta entre renglones",
            image: buildSampleTableImage(),
            options: "ABCDEFGHI".split("").map((l) => ({ id: uid("o"), text: l })).concat([{ id: uid("o"), text: "Todas son correctas" }]) },
        ],
      },
    ],
  };
  form.sections[3].questions[0].correctOptionId = form.sections[3].questions[0].options[3].id;
  form.sections[4].questions[0].correctOptionId = form.sections[4].questions[0].options[3].id;
  return form;
}

function makeBlankForm(suggestedTitle) {
  return {
    id: uid("form"), title: suggestedTitle || "Nuevo parcialito", subtitle: "",
    carreras: ["Carrera A"], comisiones: ["Comisión A"], timeLimitMinutes: null, examStatus: "cerrado",
    scheduledOpenAt: null, scheduledCloseAt: null,
    introConfig: defaultIntroConfig(),
    createdAt: new Date().toISOString(), sections: [],
  };
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- nota en escala de 1 a 10 — fórmula VIEJA (lineal) ---------- */
function scoreToNota(score, totalPoints) {
  const total = Number(totalPoints) || 0;
  if (total <= 0) return 0;
  const raw = (Number(score) / total) * 10;
  return Math.round(raw * 10) / 10;
}

/* ---------- nota en escala de 1 a 10 — fórmula NUEVA (con curva) ---------- */
function scoreToNotaCurva(score, totalPoints) {
  const total = Number(totalPoints) || 0;
  if (total <= 0) return 0;
  const pct = Math.max(0, Math.min(1, Number(score) / total));
  let nota;
  if (pct <= 0.6) {
    nota = (pct / 0.6) * 4;
  } else {
    const x = (pct - 0.6) / 0.4;
    const k = 9;
    nota = 4 + 6 * (Math.log(1 + k * x) / Math.log(1 + k));
  }
  return Math.round(nota * 10) / 10;
}

function formatNotaValue(nota) {
  return Number(nota).toFixed(1).replace(/\.0$/, "").replace(".", ",");
}
function formatNota(score, totalPoints) {
  return formatNotaValue(scoreToNota(score, totalPoints));
}
function formatNotaCurva(score, totalPoints) {
  return formatNotaValue(scoreToNotaCurva(score, totalPoints));
}

function resolveNota(row) {
  if (row && row.nota !== null && row.nota !== undefined && row.nota !== "") return Number(row.nota);
  return scoreToNota(row ? row.score : 0, row ? row.totalPoints : 0);
}
function formatResolvedNota(row) {
  if (isAttendanceOnly(row)) return "";
  return formatNotaValue(resolveNota(row));
}

/* ---------- iniciales de cada parcialito, para el libro de notas ----------
   Los números se toman completos: "PARCIALITO Lámina N° 17" -> "PLN17". */
function formInitials(title) {
  const clean = String(title || "").trim();
  if (!clean) return "?";
  return clean.split(/\s+/).map((w) => {
    if (/^\d+([.,]\d+)?$/.test(w)) return w.replace(/[.,]/g, "");
    const m = w.match(/[\p{L}\p{N}]/u);
    return m ? m[0] : "";
  }).join("").toUpperCase();
}
function computeFormInitialsMap(forms) {
  const used = new Set();
  const map = {};
  (forms || []).forEach((f) => {
    const base = formInitials(f.title);
    let ini = base, n = 2;
    while (used.has(ini)) { ini = base + n; n++; }
    used.add(ini);
    map[f.id] = ini;
  });
  return map;
}

/* ---------- orden de los parcialitos: el que el profe arma arrastrando las tarjetas ----------
   Cada parcialito guarda su posición en form.orden. Los que todavía no tienen
   posición (por ejemplo uno recién creado) van al final, en el orden de fallbackCmp. */
function sortFormsByOrden(forms, fallbackCmp) {
  const list = (forms || []).slice();
  const con = list.filter((f) => f.orden !== undefined && f.orden !== null && f.orden !== "")
                  .sort((a, b) => Number(a.orden) - Number(b.orden));
  const sin = list.filter((f) => f.orden === undefined || f.orden === null || f.orden === "");
  if (fallbackCmp) sin.sort(fallbackCmp);
  return [...con, ...sin];
}
// Se mantiene el nombre para que notas.js y notas-publicas.js no cambien.
function ordenarFormsParaNotas(forms, initialsMap) {
  return sortFormsByOrden(forms, null); // sin orden propio, queda el de creación que manda el servidor
}

/* ---------- "Confirmar asistencia" ---------- */
function isAttendanceOnly(row) {
  return !!(row && (row.asistenciaSinRendir === true || row.asistenciaSinRendir === 1 || row.asistenciaSinRendir === "1"));
}

function resolveColorClass(row) {
  if (isAttendanceOnly(row)) return "high";
  if (row && row.colorManual === "verde") return "high";
  if (row && row.colorManual === "rojo") return "low";
  const pct = row && row.totalPoints > 0 ? (Number(row.score) || 0) / row.totalPoints : 0;
  return pct >= 0.6 ? "high" : "low";
}

function tabSwitchInfo(n) {
  const count = Number(n) || 0;
  if (count === 0) return { level: 0, label: "Sin salidas de pantalla", className: "tabswitch-pill level-0" };
  if (count <= 2) return { level: 1, label: "Leve", className: "tabswitch-pill level-1" };
  if (count <= 5) return { level: 2, label: "Moderado", className: "tabswitch-pill level-2" };
  return { level: 3, label: "Grave", className: "tabswitch-pill level-3" };
}

function faltasInfo(faltas, totalForms) {
  const total = Number(totalForms) || 0;
  const count = Number(faltas) || 0;
  if (total <= 0 || count <= 0) return { level: 0, label: "Sin faltas", className: "faltas-pill level-0" };
  const pct = count / total;
  if (pct <= 0.25) return { level: 1, label: "Leve", className: "faltas-pill level-1" };
  if (pct <= 0.5) return { level: 2, label: "Moderado", className: "faltas-pill level-2" };
  return { level: 3, label: "Grave", className: "faltas-pill level-3" };
}

/* ---------- mismos colores, pero para el Excel exportado ---------- */
function xlsxNotaStyle(aprobado) {
  return aprobado
    ? { fill: { fgColor: { rgb: "DCF5EA" } }, font: { color: { rgb: "0F8A5F" }, bold: true } }
    : { fill: { fgColor: { rgb: "FFE3D9" } }, font: { color: { rgb: "D8431F" }, bold: true } };
}
function xlsxTabSwitchStyle(n) {
  const level = tabSwitchInfo(n).level;
  if (level === 0) return {};
  if (level === 1) return { fill: { fgColor: { rgb: "CCFBF1" } }, font: { color: { rgb: "115E59" }, bold: true } };
  if (level === 2) return { fill: { fgColor: { rgb: "0D9488" } }, font: { color: { rgb: "FFFFFF" }, bold: true } };
  return { fill: { fgColor: { rgb: "115E59" } }, font: { color: { rgb: "FFFFFF" }, bold: true } };
}
function xlsxFaltasStyle(faltas, totalForms) {
  const level = faltasInfo(faltas, totalForms).level;
  if (level === 0) return {};
  if (level === 1) return { fill: { fgColor: { rgb: "FCE7F3" } }, font: { color: { rgb: "9D174D" }, bold: true } };
  if (level === 2) return { fill: { fgColor: { rgb: "DB2777" } }, font: { color: { rgb: "FFFFFF" }, bold: true } };
  return { fill: { fgColor: { rgb: "9D174D" } }, font: { color: { rgb: "FFFFFF" }, bold: true } };
}
function xlsxHeaderStyle() {
  return { fill: { fgColor: { rgb: "4F46E5" } }, font: { color: { rgb: "FFFFFF" }, bold: true } };
}
function xlsxCell(value, opts) {
  const isNumber = typeof value === "number";
  return Object.assign({ v: value, t: isNumber ? "n" : "s" }, opts && opts.style ? { s: opts.style } : {});
}

function formatRichText(escapedText) {
  return String(escapedText)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/\*(.+?)\*/g, "<i>$1</i>");
}
