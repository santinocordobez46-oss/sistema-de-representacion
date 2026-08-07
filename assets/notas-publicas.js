const qp = new URLSearchParams(location.search);
const publicApiUrl = qp.get("api") ? decodeURIComponent(qp.get("api")) : "";
const fixedComision = qp.get("comision") ? decodeURIComponent(qp.get("comision")) : "";

let notasData = null;
let sortState = { key: "comision", dir: 1 };

async function load(silent) {
  const container = document.getElementById("notas-container");
  if (!publicApiUrl) {
    container.innerHTML = '<div class="empty-note">Este enlace no es válido. Pedile al profesor el link/QR generado desde "Libro de notas".</div>';
    document.getElementById("filter-comision").style.display = "none";
    document.getElementById("filter-nombre").style.display = "none";
    document.getElementById("btn-refresh").style.display = "none";
    return;
  }
  if (!silent) container.innerHTML = '<p class="empty-note">Cargando…</p>';
  try {
    const res = await apiNotasPublic(publicApiUrl);
    if (!res.ok) throw new Error(res.error || "Error desconocido");
    notasData = res;
    populateComisionFilter();
    renderTable();
  } catch (err) {
    if (!silent) container.innerHTML = `<p class="empty-note">No se pudo conectar con la planilla (${escapeHtml(String(err.message || err))}).</p>`;
  }
}

function populateComisionFilter() {
  const sel = document.getElementById("filter-comision");
  if (fixedComision) {
    sel.innerHTML = `<option value="${escapeHtml(fixedComision)}">${escapeHtml(fixedComision)}</option>`;
    sel.value = fixedComision;
    sel.disabled = true;
    return;
  }
  const current = sel.value;
  const seen = new Set(Array.from(sel.options).map((o) => o.value));
  const comisiones = new Set(notasData.students.map((s) => s.comision));
  comisiones.forEach((c) => {
    if (!seen.has(c)) {
      const o = document.createElement("option"); o.value = c; o.textContent = c;
      sel.appendChild(o);
    }
  });
  sel.value = current;
}

function notaDe(student, formId) {
  const p = student.parciales[formId];
  return p ? resolveNota(p) : -1;
}
function totalDe(student, forms) {
  let sumScore = 0, sumMax = 0;
  forms.forEach((f) => {
    const p = student.parciales[f.id];
    if (p) { sumScore += Number(p.score) || 0; sumMax += Number(p.totalPoints) || 0; }
  });
  return { sumScore, sumMax, nota: scoreToNota(sumScore, sumMax) };
}

function comparator(key) {
  if (key === "numero") {
    return (a, b) => {
      const na = parseInt(a.numeroAlumno, 10), nb = parseInt(b.numeroAlumno, 10);
      if (isNaN(na) || isNaN(nb)) return String(a.numeroAlumno).localeCompare(String(b.numeroAlumno));
      return na - nb;
    };
  }
  if (key === "nombre" || key === "comision") {
    return (a, b) => normalizeText(a[key]).localeCompare(normalizeText(b[key]), "es");
  }
  if (key === "total") {
    return (a, b) => totalDe(a, notasData.forms).nota - totalDe(b, notasData.forms).nota;
  }
  return (a, b) => notaDe(a, key) - notaDe(b, key);
}

function renderTable() {
  const comFilter = fixedComision || document.getElementById("filter-comision").value;
  const textFilter = normalizeText(document.getElementById("filter-nombre").value);
  const forms = notasData.forms;
  let students = notasData.students.filter((s) => {
    if (comFilter && s.comision !== comFilter) return false;
    if (textFilter) {
      const hay = normalizeText(s.nombre) + " " + normalizeText(s.numeroAlumno);
      if (!hay.includes(textFilter)) return false;
    }
    return true;
  });

  const cmp = comparator(sortState.key);
  students = students.slice().sort((a, b) => sortState.dir * cmp(a, b));

  document.getElementById("tb-count").textContent = students.length;
  const container = document.getElementById("notas-container");
  if (students.length === 0) {
    container.innerHTML = '<p class="empty-note">Todavía no hay notas cargadas con estos filtros.</p>';
    return;
  }

  const arrow = (key) => (sortState.key === key ? `<span class="sort-arrow">${sortState.dir === 1 ? "▲" : "▼"}</span>` : "");
  const table = document.createElement("table");
  table.className = "results-table";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>
      <th class="sortable" data-key="numero">N° Alumno${arrow("numero")}</th>
      <th class="sortable" data-key="nombre">Nombre${arrow("nombre")}</th>
      <th>Carrera</th>
      <th class="sortable" data-key="comision">Comisión${arrow("comision")}</th>
      ${forms.map((f) => `<th class="sortable" data-key="${escapeHtml(f.id)}">${escapeHtml(f.title)}${arrow(f.id)}</th>`).join("")}
      <th class="sortable" data-key="total">Total${arrow("total")}</th>
    </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  students.forEach((s) => {
    const cells = forms.map((f) => {
      const p = s.parciales[f.id];
      if (!p) return `<td style="color:var(--muted);">—</td>`;
      return `<td><span class="score-pill ${resolveColorClass(p)}">${formatResolvedNota(p)}</span></td>`;
    }).join("");
    const { sumScore, sumMax } = totalDe(s, forms);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(s.numeroAlumno)}</td>
      <td>${escapeHtml(s.nombre)}</td>
      <td>${escapeHtml(s.carrera || "—")}</td>
      <td>${escapeHtml(s.comision)}</td>
      ${cells}
      <td><span class="score-pill ${resolveColorClass({ score: sumScore, totalPoints: sumMax })}"><b>${formatNota(sumScore, sumMax)}</b></span></td>`;
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

document.getElementById("filter-comision").addEventListener("change", renderTable);
document.getElementById("filter-nombre").addEventListener("input", renderTable);
document.getElementById("btn-refresh").addEventListener("click", () => load(false));

setInterval(() => load(true), 25000);

load();
