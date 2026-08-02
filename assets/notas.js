if (!getApiUrl()) location.href = "index.html";

let notasData = null; // { students, forms }

async function load() {
  const container = document.getElementById("notas-container");
  container.innerHTML = '<p class="empty-note">Cargando…</p>';
  try {
    const res = await apiNotas();
    if (!res.ok) throw new Error(res.error || "Error desconocido");
    notasData = res;
    populateComisionFilter();
    renderTable();
  } catch (err) {
    container.innerHTML = `<p class="empty-note">No se pudo conectar con la planilla (${escapeHtml(String(err.message || err))}).</p>`;
  }
}

function populateComisionFilter() {
  const sel = document.getElementById("filter-comision");
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

function renderTable() {
  const comFilter = document.getElementById("filter-comision").value;
  const textFilter = normalizeText(document.getElementById("filter-nombre").value);
  const forms = notasData.forms;
  const students = sortByComisionYNumero(notasData.students.filter((s) => {
    if (comFilter && s.comision !== comFilter) return false;
    if (textFilter) {
      const hay = normalizeText(s.nombre) + " " + normalizeText(s.numeroAlumno);
      if (!hay.includes(textFilter)) return false;
    }
    return true;
  }));

  document.getElementById("tb-count").textContent = students.length;
  const container = document.getElementById("notas-container");
  if (students.length === 0) {
    container.innerHTML = '<p class="empty-note">Todavía no hay respuestas registradas con estos filtros.</p>';
    return;
  }

  const table = document.createElement("table");
  table.className = "results-table";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>
      <th>N° Alumno</th><th>Nombre</th><th>Carrera</th><th>Comisión</th>
      ${forms.map((f) => `<th>${escapeHtml(f.title)}</th>`).join("")}
      <th>Total</th><th>Acciones</th>
    </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  students.forEach((s) => {
    let sumScore = 0, sumMax = 0;
    const cells = forms.map((f) => {
      const p = s.parciales[f.id];
      if (!p) return `<td style="color:var(--muted);">—</td>`;
      sumScore += Number(p.score) || 0; sumMax += Number(p.totalPoints) || 0;
      const pct = p.totalPoints > 0 ? p.score / p.totalPoints : 0;
      return `<td><span class="score-pill ${pct >= 0.6 ? "high" : "low"}">${p.score}/${p.totalPoints}</span></td>`;
    }).join("");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(s.numeroAlumno)}</td>
      <td>${escapeHtml(s.nombre)}</td>
      <td>${escapeHtml(s.carrera || "—")}</td>
      <td>${escapeHtml(s.comision)}</td>
      ${cells}
      <td><b>${sumScore} / ${sumMax}</b></td>
      <td><button class="btn btn-small btn-danger btn-delete-student">Borrar alumno</button></td>`;
    tbody.appendChild(tr);

    tr.querySelector(".btn-delete-student").addEventListener("click", async (ev) => {
      if (!confirm(`¿Borrar TODO el historial de ${s.nombre || "este alumno"} (N° ${s.numeroAlumno})? Esto borra sus respuestas en todos los parcialitos y no se puede deshacer.`)) return;
      const btn = ev.currentTarget;
      btn.disabled = true; btn.textContent = "Borrando…";
      try {
        const res = await apiDeleteStudent(s.numeroAlumno);
        if (!res.ok) throw new Error(res.error || "El servidor rechazó el borrado.");
        load();
      } catch (err) {
        alert(`No se pudo borrar: ${err.message || err}. Revisá que la implementación de Apps Script esté actualizada (Implementar → Nueva versión) y volvé a intentar.`);
        btn.disabled = false; btn.textContent = "Borrar alumno";
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

document.getElementById("btn-export-xlsx").addEventListener("click", () => {
  if (!notasData || notasData.students.length === 0) { alert("No hay datos para exportar todavía."); return; }
  const forms = notasData.forms;
  const data = sortByComisionYNumero(notasData.students).map((s) => {
    const row = { "N° Alumno": s.numeroAlumno, "Nombre": s.nombre, "Carrera": s.carrera || "", "Comisión": s.comision };
    let sumScore = 0, sumMax = 0;
    forms.forEach((f) => {
      const p = s.parciales[f.id];
      row[f.title] = p ? `${p.score}/${p.totalPoints}` : "—";
      if (p) { sumScore += Number(p.score) || 0; sumMax += Number(p.totalPoints) || 0; }
    });
    row["Total"] = `${sumScore}/${sumMax}`;
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Libro de notas");
  XLSX.writeFile(wb, "libro-de-notas.xlsx");
});

load();
