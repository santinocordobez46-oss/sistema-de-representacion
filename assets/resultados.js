if (!getApiUrl()) location.href = "index.html";

const rParams = new URLSearchParams(location.search);
const rFormId = rParams.get("id");
let rForm = null;
let allRows = [];
let formQuestions = [];

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
  load();
}

async function load() {
  const container = document.getElementById("results-container");
  container.innerHTML = '<p class="empty-note">Cargando respuestas…</p>';
  try {
    const res = await apiResults(rForm.id);
    if (!res.ok) throw new Error(res.error || "Error desconocido");
    allRows = res.rows || [];
    renderTable();
  } catch (err) {
    container.innerHTML = `<p class="empty-note">No se pudo conectar con la planilla (${escapeHtml(String(err.message || err))}).</p>`;
  }
}

/* Reconstruye lo que el alumno realmente eligió/escribió a partir del valor
   guardado (que viaja como JSON dentro de un string). Para opción múltiple,
   además traduce el ID interno de la opción (ej. "o_kypabvd") al texto real
   de esa opción, buscándolo en la definición del formulario. */
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

function renderTable() {
  const comFilter = document.getElementById("filter-comision").value;
  const textFilter = normalizeText(document.getElementById("filter-nombre").value);
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

  const table = document.createElement("table");
  table.className = "results-table";
  table.innerHTML = `<thead><tr>
      <th>N° Alumno</th><th>Nombre</th><th>Carrera</th><th>Comisión</th><th>Mail</th><th>Puntaje</th><th>Fecha/Hora</th><th>Cambios de pantalla</th><th>Acciones</th>
    </tr></thead>`;
  const tbody = document.createElement("tbody");
  rows.forEach((r) => {
    const pct = r.totalPoints > 0 ? r.score / r.totalPoints : 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="cell-numero">${escapeHtml(r.numeroAlumno)}</td>
      <td class="cell-nombre">${escapeHtml(r.nombre)}</td>
      <td>${escapeHtml(r.carrera || "—")}</td>
      <td>${escapeHtml(r.comision)}</td>
      <td>${escapeHtml(r.mail || "—")}</td>
      <td><span class="score-pill ${pct >= 0.6 ? "high" : "low"}">${formatNota(r.score, r.totalPoints)} <small style="opacity:.7; font-weight:400;">(${r.score}/${r.totalPoints} pts)</small></span></td>
      <td>${new Date(r.fecha).toLocaleString("es-AR")}</td>
      <td>${r.tabSwitches || 0}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-small btn-detail">Ver detalle</button>
        <button class="btn btn-small btn-edit-row">Editar N°</button>
        <button class="btn btn-small btn-danger btn-delete-row">Borrar</button>
      </td>`;
    tbody.appendChild(tr);

    const detailTr = document.createElement("tr");
    detailTr.style.display = "none";
    const detailTd = document.createElement("td");
    detailTd.colSpan = 9;
    detailTd.style.background = "#fafbfb";
    if (r.detail && r.detail.length > 0) {
      const detailTable = document.createElement("table");
      detailTable.style.cssText = "width:100%; font-size:12px;";
      detailTable.innerHTML = `<tr><th style="text-align:left;padding:4px 8px;">Pregunta</th><th style="text-align:left;padding:4px 8px;">Respuesta</th><th style="text-align:left;padding:4px 8px;">¿Correcta?</th><th style="text-align:left;padding:4px 8px;">Puntos</th></tr>` +
        r.detail.map((d, dIdx) => `<tr>
          <td style="padding:4px 8px;">${formatRichText(escapeHtml(d.pregunta || ""))}</td>
          <td style="padding:4px 8px;">${escapeHtml(humanizeAnswer(formQuestions[dIdx], d.respuesta))}</td>
          <td style="padding:4px 8px;">${d.correcta ? "✓" : "✗"}</td>
          <td style="padding:4px 8px;">${d.puntos}</td>
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
      editBtn.classList.remove("btn-edit-row");
      editBtn.classList.add("btn-save-row");
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn btn-small btn-ghost";
      cancelBtn.textContent = "Cancelar";
      cancelBtn.style.marginLeft = "4px";
      editBtn.after(cancelBtn);
      cancelBtn.addEventListener("click", () => load());

      editBtn.addEventListener("click", async () => {
        const nuevoNumero = tr.querySelector(".edit-numero").value.trim();
        const nuevoNombre = tr.querySelector(".edit-nombre").value.trim();
        if (!nuevoNumero) { alert("El N° de alumno no puede quedar vacío."); return; }
        editBtn.disabled = true; editBtn.textContent = "Guardando…";
        try {
          const res = await apiUpdateResponse(rForm.id, originalNumero, nuevoNumero, nuevoNombre);
          if (!res.ok) throw new Error(res.error || "El servidor rechazó el cambio.");
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
document.getElementById("btn-refresh").addEventListener("click", load);

/* Quita el marcado tipo markdown (**negrita**, __subrayado__, *cursiva*) para
   que el encabezado del Excel muestre el enunciado en texto plano y legible. */
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

    // Las preguntas se toman del propio formulario (no de las respuestas) para
    // asegurar el mismo orden y las mismas columnas en todas las filas, aunque
    // algún alumno tenga un detalle incompleto.
    const questions = rForm.sections.flatMap((s) => s.questions);

    const headerBase = ["N° Alumno", "Nombre", "Carrera", "Comisión", "Mail"];
    const headerQuestions = questions.map((q, i) => `P${i + 1} (${q.points} pts) - ${plainQuestionText(q.label)}`);
    const headerEnd = ["Puntaje", "Puntaje Máximo", "Nota (1-10)", "Fecha/Hora", "Cambios de pantalla"];
    const header = [...headerBase, ...headerQuestions, ...headerEnd];

    const aoa = [header];
    rows.forEach((r) => {
      const answerCells = questions.map((q, i) => {
        const d = (r.detail || [])[i];
        if (!d) return "";
        return `${humanizeAnswer(q, d.respuesta)} ${d.correcta ? "✓" : "✗"}`;
      });
      aoa.push([
        r.numeroAlumno, r.nombre, r.carrera || "", r.comision, r.mail || "",
        ...answerCells,
        r.score, r.totalPoints, scoreToNota(r.score, r.totalPoints), new Date(r.fecha).toLocaleString("es-AR"), r.tabSwitches || 0,
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
