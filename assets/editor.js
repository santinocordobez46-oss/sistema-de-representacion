/* ============================================================
   PARCIALITO — editor.js (v2, con backend central)
   ============================================================ */

if (!getApiUrl()) { location.href = "index.html"; }

const params = new URLSearchParams(location.search);
const formId = params.get("id");
let form = null;
let saveTimer = null;

const statusEl = document.getElementById("save-status");

/* ---------- barra de formato B / I / U para textareas ----------
   Envuelve el texto seleccionado (o inserta un placeholder) con marcadores
   **negrita** / *cursiva* / __subrayado__, que después renderiza formatRichText(). */
function createRichToolbar(getTextarea) {
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex; gap:4px; margin-bottom:6px;";
  function addBtn(label, left, right, title, style) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-small btn-ghost";
    b.textContent = label;
    b.title = title;
    b.style.cssText += style;
    b.addEventListener("click", (e) => {
      e.preventDefault();
      const ta = getTextarea();
      const start = ta.selectionStart, end = ta.selectionEnd;
      const before = ta.value.slice(0, start), sel = ta.value.slice(start, end) || "texto", after = ta.value.slice(end);
      ta.value = before + left + sel + right + after;
      const newPos = start + left.length + sel.length + right.length;
      ta.focus(); ta.setSelectionRange(newPos, newPos);
      ta.dispatchEvent(new Event("input"));
    });
    bar.appendChild(b);
  }
  addBtn("B", "**", "**", "Negrita", "font-weight:700;");
  addBtn("I", "*", "*", "Cursiva / inclinada", "font-style:italic;");
  addBtn("U", "__", "__", "Subrayado", "text-decoration:underline;");
  return bar;
}

async function boot() {
  try {
    const res = await apiGetForm(formId);
    if (!res.ok) throw new Error(res.error || "No encontrado");
    form = res.form;
    form.comisiones = form.comisiones || [];
    form.sections = form.sections || [];
    initHeader();
    renderBuilder();
    statusEl.textContent = "Guardado ✓";
    const wantedTab = params.get("tab") === "publish" ? "view-publish" : document.querySelector(".ruler-tabs button.active").dataset.view;
    activateTab(wantedTab);
  } catch (err) {
    alert("No se pudo cargar este parcialito (" + err.message + "). Volviendo al panel.");
    location.href = "index.html";
  }
}

function persist() {
  syncTitleblock();
  statusEl.textContent = "Guardando…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await apiSaveForm(form); statusEl.textContent = "Guardado ✓"; }
    catch (e) { statusEl.textContent = "Error al guardar"; }
  }, 600);
}

/* ---------- tabs ---------- */
document.querySelectorAll(".ruler-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.view));
});
function activateTab(viewId) {
  document.querySelectorAll(".ruler-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === viewId));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === viewId));
  if (!form) return; // todavía está cargando; se vuelve a llamar desde initHeader() al terminar
  if (viewId === "view-intro") renderIntroConfig();
  if (viewId === "view-take") renderTake();
  if (viewId === "view-publish") renderPublish();
}

/* ============================================================
   HEADER / CONFIG
   ============================================================ */
const titleInput = document.getElementById("form-title");
const subtitleInput = document.getElementById("form-subtitle");
const timeInput = document.getElementById("form-timelimit");
const carrerasBox = document.getElementById("carreras-input");
const comisionesBox = document.getElementById("comisiones-input");

function initHeader() {
  titleInput.value = form.title;
  subtitleInput.value = form.subtitle || "";
  timeInput.value = form.timeLimitMinutes || "";
  titleInput.addEventListener("input", () => { form.title = titleInput.value; persist(); });
  subtitleInput.addEventListener("input", () => { form.subtitle = subtitleInput.value; persist(); });
  timeInput.addEventListener("input", () => { form.timeLimitMinutes = timeInput.value ? Number(timeInput.value) : null; persist(); });
  renderCarreras();
  renderComisiones();
}

function renderCarreras() {
  carrerasBox.innerHTML = "";
  (form.carreras || []).forEach((c, idx) => {
    const tag = document.createElement("span");
    tag.className = "tag"; tag.innerHTML = `<span>${escapeHtml(c)}</span>`;
    const rm = document.createElement("button"); rm.textContent = "×";
    rm.addEventListener("click", () => { form.carreras.splice(idx, 1); persist(); renderCarreras(); });
    tag.appendChild(rm); carrerasBox.appendChild(tag);
  });
  const inp = document.createElement("input");
  inp.type = "text"; inp.placeholder = "Nombre de carrera y Enter";
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && inp.value.trim()) {
      e.preventDefault();
      form.carreras = form.carreras || [];
      form.carreras.push(inp.value.trim());
      persist(); renderCarreras();
    }
  });
  carrerasBox.appendChild(inp);
}

function renderComisiones() {
  comisionesBox.innerHTML = "";
  (form.comisiones || []).forEach((c, idx) => {
    const tag = document.createElement("span");
    tag.className = "tag"; tag.innerHTML = `<span>${escapeHtml(c)}</span>`;
    const rm = document.createElement("button"); rm.textContent = "×";
    rm.addEventListener("click", () => { form.comisiones.splice(idx, 1); persist(); renderComisiones(); });
    tag.appendChild(rm); comisionesBox.appendChild(tag);
  });
  const inp = document.createElement("input");
  inp.type = "text"; inp.placeholder = "Nombre de comisión y Enter";
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && inp.value.trim()) {
      e.preventDefault();
      form.comisiones = form.comisiones || [];
      form.comisiones.push(inp.value.trim());
      persist(); renderComisiones();
    }
  });
  comisionesBox.appendChild(inp);
}

function syncTitleblock() {
  document.getElementById("tb-title").textContent = form.title || "Sin título";
  document.getElementById("tb-points").textContent = totalPointsOf(form) + " pts";
  document.getElementById("tb-count").textContent = questionCountOf(form);
}

/* ============================================================
   BUILDER (secciones y preguntas)
   ============================================================ */
const builderRoot = document.getElementById("builder-sections");

const QUESTION_TYPES = [
  { value: "short_text", label: "Respuesta corta / desarrollo (texto)" },
  { value: "number", label: "Respuesta corta (número)" },
  { value: "multiple_choice", label: "Opción múltiple" },
  { value: "true_false", label: "Verdadero / Falso" },
];

function renderBuilder() {
  builderRoot.innerHTML = "";
  form.sections.forEach((section, sIdx) => builderRoot.appendChild(renderSectionCard(section, sIdx)));
  const addSecBtn = document.createElement("button");
  addSecBtn.className = "add-section-btn";
  addSecBtn.textContent = "+ Agregar sección / pregunta";
  addSecBtn.addEventListener("click", () => {
    form.sections.push({ id: uid("sec"), title: "Nueva sección", questions: [] });
    persist(); renderBuilder();
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
  titleInp.addEventListener("input", () => { section.title = titleInp.value; persist(); });
  head.appendChild(titleInp);

  const upSecBtn = document.createElement("button");
  upSecBtn.className = "btn btn-small btn-ghost"; upSecBtn.textContent = "↑"; upSecBtn.title = "Mover sección arriba";
  upSecBtn.disabled = sIdx === 0;
  upSecBtn.addEventListener("click", () => {
    [form.sections[sIdx - 1], form.sections[sIdx]] = [form.sections[sIdx], form.sections[sIdx - 1]];
    persist(); renderBuilder();
  });
  head.appendChild(upSecBtn);

  const downSecBtn = document.createElement("button");
  downSecBtn.className = "btn btn-small btn-ghost"; downSecBtn.textContent = "↓"; downSecBtn.title = "Mover sección abajo";
  downSecBtn.disabled = sIdx === form.sections.length - 1;
  downSecBtn.addEventListener("click", () => {
    [form.sections[sIdx + 1], form.sections[sIdx]] = [form.sections[sIdx], form.sections[sIdx + 1]];
    persist(); renderBuilder();
  });
  head.appendChild(downSecBtn);

  const delSecBtn = document.createElement("button");
  delSecBtn.className = "btn btn-danger btn-small"; delSecBtn.textContent = "Eliminar sección";
  delSecBtn.addEventListener("click", () => {
    if (confirm("¿Eliminar esta sección y sus preguntas?")) { form.sections.splice(sIdx, 1); persist(); renderBuilder(); }
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
    b.className = "btn btn-small"; b.textContent = "+ " + t.label;
    b.addEventListener("click", () => { section.questions.push(makeBlankQuestion(t.value)); persist(); renderBuilder(); });
    addRow.appendChild(b);
  });
  body.appendChild(addRow);
  card.appendChild(body);
  return card;
}

function makeBlankQuestion(type) {
  const base = { id: uid("q"), type, points: 1, required: true, label: "" };
  if (type === "short_text") return { ...base, acceptedAnswers: [], caseInsensitive: true };
  if (type === "number") return { ...base, acceptedAnswers: [] };
  if (type === "multiple_choice") return { ...base, options: [{ id: uid("o"), text: "" }, { id: uid("o"), text: "" }], multiSelect: false, correctOptionId: null, correctOptionIds: [], requiredSelectionCount: null };
  if (type === "true_false") {
    const vOpt = { id: uid("o"), text: "Verdadero" }, fOpt = { id: uid("o"), text: "Falso" };
    return { ...base, type: "multiple_choice", options: [vOpt, fOpt], multiSelect: false, correctOptionId: null, correctOptionIds: [], requiredSelectionCount: null };
  }
  return base;
}

function renderQuestionBlock(section, q, qIdx) {
  const block = document.createElement("div");
  block.className = "qblock";
  const head = document.createElement("div");
  head.className = "qblock__head";
  head.innerHTML = `<span class="qnum">${qIdx + 1}</span>`;

  const upQBtn = document.createElement("button");
  upQBtn.className = "btn btn-small btn-ghost"; upQBtn.textContent = "↑"; upQBtn.title = "Mover pregunta arriba";
  upQBtn.disabled = qIdx === 0;
  upQBtn.addEventListener("click", () => {
    [section.questions[qIdx - 1], section.questions[qIdx]] = [section.questions[qIdx], section.questions[qIdx - 1]];
    persist(); renderBuilder();
  });
  head.appendChild(upQBtn);

  const downQBtn = document.createElement("button");
  downQBtn.className = "btn btn-small btn-ghost"; downQBtn.textContent = "↓"; downQBtn.title = "Mover pregunta abajo";
  downQBtn.disabled = qIdx === section.questions.length - 1;
  downQBtn.addEventListener("click", () => {
    [section.questions[qIdx + 1], section.questions[qIdx]] = [section.questions[qIdx], section.questions[qIdx + 1]];
    persist(); renderBuilder();
  });
  head.appendChild(downQBtn);

  const typeSel = document.createElement("select");
  typeSel.className = "qtype-select";
  QUESTION_TYPES.forEach((t) => {
    const o = document.createElement("option");
    o.value = t.value; o.textContent = t.label;
    if (t.value === q.type || (t.value === "true_false" && q.type === "multiple_choice" && q.options.length === 2 && q.options[0].text === "Verdadero")) o.selected = true;
    typeSel.appendChild(o);
  });
  typeSel.addEventListener("change", () => {
    const fresh = makeBlankQuestion(typeSel.value);
    fresh.label = q.label; fresh.id = q.id; fresh.points = q.points;
    section.questions[qIdx] = fresh; persist(); renderBuilder();
  });
  head.appendChild(typeSel);

  const stamp = document.createElement("div");
  stamp.className = "points-stamp"; stamp.innerHTML = `<span>PTS</span>`;
  const ptsInput = document.createElement("input");
  ptsInput.type = "number"; ptsInput.min = "0"; ptsInput.step = "0.5"; ptsInput.value = q.points;
  ptsInput.addEventListener("input", () => { q.points = Number(ptsInput.value) || 0; persist(); });
  stamp.appendChild(ptsInput);
  head.appendChild(stamp);
  block.appendChild(head);

  const body = document.createElement("div");
  body.className = "qblock__body";

  const labelField = document.createElement("div");
  labelField.innerHTML = `<label class="field-label">Enunciado</label>`;
  const labelTa = document.createElement("textarea");
  labelTa.value = q.label;
  labelTa.addEventListener("input", () => { q.label = labelTa.value; persist(); });
  labelField.appendChild(createRichToolbar(() => labelTa));
  labelField.appendChild(labelTa);
  const formatNote = document.createElement("div");
  formatNote.style.cssText = "font-size:11px; color:var(--muted); margin-top:4px;";
  formatNote.textContent = "Seleccioná texto y usá B / I / U, o escribí **negrita**, *cursiva*, __subrayado__ directamente.";
  labelField.appendChild(formatNote);
  body.appendChild(labelField);

  const imgField = document.createElement("div");
  imgField.innerHTML = `<label class="field-label">Imagen del enunciado (opcional)</label>`;
  const dropBox = document.createElement("div");
  dropBox.className = "image-drop";
  if (q.image) {
    dropBox.innerHTML = `<img src="${q.image}" alt=""><span>Imagen cargada</span>`;
    const rm = document.createElement("button");
    rm.className = "btn btn-small btn-danger"; rm.textContent = "Quitar";
    rm.addEventListener("click", () => { q.image = null; persist(); renderBuilder(); });
    dropBox.appendChild(rm);
  } else {
    const fileInp = document.createElement("input");
    fileInp.type = "file"; fileInp.accept = "image/*";
    fileInp.addEventListener("change", () => {
      const file = fileInp.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { q.image = reader.result; persist(); renderBuilder(); };
      reader.readAsDataURL(file);
    });
    dropBox.innerHTML = `<span>Subí una imagen (tabla, gráfico, plano, etc.)</span>`;
    dropBox.appendChild(fileInp);
  }
  imgField.appendChild(dropBox);
  body.appendChild(imgField);

  if (q.type === "short_text" || q.type === "number") {
    const accField = document.createElement("div");
    accField.innerHTML = `<label class="field-label">${q.type === "number" ? "Valores numéricos aceptados" : "Respuestas aceptadas (cualquiera cuenta como correcta)"}</label>`;
    const tagInput = document.createElement("div");
    tagInput.className = "tag-input";
    (q.acceptedAnswers || []).forEach((ans, aIdx) => {
      const tag = document.createElement("span");
      tag.className = "tag"; tag.innerHTML = `<span>${escapeHtml(ans)}</span>`;
      const rm = document.createElement("button"); rm.textContent = "×";
      rm.addEventListener("click", () => { q.acceptedAnswers.splice(aIdx, 1); persist(); renderBuilder(); });
      tag.appendChild(rm); tagInput.appendChild(tag);
    });
    const newTagInp = document.createElement("input");
    newTagInp.type = "text"; newTagInp.placeholder = "Escribí una respuesta y Enter";
    newTagInp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && newTagInp.value.trim()) {
        e.preventDefault();
        q.acceptedAnswers = q.acceptedAnswers || [];
        q.acceptedAnswers.push(newTagInp.value.trim());
        persist(); renderBuilder();
      }
    });
    tagInput.appendChild(newTagInp);
    accField.appendChild(tagInput);
    body.appendChild(accField);

    if (q.type === "short_text") {
      const chk = document.createElement("div"); chk.className = "checkrow";
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = q.caseInsensitive !== false;
      cb.addEventListener("change", () => { q.caseInsensitive = cb.checked; persist(); });
      chk.appendChild(cb);
      chk.appendChild(document.createTextNode(" Ignorar mayúsculas/minúsculas y tildes al corregir"));
      body.appendChild(chk);
    } else {
      const note = document.createElement("div"); note.className = "checkrow";
      note.textContent = "El corrector acepta coma o punto como separador decimal automáticamente (0,7 = 0.7).";
      body.appendChild(note);
    }
  }

  if (q.type === "multiple_choice") {
    const multiChk = document.createElement("div"); multiChk.className = "checkrow";
    const multiCb = document.createElement("input"); multiCb.type = "checkbox"; multiCb.checked = !!q.multiSelect;
    multiCb.addEventListener("change", () => {
      q.multiSelect = multiCb.checked;
      if (q.multiSelect) { q.correctOptionIds = q.correctOptionId ? [q.correctOptionId] : []; }
      else { q.correctOptionId = (q.correctOptionIds || [])[0] || null; }
      persist(); renderBuilder();
    });
    multiChk.appendChild(multiCb);
    multiChk.appendChild(document.createTextNode(" Permite marcar varias opciones correctas"));
    body.appendChild(multiChk);

    if (q.multiSelect) {
      const cntField = document.createElement("div");
      cntField.innerHTML = `<label class="field-label">Cantidad exacta que el alumno debe marcar (opcional)</label>`;
      const cntInp = document.createElement("input");
      cntInp.type = "number"; cntInp.min = "1"; cntInp.placeholder = "Sin restricción";
      cntInp.value = q.requiredSelectionCount || "";
      cntInp.addEventListener("input", () => { q.requiredSelectionCount = cntInp.value ? Number(cntInp.value) : null; persist(); });
      cntField.appendChild(cntInp);
      body.appendChild(cntField);
    }

    const optField = document.createElement("div");
    optField.innerHTML = `<label class="field-label">Opciones (marcá ${q.multiSelect ? "todas las correctas" : "la correcta"})</label>`;
    q.options.forEach((opt, oIdx) => {
      const row = document.createElement("div"); row.className = "opt-row";
      const check = document.createElement("input");
      check.type = q.multiSelect ? "checkbox" : "radio";
      check.className = "radio-correct";
      if (!q.multiSelect) check.name = "correct_" + q.id;
      if (q.multiSelect) {
        check.checked = (q.correctOptionIds || []).includes(opt.id);
        check.addEventListener("change", () => {
          q.correctOptionIds = q.correctOptionIds || [];
          if (check.checked) q.correctOptionIds.push(opt.id);
          else q.correctOptionIds = q.correctOptionIds.filter((id) => id !== opt.id);
          persist();
        });
      } else {
        check.checked = q.correctOptionId === opt.id;
        check.addEventListener("change", () => { q.correctOptionId = opt.id; persist(); });
      }
      row.appendChild(check);
      const txt = document.createElement("input");
      txt.type = "text"; txt.value = opt.text; txt.placeholder = "Texto de la opción";
      txt.addEventListener("input", () => { opt.text = txt.value; persist(); });
      row.appendChild(txt);
      const rm = document.createElement("button"); rm.className = "btn btn-small btn-danger"; rm.textContent = "×";
      rm.addEventListener("click", () => { q.options.splice(oIdx, 1); persist(); renderBuilder(); });
      row.appendChild(rm);
      optField.appendChild(row);
    });
    const addOptBtn = document.createElement("button");
    addOptBtn.className = "btn btn-small"; addOptBtn.textContent = "+ Opción";
    addOptBtn.addEventListener("click", () => { q.options.push({ id: uid("o"), text: "" }); persist(); renderBuilder(); });
    optField.appendChild(addOptBtn);
    body.appendChild(optField);
  }

  const chkReq = document.createElement("div"); chkReq.className = "checkrow";
  const cbReq = document.createElement("input"); cbReq.type = "checkbox"; cbReq.checked = q.required !== false;
  cbReq.addEventListener("change", () => { q.required = cbReq.checked; persist(); });
  chkReq.appendChild(cbReq);
  chkReq.appendChild(document.createTextNode(" Obligatoria"));
  body.appendChild(chkReq);

  block.appendChild(body);

  const foot = document.createElement("div"); foot.className = "qblock__foot";
  const delBtn = document.createElement("button");
  delBtn.className = "btn btn-small btn-danger"; delBtn.textContent = "Eliminar pregunta";
  delBtn.addEventListener("click", () => { section.questions.splice(qIdx, 1); persist(); renderBuilder(); });
  foot.appendChild(delBtn);
  block.appendChild(foot);
  return block;
}

/* ============================================================
   PANTALLA DE INICIO DEL ALUMNO (mensaje, campos estandarizados, campos propios)
   ============================================================ */
function ensureIntroConfig() {
  if (!form.introConfig) form.introConfig = defaultIntroConfig();
  form.introConfig.customFields = form.introConfig.customFields || [];
  return form.introConfig;
}

function renderIntroConfig() {
  const cfg = ensureIntroConfig();
  const welcomeTa = document.getElementById("intro-welcome");
  const showNombreCb = document.getElementById("intro-show-nombre");
  const showMailCb = document.getElementById("intro-show-mail");

  if (!welcomeTa.dataset.toolbarAdded) {
    welcomeTa.parentNode.insertBefore(createRichToolbar(() => welcomeTa), welcomeTa);
    welcomeTa.dataset.toolbarAdded = "1";
  }

  welcomeTa.value = cfg.welcomeMessage || "";
  showNombreCb.checked = cfg.showApellidoNombre !== false;
  showMailCb.checked = !!cfg.showMail;

  welcomeTa.oninput = () => { cfg.welcomeMessage = welcomeTa.value; persist(); };
  showNombreCb.onchange = () => { cfg.showApellidoNombre = showNombreCb.checked; persist(); };
  showMailCb.onchange = () => { cfg.showMail = showMailCb.checked; persist(); };

  renderIntroCustomFields();
}

function renderIntroCustomFields() {
  const cfg = ensureIntroConfig();
  const root = document.getElementById("intro-custom-fields");
  root.innerHTML = "";
  if (cfg.customFields.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-note"; empty.textContent = "Todavía no agregaste campos propios.";
    root.appendChild(empty);
  }
  cfg.customFields.forEach((field, idx) => {
    const block = document.createElement("div");
    block.className = "qblock";
    const head = document.createElement("div");
    head.className = "qblock__head";
    head.innerHTML = `<span class="qnum">${idx + 1}</span><span class="qtype-select" style="border:none;background:transparent;">${field.type === "choice" ? "Campo de opciones" : "Campo de texto"}</span>`;
    const upBtn = document.createElement("button"); upBtn.className = "btn btn-small btn-ghost"; upBtn.textContent = "↑";
    upBtn.disabled = idx === 0;
    upBtn.addEventListener("click", () => { [cfg.customFields[idx - 1], cfg.customFields[idx]] = [cfg.customFields[idx], cfg.customFields[idx - 1]]; persist(); renderIntroCustomFields(); });
    const downBtn = document.createElement("button"); downBtn.className = "btn btn-small btn-ghost"; downBtn.textContent = "↓";
    downBtn.disabled = idx === cfg.customFields.length - 1;
    downBtn.addEventListener("click", () => { [cfg.customFields[idx + 1], cfg.customFields[idx]] = [cfg.customFields[idx], cfg.customFields[idx + 1]]; persist(); renderIntroCustomFields(); });
    head.appendChild(upBtn); head.appendChild(downBtn);
    block.appendChild(head);

    const body = document.createElement("div"); body.className = "qblock__body";
    const labelField = document.createElement("div");
    labelField.innerHTML = `<label class="field-label">Etiqueta del campo</label>`;
    const labelInp = document.createElement("input"); labelInp.type = "text"; labelInp.value = field.label;
    labelInp.addEventListener("input", () => { field.label = labelInp.value; persist(); });
    labelField.appendChild(labelInp);
    body.appendChild(labelField);

    if (field.type === "choice") {
      const optField = document.createElement("div");
      optField.innerHTML = `<label class="field-label">Opciones</label>`;
      field.options.forEach((opt, oIdx) => {
        const row = document.createElement("div"); row.className = "opt-row";
        const txt = document.createElement("input"); txt.type = "text"; txt.value = opt.text; txt.placeholder = "Texto de la opción";
        txt.addEventListener("input", () => { opt.text = txt.value; persist(); });
        row.appendChild(txt);
        const rm = document.createElement("button"); rm.className = "btn btn-small btn-danger"; rm.textContent = "×";
        rm.addEventListener("click", () => { field.options.splice(oIdx, 1); persist(); renderIntroCustomFields(); });
        row.appendChild(rm);
        optField.appendChild(row);
      });
      const addOptBtn = document.createElement("button");
      addOptBtn.className = "btn btn-small"; addOptBtn.textContent = "+ Opción";
      addOptBtn.addEventListener("click", () => { field.options.push({ id: uid("o"), text: "" }); persist(); renderIntroCustomFields(); });
      optField.appendChild(addOptBtn);
      body.appendChild(optField);
    }
    block.appendChild(body);

    const foot = document.createElement("div"); foot.className = "qblock__foot";
    const delBtn = document.createElement("button"); delBtn.className = "btn btn-small btn-danger"; delBtn.textContent = "Eliminar campo";
    delBtn.addEventListener("click", () => { cfg.customFields.splice(idx, 1); persist(); renderIntroCustomFields(); });
    foot.appendChild(delBtn);
    block.appendChild(foot);

    root.appendChild(block);
  });
}

document.getElementById("btn-add-intro-text").addEventListener("click", () => {
  ensureIntroConfig().customFields.push(makeBlankCustomField("text"));
  persist(); renderIntroCustomFields();
});
document.getElementById("btn-add-intro-choice").addEventListener("click", () => {
  ensureIntroConfig().customFields.push(makeBlankCustomField("choice"));
  persist(); renderIntroCustomFields();
});

/* ============================================================
   VISTA PREVIA (dentro del editor, no guarda nada)
   ============================================================ */
const takeRoot = document.getElementById("take-root");

function renderTake() {
  takeRoot.innerHTML = "";
  const note = document.createElement("div");
  note.className = "empty-note"; note.style.marginBottom = "16px";
  note.textContent = "Vista previa: acá probás la corrección. Nada de esto se guarda.";
  takeRoot.appendChild(note);

  const answers = {};
  const allQuestions = form.sections.flatMap((s) => s.questions);
  const totalPoints = allQuestions.reduce((a, q) => a + (Number(q.points) || 0), 0);

  form.sections.forEach((section) => {
    const secTitle = document.createElement("h3");
    secTitle.style.fontFamily = "var(--font-display)"; secTitle.style.margin = "22px 0 10px";
    secTitle.textContent = section.title;
    takeRoot.appendChild(secTitle);

    section.questions.forEach((q) => {
      const card = document.createElement("div");
      card.className = "take-question"; card.dataset.qid = q.id;
      const lbl = document.createElement("div");
      lbl.className = "take-question__label"; lbl.innerHTML = formatRichText(escapeHtml(q.label || "(sin enunciado)"));
      card.appendChild(lbl);
      const pts = document.createElement("div");
      pts.className = "take-question__points"; pts.textContent = `Valor: ${q.points} punto(s)`;
      card.appendChild(pts);
      if (q.image) { const img = document.createElement("img"); img.className = "q-img"; img.src = q.image; card.appendChild(img); }

      if (q.type === "short_text" || q.type === "number") {
        const inp = document.createElement("input");
        inp.type = "text";
        inp.addEventListener("input", () => { answers[q.id] = inp.value; });
        card.appendChild(inp);
      } else if (q.multiSelect) {
        answers[q.id] = [];
        q.options.forEach((opt) => {
          const row = document.createElement("label"); row.className = "choice-row";
          const check = document.createElement("input");
          check.type = "checkbox"; check.value = opt.id;
          check.addEventListener("change", () => {
            answers[q.id] = answers[q.id] || [];
            if (check.checked) answers[q.id].push(opt.id);
            else answers[q.id] = answers[q.id].filter((id) => id !== opt.id);
          });
          row.appendChild(check);
          const span = document.createElement("span"); span.textContent = opt.text;
          row.appendChild(span);
          card.appendChild(row);
        });
      } else {
        q.options.forEach((opt) => {
          const row = document.createElement("label"); row.className = "choice-row";
          const radio = document.createElement("input");
          radio.type = "radio"; radio.name = "take_" + q.id; radio.value = opt.id;
          radio.addEventListener("change", () => { answers[q.id] = opt.id; });
          row.appendChild(radio);
          const span = document.createElement("span"); span.textContent = opt.text;
          row.appendChild(span);
          card.appendChild(row);
        });
      }
      takeRoot.appendChild(card);
    });
  });

  const submitBtn = document.createElement("button");
  submitBtn.className = "btn btn-accent"; submitBtn.style.marginTop = "10px";
  submitBtn.textContent = "Corregir (solo prueba)";
  submitBtn.addEventListener("click", () => {
    let score = 0;
    allQuestions.forEach((q) => {
      const given = answers[q.id];
      let correct = false;
      if (q.type === "short_text") correct = (q.acceptedAnswers || []).some((a) => normalizeText(a) === normalizeText(given));
      else if (q.type === "number") { const g = normalizeNumber(given); correct = g !== null && (q.acceptedAnswers || []).some((a) => normalizeNumber(a) === g); }
      else if (q.multiSelect) {
        const givenIds = (given || []).slice().sort();
        const correctIds = (q.correctOptionIds || []).slice().sort();
        correct = givenIds.length === correctIds.length && givenIds.every((id, i) => id === correctIds[i]);
      }
      else if (q.type === "multiple_choice") correct = given === q.correctOptionId;
      if (correct) score += Number(q.points) || 0;
      const card = takeRoot.querySelector(`[data-qid="${q.id}"]`);
      const old = card.querySelector(".result-badge"); if (old) old.remove();
      const badge = document.createElement("span");
      badge.className = "result-badge " + (correct ? "ok" : "bad");
      badge.textContent = correct ? "✓ Correcta" : "✗ Incorrecta";
      card.querySelector(".take-question__label").appendChild(badge);
    });
    let panel = document.querySelector(".score-panel");
    if (!panel) { panel = document.createElement("div"); panel.className = "score-panel"; takeRoot.appendChild(panel); }
    panel.innerHTML = `<span>Puntaje obtenido</span><span class="num">${score} / ${totalPoints}</span>`;
  });
  takeRoot.appendChild(submitBtn);
}

/* ============================================================
   PUBLICAR — un QR por comisión, generado con un servicio de imagen
   directo (más robusto que depender de una librería JS de terceros)
   ============================================================ */
/* ---------- tarjeta descargable de QR (estilo cartel: fondo negro, texto blanco) ----------
   Usa el MISMO QR que ya se ve en pantalla (misma URL de api.qrserver.com),
   solo lo compone dentro de un cartel más prolijo para imprimir/compartir. */
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawWrappedText(ctx, text, cx, y, maxWidth, lineHeight, font, color) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = "center";
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((w) => {
    const test = current ? current + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && current) { lines.push(current); current = w; }
    else current = test;
  });
  if (current) lines.push(current);
  lines.forEach((line, i) => ctx.fillText(line, cx, y + i * lineHeight));
  return lines.length * lineHeight;
}
async function downloadQrCard(form, comision, qrImgUrl) {
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}

  const W = 720, H = 900;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  roundRectPath(ctx, 0, 0, W, H, 46);
  ctx.fillStyle = "#0c0b16";
  ctx.fill();

  ctx.save();
  roundRectPath(ctx, 0, 0, W, H, 46);
  ctx.clip();
  ctx.fillStyle = "#4f46e5";
  ctx.fillRect(0, 0, W, 10);
  ctx.restore();

  let y = 110;
  y += drawWrappedText(ctx, String(comision).toUpperCase(), W / 2, y, W - 100, 60, "800 50px 'Space Grotesk', sans-serif", "#ffffff");

  const qrSize = 460;
  const qrX = (W - qrSize) / 2;
  const qrY = y + 40;
  roundRectPath(ctx, qrX, qrY, qrSize, qrSize, 18);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = qrImgUrl;
    });
    const pad = 26;
    ctx.drawImage(img, qrX + pad, qrY + pad, qrSize - pad * 2, qrSize - pad * 2);
  } catch (e) {
    ctx.fillStyle = "#c33"; ctx.font = "16px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("No se pudo cargar el QR", W / 2, qrY + qrSize / 2);
  }

  let by = qrY + qrSize + 86;
  by += drawWrappedText(ctx, String(form.title || "Parcialito").toUpperCase(), W / 2, by, W - 90, 50, "800 40px 'Space Grotesk', sans-serif", "#ffffff");
  if (form.subtitle) {
    drawWrappedText(ctx, form.subtitle, W / 2, by + 14, W - 90, 36, "500 24px 'IBM Plex Sans', sans-serif", "#c9c6dc");
  }

  canvas.toBlob((blob) => {
    if (!blob) { alert("No se pudo generar la imagen. Probá de nuevo."); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const slug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    a.download = `${slug(form.title)}-${slug(comision)}.png`;
    a.click();
  }, "image/png");
}

function renderPublish() {
  renderExamStatus();
  renderSchedule();

  const warnBox = document.getElementById("publish-warning");
  const grid = document.getElementById("qr-per-comision");
  warnBox.innerHTML = "";
  grid.innerHTML = "";

  if (!form.comisiones || form.comisiones.length === 0) {
    warnBox.innerHTML = '<p class="empty-note">Todavía no agregaste comisiones en "01 · Editor". Agregá al menos una para poder generar su QR.</p>';
    return;
  }

  const baseUrl = location.href.replace(/editor\.html.*$/, "");

  form.comisionSchedules = form.comisionSchedules || {};

  form.comisiones.forEach((comision) => {
    const shareUrl = `${baseUrl}take.html?id=${encodeURIComponent(form.id)}&api=${encodeURIComponent(getApiUrl())}&comision=${encodeURIComponent(comision)}`;
    const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(shareUrl)}`;
    const own = form.comisionSchedules[comision] || { openAt: null, closeAt: null };
    const isOpen = computeEffectiveExamStatus(form, comision) === "abierto";
    const hasOwnSchedule = !!(own.openAt || own.closeAt);

    const card = document.createElement("div");
    card.className = "qr-card";
    card.innerHTML = `
      <span class="qr-card__com">${escapeHtml(comision)}</span>
      <span class="result-badge ${isOpen ? "ok" : "bad"}" data-role="status">${isOpen ? "● Abierto" : "● Cerrado"}</span>
      <img src="${qrImgUrl}" width="180" height="180" alt="QR ${escapeHtml(comision)}" loading="lazy"
           onerror="this.replaceWith(Object.assign(document.createElement('p'),{className:'empty-note',textContent:'No se pudo generar la imagen del QR (revisá tu conexión) — usá el enlace de abajo.'}))">
      <div class="share-url-row">
        <input type="text" readonly value="${escapeHtml(shareUrl)}">
        <button class="btn btn-small btn-copy">Copiar</button>
      </div>
      <button class="btn btn-small btn-download-card" style="width:100%;">🖼 Descargar tarjeta para compartir</button>
      <div style="width:100%; text-align:left;">
        <label class="field-label" style="margin-top:10px; font-size:11px;">Horario propio de esta comisión (si lo dejás vacío, usa el horario general)</label>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <div>
            <label class="field-label" style="margin-top:0; font-size:10px;">Apertura</label>
            <input type="datetime-local" class="com-open" style="font-size:12px;">
          </div>
          <div>
            <label class="field-label" style="margin-top:0; font-size:10px;">Cierre</label>
            <input type="datetime-local" class="com-close" style="font-size:12px;">
          </div>
        </div>
        <button class="btn btn-small btn-ghost com-clear" style="margin-top:6px;" ${hasOwnSchedule ? "" : "disabled"}>Quitar horario propio, usar el general</button>
      </div>`;

    const openInput = card.querySelector(".com-open");
    const closeInput = card.querySelector(".com-close");
    const clearBtn = card.querySelector(".com-clear");
    openInput.value = isoToLocalInputValue(own.openAt);
    closeInput.value = isoToLocalInputValue(own.closeAt);

    const refreshStatusBadge = () => {
      const nowOpen = computeEffectiveExamStatus(form, comision) === "abierto";
      const badge = card.querySelector('[data-role="status"]');
      badge.textContent = nowOpen ? "● Abierto" : "● Cerrado";
      badge.className = "result-badge " + (nowOpen ? "ok" : "bad");
      const stillHasOwn = !!(form.comisionSchedules[comision]?.openAt || form.comisionSchedules[comision]?.closeAt);
      clearBtn.disabled = !stillHasOwn;
    };

    openInput.onchange = () => {
      form.comisionSchedules[comision] = form.comisionSchedules[comision] || { openAt: null, closeAt: null };
      form.comisionSchedules[comision].openAt = localInputValueToIso(openInput.value);
      persist(); refreshStatusBadge();
    };
    closeInput.onchange = () => {
      form.comisionSchedules[comision] = form.comisionSchedules[comision] || { openAt: null, closeAt: null };
      form.comisionSchedules[comision].closeAt = localInputValueToIso(closeInput.value);
      persist(); refreshStatusBadge();
    };
    clearBtn.addEventListener("click", () => {
      delete form.comisionSchedules[comision];
      openInput.value = ""; closeInput.value = "";
      persist(); refreshStatusBadge();
    });

    card.querySelector(".btn-copy").addEventListener("click", () => {
      const inp = card.querySelector('input[type="text"][readonly]');
      inp.select(); document.execCommand("copy");
    });
    card.querySelector(".btn-download-card").addEventListener("click", async (ev) => {
      const btn = ev.currentTarget;
      const original = btn.textContent;
      btn.disabled = true; btn.textContent = "Generando…";
      try {
        await downloadQrCard(form, comision, qrImgUrl);
      } catch (e) {
        alert("No se pudo generar la tarjeta. Probá de nuevo.");
      }
      btn.disabled = false; btn.textContent = original;
    });
    grid.appendChild(card);
  });
}

/* ---------- horario programado: convierte entre <input datetime-local> (hora local)
   y el ISO en UTC que se guarda en el formulario, para que no dependa de en qué
   huso horario corra el navegador o el servidor de Apps Script ---------- */
function isoToLocalInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputValueToIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function renderSchedule() {
  const openInput = document.getElementById("exam-open-at");
  const closeInput = document.getElementById("exam-close-at");
  openInput.value = isoToLocalInputValue(form.scheduledOpenAt);
  closeInput.value = isoToLocalInputValue(form.scheduledCloseAt);
  openInput.onchange = () => { form.scheduledOpenAt = localInputValueToIso(openInput.value); persist(); renderExamStatus(); };
  closeInput.onchange = () => { form.scheduledCloseAt = localInputValueToIso(closeInput.value); persist(); renderExamStatus(); };
  document.getElementById("btn-clear-schedule").onclick = () => {
    form.scheduledOpenAt = null; form.scheduledCloseAt = null;
    openInput.value = ""; closeInput.value = "";
    persist(); renderExamStatus();
  };
}

function renderExamStatus() {
  const badge = document.getElementById("exam-status-badge");
  const startBtn = document.getElementById("btn-start-exam");
  const endBtn = document.getElementById("btn-end-exam");
  const hasSchedule = !!(form.scheduledOpenAt || form.scheduledCloseAt);
  const isOpen = computeEffectiveExamStatus(form) === "abierto";
  badge.textContent = isOpen ? "● Parcial ABIERTO (general) — los alumnos ya pueden responder" : "● Parcial CERRADO (general)";
  if (hasSchedule) badge.textContent += " · horario programado";
  badge.title = "Este es el estado por defecto. Cada comisión puede tener su propio horario más abajo, que manda por sobre este.";
  badge.className = "result-badge " + (isOpen ? "ok" : "bad");
  startBtn.disabled = hasSchedule || isOpen;
  endBtn.disabled = hasSchedule || !isOpen;
  startBtn.title = hasSchedule ? "Hay un horario programado activo — quitalo para volver a control manual" : "";
  endBtn.title = startBtn.title;
}

async function setExamStatus(status) {
  const startBtn = document.getElementById("btn-start-exam");
  const endBtn = document.getElementById("btn-end-exam");
  startBtn.disabled = true; endBtn.disabled = true;
  clearTimeout(saveTimer); // evita que un guardado demorado de otro campo pise este cambio
  form.examStatus = status;
  try {
    await apiSaveForm(form);
  } catch (e) {
    alert("No se pudo actualizar el estado del parcial. Probá de nuevo.");
  }
  renderExamStatus();
}

document.getElementById("btn-start-exam").addEventListener("click", () => {
  if (confirm("¿Iniciar el parcial ahora? A partir de este momento los alumnos que escaneen el QR van a poder empezar a responder.")) {
    setExamStatus("abierto");
  }
});
document.getElementById("btn-end-exam").addEventListener("click", () => {
  if (confirm("¿Finalizar el parcial ahora? Ningún envío más va a ser aceptado después de esto, aunque algún alumno todavía esté respondiendo.")) {
    setExamStatus("cerrado");
  }
});

document.getElementById("btn-download-json").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(form, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  const safeName = (form.title || "formulario").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  a.download = safeName + ".json"; a.click();
});
document.getElementById("btn-go-results").addEventListener("click", () => { location.href = "resultados.html?id=" + form.id; });

boot();
