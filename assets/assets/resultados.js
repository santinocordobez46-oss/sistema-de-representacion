const rParams = new URLSearchParams(location.search);
const rFormId = rParams.get("id");
const rForm = getForm(rFormId);
let allRows = [];

if (!rForm) {
  document.getElementById("results-container").innerHTML = '<p class="empty-note">No se encontró ese parcialito.</p>';
} else {
  document.getElementById("tb-title").textContent = rForm.title;
  document.getElementById("tb-subtitle").textContent = rForm.subtitle || "";
  const comSel = document.getElementById("filter-comision");
  (rForm.comisiones || []).forEach((c) => {
    const o = document.createElement("option"); o.value = c; o.textContent = c;
    comSel.appendChild(o);
  });
  if (rForm.sheetViewUrl) {
    const link = document.getElementById("link-sheet");
    link.href = rForm.sheetViewUrl; link.style.display = "inline-flex";
  }
  load();
}

async function load() {
  const container = document.getElementById("results-container");
  if (!rForm.sheetWebAppUrl) {
    container.innerHTML = '<p class="empty-note">Este parcialito todavía no tiene conectada la planilla de Google Sheets. Andá a Editor → "03 · Publicar / QR" y pegá la URL de Apps Script.</p>';
    document.getElementById("tb-count").textContent = "0";
    return;
  }
  container.innerHTML = '<p class="empty-note">Cargando respuestas…</p>';
  try {
    const url = `${rForm.sheetWebAppUrl}?action=results&formId=${encodeURIComponent(rForm.id)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Error desconocido");
    allRows = data.rows || [];
    renderTable();
  } catch (err) {
    container.innerHTML = `<p class="empty-note">No se pudo conectar con la planilla (${escapeHtml(String(err.message || err))}). Revisá que la URL de Apps Script esté bien pegada y que la implementación esté publicada como "Cualquier usuario".</p>`;
  }
}

function renderTable() {
  const comFilter = document.getElementById("filter-comision").value;
  const textFilter = normalizeText(document.getElementById("filter-nombre").value);
  const rows = allRows.filter((r) => {
    if (comFilter && String(r.comision).trim() !== comFilter) return false;
    if (textFilter) {
      const hay = normalizeText(r.nombre) + " " + normalizeText(r.numeroAlumno);
      if (!hay.includes(textFilter)) return false;
    }
    return true;
  }).sort((a, b) => {
    const na = parseInt(a.numeroAlumno, 10), nb = parseInt(b.numeroAlumno, 10);
    if (isNaN(na) || isNaN(nb)) return String(a.numeroAlumno).localeCompare(String(b.numeroAlumno));
    return na - nb;
  });

  document.getElementById("tb-count").textContent = rows.length;
  const container = document.getElementById("results-container");
  if (rows.length === 0) {
    container.innerHTML = '<p class="empty-note">Todavía no hay respuestas para mostrar con estos filtros.</p>';
    return;
  }

  const table = document.createElement("table");
  table.className = "results-table";
  table.innerHTML = `<thead><tr>
      <th>N° Alumno</th><th>Nombre</th><th>Comisión</th><th>Puntaje</th><th>Fecha/Hora</th><th>Cambios de pantalla</th>
    </tr></thead>`;
  const tbody = document.createElement("tbody");
  rows.forEach((r) => {
    const pct = r.totalPoints > 0 ? r.score / r.totalPoints : 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.numeroAlumno)}</td>
      <td>${escapeHtml(r.nombre)}</td>
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
  const rows = [...allRows].sort((a, b) => {
    const na = parseInt(a.numeroAlumno, 10), nb = parseInt(b.numeroAlumno, 10);
    if (isNaN(na) || isNaN(nb)) return String(a.numeroAlumno).localeCompare(String(b.numeroAlumno));
    return na - nb;
  });
  const data = rows.map((r) => ({
    "N° Alumno": r.numeroAlumno, "Nombre": r.nombre, "Comisión": r.comision,
    "Puntaje": r.score, "Puntaje Máximo": r.totalPoints,
    "Fecha/Hora": new Date(r.fecha).toLocaleString("es-AR"),
    "Cambios de pantalla": r.tabSwitches || 0,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resultados");
  XLSX.writeFile(wb, `${(rForm.title || "resultados").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.xlsx`);
});
