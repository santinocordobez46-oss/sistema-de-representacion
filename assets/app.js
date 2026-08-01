/* ============================================================
   PARCIALITO BUILDER — lógica de la aplicación
   ============================================================ */

const STORAGE_KEY = "parcialito_builder_state_v1";
const RESPONSES_KEY = "parcialito_responses_v1";

function uid(prefix = "id") {
  return prefix + "_" + Math.random().toString(36).slice(2, 9);
}

/* ---------- imagen de ejemplo (tablero de distancias) generada como SVG ---------- */
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

function defaultExample() {
  return {
    title: "PARCIALITO LAMINA Nro. 0",
    subtitle: "Rotulado y escritura normalizada",
    sections: [
      {
        id: uid("sec"),
        title: "Información del estudiante",
        info: true,
        questions: [
          {
            id: uid("q"), type: "info_text",
            label: "1°) APELLIDO/S EN MAYÚSCULA, 2°) Nombres con Iniciales en Mayúscula",
            required: true, points: 0,
          },
          {
            id: uid("q"), type: "info_text",
            label: "Poner los 3 dígitos de N° de Alumno",
            required: true, points: 0,
          },
          {
            id: uid("q"), type: "info_choice",
            label: "Carrera que está cursando",
            required: true, points: 0,
            options: [
              { id: uid("o"), text: "I. Biomed." },
              { id: uid("o"), text: "I. Elect." },
              { id: uid("o"), text: "I. Comp." },
              { id: uid("o"), text: "Otra" },
            ],
          },
        ],
      },
      {
        id: uid("sec"),
        title: "Pregunta 1 _ Escribir solamente un Número de 2 Dígitos",
        questions: [
          {
            id: uid("q"), type: "number", points: 1, required: true,
            label: "Mencione UNO DE LOS DOS ángulos de inclinación de las Letras que admite la Norma de aplicación (solamente escribir N° de 2 Dígitos)",
            acceptedAnswers: ["90", "75"],
          },
          {
            id: uid("q"), type: "number", points: 1, required: true,
            label: "Mencione EL OTRO ángulo de inclinación de las Letras que admite la Norma de aplicación (solamente escribir los 2 Dígitos)",
            acceptedAnswers: ["90", "75"],
          },
        ],
      },
      {
        id: uid("sec"),
        title: "Pregunta 2 _ Escribir una Palabra",
        questions: [
          {
            id: uid("q"), type: "short_text", points: 2, required: true, caseInsensitive: true,
            label: "En escritura Normalizada, h es la altura de la letra .....? (Escribir respuesta en singular)",
            acceptedAnswers: ["mayuscula", "mayúscula"],
          },
        ],
      },
      {
        id: uid("sec"),
        title: "Pregunta 3 _ Escribir Número de dos dígitos, separados por una coma (Parte entera, Decimal)",
        questions: [
          {
            id: uid("q"), type: "number", points: 2, required: true,
            label: "Si la altura de la Letra Mayúscula es h, a que altura debe hacerse la letra Minúscula (Proporción o N° no entero)",
            acceptedAnswers: ["0.7", "0,7"],
          },
        ],
      },
      {
        id: uid("sec"),
        title: "Pregunta 5 _ Multiple Choice",
        questions: [
          {
            id: uid("q"), type: "multiple_choice", points: 2, required: true,
            label: "Pregunta",
            options: [
              { id: uid("o"), text: "1 h" },
              { id: uid("o"), text: "1,2 h" },
              { id: uid("o"), text: "1,4 h" },
              { id: uid("o"), text: "1,6 h" },
              { id: uid("o"), text: "1,8 h" },
              { id: uid("o"), text: "2 h" },
            ],
          },
        ],
      },
      {
        id: uid("sec"),
        title: "Pregunta 6",
        questions: [
          {
            id: uid("q"), type: "multiple_choice", points: 2, required: true,
            label: "Según el siguiente tablero, seleccione la Letra que corresponde a la distancia correcta entre renglones",
            image: buildSampleTableImage(),
            options: "ABCDEFGHI".split("").map((l) => ({ id: uid("o"), text: l })).concat([{ id: uid("o"), text: "Todas son correctas" }]),
          },
        ],
      },
    ],
  };
}

/* correctIndex must be set after options created (need option ids) — set default correct answers now */
function applyExampleCorrectAnswers(state) {
  const mc1 = state.sections[4].questions[0]; // 1,6 h
  mc1.correctOptionId = mc1.options[3].id;
  const mc2 = state.sections[5].questions[0]; // D
  mc2.correctOptionId = mc2.options[3].id;
  return state;
}

/* ---------- estado ---------- */
let state = loadState() || applyExampleCorrectAnswers(defaultExample());

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

/* ============================================================
   TABS
   ============================================================ */
document.querySelectorAll(".ruler-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".ruler-tabs button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.view).classList.add("active");
    if (btn.dataset.view === "view-take") renderTake();
    if (btn.dataset.view === "view-export") renderExport();
  });
});

/* ============================================================
   BUILDER
   ============================================================ */
const builderRoot = document.getElementById("builder-sections");
const titleInput = document.getElementById("form-title");
const subtitleInput = document.getElementById("form-subtitle");

function initHeaderInputs() {
  titleInput.value = state.title;
  subtitleInput.value = state.subtitle || "";
  titleInput.addEventListener("input", () => { state.title = titleInput.value; saveState(); syncTitleblock(); });
  subtitleInput.addEventListener("input", () => { state.subtitle = subtitleInput.value; saveState(); syncTitleblock(); });
}

function syncTitleblock() {
  document.getElementById("tb-title").textContent = state.title || "Sin título";
  document.getElementById("tb-subtitle").textContent = state.subtitle || "";
  const totalPts = state.sections.flatMap((s) => s.questions).reduce((a, q) => a + (Number(q.points) || 0), 0);
  document.getElementById("tb-points").textContent = totalPts + " pts";
  document.getElementById("tb-count").textContent = state.sections.flatMap((s) => s.questions).length;
}

const QUESTION_TYPES = [
  { value: "short_text", label: "Respuesta corta (texto)" },
  { value: "number", label: "Respuesta corta (número)" },
  { value: "multiple_choice", label: "Opción múltiple" },
  { value: "info_text", label: "Dato identificatorio (texto)" },
  { value: "info_choice", label: "Dato identificatorio (opción)" },
];

function renderBuilder() {
  builderRoot.innerHTML = "";
  state.sections.forEach((section, sIdx) => {
    builderRoot.appendChild(renderSectionCard(section, sIdx));
  });
  const addSecBtn = document.createElement("button");
  addSecBtn.className = "add-section-btn";
  addSecBtn.textContent = "+ Agregar sección";
  addSecBtn.addEventListener("click", () => {
    state.sections.push({ id: uid("sec"), title: "Nueva sección", questions: [] });
    saveState();
    renderBuilder();
  });
  builderRoot.appendChild(addSecBtn);
  syncTitleblock();
}

function renderSectionCard(section, sIdx) {
  const card = document.createElement("div");
  card.className = "section-card";

  const head = document.createElement("div");
  head.className = "section-card__head";
  head.innerHTML = `<span class="section-tick">SECC. ${String(sIdx + 1).padStart(2, "0")}</span>`;
  const titleInp = document.createElement("input");
  titleInp.type = "text"; titleInp.value = section.title;
  titleInp.addEventListener("input", () => { section.title = titleInp.value; saveState(); });
  head.appendChild(titleInp);

  const delSecBtn = document.createElement("button");
  delSecBtn.className = "btn btn-danger btn-small";
  delSecBtn.textContent = "Eliminar sección";
  delSecBtn.addEventListener("click", () => {
    if (confirm("¿Eliminar esta sección y todas sus preguntas?")) {
      state.sections.splice(sIdx, 1); saveState(); renderBuilder();
    }
  });
  head.appendChild(delSecBtn);
  card.appendChild(head);

  const body = document.createElement("div");
  body.className = "section-card__body";
  section.questions.forEach((q, qIdx) => body.appendChild(renderQuestionBlock(section, q, qIdx)));

  const addRow = document.createElement("div");
  addRow.className = "add-question-row";
  QUESTION_TYPES.forEach((t) => {
    const b = document.createElement("button");
    b.className = "btn btn-small";
    b.textContent = "+ " + t.label;
    b.addEventListener("click", () => {
      section.questions.push(makeBlankQuestion(t.value));
      saveState(); renderBuilder();
    });
    addRow.appendChild(b);
  });
  body.appendChild(addRow);
  card.appendChild(body);
  return card;
}

function makeBlankQuestion(type) {
  const base = { id: uid("q"), type, points: type.startsWith("info") ? 0 : 1, required: true, label: "" };
  if (type === "short_text") return { ...base, acceptedAnswers: [], caseInsensitive: true };
  if (type === "number") return { ...base, acceptedAnswers: [] };
  if (type === "multiple_choice") return { ...base, options: [{ id: uid("o"), text: "" }, { id: uid("o"), text: "" }], correctOptionId: null };
  if (type === "info_choice") return { ...base, options: [{ id: uid("o"), text: "" }] };
  return base; // info_text
}

function renderQuestionBlock(section, q, qIdx) {
  const block = document.createElement("div");
  block.className = "qblock";

  const head = document.createElement("div");
  head.className = "qblock__head";
  head.innerHTML = `<span class="qnum">${qIdx + 1}</span>`;

  const typeSel = document.createElement("select");
  typeSel.className = "qtype-select";
  QUESTION_TYPES.forEach((t) => {
    const o = document.createElement("option");
    o.value = t.value; o.textContent = t.label;
    if (t.value === q.type) o.selected = true;
    typeSel.appendChild(o);
  });
  typeSel.addEventListener("change", () => {
    const fresh = makeBlankQuestion(typeSel.value);
    fresh.label = q.label; fresh.id = q.id;
    section.questions[qIdx] = fresh;
    saveState(); renderBuilder();
  });
  head.appendChild(typeSel);

  if (!q.type.startsWith("info")) {
    const stamp = document.createElement("div");
    stamp.className = "points-stamp";
    stamp.innerHTML = `<span>PTS</span>`;
    const ptsInput = document.createElement("input");
    ptsInput.type = "number"; ptsInput.min = "0"; ptsInput.step = "0.5";
    ptsInput.value = q.points;
    ptsInput.addEventListener("input", () => { q.points = Number(ptsInput.value) || 0; saveState(); syncTitleblock(); });
    stamp.appendChild(ptsInput);
    head.appendChild(stamp);
  }
  block.appendChild(head);

  const body = document.createElement("div");
  body.className = "qblock__body";

  const labelField = document.createElement("div");
  labelField.innerHTML = `<label class="field-label">Enunciado</label>`;
  const labelTa = document.createElement("textarea");
  labelTa.value = q.label;
  labelTa.addEventListener("input", () => { q.label = labelTa.value; saveState(); });
  labelField.appendChild(labelTa);
  body.appendChild(labelField);

  // image (only for scored question types, keeps it simple)
  if (!q.type.startsWith("info")) {
    const imgField = document.createElement("div");
    imgField.innerHTML = `<label class="field-label">Imagen del enunciado (opcional)</label>`;
    const dropBox = document.createElement("div");
    dropBox.className = "image-drop";
    if (q.image) {
      dropBox.innerHTML = `<img src="${q.image}" alt=""><span>Imagen cargada</span>`;
      const rm = document.createElement("button");
      rm.className = "btn btn-small btn-danger"; rm.textContent = "Quitar";
      rm.addEventListener("click", () => { q.image = null; saveState(); renderBuilder(); });
      dropBox.appendChild(rm);
    } else {
      const fileInp = document.createElement("input");
      fileInp.type = "file"; fileInp.accept = "image/*";
      fileInp.addEventListener("change", () => {
        const file = fileInp.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { q.image = reader.result; saveState(); renderBuilder(); };
        reader.readAsDataURL(file);
      });
      dropBox.innerHTML = `<span>Subí una imagen (tabla, gráfico, plano, etc.)</span>`;
      dropBox.appendChild(fileInp);
    }
    imgField.appendChild(dropBox);
    body.appendChild(imgField);
  }

  if (q.type === "short_text" || q.type === "number") {
    const accField = document.createElement("div");
    accField.innerHTML = `<label class="field-label">${q.type === "number" ? "Valores numéricos aceptados" : "Respuestas aceptadas (cualquiera de estas cuenta como correcta)"}</label>`;
    const tagInput = document.createElement("div");
    tagInput.className = "tag-input";
    (q.acceptedAnswers || []).forEach((ans, aIdx) => {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.innerHTML = `<span>${escapeHtml(ans)}</span>`;
      const rm = document.createElement("button");
      rm.textContent = "×";
      rm.addEventListener("click", () => { q.acceptedAnswers.splice(aIdx, 1); saveState(); renderBuilder(); });
      tag.appendChild(rm);
      tagInput.appendChild(tag);
    });
    const newTagInp = document.createElement("input");
    newTagInp.type = "text";
    newTagInp.placeholder = "Escribí una respuesta y Enter";
    newTagInp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && newTagInp.value.trim()) {
        e.preventDefault();
        q.acceptedAnswers = q.acceptedAnswers || [];
        q.acceptedAnswers.push(newTagInp.value.trim());
        saveState(); renderBuilder();
      }
    });
    tagInput.appendChild(newTagInp);
    accField.appendChild(tagInput);
    body.appendChild(accField);

    if (q.type === "short_text") {
      const chk = document.createElement("div");
      chk.className = "checkrow";
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = q.caseInsensitive !== false;
      cb.addEventListener("change", () => { q.caseInsensitive = cb.checked; saveState(); });
      chk.appendChild(cb);
      chk.appendChild(document.createTextNode(" Ignorar mayúsculas/minúsculas y tildes al corregir"));
      body.appendChild(chk);
    } else {
      const note = document.createElement("div");
      note.className = "checkrow";
      note.textContent = "El corrector acepta coma o punto como separador decimal automáticamente (0,7 = 0.7).";
      body.appendChild(note);
    }
  }

  if (q.type === "multiple_choice" || q.type === "info_choice") {
    const optField = document.createElement("div");
    optField.innerHTML = `<label class="field-label">Opciones ${q.type === "multiple_choice" ? "(marcá la correcta)" : ""}</label>`;
    q.options.forEach((opt, oIdx) => {
      const row = document.createElement("div");
      row.className = "opt-row";
      if (q.type === "multiple_choice") {
        const radio = document.createElement("input");
        radio.type = "radio"; radio.className = "radio-correct";
        radio.name = "correct_" + q.id;
        radio.checked = q.correctOptionId === opt.id;
        radio.addEventListener("change", () => { q.correctOptionId = opt.id; saveState(); });
        row.appendChild(radio);
      }
      const txt = document.createElement("input");
      txt.type = "text"; txt.value = opt.text;
      txt.placeholder = "Texto de la opción";
      txt.addEventListener("input", () => { opt.text = txt.value; saveState(); });
      row.appendChild(txt);
      const rm = document.createElement("button");
      rm.className = "btn btn-small btn-danger"; rm.textContent = "×";
      rm.addEventListener("click", () => { q.options.splice(oIdx, 1); saveState(); renderBuilder(); });
      row.appendChild(rm);
      optField.appendChild(row);
    });
    const addOptBtn = document.createElement("button");
    addOptBtn.className = "btn btn-small"; addOptBtn.textContent = "+ Opción";
    addOptBtn.addEventListener("click", () => { q.options.push({ id: uid("o"), text: "" }); saveState(); renderBuilder(); });
    optField.appendChild(addOptBtn);
    body.appendChild(optField);
  }

  const chkReq = document.createElement("div");
  chkReq.className = "checkrow";
  const cbReq = document.createElement("input");
  cbReq.type = "checkbox"; cbReq.checked = q.required !== false;
  cbReq.addEventListener("change", () => { q.required = cbReq.checked; saveState(); });
  chkReq.appendChild(cbReq);
  chkReq.appendChild(document.createTextNode(" Obligatoria"));
  body.appendChild(chkReq);

  block.appendChild(body);

  const foot = document.createElement("div");
  foot.className = "qblock__foot";
  const delBtn = document.createElement("button");
  delBtn.className = "btn btn-small btn-danger";
  delBtn.textContent = "Eliminar pregunta";
  delBtn.addEventListener("click", () => { section.questions.splice(qIdx, 1); saveState(); renderBuilder(); });
  foot.appendChild(delBtn);
  block.appendChild(foot);

  return block;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ============================================================
   VISTA PREVIA / RENDIR
   ============================================================ */
const takeRoot = document.getElementById("take-root");

function normalizeText(s) {
  return String(s || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // saca tildes
}
function normalizeNumber(s) {
  const cleaned = String(s || "").trim().replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

function renderTake() {
  takeRoot.innerHTML = "";
  const answers = {};

  const allQuestions = state.sections.flatMap((s) => s.questions);
  const totalPoints = allQuestions.reduce((a, q) => a + (q.type.startsWith("info") ? 0 : Number(q.points) || 0), 0);

  state.sections.forEach((section) => {
    const secTitle = document.createElement("h3");
    secTitle.style.fontFamily = "var(--font-display)";
    secTitle.style.margin = "22px 0 10px";
    secTitle.textContent = section.title;
    takeRoot.appendChild(secTitle);

    section.questions.forEach((q) => {
      const card = document.createElement("div");
      card.className = "take-question";
      const lbl = document.createElement("div");
      lbl.className = "take-question__label";
      lbl.textContent = q.label || "(sin enunciado)";
      card.appendChild(lbl);
      if (!q.type.startsWith("info")) {
        const pts = document.createElement("div");
        pts.className = "take-question__points";
        pts.textContent = `Valor: ${q.points} punto(s)`;
        card.appendChild(pts);
      }
      if (q.image) {
        const img = document.createElement("img");
        img.className = "q-img"; img.src = q.image;
        card.appendChild(img);
      }

      if (q.type === "info_text" || q.type === "short_text" || q.type === "number") {
        const inp = document.createElement("input");
        inp.type = "text";
        inp.addEventListener("input", () => { answers[q.id] = inp.value; });
        card.appendChild(inp);
      } else if (q.type === "multiple_choice" || q.type === "info_choice") {
        q.options.forEach((opt) => {
          const row = document.createElement("label");
          row.className = "choice-row";
          const radio = document.createElement("input");
          radio.type = "radio"; radio.name = "take_" + q.id; radio.value = opt.id;
          radio.addEventListener("change", () => { answers[q.id] = opt.id; });
          row.appendChild(radio);
          const span = document.createElement("span");
          span.textContent = opt.text;
          row.appendChild(span);
          card.appendChild(row);
        });
      }
      card.dataset.qid = q.id;
      takeRoot.appendChild(card);
    });
  });

  const submitBtn = document.createElement("button");
  submitBtn.className = "btn btn-accent";
  submitBtn.style.marginTop = "10px";
  submitBtn.textContent = "Corregir / Enviar";
  submitBtn.addEventListener("click", () => gradeAndShow(answers, totalPoints));
  takeRoot.appendChild(submitBtn);

  const resultBox = document.createElement("div");
  resultBox.id = "take-result";
  takeRoot.appendChild(resultBox);
}

function gradeAndShow(answers, totalPoints) {
  let score = 0;
  const allQuestions = state.sections.flatMap((s) => s.questions);

  allQuestions.forEach((q) => {
    if (q.type.startsWith("info")) return;
    const given = answers[q.id];
    let correct = false;
    if (q.type === "short_text") {
      const normGiven = normalizeText(given);
      correct = (q.acceptedAnswers || []).some((a) => normalizeText(a) === normGiven);
    } else if (q.type === "number") {
      const normGiven = normalizeNumber(given);
      correct = normGiven !== null && (q.acceptedAnswers || []).some((a) => normalizeNumber(a) === normGiven);
    } else if (q.type === "multiple_choice") {
      correct = given === q.correctOptionId;
    }
    if (correct) score += Number(q.points) || 0;

    const card = takeRoot.querySelector(`[data-qid="${q.id}"]`);
    if (card) {
      const old = card.querySelector(".result-badge");
      if (old) old.remove();
      const badge = document.createElement("span");
      badge.className = "result-badge " + (correct ? "ok" : "bad");
      badge.textContent = correct ? "✓ Correcta" : "✗ Incorrecta";
      card.querySelector(".take-question__label").appendChild(badge);
    }
  });

  // guarda la respuesta localmente (demo — fase 2 conectará a una planilla real)
  const responses = JSON.parse(localStorage.getItem(RESPONSES_KEY) || "[]");
  responses.push({ date: new Date().toISOString(), score, totalPoints, answers });
  localStorage.setItem(RESPONSES_KEY, JSON.stringify(responses));

  let panel = document.querySelector(".score-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "score-panel";
    document.getElementById("take-result").appendChild(panel);
  }
  panel.innerHTML = `<span>Puntaje obtenido</span><span class="num">${score} / ${totalPoints}</span>`;
}

/* ============================================================
   EXPORTAR
   ============================================================ */
function renderExport() {
  document.getElementById("export-json").textContent = JSON.stringify(state, null, 2);

  const dlBtn = document.getElementById("btn-download-json");
  dlBtn.onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const safeName = (state.title || "formulario").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    a.download = safeName + ".json";
    a.click();
  };

  // enlace de ejemplo para compartir (fase 1: apunta a take.html con el formulario embebido en el hash)
  const compact = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  const baseUrl = location.href.replace(/index\.html.*$/, "").replace(/#.*$/, "");
  const shareUrl = baseUrl + "take.html#" + compact;
  document.getElementById("share-url").value = shareUrl;

  const qrBox = document.getElementById("qrcode-box");
  qrBox.innerHTML = "";
  if (shareUrl.length > 2200) {
    qrBox.innerHTML = `<p class="empty-note">Este formulario tiene imágenes y el enlace quedó muy largo para un QR directo. En la Fase 2 vamos a alojar el formulario como archivo (por ej. <code>forms/parcialito-lamina-0.json</code>) para tener un enlace corto y un QR limpio.</p>`;
  } else if (window.QRCode) {
    new QRCode(qrBox, { text: shareUrl, width: 176, height: 176 });
  }
}

document.getElementById("btn-copy-link")?.addEventListener("click", () => {
  const inp = document.getElementById("share-url");
  inp.select(); document.execCommand("copy");
});

document.getElementById("btn-load-example").addEventListener("click", () => {
  if (confirm("Esto reemplaza el formulario actual por el ejemplo del PARCIALITO LAMINA Nro. 0. ¿Continuar?")) {
    state = applyExampleCorrectAnswers(defaultExample());
    saveState();
    initHeaderInputs();
    renderBuilder();
  }
});

document.getElementById("btn-new-form").addEventListener("click", () => {
  if (confirm("¿Vaciar el formulario y empezar uno nuevo en blanco?")) {
    state = { title: "Nuevo cuestionario", subtitle: "", sections: [] };
    saveState();
    initHeaderInputs();
    renderBuilder();
  }
});

/* ---------- init ---------- */
initHeaderInputs();
renderBuilder();
