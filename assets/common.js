/* ============================================================
   PARCIALITO — funciones compartidas entre dashboard / editor / resultados / take
   ============================================================ */

const FORMS_KEY = "parcialito_forms_v2";

function uid(prefix = "id") {
  return prefix + "_" + Math.random().toString(36).slice(2, 9);
}

function loadForms() {
  try { return JSON.parse(localStorage.getItem(FORMS_KEY)) || []; }
  catch (e) { return []; }
}
function saveForms(forms) {
  localStorage.setItem(FORMS_KEY, JSON.stringify(forms));
}
function getForm(id) {
  return loadForms().find((f) => f.id === id);
}
function upsertForm(form) {
  const forms = loadForms();
  const idx = forms.findIndex((f) => f.id === form.id);
  form.updatedAt = new Date().toISOString();
  if (idx >= 0) forms[idx] = form; else forms.push(form);
  saveForms(forms);
}
function deleteForm(id) {
  saveForms(loadForms().filter((f) => f.id !== id));
}

function normalizeText(s) {
  return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normalizeNumber(s) {
  const cleaned = String(s || "").trim().replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
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

function defaultExampleForm() {
  const form = {
    id: uid("form"),
    title: "PARCIALITO LAMINA Nro. 0",
    subtitle: "Rotulado y escritura normalizada",
    comisiones: ["I. Biomed.", "I. Elect.", "I. Comp."],
    timeLimitMinutes: 15,
    sheetWebAppUrl: "",
    sheetViewUrl: "",
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

function makeBlankForm() {
  return {
    id: uid("form"), title: "Nuevo parcialito", subtitle: "",
    comisiones: ["Comisión A"], timeLimitMinutes: null,
    sheetWebAppUrl: "", sheetViewUrl: "",
    createdAt: new Date().toISOString(), sections: [],
  };
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
