if (!getApiUrl()) location.href = "index.html";

const rParams = new URLSearchParams(location.search);
const rFormId = rParams.get("id");
let rForm = null;
let allRows = [];
let formQuestions = [];
let editingInProgress = 0;
const TABSWITCH_PREF_KEY = "parcialito_show_tabswitches_v1";

async function init() {
  const container = document.getElementById("results-container");
  try {
    const res = await apiGetForm(rFormId);
    if (!res.ok) throw new Error(res.error);
    rForm = res.form;
    formQuestions = rForm.sections.flatMap((s) => s.questions);
  } catch (err) {
    container.innerHTML = `<p class="empty-note">No se encontró ese parcialito (${escapeHtml(err.message)}).</p>`;
    return;
  }
  document.getElementById("tb-title").textContent = rForm.title;
  document.getElementById("tb-subtitle").textContent = rForm.subtitle || "";
  const comSel = document.getElementById("filter-comision");
  (rForm.comisiones || []).forEach((c) => {
    const o = document.createElement("option"); o.value = c; o.textContent = c;
    comSel.appendChild(o);
  });

  const toggleTab = document.getElementById("toggle-tabswitches");
  const savedPref = localStorage.getItem(TABSWITCH_PREF_KEY);
  if (savedPref !== null) toggleTab.checked = savedPref === "1";
  toggleTab.addEventListener("change", () => {
    localStorage.setItem(TABSWITCH_PREF_KEY, toggleTab.checked ? "1" : "0");
    renderTable();
  });

  load();
}

async function load(silent) {
  const container = document.getElementById("results-container");
  if (!silent) container.innerHTML = '<p class="empty-note">Cargando respuestas…</p>';
  try {
    const res = await apiResults(rForm.id);
    if (!res.ok) throw new Error(res.error || "Error desconocido");
    allRows = res.rows || [];
    renderTable();
  } catch (err) {
    if (!silent) container.innerHTML = `<p class="empty-note">No se pudo conectar con la planilla (${escapeHtml(String(err.message || err))}).</p>`;
  }
}

function humanizeAnswer(q, rawRespuesta) {
  let given;
  try { given = JSON.parse(rawRespuesta); } catch (e) { given = rawRespuesta; }
  if (given === null || given === undefined) return "";
  if (q && q.type === "multiple_choice") {
    const optMap = {};
    (q.options || []).forEach((o) => { optMap[o.id] = o.text; });
    if (Array.isArray(given)) return given.map((id) => optMap[id] || id).join(" + ");
    return optMap[given] || String(given);
  }
  return String(given);
}

function buildScoreCell(r) {
  const td = document.createElement("td");
  const pill = document.createElement("span");
  pill.className = `score-pill ${resolveColorClass(r)}`;
  pill.style.cursor = "pointer";
  pill.title = "Clic para forzar verde/rojo, o volver a automático";
  pill.textContent = formatResolvedNota(r);
  td.appendChild(pill);

  pill.addEventListener("click", () => {
    editingInProgress++;
    const sel = document.createElement("select");
    sel.style.cssText = "font-size:11px; padding:2px 4px; max-width:150px;";
    [["", "Automático (según puntaje)"], ["verde", "Forzar verde"], ["rojo", "Forzar rojo"]].forEach(([val, label]) => {
      const opt = document.createElement("option"); opt.value = val; opt.textContent = label;
      if (val === (r.colorManual || "")) opt.selected = true;
      sel.appendChild(opt);
    });
    td.innerHTML = "";
    td.appendChild(sel);
    sel.focus();

    let handled = false;
    const close = () => {
      if (handled) return;
      handled = true;
      editingInProgress = Math.max(0, editingInProgress - 1);
      renderTable();
    };
    sel.addEventListener("change", async () => {
      handled = true;
      sel.disabled = true;
      try {
        const res = await apiSetResponseColor(rForm.id, r.numeroAlumno, sel.value);
        if (!res.ok) throw new Error(res.error || "El servidor rechazó el cambio.");
        r.colorManual = sel.value;
      } catch (err) {
        alert(`No se pudo guardar el color: ${err.message || err}. Revisá que la implementación de Apps Script esté actualizada (Implementar → Nueva versión) y volvé a intentar.`);
      }
      editingInProgress = Math.max(0, editingInProgress - 1);
      renderTable();
    });
    sel.addEventListener("blur", close);
  });

  return td;
}

function renderTable() {
  const comFilter = document.getElementById("filter-comision").value;
  const textFilter = normalizeText(document.getElementById("filter-nombre").value);
  const showTab = document.getElementById("toggle-tabswitches").checked;
  const rows = sortByComisionYNumero(allRows.filter((r) => {
    if (comFilter && String(r.comision).trim() !== comFilter) return false;
    if (textFilter) {
      const hay = normalizeText(r.nombre) + " " + normalizeText(r.numeroAlumno);
      if (!hay.includes(textFilter)) return false;
    }
    return true;
  }));

  document.getElementById("tb-count").textContent = rows.length;
  const container = document.getElementById("results-container");
  if (rows.length === 0) {
    container.innerHTML = '<p class="empty-note">Todavía no hay respuestas para mostrar con estos filtros.</p>';
    return;
  }

  const colCount = showTab ? 9 : 8;
  const table = document.createElement("table");
  table.className = "results-table";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>
      <th>N° Alumno</th><th>Nombre</th><th>Carrera</th><th>Comisión</th><th>Mail</th><th>Puntaje</th><th>Fecha/Hora</th>
      ${showTab ? "<th>Cambios de pantalla</th>" : ""}
      <th>Acciones</th>
    </tr>`;
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  rows.forEach((r) => {
    const tr = document.createElement("tr");

    const tdNumero = document.createElement("td"); tdNumero.className = "cell-numero"; tdNumero.textContent = r.numeroAlumno;
    const tdNombre = document.createElement("td"); tdNombre.className = "cell-nombre"; tdNombre.textContent = r.nombre;
    const tdCarrera = document.createElement("td"); tdCarrera.textContent = r.carrera || "—";
    const tdComision = document.createElement("td"); tdComision.textContent = r.comision;
    const tdMail = document.createElement("td"); tdMail.textContent = r.mail || "—";
    tr.appendChild(tdNumero); tr.appendChild(tdNombre); tr.appendChild(tdCarrera); tr.appendChild(tdComision); tr.appendChild(tdMail);
    tr.appendChild(buildScoreCell(r));

    const tdFecha = document.createElement("td"); tdFecha.textContent = new Date(r.fecha).toLocaleString("es-AR");
    tr.appendChild(tdFecha);
    if (showTab) {
      const tdTab = document.createElement("td");
      const info = tabSwitchInfo(r.tabSwitches);
      tdTab.innerHTML = `<span class="${info.className}" title="${escapeHtml(info.label)}">${r.tabSwitches || 0}</span>`;
      tr.appendChild(tdTab);
    }

    const tdActions = document.createElement("td");
    tdActions.style.whiteSpace = "nowrap";
    tdActions.innerHTML = `
      <button class="btn btn-small btn-detail">Ver detalle</button>
      <button class="btn btn-small btn-edit-row">Editar N°</button>
      <button class="btn btn-small btn-danger btn-delete-row">Borrar</button>`;
    tr.appendChild(tdActions);
    tbody.appendChild(tr);

    const detailTr = document.createElement("tr");
    detailTr.style.display = "none";
    const detailTd = document.createElement("td");
    detailTd.colSpan = colCount;
    detailTd.style.background = "#fafbfb";
    if (r.detail && r.detail.length > 0) {
      const detailTable = document.createElement("table");
      detailTable.style.cssText = "width:100%; font-size:12px;";
      detailTable.innerHTML = `<tr><th style="text-align:left;padding:4px 8px;">Pregunta</th><th style="text-align:left;padding:4px 8px;">Respuesta</th><th style="text-align:left;padding:4px 8px;">¿Correcta?</th><th style="text-align:left;padding:4px 8px;">Puntos</th><th style="text-align:left;padding:4px 8px;">Salió de pantalla</th></tr>` +
        r.detail.map((d, dIdx) => `<tr>
          <td style="padding:4px 8px;">${formatRichText(escapeHtml(d.pregunta || ""))}</td>
          <td style="padding:4px 8px;">${escapeHtml(humanizeAnswer(formQuestions[dIdx], d.respuesta))}</td>
          <td style="padding:4px 8px;">${d.correcta ? "✓" : "✗"}</td>
          <td style="padding:4px 8px;">${d.puntos}</td>
          <td style="padding:4px 8px;">${d.cambiosPantalla ? `<span class="${tabSwitchInfo(d.cambiosPantalla).className}" title="${escapeHtml(tabSwitchInfo(d.cambiosPantalla).label)}">${d.cambiosPantalla}x</span>` : "—"}</td>
        </tr>`).join("");
      detailTd.appendChild(detailTable);
    } else {
      detailTd.textContent = "No hay detalle guardado para esta respuesta.";
      detailTd.style.padding = "10px";
    }
    detailTr.appendChild(detailTd);
    tbody.appendChild(detailTr);

    tr.querySelector(".btn-detail").addEventListener("click", () => {
      const isHidden = detailTr.style.display === "none";
      detailTr.style.display = isHidden ? "table-row" : "none";
    });
    tr.querySelector(".btn-edit-row").addEventListener("click", (ev) => {
      const editBtn = ev.currentTarget;
      const numCell = tr.querySelector(".cell-numero");
      const nombreCell = tr.querySelector(".cell-nombre");
      const originalNumero = r.numeroAlumno;
      numCell.innerHTML = `<input type="text" class="edit-numero" style="width:80px;" value="${escapeHtml(originalNumero)}">`;
      nombreCell.innerHTML = `<input type="text" class="edit-nombre" style="width:140px;" value="${escapeHtml(r.nombre)}">`;
      editBtn.textContent = "Guardar";
      editingInProgress++;
      editBtn.classList.remove("btn-edit-row");
      editBtn.classList.add("btn-save-row");
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn btn-small btn-ghost";
      cancelBtn.textContent = "Cancelar";
      cancelBtn.style.marginLeft = "4px";
      editBtn.after(cancelBtn);
      cancelBtn.addEventListener("click", () => { editingInProgress = Math.max(0, editingInProgress - 1); load(); });

      editBtn.addEventListener("click", async () => {
        const nuevoNumero = tr.querySelector(".edit-numero").value.trim();
        const nuevoNombre = tr.querySelector(".edit-nombre").value.trim();
        if (!nuevoNumero) { alert("El N° de alumno no puede quedar vacío."); return; }
        editBtn.disabled = true; editBtn.textContent = "Guardando…";
        try {
          const res = await apiUpdateResponse(rForm.id, originalNumero, nuevoNumero, nuevoNombre);
          if (!res.ok) throw new Error(res.error || "El servidor rechazó el cambio.");
          editingInProgress = Math.max(0, editingInProgress - 1);
          load();
        } catch (err) {
          alert(`No se pudo guardar: ${err.message || err}. Revisá que la implementación de Apps Script esté actualizada (Implementar → Nueva versión) y volvé a intentar.`);
          editBtn.disabled = false; editBtn.textContent = "Guardar";
        }
      }, { once: true });
    }, { once: true });

    tr.querySelector(".btn-delete-row").addEventListener("click", async (ev) => {
      if (!confirm(`¿Borrar la respuesta de ${r.nombre || "este alumno"} (N° ${r.numeroAlumno})? No se puede deshacer.`)) return;
      const btn = ev.currentTarget;
      btn.disabled = true; btn.textContent = "Borrando…";
      try {
        const res = await apiDeleteResponse(rForm.id, r.numeroAlumno, r.comision);
        if (!res.ok) throw new Error(res.error || "El servidor rechazó el borrado.");
        load();
      } catch (err) {
        alert(`No se pudo borrar: ${err.message || err}. Revisá que la implementación de Apps Script esté actualizada (Implementar → Nueva versión) y volvé a intentar.`);
        btn.disabled = false; btn.textContent = "Borrar";
      }
    });
  });
  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
}

document.getElementById("filter-comision").addEventListener("change", renderTable);
document.getElementById("filter-nombre").addEventListener("input", renderTable);
document.getElementById("btn-refresh").addEventListener("click", () => load(false));

setInterval(() => { if (editingInProgress === 0) load(true); }, 25000);

function plainQuestionText(label) {
  return String(label || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .trim();
}

document.getElementById("btn-export-xlsx").addEventListener("click", (ev) => {
  if (allRows.length === 0) { alert("No hay datos para exportar todavía."); return; }
  const btn = ev.currentTarget;
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = "Generando…";
  try {
    const rows = sortByComisionYNumero(allRows);
    const questions = rForm.sections.flatMap((s) => s.questions);

    const headerBase = ["N° Alumno", "Nombre", "Carrera", "Comisión", "Mail"];
    const headerQuestions = questions.map((q, i) => `P${i + 1} (${q.points} pts) - ${plainQuestionText(q.label)}`);
    const headerEnd = ["Puntaje", "Puntaje Máximo", "Nota (1-10)", "Fecha/Hora", "Cambios de pantalla"];
    const header = [...headerBase, ...headerQuestions, ...headerEnd].map((label) => xlsxCell(label, { style: xlsxHeaderStyle() }));

    const aoa = [header];
    rows.forEach((r) => {
      const answerCells = questions.map((q, i) => {
        const d = (r.detail || [])[i];
        if (!d) return xlsxCell("");
        const salida = d.cambiosPantalla ? ` [salió ${d.cambiosPantalla}x]` : "";
        return xlsxCell(`${humanizeAnswer(q, d.respuesta)} ${d.correcta ? "✓" : "✗"}${salida}`);
      });
      const aprobado = resolveColorClass(r) === "high";
      aoa.push([
        xlsxCell(r.numeroAlumno), xlsxCell(r.nombre), xlsxCell(r.carrera || ""), xlsxCell(r.comision), xlsxCell(r.mail || ""),
        ...answerCells,
        xlsxCell(r.score), xlsxCell(r.totalPoints),
        xlsxCell(resolveNota(r), { style: xlsxNotaStyle(aprobado) }),
        xlsxCell(new Date(r.fecha).toLocaleString("es-AR")),
        xlsxCell(r.tabSwitches || 0, { style: xlsxTabSwitchStyle(r.tabSwitches) }),
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
      { wch: 10 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 24 },
      ...questions.map(() => ({ wch: 32 })),
      { wch: 9 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 10 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resultados");
    XLSX.writeFile(wb, `${(rForm.title || "resultados").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.xlsx`);
  } catch (err) {
    alert("No se pudo generar el Excel (" + (err.message || err) + "). No se descargó ningún archivo.");
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
});

init();
