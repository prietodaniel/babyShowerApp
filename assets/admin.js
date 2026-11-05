(function () {
  const { CFG, sb, esc, $, $$, toast, photoUrl, uploadPhoto, requireConfig, errMsg, shuffle } = App;
  if (!requireConfig()) return;
  const pane = $("#pane");
  let tab = "control", refreshTimer = null;

  // ---------------------------------------------------------------- Auth
  async function boot() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return showLogin();
    const { data: isAdmin } = await sb.rpc("is_admin");
    if (!isAdmin) { await sb.auth.signOut(); toast("Ese usuario no es admin (revisá la tabla admins)", "err"); return showLogin(); }
    $("#login").classList.add("hidden"); $("#panel").classList.remove("hidden");
    show(tab);
  }
  function showLogin() { $("#panel").classList.add("hidden"); $("#login").classList.remove("hidden"); }
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({ email: $("#l-email").value.trim(), password: $("#l-pass").value });
    if (error) return toast("Error: " + errMsg(error), "err");
    boot();
  });
  $("#logout").onclick = async () => { await sb.auth.signOut(); showLogin(); };

  // ---------------------------------------------------------------- Helpers
  const q = async (p) => { const { data, error } = await p; if (error) { toast("Error: " + errMsg(error), "err"); throw error; } return data; };
  const fmtDate = (s) => (s ? new Date(s).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
  function download(name, blob) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function csv(rows, cols) {
    const cell = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    return "﻿" + [cols.join(";")].concat(rows.map((r) => cols.map((c) => cell(r[c])).join(";"))).join("\n");
  }
  async function setState(patch) {
    await q(sb.from("state").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1));
  }

  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (b) show(b.dataset.tab); });
  function show(t) {
    tab = t; clearInterval(refreshTimer);
    $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
    pane.innerHTML = '<p class="muted center">Cargando…</p>';
    ({ control, preguntas, invitados, regalos, fotos, deseos, bebes, predicciones, jugadores }[t])().catch(() => {});
  }
  // acciones por data-act
  const actions = {};
  pane.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || !actions[b.dataset.act]) return;
    e.preventDefault();
    b.disabled = true;
    try { await actions[b.dataset.act](b.dataset, b); } catch (err) { console.error(err); }
    b.disabled = false;
  });

  // ---------------------------------------------------------------- Control
  async function control() {
    const [st, qs] = await Promise.all([
      q(sb.from("state").select("*").eq("id", 1).single()),
      q(sb.from("questions").select("*").order("sort").order("id")),
    ]);
    const cur = qs.find((x) => x.id === st.question_id);
    const modes = [["bienvenida", "🏠 Bienvenida + QR"], ["galeria", "📸 Galería"], ["pregunta", "❓ Pregunta"], ["ranking", "🏆 Ranking"], ["deseos", "💌 Deseos"], ["predicciones", "🔮 Predicciones"]];
    pane.innerHTML = `
      <section class="card">
        <h3>📺 Qué muestra la pantalla</h3>
        <div class="modes">${modes.map(([m, l]) => `<button class="btn ${st.mode === m ? "" : "ghost"}" data-act="mode" data-m="${m}">${l}</button>`).join("")}</div>
        <div class="row" style="margin-top:12px">
          <label><input type="checkbox" id="aa-photos" ${st.auto_approve_photos ? "checked" : ""} style="width:auto"> Aprobar fotos automáticamente</label>
          <label><input type="checkbox" id="aa-wishes" ${st.auto_approve_wishes ? "checked" : ""} style="width:auto"> Aprobar deseos automáticamente</label>
        </div>
      </section>
      <section class="card">
        <h3>❓ Pregunta actual</h3>
        ${cur ? `<p><b>${esc(cur.prompt)}</b> <span class="pill">${cur.kind}</span></p>
          <p>Estado: ${st.accepting ? '<span class="pill">Votación abierta</span>' : '<span class="pill off">Cerrada</span>'} ${st.reveal ? '<span class="pill warn">Revelada</span>' : ""}
             · <b id="ans-count">…</b> respuestas</p>
          <div class="modes">
            ${st.accepting ? '<button class="btn alt" data-act="close">⏱️ Cerrar votación</button>' : '<button class="btn ghost" data-act="reopen">Reabrir votación</button>'}
            ${cur.kind !== "encuesta" ? `<button class="btn" data-act="reveal" ${cur.correct == null ? "disabled title='Falta la respuesta correcta'" : ""}>🎉 Revelar respuesta</button>` : ""}
            <button class="btn" data-act="next">⏭️ Siguiente pregunta</button>
          </div>
          ${cur.correct == null && cur.kind !== "encuesta" ? '<p class="pill off">⚠️ Esta pregunta no tiene respuesta correcta cargada</p>' : ""}`
        : '<p class="muted">Ninguna pregunta lanzada. Elegí una abajo.</p>'}
      </section>
      <section class="card">
        <h3>Lanzar una pregunta</h3>
        ${qs.map((x) => `<div class="qrow ${x.id === st.question_id ? "cur" : ""}">
          <div><span class="pill ${x.revealed ? "warn" : ""}">${x.kind}${x.revealed ? " · jugada" : ""}</span> ${esc(x.prompt)}
            ${x.correct == null && x.kind !== "encuesta" ? '<span class="pill off">sin respuesta</span>' : ""}</div>
          <button class="btn sm" data-act="launch" data-id="${x.id}">Lanzar</button></div>`).join("") || '<p class="muted">No hay preguntas. Cargalas en la pestaña Preguntas.</p>'}
      </section>`;
    $("#aa-photos").onchange = (e) => setState({ auto_approve_photos: e.target.checked }).then(() => toast("Guardado"));
    $("#aa-wishes").onchange = (e) => setState({ auto_approve_wishes: e.target.checked }).then(() => toast("Guardado"));
    actions.mode = async (d) => { await setState({ mode: d.m }); control(); };
    actions.launch = async (d) => { await setState({ mode: "pregunta", question_id: +d.id, accepting: true, reveal: false, correct: null }); control(); };
    actions.close = async () => { await setState({ accepting: false }); control(); };
    actions.reopen = async () => { await setState({ accepting: true, reveal: false, correct: null }); control(); };
    actions.reveal = async () => {
      await q(sb.from("questions").update({ revealed: true }).eq("id", cur.id));
      await setState({ accepting: false, reveal: true, correct: cur.correct }); control();
    };
    actions.next = async () => {
      const i = qs.findIndex((x) => x.id === st.question_id);
      const nxt = qs.slice(i + 1).find((x) => !x.revealed) || qs.find((x) => !x.revealed && x.id !== st.question_id);
      if (!nxt) return toast("No quedan preguntas sin jugar");
      await setState({ mode: "pregunta", question_id: nxt.id, accepting: true, reveal: false, correct: null }); control();
    };
    if (cur) {
      const upd = async () => { const { count } = await sb.from("answers").select("id", { count: "exact", head: true }).eq("question_id", cur.id); const el = $("#ans-count"); if (el) el.textContent = count ?? 0; };
      upd(); refreshTimer = setInterval(upd, 3000);
    }
  }

  // ---------------------------------------------------------------- Preguntas
  async function preguntas() {
    const qs = await q(sb.from("questions").select("*").order("sort").order("id"));
    pane.innerHTML = `
      <section class="card">
        <h3 id="qf-title">Nueva pregunta</h3>
        <form id="qf">
          <input type="hidden" id="qf-id">
          <div class="row">
            <div><label>Tipo</label><select id="qf-kind"><option value="trivia">Trivia (con respuesta correcta)</option><option value="bebe">¿Quién es el bebé?</option><option value="encuesta">Encuesta (sin respuesta correcta)</option></select></div>
            <div><label>Orden</label><input id="qf-sort" type="number" value="${qs.length + 1}"></div>
          </div>
          <label>Pregunta</label><input id="qf-prompt" required>
          <label>Opciones (una por línea)</label><textarea id="qf-opts" required placeholder="Mamá&#10;Papá"></textarea>
          <label>Respuesta correcta</label><select id="qf-correct"></select>
          <label>Pista (opcional)</label><input id="qf-hint" placeholder="Ej: le gusta el café frío y se queja de la espalda">
          <label>Imagen (opcional)</label><input id="qf-img" type="file" accept="image/*">
          <input type="hidden" id="qf-imgpath">
          <div class="row"><button class="btn block">Guardar</button><button type="button" class="btn ghost block" id="qf-reset">Limpiar</button></div>
        </form>
      </section>
      <section class="card">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
          <h3>Preguntas (${qs.length})</h3>
          <button class="btn alt sm" data-act="genbebes">👶 Crear preguntas desde fotos de bebé</button>
        </div>
        ${qs.map((x) => `<div class="qrow"><div>
            <span class="pill">${x.kind}</span> <b>${esc(x.prompt)}</b>
            ${x.image_path ? `<img src="${esc(photoUrl(x.image_path))}" style="height:40px;border-radius:6px;vertical-align:middle">` : ""}
            <div class="small muted">${(x.options || []).map((o, i) => (i === x.correct ? `<b>✔ ${esc(o)}</b>` : esc(o))).join(" · ")}</div>
            ${x.correct == null && x.kind !== "encuesta" ? '<span class="pill off">falta respuesta correcta</span>' : ""}
          </div>
          <div style="white-space:nowrap"><button class="btn ghost sm" data-act="qedit" data-id="${x.id}">Editar</button> <button class="btn danger sm" data-act="qdel" data-id="${x.id}">✕</button></div></div>`).join("")}
      </section>`;
    const fillCorrect = (sel) => {
      const opts = $("#qf-opts").value.split("\n").map((s) => s.trim()).filter(Boolean);
      $("#qf-correct").innerHTML = '<option value="">— sin definir —</option>' + opts.map((o, i) => `<option value="${i}">${esc(o)}</option>`).join("");
      if (sel != null) $("#qf-correct").value = String(sel);
    };
    $("#qf-opts").addEventListener("input", () => fillCorrect($("#qf-correct").value));
    fillCorrect();
    $("#qf-reset").onclick = () => { $("#qf").reset(); $("#qf-id").value = ""; $("#qf-imgpath").value = ""; $("#qf-title").textContent = "Nueva pregunta"; fillCorrect(); };
    actions.qedit = (d) => {
      const x = qs.find((y) => y.id === +d.id);
      $("#qf-id").value = x.id; $("#qf-kind").value = x.kind; $("#qf-sort").value = x.sort; $("#qf-prompt").value = x.prompt;
      $("#qf-opts").value = (x.options || []).join("\n"); fillCorrect(x.correct ?? ""); $("#qf-hint").value = x.hint || ""; $("#qf-imgpath").value = x.image_path || "";
      $("#qf-title").textContent = "Editar pregunta"; window.scrollTo({ top: 0, behavior: "smooth" });
    };
    actions.qdel = async (d) => { if (!confirm("¿Borrar la pregunta y sus respuestas?")) return; await q(sb.from("questions").delete().eq("id", +d.id)); preguntas(); };
    actions.genbebes = async () => {
      const subs = await q(sb.from("baby_submissions").select("*").order("id"));
      const used = new Set(qs.filter((x) => x.kind === "bebe").map((x) => x.image_path));
      const players = await q(sb.from("players").select("name"));
      const names = [...new Set(subs.map((s) => s.name.trim()))];
      const pool = [...new Set(names.concat(players.map((p) => p.name.trim())))];
      const rows = [];
      subs.filter((s) => !used.has(s.path)).forEach((s, i) => {
        const others = shuffle(pool.filter((n) => n.toLowerCase() !== s.name.trim().toLowerCase())).slice(0, 3);
        const opts = shuffle([s.name.trim()].concat(others));
        rows.push({ kind: "bebe", prompt: "¿Quién es este bebé? 👶", options: opts, correct: opts.indexOf(s.name.trim()), image_path: s.path, sort: 100 + qs.length + i });
      });
      if (!rows.length) return toast("No hay fotos de bebé nuevas");
      await q(sb.from("questions").insert(rows));
      toast(`Se crearon ${rows.length} preguntas 👶`); preguntas();
    };
    $("#qf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#qf button"); btn.disabled = true;
      try {
        let image_path = $("#qf-imgpath").value || null;
        const f = $("#qf-img").files[0];
        if (f) image_path = await uploadPhoto(f, "preguntas");
        const c = $("#qf-correct").value;
        const row = {
          kind: $("#qf-kind").value, sort: +$("#qf-sort").value || 0, prompt: $("#qf-prompt").value.trim(),
          options: $("#qf-opts").value.split("\n").map((s) => s.trim()).filter(Boolean),
          correct: c === "" ? null : +c, hint: $("#qf-hint").value.trim() || null, image_path,
        };
        const id = $("#qf-id").value;
        await q(id ? sb.from("questions").update(row).eq("id", +id) : sb.from("questions").insert(row));
        toast("Guardado ✔"); preguntas();
      } catch (err) { if (!err.code) toast("Error: " + errMsg(err), "err"); btn.disabled = false; }
    });
  }

  // ---------------------------------------------------------------- Asistencia
  async function invitados() {
    const rs = await q(sb.from("rsvps").select("*").order("created_at", { ascending: false }));
    const yes = rs.filter((r) => r.attending);
    const adults = yes.reduce((a, r) => a + r.adults, 0), kids = yes.reduce((a, r) => a + r.kids, 0);
    pane.innerHTML = `<section class="card">
      <div class="row center">
        <div><b style="font-size:2rem">${adults + kids}</b><div class="muted">personas confirmadas</div></div>
        <div><b style="font-size:2rem">${adults}</b><div class="muted">adultos</div></div>
        <div><b style="font-size:2rem">${kids}</b><div class="muted">niños</div></div>
        <div><b style="font-size:2rem">${rs.length - yes.length}</b><div class="muted">no vienen</div></div>
      </div>
      <p class="center"><button class="btn sm" data-act="rcsv">⬇️ Descargar CSV</button></p>
      <div style="overflow-x:auto"><table><tr><th>Nombre</th><th>¿Viene?</th><th>Ad.</th><th>Niños</th><th>Tel.</th><th>Mensaje</th><th>Fecha</th><th></th></tr>
      ${rs.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.attending ? "✅" : "❌"}</td><td>${r.adults}</td><td>${r.kids}</td><td>${esc(r.phone)}</td><td>${esc(r.message)}</td><td class="small">${fmtDate(r.created_at)}</td>
        <td><button class="btn danger sm" data-act="rdel" data-id="${r.id}">✕</button></td></tr>`).join("")}</table></div></section>`;
    actions.rcsv = () => download("asistencia.csv", new Blob([csv(rs.map((r) => ({ ...r, attending: r.attending ? "Sí" : "No" })), ["name", "attending", "adults", "kids", "phone", "message", "created_at"])], { type: "text/csv" }));
    actions.rdel = async (d) => { if (!confirm("¿Borrar esta confirmación?")) return; await q(sb.from("rsvps").delete().eq("id", +d.id)); invitados(); };
  }

  // ---------------------------------------------------------------- Regalos
  async function regalos() {
    const [gs, rs] = await Promise.all([
      q(sb.from("gifts").select("*").order("sort").order("id")),
      q(sb.from("gift_reservations").select("*").order("created_at")),
    ]);
    pane.innerHTML = `<section class="card">
        <h3 id="gf-title">Nuevo regalo</h3>
        <form id="gf"><input type="hidden" id="gf-id">
          <div class="row"><div style="flex:3"><label>Nombre</label><input id="gf-name" required></div>
            <div><label>Cantidad</label><input id="gf-qty" type="number" min="1" value="1"></div>
            <div><label>Orden</label><input id="gf-sort" type="number" value="${gs.length + 1}"></div></div>
          <label>Descripción</label><input id="gf-desc">
          <label>Link de ejemplo</label><input id="gf-link" type="url" placeholder="https://…">
          <div class="row"><button class="btn block">Guardar</button><button type="button" class="btn ghost block" id="gf-reset">Limpiar</button></div>
        </form></section>
      <section class="card"><h3>Regalos (${gs.length}) · ${rs.length} reservas</h3>
        ${gs.map((g) => { const mine = rs.filter((r) => r.gift_id === g.id); return `<div class="qrow"><div>
          <b>${esc(g.name)}</b> <span class="pill ${mine.length >= g.qty ? "off" : ""}">${mine.length}/${g.qty}</span>
          ${g.description ? `<div class="small muted">${esc(g.description)}</div>` : ""}
          ${mine.map((r) => `<div class="small">🎁 ${esc(r.name)} <a href="#" data-act="unres" data-id="${r.id}">(quitar)</a></div>`).join("")}
          </div><div style="white-space:nowrap"><button class="btn ghost sm" data-act="gedit" data-id="${g.id}">Editar</button> <button class="btn danger sm" data-act="gdel" data-id="${g.id}">✕</button></div></div>`; }).join("")}
      </section>`;
    $("#gf-reset").onclick = () => { $("#gf").reset(); $("#gf-id").value = ""; $("#gf-title").textContent = "Nuevo regalo"; };
    actions.gedit = (d) => {
      const g = gs.find((x) => x.id === +d.id);
      $("#gf-id").value = g.id; $("#gf-name").value = g.name; $("#gf-qty").value = g.qty; $("#gf-sort").value = g.sort;
      $("#gf-desc").value = g.description || ""; $("#gf-link").value = g.link || ""; $("#gf-title").textContent = "Editar regalo";
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    actions.gdel = async (d) => { if (!confirm("¿Borrar el regalo y sus reservas?")) return; await q(sb.from("gifts").delete().eq("id", +d.id)); regalos(); };
    actions.unres = async (d) => { if (!confirm("¿Quitar esta reserva?")) return; await q(sb.from("gift_reservations").delete().eq("id", +d.id)); regalos(); };
    $("#gf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const row = { name: $("#gf-name").value.trim(), qty: +$("#gf-qty").value || 1, sort: +$("#gf-sort").value || 0, description: $("#gf-desc").value.trim() || null, link: $("#gf-link").value.trim() || null };
      const id = $("#gf-id").value;
      try { await q(id ? sb.from("gifts").update(row).eq("id", +id) : sb.from("gifts").insert(row)); toast("Guardado ✔"); regalos(); } catch (err) {}
    });
  }

  // ---------------------------------------------------------------- Fotos
  async function fotos() {
    const ps = await q(sb.from("photos").select("*").order("created_at", { ascending: false }));
    const pending = ps.filter((p) => !p.approved);
    pane.innerHTML = `<section class="card">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
        <h3>📸 Fotos (${ps.length}) · ${pending.length} pendientes</h3>
        <div>${pending.length ? '<button class="btn sm" data-act="papproveall">Aprobar todas</button>' : ""}
          <button class="btn alt sm" data-act="pzip">⬇️ Descargar ZIP</button></div>
      </div>
      <p id="zip-progress" class="muted small"></p>
      <div class="thumbs">${ps.map((p) => `<figure><a href="${esc(photoUrl(p.path))}" target="_blank"><img src="${esc(photoUrl(p.path))}" loading="lazy" alt=""></a>
        <figcaption>${p.approved ? '<span class="pill">✔</span>' : `<button class="btn sm" data-act="papprove" data-id="${p.id}">Aprobar</button>`}
        <button class="btn danger sm" data-act="pdel" data-id="${p.id}" data-path="${esc(p.path)}">✕</button> <span class="muted">${esc(p.uploader || "")}</span></figcaption></figure>`).join("")}</div>
    </section>`;
    actions.papprove = async (d) => { await q(sb.from("photos").update({ approved: true }).eq("id", +d.id)); fotos(); };
    actions.papproveall = async () => { await q(sb.from("photos").update({ approved: true }).eq("approved", false)); fotos(); };
    actions.pdel = async (d) => {
      if (!confirm("¿Borrar la foto?")) return;
      await sb.storage.from("fotos").remove([d.path]);
      await q(sb.from("photos").delete().eq("id", +d.id)); fotos();
    };
    actions.pzip = async () => {
      if (!window.JSZip) return toast("No cargó JSZip", "err");
      const zip = new JSZip(); let i = 0;
      for (const p of ps) {
        i++; $("#zip-progress").textContent = `Descargando ${i}/${ps.length}…`;
        try { const r = await fetch(photoUrl(p.path)); zip.file(`${String(i).padStart(3, "0")}-${(p.uploader || "foto").replace(/[^\w-]+/g, "_")}.jpg`, await r.blob()); } catch (e) {}
      }
      $("#zip-progress").textContent = "Armando ZIP…";
      download("fotos-baby-shower.zip", await zip.generateAsync({ type: "blob" }));
      $("#zip-progress").textContent = "";
    };
  }

  // ---------------------------------------------------------------- Deseos
  async function deseos() {
    const ws = await q(sb.from("wishes").select("*").order("created_at"));
    pane.innerHTML = `<section class="card">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
        <h3>💌 Deseos (${ws.length})</h3><button class="btn alt sm" data-act="wbook">📖 Libro de deseos (imprimir / PDF)</button></div>
      ${ws.map((w) => `<div class="qrow"><div><b>${esc(w.name)}</b>: ${esc(w.text)}</div><div style="white-space:nowrap">
        ${w.approved ? '<span class="pill">✔</span>' : `<button class="btn sm" data-act="wapprove" data-id="${w.id}">Aprobar</button>`}
        <button class="btn danger sm" data-act="wdel" data-id="${w.id}">✕</button></div></div>`).join("") || '<p class="muted">Todavía no hay mensajes.</p>'}
    </section>`;
    actions.wapprove = async (d) => { await q(sb.from("wishes").update({ approved: true }).eq("id", +d.id)); deseos(); };
    actions.wdel = async (d) => { if (!confirm("¿Borrar el mensaje?")) return; await q(sb.from("wishes").delete().eq("id", +d.id)); deseos(); };
    actions.wbook = () => {
      const win = window.open("", "_blank");
      if (!win) return toast("Permití las ventanas emergentes", "err");
      win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Libro de deseos</title>
        <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito:wght@400;700&display=swap" rel="stylesheet">
        <style>body{font-family:Nunito,sans-serif;color:#3d3a4b;max-width:700px;margin:40px auto;padding:0 20px}h1{font-family:Fredoka;text-align:center;font-size:2.4rem}
        .w{border:2px dashed #f4b9a4;border-radius:16px;padding:16px 20px;margin:16px 0;break-inside:avoid}.w p{font-size:1.15rem;margin:0 0 8px}.w b{color:#5f9480}
        .sub{text-align:center;color:#7a7688}</style></head><body>
        <h1>💌 Libro de deseos para ${esc(CFG.BABY_NAME)}</h1><p class="sub">Baby Shower · ${esc(CFG.EVENT_DATE_LABEL)}</p>
        ${ws.map((w) => `<div class="w"><p>“${esc(w.text)}”</p><b>— ${esc(w.name)}</b></div>`).join("")}
        <script>setTimeout(()=>print(),800)<\/script></body></html>`);
      win.document.close();
    };
  }

  // ---------------------------------------------------------------- Fotos de bebé
  async function bebes() {
    const bs = await q(sb.from("baby_submissions").select("*").order("created_at"));
    pane.innerHTML = `<section class="card"><h3>👶 Fotos de bebé recibidas (${bs.length})</h3>
      <p class="muted small">Para el juego, andá a <b>Preguntas → Crear preguntas desde fotos de bebé</b>. Podés agregar una pista graciosa a cada una.</p>
      <div class="thumbs">${bs.map((b) => `<figure><img src="${esc(photoUrl(b.path))}" loading="lazy" alt=""><figcaption><b>${esc(b.name)}</b>
        <button class="btn danger sm" data-act="bdel" data-id="${b.id}">✕</button></figcaption></figure>`).join("")}</div></section>`;
    actions.bdel = async (d) => { if (!confirm("¿Borrar esta foto?")) return; await q(sb.from("baby_submissions").delete().eq("id", +d.id)); bebes(); };
  }

  // ---------------------------------------------------------------- Predicciones
  async function predicciones() {
    const ps = await q(sb.from("predictions").select("*").order("created_at"));
    const cols = ["name", "birth_date", "weight_kg", "height_cm", "hair", "eyes", "looks_like", "first_word"];
    pane.innerHTML = `<section class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h3>🔮 Predicciones (${ps.length})</h3>
      <button class="btn sm" data-act="pcsv">⬇️ CSV</button></div>
      <div style="overflow-x:auto"><table><tr><th>Nombre</th><th>Fecha</th><th>Peso</th><th>Altura</th><th>Pelo</th><th>Ojos</th><th>Parecido</th><th>1ª palabra</th></tr>
      ${ps.map((p) => `<tr>${cols.map((c) => `<td>${esc(p[c])}</td>`).join("")}</tr>`).join("")}</table></div></section>`;
    actions.pcsv = () => download("predicciones.csv", new Blob([csv(ps, cols)], { type: "text/csv" }));
  }

  // ---------------------------------------------------------------- Jugadores
  async function jugadores() {
    const sc = await q(sb.from("scores").select("*").order("points", { ascending: false }));
    pane.innerHTML = `<section class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <h3>🎮 Jugadores (${sc.length})</h3><button class="btn danger sm" data-act="reset">🧹 Reiniciar juego (borra respuestas)</button></div>
      <table><tr><th>#</th><th>Nombre</th><th>Puntos</th><th></th></tr>
      ${sc.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${s.points}</td><td><button class="btn danger sm" data-act="pldel" data-id="${s.id}">✕</button></td></tr>`).join("")}</table></section>`;
    actions.pldel = async (d) => { if (!confirm("¿Borrar este jugador?")) return; await q(sb.from("players").delete().eq("id", d.id)); jugadores(); };
    actions.reset = async () => {
      if (!confirm("Esto borra TODAS las respuestas y marca las preguntas como no jugadas. ¿Seguro?")) return;
      await q(sb.from("answers").delete().gt("id", 0));
      await q(sb.from("questions").update({ revealed: false }).gt("id", 0));
      await setState({ mode: "bienvenida", question_id: null, accepting: false, reveal: false, correct: null });
      if (confirm("¿También borrar los jugadores? (tendrán que volver a poner su nombre)")) await q(sb.from("players").delete().not("id", "is", null));
      toast("Juego reiniciado"); jugadores();
    };
  }

  boot();
})();
