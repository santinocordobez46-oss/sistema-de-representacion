/* ============================================================
   PARCIALITO — funciones compartidas (v2, con backend central)
   ============================================================ */

const GLOBAL_URL_KEY = "parcialito_api_url_v1";

function uid(prefix = "id") { return prefix + "_" + Math.random().toString(36).slice(2, 9); }

function getApiUrl() { return localStorage.getItem(GLOBAL_URL_KEY) || ""; }
function setApiUrl(url) { localStorage.setItem(GLOBAL_URL_KEY, url.trim()); }

/* ---------- llamadas al backend ---------- */
async function apiGet(action, extraParams = {}) {
  const url = new URL(getApiUrl());
  url.searchParams.set("action", action);
  Object.entries(extraParams).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}
async function apiPost(body) {
  const res = await fetch(getApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiListForms() { return apiGet("listforms"); }
async function apiGetForm(id) { return apiGet("getform", { formId: id }); }
async function apiSaveForm(form) { return apiPost({ action: "saveform", form }); }
async function apiDeleteForm(id) { return apiPost({ action: "deleteform", formId: id }); }
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

/* ---------- normalización para corrección ---------- */
function normalizeText(s) {
  return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normalizeNumber(s) {
  const cleaned = String(s || "").trim().replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

/* ---------- corrección de una pregunta (compartida entre la vista previa del editor y el examen real) ----------
   Devuelve { correct, puntos }. Para opción múltiple con varias correctas,
   el puntaje es PROPORCIONAL: si cada opción correcta tiene su propio valor
   cargado (q.optionPoints), se suma solo el de las que el alumno marcó bien
   (nunca resta por marcar una incorrecta, nunca supera el puntaje total). Si
   no hay valores individuales cargados (preguntas viejas), se reparte el
   puntaje total en partes iguales entre las opciones correctas, así ninguna
   pregunta de "marcar varias" queda en todo-o-nada por defecto. */
function scoreQuestionAnswer(q, given) {
  if (q.type === "short_text") {
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
    puntos = Math.round(puntos * 100) / 100; // evita arrastre de decimales flotantes
    const correct = givenIds.length === correctIds.length && correctIds.every((id) => givenIds.includes(id));
    return { correct, puntos };
  }
  if (q.type === "multiple_choice") {
    const correct = given === q.correctOptionId;
    return { correct, puntos: correct ? (Number(q.points) || 0) : 0 };
  }
  return { correct: false, puntos: 0 };
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

/* ---------- estado efectivo del examen: manual + horario programado (opcional) ----------
   Cada comisión puede tener su propio horario (form.comisionSchedules[comision]).
   Si esa comisión no tiene uno propio, se usa el horario general del formulario
   (form.scheduledOpenAt / form.scheduledCloseAt) como respaldo. Si no hay nada
   programado (ni por comisión ni general), manda el estado manual (examStatus). */
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
  return base; // "text"
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
  form.sections[3].questions[0].correctOptionId = form.sections[3].questions[0].options[3].id; // 1,6 h
  form.sections[4].questions[0].correctOptionId = form.sections[4].questions[0].options[3].id; // D
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

/* ---------- formato de texto enriquecido (negrita/cursiva/subrayado) ----------
   Sintaxis simple tipo markdown: **negrita**, *cursiva/inclinada*, __subrayado__.
   Siempre se aplica DESPUÉS de escapeHtml(), nunca antes, para que no se pueda
   inyectar HTML real a través del enunciado. */
/* ---------- nota en escala de 1 a 10 (proporcional al puntaje máximo) ----------
   Sirve tanto para un parcialito de 10 puntos como uno de 20, 35, etc. —
   siempre se saca la regla de tres y se redondea a 1 decimal. */
function scoreToNota(score, totalPoints) {
  const total = Number(totalPoints) || 0;
  if (total <= 0) return 0;
  const raw = (Number(score) / total) * 10;
  return Math.round(raw * 10) / 10;
}
function formatNota(score, totalPoints) {
  return scoreToNota(score, totalPoints).toFixed(1).replace(/\.0$/, "").replace(".", ",");
}

function formatRichText(escapedText) {
  return String(escapedText)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/\*(.+?)\*/g, "<i>$1</i>");
}
