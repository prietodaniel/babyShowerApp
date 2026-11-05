(function () {
  const { sb, store, esc, $, $$, toast, photoUrl, uploadPhoto, requireConfig, errMsg, nf } = App;
  if (!requireConfig()) return;

  const QCOLS = "id,kind,prompt,options,image_path,hint,sort";
  let me = store.get("player");
  let state = null, question = null, myChoice = null;

  // ---------- Ingreso
  function showApp() {
    $("#join").classList.add("hidden");
    $("#app").classList.remove("hidden");
    $("#me-name").textContent = me.name;
    start();
  }
  if (me && me.id) showApp();
  else {
    $("#join").classList.remove("hidden");
    $("#j-name").value = store.get("guest_name") || "";
  }
  $("#join-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#join-form button"); btn.disabled = true;
    try {
      const p = { id: crypto.randomUUID(), name: $("#j-name").value.trim() };
      const { error } = await sb.from("players").insert(p);
      if (error) throw error;
      me = p; store.set("player", p); store.set("guest_name", p.name);
      showApp();
    } catch (err) { toast("Error: " + errMsg(err), "err"); btn.disabled = false; }
  });

  // ---------- Tabs
  $$(".tabs button").forEach((b) => b.addEventListener("click", () => {
    $$(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
    $$("[data-pane]").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== b.dataset.tab));
  }));

  // ---------- Juego en vivo
  async function loadState() {
    const { data } = await sb.from("state").select("*").eq("id", 1).maybeSingle();
    if (data) await applyState(data);
  }
  async function applyState(s) {
    const qChanged = !state || state.question_id !== s.question_id;
    state = s;
    if (qChanged) {
      question = null; myChoice = null;
      if (s.question_id) {
        const [{ data: q }, { data: a }] = await Promise.all([
          sb.from("questions").select(QCOLS).eq("id", s.question_id).maybeSingle(),
          sb.from("answers").select("choice").eq("question_id", s.question_id).eq("player_id", me.id).maybeSingle(),
        ]);
        question = q; myChoice = a ? a.choice : null;
      }
    }
    render();
    loadPoints();
  }
  async function loadPoints() {
    const { data } = await sb.from("scores").select("points").eq("id", me.id).maybeSingle();
    $("#me-points").textContent = nf(data ? data.points : 0) + " millas";
  }

  function render() {
    const el = $("#game");
    if (!state || state.mode !== "pregunta" || !question) {
      const msgs = {
        bienvenida: "¡Bienvenidos a bordo! En un ratito arrancan los juegos.",
        galeria: "Mientras tanto, subí fotos al diario de viaje.",
        ranking: "Mirá la pantalla: ¡los pasajeros con más millas!",
        deseos: "Mandale una postal a Justino desde la pestaña Postales.",
        predicciones: "Mirá la pantalla: la bitácora de predicciones.",
      };
      el.innerHTML = `<div class="center"><img src="assets/img/avion.svg" alt="" class="float" style="width:150px;margin:6px auto">
        <h2>Esperando la próxima pregunta</h2><p class="muted">${esc(msgs[state && state.mode] || "Mirá la pantalla grande.")}</p></div>`;
      return;
    }
    const q = question, opts = q.options || [];
    const revealed = state.reveal && state.correct != null;
    const closed = !state.accepting;
    let head = "";
    if (q.kind === "bebe") head = '<p class="pill">¿Quién es este pequeño viajero?</p>';
    else if (q.kind === "encuesta") head = '<p class="pill">Encuesta</p>';
    else head = '<p class="pill">Trivia</p>';
    let status = "";
    if (revealed && q.kind !== "encuesta") {
      status = myChoice == null ? "No llegaste a responder" : myChoice === state.correct ? "¡Correcto! +100 millas ✈" : "Uy, no era esa";
    } else if (myChoice != null) status = "Respuesta enviada. ¡Mirá la pantalla!";
    else if (closed) status = "Votación cerrada";
    el.innerHTML = `${head}<h2>${esc(q.prompt)}</h2>
      ${q.image_path ? `<img class="qimg" src="${esc(photoUrl(q.image_path))}" alt="">` : ""}
      ${q.hint ? `<p class="muted">💡 ${esc(q.hint)}</p>` : ""}
      <div>${opts.map((o, i) => {
        let cls = "opt";
        if (myChoice === i) cls += " sel";
        if (revealed && q.kind !== "encuesta") { if (i === state.correct) cls += " right"; else if (myChoice === i) cls += " wrong"; }
        return `<button class="${cls}" data-i="${i}" ${myChoice != null || closed ? "disabled" : ""}>${esc(o)}</button>`;
      }).join("")}</div>
      <p class="center"><b>${status}</b></p>`;
  }

  $("#game").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-i]");
    if (!b || myChoice != null || !question) return;
    const choice = +b.dataset.i;
    myChoice = choice; render();
    const { error } = await sb.from("answers").insert({ question_id: question.id, player_id: me.id, choice });
    if (error) {
      if (error.code === "23505") return; // ya respondió
      if (error.code === "23503") { store.del("player"); toast("Tu sesión expiró, volvé a entrar", "err"); setTimeout(() => location.reload(), 1500); return; }
      myChoice = null; render();
      toast(state && !state.accepting ? "La votación ya se cerró" : "Error: " + errMsg(error), "err");
    }
  });

  function start() {
    loadState();
    sb.channel("state-jugar")
      .on("postgres_changes", { event: "*", schema: "public", table: "state" }, (p) => p.new && applyState(p.new))
      .subscribe();
    setInterval(loadState, 6000);
  }

  // ---------- Fotos
  $("#f-send").addEventListener("click", async () => {
    const files = Array.from($("#f-files").files || []);
    if (!files.length) return toast("Elegí una o más fotos", "err");
    const btn = $("#f-send"); btn.disabled = true;
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      $("#f-progress").textContent = `Subiendo ${i + 1} de ${files.length}…`;
      try {
        const path = await uploadPhoto(files[i], "evento");
        const { error } = await sb.from("photos").insert({ path, uploader: me.name, approved: !!(state && state.auto_approve_photos) });
        if (error) throw error;
        ok++;
      } catch (err) { toast("Error con una foto: " + errMsg(err), "err"); }
    }
    $("#f-progress").textContent = ok ? `¡Listo! ${ok} foto(s) en el diario de viaje` : "";
    $("#f-files").value = ""; btn.disabled = false;
  });

  // ---------- Deseos
  $("#w-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#w-form button"); btn.disabled = true;
    try {
      const { error } = await sb.from("wishes").insert({ name: me.name, text: $("#w-text").value.trim(), approved: !!(state && state.auto_approve_wishes) });
      if (error) throw error;
      $("#w-text").value = "";
      toast("¡Postal enviada!");
    } catch (err) { toast("Error: " + errMsg(err), "err"); }
    btn.disabled = false;
  });
})();
