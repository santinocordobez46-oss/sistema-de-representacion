if (!getApiUrl()) location.href = "index.html";

let notasData = null;
let editingInProgress = 0;

async function load(silent) {
  const container = document.getElementById("notas-container");
  if (!silent) container.innerHTML = '<p class="empty-note">Cargando…</p>';
  try {
    const res = await apiNotas();
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

function buildNotaCell(p, formId, numeroAlumno) {
  const td = document.createElement("td");
  if (!p) { td.style.color = "var(--muted)"; td.textContent = "—"; return td; }

  if (isAttendanceOnly(p)) {
    const pill = document.createElement("span");
    pill.className = "score-pill high";
    pill.title = "Confirmó asistencia — no rindió este parcialito";
    td.appendChild(pill);
    return td;
  }

  const pill = document.createElement("span");
  pill.className = `score-pill ${resolveColorClass(p)}`;
  pill.style.cursor = "pointer";
  pill.title = "Clic para forzar verde/rojo, o volver a automático";
  pill.textContent = formatResolvedNota(p);
  td.appendChild(pill);

  pill.addEventListener("click", () => {
    editingInProgress++;
    const sel = document.createElement("select");
    sel.style.cssText = "font-size:11px; padding:2px 4px; max-width:150px;";
    [["", "Automático (según puntaje)"], ["verde", "Forzar verde"], ["rojo", "Forzar rojo"]].forEach(([val, label]) => {
      const opt = document.createElement("option"); opt.value = val; opt.textContent = label;
      if (val === (p.colorManual || "")) opt.selected = true;
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
        const res = await apiSetResponseColor(formId, numeroAlumno, sel.value);
        if (!res.ok) throw new Error(res.error || "El servidor rechazó el cambio.");
        p.colorManual = sel.value;
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

  const initialsMap = computeFormInitialsMap(forms);
  const table = document.createElement("table");
  table.className = "results-table sticky-head";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>
      <th>N° Alumno</th><th>Nombre</th><th>Carrera</th><th>Comisión</th><th>Mail</th>
      ${forms.map((f) => `<th title="${escapeHtml(f.title)}">${escapeHtml(initialsMap[f.id])}</th>`).join("")}
      <th>Total</th><th>Faltas</th><th>Cambios pantalla (total)</th><th>Acciones</th>
    </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  students.forEach((s) => {
    const tr = document.createElement("tr");

    const tdNumero = document.createElement("td"); tdNumero.className = "cell-numero"; tdNumero.textContent = s.numeroAlumno;
    const tdNombre = document.createElement("td"); tdNombre.className = "cell-nombre"; tdNombre.textContent = s.nombre;
    const tdCarrera = document.createElement("td"); tdCarrera.textContent = s.carrera || "—";
    const tdComision = document.createElement("td"); tdComision.textContent = s.comision;
    const tdMail = document.createElement("td"); tdMail.className = "cell-mail"; tdMail.textContent = s.mail || "—";
    tr.appendChild(tdNumero); tr.appendChild(tdNombre); tr.appendChild(tdCarrera); tr.appendChild(tdComision); tr.appendChild(tdMail);

    let sumScore = 0, sumMax = 0, sumTabSwitches = 0, rendidos = 0;
    forms.forEach((f) => {
      const p = s.parciales[f.id];
      if (p) { sumScore += Number(p.score) || 0; sumMax += Number(p.totalPoints) || 0; sumTabSwitches += Number(p.tabSwitches) || 0; rendidos++; }
      tr.appendChild(buildNotaCell(p, f.id, s.numeroAlumno));
    });

    const tdTotal = document.createElement("td");
    const totalPill = document.createElement("span");
    totalPill.className = `score-pill ${resolveColorClass({ score: sumScore, totalPoints: sumMax })}`;
    totalPill.innerHTML = `<b>${formatNota(sumScore, sumMax)}</b>`;
    tdTotal.appendChild(totalPill);
    tr.appendChild(tdTotal);

    const faltas = forms.length - rendidos;
    const tdFaltas = document.createElement("td");
    const fInfo = faltasInfo(faltas, forms.length);
    tdFaltas.innerHTML = `<span class="${fInfo.className}" title="${escapeHtml(fInfo.label)} — ${faltas} de ${forms.length} parcialitos">${faltas}</span>`;
    tr.appendChild(tdFaltas);

    const tdTabSwitches = document.createElement("td");
    const tabInfo = tabSwitchInfo(sumTabSwitches);
    tdTabSwitches.innerHTML = `<span class="${tabInfo.className}" title="${escapeHtml(tabInfo.label)}">${sumTabSwitches}</span>`;
    tr.appendChild(tdTabSwitches);

    const tdActions = document.createElement("td");
    tdActions.style.whiteSpace = "nowrap";
    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-small"; editBtn.textContent = "Editar alumno";
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-small btn-danger"; delBtn.style.marginLeft = "4px";
    delBtn.textContent = "Borrar alumno";
    tdActions.appendChild(editBtn); tdActions.appendChild(delBtn);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);

    editBtn.addEventListener("click", () => {
      const originalNumero = s.numeroAlumno, originalNombre = s.nombre, originalMail = s.mail || "";
      tdNumero.innerHTML = `<input type="text" class="edit-numero" style="width:70px;" value="${escapeHtml(originalNumero)}">`;
      tdNombre.innerHTML = `<input type="text" class="edit-nombre" style="width:140px;" value="${escapeHtml(originalNombre)}">`;
      tdMail.innerHTML = `<input type="email" class="edit-mail" style="width:150px;" value="${escapeHtml(originalMail)}">`;
      editBtn.textContent = "Guardar";
      editingInProgress++;
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn btn-small btn-ghost"; cancelBtn.style.marginLeft = "4px";
      cancelBtn.textContent = "Cancelar";
      editBtn.after(cancelBtn);
      cancelBtn.addEventListener("click", () => { editingInProgress = Math.max(0, editingInProgress - 1); renderTable(); }, { once: true });

      editBtn.addEventListener("click", async () => {
        const nuevoNumero = tr.querySelector(".edit-numero").value.trim();
        const nuevoNombre = tr.querySelector(".edit-nombre").value.trim();
        const nuevoMail = tr.querySelector(".edit-mail").value.trim();
        if (!nuevoNumero) { alert("El N° de alumno no puede quedar vacío."); return; }
        editBtn.disabled = true; editBtn.textContent = "Guardando…";
        try {
          const res = await apiUpdateStudentInfo(originalNumero, nuevoNumero, nuevoNombre, nuevoMail);
          if (!res.ok) throw new Error(res.error || "El servidor rechazó el cambio.");
          editingInProgress = Math.max(0, editingInProgress - 1);
          load();
        } catch (err) {
          alert(`No se pudo guardar: ${err.message || err}. Revisá que la implementación de Apps Script esté actualizada (Implementar → Nueva versión) y volvé a intentar.`);
          editBtn.disabled = false; editBtn.textContent = "Guardar";
        }
      }, { once: true });
    }, { once: true });

    delBtn.addEventListener("click", async (ev) => {
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
document.getElementById("btn-refresh").addEventListener("click", () => load(false));

document.getElementById("btn-export-xlsx").addEventListener("click", () => {
  if (!notasData || notasData.students.length === 0) { alert("No hay datos para exportar todavía."); return; }
  const forms = notasData.forms;
  const students = sortByComisionYNumero(notasData.students);

  const headerLabels = ["N° Alumno", "Nombre", "Carrera", "Comisión", "Mail", ...forms.map((f) => f.title), "Nota Total", "Faltas", "Cambios de pantalla (total)"];
  const aoa = [headerLabels.map((label) => xlsxCell(label, { style: xlsxHeaderStyle() }))];

  students.forEach((s) => {
    let sumScore = 0, sumMax = 0, sumTabSwitches = 0, rendidos = 0;
    const notaCells = forms.map((f) => {
      const p = s.parciales[f.id];
      if (!p) return xlsxCell("—");
      rendidos++;
      if (isAttendanceOnly(p)) return xlsxCell("", { style: xlsxNotaStyle(true) });
      sumScore += Number(p.score) || 0; sumMax += Number(p.totalPoints) || 0; sumTabSwitches += Number(p.tabSwitches) || 0;
      return xlsxCell(resolveNota(p), { style: xlsxNotaStyle(resolveColorClass(p) === "high") });
    });
    const faltas = forms.length - rendidos;
    const totalNota = scoreToNota(sumScore, sumMax);
    const totalAprobado = resolveColorClass({ score: sumScore, totalPoints: sumMax }) === "high";

    aoa.push([
      xlsxCell(s.numeroAlumno), xlsxCell(s.nombre), xlsxCell(s.carrera || ""), xlsxCell(s.comision), xlsxCell(s.mail || ""),
      ...notaCells,
      xlsxCell(totalNota, { style: xlsxNotaStyle(totalAprobado) }),
      xlsxCell(faltas, { style: xlsxFaltasStyle(faltas, forms.length) }),
      xlsxCell(sumTabSwitches, { style: xlsxTabSwitchStyle(sumTabSwitches) }),
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 10 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 24 },
    ...forms.map(() => ({ wch: 10 })),
    { wch: 10 }, { wch: 8 }, { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Libro de notas");
  XLSX.writeFile(wb, "libro-de-notas.xlsx");
});

document.getElementById("btn-share-public").addEventListener("click", () => {
  const box = document.getElementById("public-share-card");
  if (box.style.display !== "none") { box.style.display = "none"; return; }
  if (box.childElementCount === 0) {
    const baseUrl = location.href.replace(/notas\.html.*$/, "");
    const shareUrl = `${baseUrl}notas-publicas.html?api=${encodeURIComponent(getApiUrl())}`;
    const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(shareUrl)}`;
    const card = document.createElement("div");
    card.className = "qr-card qr-card--solo";
    card.innerHTML = `
      <span class="qr-card__com">Vista de notas para alumnos</span>
      <img src="${qrImgUrl}" width="180" height="180" alt="QR notas públicas" loading="lazy"
           onerror="this.replaceWith(Object.assign(document.createElement('p'),{className:'empty-note',textContent:'No se pudo generar la imagen del QR (revisá tu conexión) — usá el enlace de abajo.'}))">
      <div class="share-url-row">
        <input type="text" readonly value="${escapeHtml(shareUrl)}">
        <button class="btn btn-small btn-copy">Copiar</button>
      </div>
      <button class="btn btn-small btn-download-qr" style="width:100%;">🖼 Descargar QR</button>
      <p class="hint" style="font-size:11px;color:var(--muted);margin:0;">
        Ven todos los alumnos y todas las comisiones, con filtro propio. Este link/QR
        es siempre el mismo — no hace falta volver a generarlo cuando cargues
        parcialitos nuevos, ni cuando actualices el código (mientras uses
        "Editar → Nueva versión" en Apps Script, no una implementación nueva).
      </p>`;
    card.querySelector(".btn-copy").addEventListener("click", () => {
      const inp = card.querySelector('input[type="text"][readonly]');
      inp.select(); document.execCommand("copy");
    });
    card.querySelector(".btn-download-qr").addEventListener("click", async (ev) => {
      const btn = ev.currentTarget;
      const original = btn.textContent;
      btn.disabled = true; btn.textContent = "Generando…";
      try {
        const img = await new Promise((resolve, reject) => {
          const im = new Image();
          im.crossOrigin = "anonymous";
          im.onload = () => resolve(im);
          im.onerror = reject;
          im.src = qrImgUrl;
        });
        const canvas = document.createElement("canvas");
        canvas.width = img.width; canvas.height = img.height;
        canvas.getContext("2d").drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "qr-notas-alumnos.png";
          a.click();
          URL.revokeObjectURL(a.href);
        }, "image/png");
      } catch (e) {
        alert("No se pudo descargar el QR. Probá de nuevo, o usá el enlace de abajo para copiarlo.");
      }
      btn.disabled = false; btn.textContent = original;
    });
    box.appendChild(card);
  }
  box.style.display = "block";
});

setInterval(() => { if (editingInProgress === 0) load(true); }, 25000);

load();
