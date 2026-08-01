/* ============================================================
   PARCIALITO — editor.js
   ============================================================ */

const params = new URLSearchParams(location.search);
const formId = params.get("id");
let form = getForm(formId);
if (!form) {
  alert("No se encontró ese parcialito. Volviendo al panel.");
  location.href = "index.html";
}

function persist() { upsertForm(form); syncTitleblock(); }

/* ---------- tabs ---------- */
document.querySelectorAll(".ruler-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.view));
});
function activateTab(viewId) {
  document.querySelectorAll(".ruler-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === viewId));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === viewId));
  if (viewId === "view-take") renderTake();
  if (viewId === "view-publish") renderPublish();
}
if (params.get("tab") === "publish") activateTab("view-publish");

/* ============================================================
   HEADER / CONFIG
   ============================================================ */
const titleInput = document.getElementById("form-title");
const subtitleInput = document.getElementById("form-subtitle");
const timeInput = document.getElementById("form-timelimit");
const comisionesBox = document.getElementById("comisiones-input");

function initHeader() {
  titleInput.value = form.title;
  subtitleInput.value = form.subtitle || "";
  timeInput.value = form.timeLimitMinutes || "";
  titleInput.addEventListener("input", () => { form.title = titleInput.value; persist(); });
  subtitleInput.addEventListener("input", () => { form.subtitle = subtitleInput.value; persist(); });
  timeInput.addEventListener("input", () => { form.timeLimitMinutes = timeInput.value ? Number(timeInput.value) : null; persist(); });
  renderComisiones();
}

function renderComisiones() {
  comisionesBox.innerHTML = "";
  (form.comisiones || []).forEach((c, idx) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.innerHTML = `<span>${escapeHtml(c)}</span>`;
    const rm = document.createElement("button");
    rm.textContent = "×";
    rm.addEventListener("click", () => { form.comisiones.splice(idx, 1); persist(); renderComisiones(); });
    tag.appendChild(rm);
    comisionesBox.appendChild(tag);
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
  document.getElementById("tb-subtitle").textContent = form.subtitle || "";
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
  if (type === "multiple_choice") return { ...base, options: [{ id: uid("o"), text: "" }, { id: uid("o"), text: "" }], correctOptionId: null };
  if (type === "true_false") {
    const vOpt = { id: uid("o"), text: "Verdadero" }, fOpt = { id: uid("o"), text: "Falso" };
    return { ...base, type: "multiple_choice", options: [vOpt, fOpt], correctOptionId: null };
  }
  return base;
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
  labelField.appendChild(labelTa);
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
      chk.appendChild(document.createTextNode(" Ignorar mayúsculas/minúsculas y tildes al corregir (recomendado para \"desarrollo\" corto)"));
      body.appendChild(chk);
    } else {
      const note = document.createElement("div"); note.className = "checkrow";
      note.textContent = "El corrector acepta coma o punto como separador decimal automáticamente (0,7 = 0.7).";
      body.appendChild(note);
    }
  }

  if (q.type === "multiple_choice") {
    const optField = document.createElement("div");
    optField.innerHTML = `<label class="field-label">Opciones (marcá la correcta)</label>`;
    q.options.forEach((opt, oIdx) => {
      const row = document.createElement("div"); row.className = "opt-row";
      const radio = document.createElement("input");
      radio.type = "radio"; radio.className = "radio-correct"; radio.name = "correct_" + q.id;
      radio.checked = q.correctOptionId === opt.id;
      radio.addEventListener("change", () => { q.correctOptionId = opt.id; persist(); });
      row.appendChild(radio);
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

document.getElementById("btn-load-example").addEventListener("click", () => {
  if (confirm("Esto reemplaza las preguntas actuales por el ejemplo del profe. ¿Continuar?")) {
    const example = defaultExampleForm();
    form.title = example.title; form.subtitle = example.subtitle;
    form.comisiones = example.comisiones; form.timeLimitMinutes = example.timeLimitMinutes;
    form.sections = example.sections;
    persist(); initHeader(); renderBuilder();
  }
});

/* ============================================================
   VISTA PREVIA (dentro del editor, no guarda nada)
   ============================================================ */
const takeRoot = document.getElementById("take-root");

function renderTake() {
  takeRoot.innerHTML = "";
  const note = document.createElement("div");
  note.className = "empty-note";
  note.style.marginBottom = "16px";
  note.textContent = "Vista previa: acá probás la corrección. Nada de esto se guarda en la planilla.";
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
      lbl.className = "take-question__label"; lbl.textContent = q.label || "(sin enunciado)";
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
   PUBLICAR
   ============================================================ */
function renderPublish() {
  document.getElementById("form-sheeturl").value = form.sheetWebAppUrl || "";
  document.getElementById("form-sheetviewurl").value = form.sheetViewUrl || "";
  document.getElementById("form-sheeturl").oninput = (e) => { form.sheetWebAppUrl = e.target.value.trim(); persist(); };
  document.getElementById("form-sheetviewurl").oninput = (e) => { form.sheetViewUrl = e.target.value.trim(); persist(); };

  const compact = btoa(unescape(encodeURIComponent(JSON.stringify(form))));
  const baseUrl = location.href.replace(/editor\.html.*$/, "");
  const shareUrl = baseUrl + "take.html#" + compact;
  document.getElementById("share-url").value = shareUrl;

  const qrBox = document.getElementById("qrcode-box");
  qrBox.innerHTML = "";
  if (shareUrl.length > 2200) {
    qrBox.innerHTML = `<p class="empty-note">Este formulario tiene imágenes y el enlace quedó muy largo para un QR directo. Si esto pasa, avisame y sumamos alojar el formulario como archivo aparte para un link corto.</p>`;
  } else if (window.QRCode) {
    new QRCode(qrBox, { text: shareUrl, width: 176, height: 176 });
  }

  if (!form.sheetWebAppUrl) {
    const warn = document.createElement("p");
    warn.className = "empty-note"; warn.style.marginTop = "10px";
    warn.textContent = "Todavía no conectaste la planilla de Google Sheets: los alumnos van a poder rendir y ver su puntaje, pero la respuesta NO se va a guardar ni se va a bloquear el reingreso hasta que la conectes.";
    qrBox.parentElement.appendChild(warn);
  }
}

document.getElementById("btn-copy-link").addEventListener("click", () => {
  const inp = document.getElementById("share-url"); inp.select(); document.execCommand("copy");
});
document.getElementById("btn-download-json").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(form, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  const safeName = (form.title || "formulario").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  a.download = safeName + ".json"; a.click();
});
document.getElementById("btn-go-results").addEventListener("click", () => { location.href = "resultados.html?id=" + form.id; });

/* ---------- init ---------- */
initHeader();
renderBuilder();
