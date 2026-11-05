(function () {
  const { CFG, sb, store, esc, $, photoUrl, requireConfig, baseUrl, shuffle } = App;
  const stage = $("#stage");
  const playUrl = baseUrl() + "jugar.html";
  let voice = !!store.get("tv_voice");

  document.addEventListener("click", () => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  });
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "v") { voice = !voice; store.set("tv_voice", voice); flashHint(voice ? "🔊 Voz activada" : "🔇 Voz desactivada"); }
  });
  function flashHint(t) { const h = $("#hint"); h.textContent = t; h.style.opacity = 1; setTimeout(() => (h.style.opacity = 0), 2500); }
  setTimeout(() => ($("#hint").style.opacity = 0), 6000);

  function qr(el, size) {
    el.innerHTML = "";
    if (window.QRCode) new QRCode(el, { text: playUrl, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
  }
  qr($("#qr-small"), Math.round(window.innerWidth * 0.08));

  if (!requireConfig()) { renderWelcome(); return; }

  let state = null, mode = null, timers = [];
  const clearTimers = () => { timers.forEach(clearInterval); timers = []; if (window.speechSynthesis) speechSynthesis.cancel(); };
  const every = (fn, ms) => { fn(); timers.push(setInterval(fn, ms)); };

  async function loadState() {
    const { data } = await sb.from("state").select("*").eq("id", 1).maybeSingle();
    if (data) applyState(data);
  }
  function applyState(s) {
    const prev = state; state = s;
    const key = s.mode + ":" + (s.mode === "pregunta" ? s.question_id : "");
    if (!prev || key !== mode) { mode = key; switchMode(); }
    else if (s.mode === "pregunta") updateQuestion();
  }

  function switchMode() {
    clearTimers();
    $("#corner").classList.toggle("hidden", state.mode === "bienvenida");
    ({ bienvenida: renderWelcome, galeria: renderGallery, pregunta: renderQuestion, ranking: renderRanking,
       deseos: renderWishes, predicciones: renderPredictions }[state.mode] || renderWelcome)();
  }

  // ---------- Bienvenida
  function renderWelcome() {
    stage.innerHTML = `<div style="font-size:6vw">🍼🧸</div>
      <p class="t-m">Bienvenidos al Baby Shower de</p>
      <h1 class="t-xl">${esc(CFG.BABY_NAME)}</h1>
      <div style="display:flex;gap:4vw;align-items:center;margin-top:4vh">
        <div class="qr" id="qr-big"></div>
        <div style="text-align:left"><p class="t-l">¡Escaneá<br>y jugá! 📱</p><p class="t-m">Trivia · Fotos · Deseos</p></div>
      </div>`;
    qr($("#qr-big"), Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.32));
  }

  // ---------- Galería
  function renderGallery() {
    stage.innerHTML = '<div id="slides"></div>';
    let list = [], idx = 0, shown = new Set();
    const host = $("#slides");
    async function refresh() {
      const { data } = await sb.from("photos").select("id,path,uploader").eq("approved", true).order("created_at", { ascending: false }).limit(300);
      if (!data) return;
      const fresh = data.filter((p) => !shown.has(p.id));
      // las nuevas primero, después el resto mezclado
      list = fresh.concat(shuffle(data.filter((p) => shown.has(p.id))));
      idx = 0;
    }
    function next() {
      if (!list.length) {
        if (!host.children.length) host.innerHTML = '<div class="slide on" style="flex-direction:column"><p class="t-l">📸 ¡Subí tus fotos!</p><p class="t-m">Escaneá el QR y andá a la pestaña Fotos</p></div>';
        return;
      }
      const p = list[idx % list.length]; idx++; shown.add(p.id);
      const d = document.createElement("div");
      d.className = "slide";
      d.innerHTML = `<img src="${esc(photoUrl(p.path))}" alt="">${p.uploader ? `<div class="who">📸 ${esc(p.uploader)}</div>` : ""}`;
      const img = d.querySelector("img");
      const show = () => { host.appendChild(d); requestAnimationFrame(() => d.classList.add("on")); setTimeout(() => { while (host.children.length > 1) host.firstChild.remove(); }, 1200); };
      img.onload = show; img.onerror = () => {};
    }
    refresh().then(next);
    timers.push(setInterval(next, 6000));
    timers.push(setInterval(refresh, 20000));
  }

  // ---------- Pregunta
  let qData = null;
  async function renderQuestion() {
    qData = null;
    stage.innerHTML = '<p class="t-m">Cargando…</p>';
    if (!state.question_id) { stage.innerHTML = '<p class="t-l">Preparando la pregunta…</p>'; return; }
    const myMode = mode;
    const { data } = await sb.from("questions").select("id,kind,prompt,options,image_path,hint").eq("id", state.question_id).maybeSingle();
    if (myMode !== mode) return; // cambió el modo mientras cargaba
    qData = data;
    if (!qData) return;
    const label = { bebe: "👶 ¿Quién es el bebé?", encuesta: "📊 Encuesta", trivia: "❓ Trivia" }[qData.kind] || "";
    const bars = `<div class="bars">${(qData.options || []).map((o, i) => `<div class="bar" data-i="${i}"><div class="fill" style="width:0"></div><span class="lbl">${esc(o)}</span><span class="n">0</span></div>`).join("")}</div>`;
    stage.innerHTML = `<p class="t-m">${label}</p><h1 class="t-l">${esc(qData.prompt)}</h1>
      ${qData.image_path ? `<div class="qwrap"><img src="${esc(photoUrl(qData.image_path))}" alt=""><div style="flex:1">${bars}</div></div>` : bars}
      ${qData.hint ? `<p class="t-m">💡 ${esc(qData.hint)}</p>` : ""}
      <p class="t-m" id="q-status"></p>`;
    every(updateQuestion, 2000);
  }
  async function updateQuestion() {
    if (!qData) return;
    const [{ data: ans }, { count }] = await Promise.all([
      sb.from("answers").select("choice").eq("question_id", qData.id),
      sb.from("players").select("id", { count: "exact", head: true }),
    ]);
    const counts = (qData.options || []).map(() => 0);
    (ans || []).forEach((a) => { if (counts[a.choice] != null) counts[a.choice]++; });
    const total = counts.reduce((a, b) => a + b, 0), max = Math.max(1, ...counts);
    const revealed = state.reveal && state.correct != null && qData.kind !== "encuesta";
    document.querySelectorAll(".bar").forEach((b) => {
      const i = +b.dataset.i;
      b.querySelector(".fill").style.width = ((counts[i] / max) * 100) + "%";
      b.querySelector(".n").textContent = counts[i];
      b.classList.toggle("right", revealed && i === state.correct);
      b.classList.toggle("dim", revealed && i !== state.correct);
    });
    const st = $("#q-status");
    if (st) st.textContent = revealed ? "🎉 ¡Esa era la respuesta!" : `${total} de ${count || 0} respondieron` + (state.accepting ? " · ¡respondé desde el celu!" : " · votación cerrada");
  }

  // ---------- Ranking
  function renderRanking() {
    stage.innerHTML = '<h1 class="t-l">🏆 Ranking</h1><div class="rank" id="rank"></div>';
    every(async () => {
      const { data } = await sb.from("scores").select("name,points").order("points", { ascending: false }).limit(8);
      const medals = ["🥇", "🥈", "🥉"];
      $("#rank").innerHTML = (data || []).map((r, i) => `<div><span>${medals[i] || i + 1 + "."} ${esc(r.name)}</span><span>${r.points}</span></div>`).join("") || '<p class="t-m">Todavía no hay puntos</p>';
    }, 4000);
  }

  // ---------- Deseos
  function renderWishes() {
    stage.innerHTML = '<p class="t-m">💌 Mensajes para el bebé</p><div class="wish" id="wish"></div><p class="t-m" id="wish-by"></p>';
    let list = [], idx = 0;
    async function refresh() {
      const { data } = await sb.from("wishes").select("name,text").eq("approved", true).order("created_at", { ascending: false }).limit(300);
      if (data) list = data;
    }
    function next() {
      if (!list.length) { $("#wish").textContent = "¡Dejale un mensaje al bebé desde el celular! 💛"; return; }
      const w = list[idx % list.length]; idx++;
      const el = $("#wish"); el.style.opacity = 0;
      setTimeout(() => {
        el.textContent = "“" + w.text + "”"; $("#wish-by").textContent = "— " + w.name; el.style.opacity = 1;
        if (voice && window.speechSynthesis) {
          const u = new SpeechSynthesisUtterance(w.text + ". De " + w.name);
          u.lang = "es-AR"; u.rate = 0.95; speechSynthesis.cancel(); speechSynthesis.speak(u);
        }
      }, 800);
    }
    refresh().then(next);
    timers.push(setInterval(next, 10000));
    timers.push(setInterval(refresh, 20000));
  }

  // ---------- Predicciones
  function renderPredictions() {
    stage.innerHTML = '<h1 class="t-l">🔮 Las predicciones</h1><div class="stats" id="stats"></div><p class="t-m" id="pcount"></p>';
    every(async () => {
      const { data } = await sb.from("predictions").select("*");
      const d = data || [];
      const avg = (k) => { const v = d.map((x) => +x[k]).filter((x) => x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
      const mode = (k) => { const c = {}; d.forEach((x) => { if (x[k]) c[x[k]] = (c[x[k]] || 0) + 1; }); const e = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return e ? e[0] : "—"; };
      const w = avg("weight_kg"), h = avg("height_cm");
      const fd = mode("birth_date");
      const fdTxt = fd !== "—" ? new Date(fd + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" }) : "—";
      $("#stats").innerHTML = [
        [fdTxt, "fecha más votada"], [w ? w.toFixed(2) + " kg" : "—", "peso promedio"], [h ? h.toFixed(1) + " cm" : "—", "altura promedio"],
        [mode("looks_like"), "se va a parecer a"], [mode("eyes"), "color de ojos"], [mode("first_word"), "primera palabra"],
      ].map(([b, s]) => `<div><b>${esc(b)}</b><span>${s}</span></div>`).join("");
      $("#pcount").textContent = d.length + " predicciones";
    }, 8000);
  }

  loadState();
  sb.channel("state-tv")
    .on("postgres_changes", { event: "*", schema: "public", table: "state" }, (p) => p.new && applyState(p.new))
    .subscribe();
  setInterval(loadState, 5000);
})();
