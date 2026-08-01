if (!getApiUrl()) location.href = "index.html";

const rParams = new URLSearchParams(location.search);
const rFormId = rParams.get("id");
let rForm = null;
let allRows = [];

async function init() {
  const container = document.getElementById("results-container");
  try {
    const res = await apiGetForm(rFormId);
    if (!res.ok) throw new Error(res.error);
    rForm = res.form;
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
      <th>N° Alumno</th><th>Nombre</th><th>Carrera</th><th>Comisión</th><th>Puntaje</th><th>Fecha/Hora</th><th>Cambios de pantalla</th>
    </tr></thead>`;
  const tbody = document.createElement("tbody");
  rows.forEach((r) => {
    const pct = r.totalPoints > 0 ? r.score / r.totalPoints : 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.numeroAlumno)}</td>
      <td>${escapeHtml(r.nombre)}</td>
      <td>${escapeHtml(r.carrera || "—")}</td>
      <td>${escapeHtml(r.comision)}</td>
      <td><span class="score-pill ${pct >= 0.6 ? "high" : "low"}">${r.score} / ${r.totalPoints}</span></td>
      <td>${new Date(r.fecha).toLocaleString("es-AR")}</td>
      <td>${r.tabSwitches || 0}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
}

document.getElementById("filter-comision").addEventListener("change", renderTable);
document.getElementById("filter-nombre").addEventListener("input", renderTable);
document.getElementById("btn-refresh").addEventListener("click", load);

document.getElementById("btn-export-xlsx").addEventListener("click", () => {
  if (allRows.length === 0) { alert("No hay datos para exportar todavía."); return; }
  const rows = sortByComisionYNumero(allRows);
  const data = rows.map((r) => ({
    "N° Alumno": r.numeroAlumno, "Nombre": r.nombre, "Carrera": r.carrera || "", "Comisión": r.comision,
    "Puntaje": r.score, "Puntaje Máximo": r.totalPoints,
    "Fecha/Hora": new Date(r.fecha).toLocaleString("es-AR"),
    "Cambios de pantalla": r.tabSwitches || 0,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resultados");
  XLSX.writeFile(wb, `${(rForm.title || "resultados").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.xlsx`);
});

init();
