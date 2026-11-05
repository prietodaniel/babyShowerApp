(function () {
  const { sb, store, esc, $, toast, requireConfig, errMsg } = App;
  if (!requireConfig()) { $("#gifts").innerHTML = ""; return; }
  const nameEl = $("#g-name");
  nameEl.value = store.get("guest_name") || "";
  nameEl.addEventListener("change", () => store.set("guest_name", nameEl.value.trim()));
  const mine = new Set(store.get("my_gifts") || []);

  async function load() {
    const { data, error } = await sb.from("gifts_public").select("*").order("sort").order("id");
    if (error) { $("#gifts").innerHTML = `<p class="muted">Error: ${esc(error.message)}</p>`; return; }
    if (!data.length) { $("#gifts").innerHTML = '<p class="muted center">Todavía no hay regalos cargados.</p>'; return; }
    $("#gifts").innerHTML = data.map((g) => {
      const left = g.qty - g.reserved, done = left <= 0;
      const status = done ? '<span class="pill off">Completo</span>'
        : g.qty > 1 ? `<span class="pill">Faltan ${left} de ${g.qty}</span>` : '<span class="pill">Disponible</span>';
      return `<div class="gift ${done ? "done" : ""}">
        <div>
          <h3>${esc(g.name)}</h3>
          ${g.description ? `<div class="muted small">${esc(g.description)}</div>` : ""}
          ${g.link ? `<a class="small" href="${esc(g.link)}" target="_blank" rel="noopener">Ver ejemplo ↗</a>` : ""}
          <div style="margin-top:4px">${status} ${mine.has(g.id) ? '<span class="pill warn">Lo regalás vos 💛</span>' : ""}</div>
        </div>
        ${done ? "" : `<button class="btn sm" data-id="${g.id}">Lo regalo yo</button>`}
      </div>`;
    }).join("");
  }

  $("#gifts").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-id]");
    if (!b) return;
    const name = nameEl.value.trim();
    if (!name) { nameEl.focus(); return toast("Poné tu nombre arriba primero", "err"); }
    b.disabled = true;
    try {
      const id = +b.dataset.id;
      const { data, error } = await sb.rpc("reserve_gift", { p_gift: id, p_name: name });
      if (error) throw error;
      if (data) { mine.add(id); store.set("my_gifts", [...mine]); store.set("guest_name", name); toast("¡Gracias! Quedó anotado 🎁"); }
      else toast("Ups, alguien lo reservó recién", "err");
    } catch (err) { toast("Error: " + errMsg(err), "err"); }
    await load();
  });

  load();
})();
