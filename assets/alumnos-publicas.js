const qp = new URLSearchParams(location.search);
const publicApiUrl = qp.get("api") ? decodeURIComponent(qp.get("api")) : "";

let alumnosData = [];
let sortState = { key: "apellido", dir: 1 };

async function load(silent) {
  const container = document.getElementById("alumnos-container");
  if (!publicApiUrl) {
    container.innerHTML = '<div class="empty-note">Este enlace no es válido. Pedile al profesor el link generado desde "Números de alumno".</div>';
    document.getElementById("filter-carrera").style.display = "none";
    document.getElementById("filter-comision").style.display = "none";
    document.getElementById("filter-texto").style.display = "none";
    return;
  }
  if (!silent) container.innerHTML = '<p class="empty-note">Cargando…</p>';
  try {
    const res = await apiListAlumnosPublic(publicApiUrl);
    if (!res.ok) throw new Error(res.error || "Error desconocido");
    alumnosData = res.alumnos || [];
    populateFilters();
    renderTable();
  } catch (err) {
    if (!silent) container.innerHTML = `<p class="empty-note">No se pudo conectar con la planilla (${escapeHtml(String(err.message || err))}).</p>`;
  }
}

function populateFilters() {
  const selCarrera = document.getElementById("filter-carrera");
  const selComision = document.getElementById("filter-comision");
  const curCarrera = selCarrera.value, curComision = selComision.value;

  const carreras = Array.from(new Set(alumnosData.map((a) => a.carrera).filter(Boolean))).sort();
  const seenC = new Set(Array.from(selCarrera.options).map((o) => o.value));
  carreras.forEach((c) => { if (!seenC.has(c)) { const o = document.createElement("option"); o.value = c; o.textContent = c; selCarrera.appendChild(o); } });
  selCarrera.value = curCarrera;

  const comisiones = Array.from(new Set(alumnosData.map((a) => a.comision).filter(Boolean))).sort();
  const seenCom = new Set(Array.from(selComision.options).map((o) => o.value));
  comisiones.forEach((c) => { if (!seenCom.has(c)) { const o = document.createElement("option"); o.value = c; o.textContent = c; selComision.appendChild(o); } });
  selComision.value = curComision;
}

function comparator(key) {
  if (key === "numero") {
    return (a, b) => {
      const na = parseInt(a.numeroAlumno, 10), nb = parseInt(b.numeroAlumno, 10);
      if (isNaN(na) || isNaN(nb)) return String(a.numeroAlumno).localeCompare(String(b.numeroAlumno));
      return na - nb;
    };
  }
  return (a, b) => normalizeText(a[key] || "").localeCompare(normalizeText(b[key] || ""), "es");
}

function renderTable() {
  const carreraFilter = document.getElementById("filter-carrera").value;
  const comisionFilter = document.getElementById("filter-comision").value;
  const textFilter = normalizeText(document.getElementById("filter-texto").value);

  let alumnos = alumnosData.filter((a) => {
    if (carreraFilter && a.carrera !== carreraFilter) return false;
    if (comisionFilter && a.comision !== comisionFilter) return false;
    if (textFilter) {
      const hay = normalizeText(a.numeroAlumno + " " + a.apellido + " " + a.nombres);
      if (!hay.includes(textFilter)) return false;
    }
    return true;
  });

  const cmp = comparator(sortState.key);
  alumnos = alumnos.slice().sort((a, b) => sortState.dir * cmp(a, b));

  document.getElementById("tb-count").textContent = alumnos.length;
  const container = document.getElementById("alumnos-container");
  if (alumnos.length === 0) {
    container.innerHTML = '<p class="empty-note">No hay resultados con esa búsqueda.</p>';
    return;
  }

  const arrow = (key) => (sortState.key === key ? `<span class="sort-arrow">${sortState.dir === 1 ? "▲" : "▼"}</span>` : "");
  const table = document.createElement("table");
  table.className = "results-table";
  table.innerHTML = `<thead><tr>
      <th class="sortable" data-key="numero">N° Alumno${arrow("numero")}</th>
      <th class="sortable" data-key="apellido">Apellido${arrow("apellido")}</th>
      <th class="sortable" data-key="nombres">Nombres${arrow("nombres")}</th>
      <th class="sortable" data-key="condicion">Condición${arrow("condicion")}</th>
      <th>Carrera</th>
      <th>Comisión</th>
    </tr></thead>`;
  const tbody = document.createElement("tbody");
  alumnos.forEach((a) => {
    const sinNumero = !a.numeroAlumno || a.numeroAlumno.trim() === "000" || isNaN(parseInt(a.numeroAlumno, 10));
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="tag-pill ${sinNumero ? "low" : ""}">${escapeHtml(a.numeroAlumno)}</span></td>
      <td>${escapeHtml(a.apellido)}</td>
      <td>${escapeHtml(a.nombres)}</td>
      <td><span class="tag-pill ${normalizeText(a.condicion).includes("recursante") ? "recursante" : "primer"}">${escapeHtml(a.condicion || "—")}</span></td>
      <td>${escapeHtml(a.carrera || "—")}</td>
      <td>${escapeHtml(a.comision || "—")}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);

  table.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (sortState.key === key) sortState.dir *= -1;
      else sortState = { key, dir: 1 };
      renderTable();
    });
  });
}

document.getElementById("filter-carrera").addEventListener("change", renderTable);
document.getElementById("filter-comision").addEventListener("change", renderTable);
document.getElementById("filter-texto").addEventListener("input", renderTable);

setInterval(() => load(true), 30000);

load();
