let alumnosData = [];
let comisionesConocidas = new Set();
let sortState = { key: "apellido", dir: 1 };

async function init() {
  if (!getApiUrl()) { location.href = "index.html"; return; }
  await load();
}

function showConfig(errorMsg) {
  document.getElementById("config-view").style.display = "block";
  document.getElementById("alumnos-view").style.display = "none";
  if (errorMsg) {
    const el = document.getElementById("config-error");
    el.style.display = "block"; el.textContent = errorMsg;
  } else {
    document.getElementById("config-error").style.display = "none";
  }
}

async function load(silent) {
  if (!silent) {
    document.getElementById("config-view").style.display = "none";
    document.getElementById("alumnos-view").style.display = "block";
    document.getElementById("alumnos-container").innerHTML = '<p class="empty-note">Cargando…</p>';
  }
  try {
    const res = await apiListAlumnos();
    if (!res.ok) {
      if (res.needsConfig) { showConfig(silent ? null : res.error); return; }
      throw new Error(res.error || "Error desconocido");
    }
    alumnosData = res.alumnos || [];
    document.getElementById("config-view").style.display = "none";
    document.getElementById("alumnos-view").style.display = "block";
    populateFilters();
    renderTable();
  } catch (err) {
    if (!silent) {
      document.getElementById("alumnos-container").innerHTML =
        `<p class="empty-note">No se pudo cargar la lista (${escapeHtml(String(err.message || err))}).</p>`;
    }
  }
}

function populateFilters() {
  const selCarrera = document.getElementById("filter-carrera");
  const selComision = document.getElementById("filter-comision");
  const curCarrera = selCarrera.value, curComision = selComision.value;

  const carreras = Array.from(new Set(alumnosData.map((a) => a.carrera).filter(Boolean))).sort();
  selCarrera.innerHTML = '<option value="">Todas las carreras</option>' +
    carreras.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  selCarrera.value = curCarrera;

  comisionesConocidas = new Set(alumnosData.map((a) => a.comision).filter(Boolean));
  const comisiones = Array.from(comisionesConocidas).sort();
  selComision.innerHTML = '<option value="">Todas las comisiones</option><option value="__sin__">Sin comisión asignada</option>' +
    comisiones.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  selComision.value = curComision;
}

function normalizarAlumno(s) { return normalizeText(s); }

function comparator(key) {
  if (key === "numero") {
    return (a, b) => {
      const na = parseInt(a.numeroAlumno, 10), nb = parseInt(b.numeroAlumno, 10);
      if (isNaN(na) || isNaN(nb)) return String(a.numeroAlumno).localeCompare(String(b.numeroAlumno));
      return na - nb;
    };
  }
  return (a, b) => normalizarAlumno(a[key] || "").localeCompare(normalizarAlumno(b[key] || ""), "es");
}

function renderTable() {
  const carreraFilter = document.getElementById("filter-carrera").value;
  const comisionFilter = document.getElementById("filter-comision").value;
  const condicionFilter = document.getElementById("filter-condicion").value;
  const textFilter = normalizarAlumno(document.getElementById("filter-texto").value);

  let alumnos = alumnosData.filter((a) => {
    if (carreraFilter && a.carrera !== carreraFilter) return false;
    if (comisionFilter === "__sin__" && a.comision) return false;
    if (comisionFilter && comisionFilter !== "__sin__" && a.comision !== comisionFilter) return false;
    if (condicionFilter && normalizarAlumno(a.condicion) !== normalizarAlumno(condicionFilter)) return false;
    if (textFilter) {
      const hay = normalizarAlumno(a.numeroAlumno + " " + a.apellido + " " + a.nombres);
      if (!hay.includes(textFilter)) return false;
    }
    return true;
  });

  const cmp = comparator(sortState.key);
  alumnos = alumnos.slice().sort((a, b) => sortState.dir * cmp(a, b));

  document.getElementById("tb-count").textContent = alumnos.length;
  const container = document.getElementById("alumnos-container");
  if (alumnos.length === 0) {
    container.innerHTML = '<p class="empty-note">No hay alumnos que coincidan con estos filtros.</p>';
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
      <th class="sortable" data-key="carrera">Carrera${arrow("carrera")}</th>
      <th>Comisión</th>
    </tr></thead>`;
  const tbody = document.createElement("tbody");
  alumnos.forEach((a) => {
    const sinNumero = !a.numeroAlumno || a.numeroAlumno.trim() === "000" || isNaN(parseInt(a.numeroAlumno, 10));
    const tr = document.createElement("tr");
    const origenTag = a.comisionOrigen === "parcialito"
      ? '<span class="tag-pill primer" style="margin-left:6px;" title="Tomada de un parcialito ya rendido">✓ auto</span>'
      : (a.comisionOrigen === "manual" ? '<span class="tag-pill" style="margin-left:6px; background:var(--line); color:var(--muted);" title="Asignada a mano, todavía no rindió nada">manual</span>' : "");
    tr.innerHTML = `
      <td class="${sinNumero ? "tag-pill low" : ""}" style="${sinNumero ? "display:table-cell;" : ""}">${escapeHtml(a.numeroAlumno)}</td>
      <td>${escapeHtml(a.apellido)}</td>
      <td>${escapeHtml(a.nombres)}</td>
      <td><span class="tag-pill ${normalizarAlumno(a.condicion).includes("recursante") ? "recursante" : "primer"}">${escapeHtml(a.condicion || "—")}</span></td>
      <td>${escapeHtml(a.carrera || "—")}</td>
      <td>
        <div style="display:flex; align-items:center;">
          <input type="text" class="input-comision" value="${escapeHtml(a.comision || "")}" placeholder="Sin asignar" list="lista-comisiones" ${a.comisionOrigen === "parcialito" ? 'title="Ya la tomó del parcialito rendido — podés sobreescribirla igual si hace falta"' : ""}>
          ${origenTag}
        </div>
      </td>`;
    const input = tr.querySelector(".input-comision");
    input.addEventListener("change", async () => {
      const nuevaComision = input.value.trim();
      input.disabled = true;
      const res = await apiSetComisionAlumno(a.numeroAlumno, nuevaComision);
      input.disabled = false;
      if (!res.ok) { alert("No se pudo guardar: " + (res.error || "error desconocido")); return; }
      a.comision = nuevaComision;
      if (nuevaComision) comisionesConocidas.add(nuevaComision);
      populateFilters();
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.innerHTML = "";

  const datalist = document.createElement("datalist");
  datalist.id = "lista-comisiones";
  datalist.innerHTML = Array.from(comisionesConocidas).map((c) => `<option value="${escapeHtml(c)}">`).join("");
  container.appendChild(datalist);
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
document.getElementById("filter-condicion").addEventListener("change", renderTable);
document.getElementById("filter-texto").addEventListener("input", renderTable);
document.getElementById("btn-refresh").addEventListener("click", () => load(false));
document.getElementById("btn-change-config").addEventListener("click", () => showConfig());

document.getElementById("btn-save-config").addEventListener("click", async () => {
  const sheetId = document.getElementById("config-sheet-id").value.trim();
  const tabName = document.getElementById("config-tab-name").value.trim();
  if (!sheetId) return;
  const btn = document.getElementById("btn-save-config");
  btn.textContent = "Conectando…"; btn.disabled = true;
  try {
    const res = await apiSetAlumnosConfig(sheetId, tabName);
    if (!res.ok) throw new Error(res.error || "No se pudo guardar la configuración.");
    await load(false);
  } catch (err) {
    showConfig(String(err.message || err));
  } finally {
    btn.textContent = "Conectar y continuar"; btn.disabled = false;
  }
});

document.getElementById("btn-share-public").addEventListener("click", () => {
  const box = document.getElementById("public-share-card");
  if (box.style.display !== "none") { box.style.display = "none"; return; }
  if (box.childElementCount === 0) {
    const baseUrl = location.href.replace(/alumnos\.html.*$/, "");
    const shareUrl = `${baseUrl}alumnos-publicas.html?api=${encodeURIComponent(getApiUrl())}`;
    const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(shareUrl)}`;
    const card = document.createElement("div");
    card.className = "qr-card qr-card--solo";
    card.innerHTML = `
      <span class="qr-card__com">Buscador de N° de alumno para alumnos</span>
      <img src="${qrImgUrl}" width="180" height="180" alt="QR alumnos" loading="lazy"
           onerror="this.replaceWith(Object.assign(document.createElement('p'),{className:'empty-note',textContent:'No se pudo generar la imagen del QR (revisá tu conexión) — usá el enlace de abajo.'}))">
      <div class="share-url-row">
        <input type="text" readonly value="${escapeHtml(shareUrl)}">
        <button class="btn btn-small btn-copy">Copiar</button>
      </div>
      <p class="hint" style="font-size:11px;color:var(--muted);margin:0;">
        Este es el link que va en Notion (o donde quieras). Es siempre el
        mismo — no hace falta volver a generarlo cuando se sumen alumnos
        nuevos al formulario de inscripción.
      </p>`;
    card.querySelector(".btn-copy").addEventListener("click", () => {
      const inp = card.querySelector('input[type="text"][readonly]');
      inp.select(); document.execCommand("copy");
    });
    box.appendChild(card);
  }
  box.style.display = "block";
});

setInterval(() => load(true), 30000);

init();
