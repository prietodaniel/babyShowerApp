(function () {
  const { CFG, sb, store, esc, $, photoUrl, requireConfig, baseUrl, shuffle, nf } = App;
  const stage = $("#stage");
  const playUrl = baseUrl() + "jugar.html";
  let voice = !!store.get("tv_voice");

  document.addEventListener("click", () => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  });
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "v") { voice = !voice; store.set("tv_voice", voice); flashHint(voice ? "Voz activada" : "Voz desactivada"); }
  });
  function flashHint(t) { const h = $("#hint"); h.textContent = t; h.style.opacity = 1; setTimeout(() => (h.style.opacity = 0), 2500); }
  setTimeout(() => ($("#hint").style.opacity = 0), 6000);

  function qr(el, size) {
    el.innerHTML = "";
    if (window.QRCode) new QRCode(el, { text: playUrl, width: size, height: size, colorDark: "#4a3d31", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
  }
  qr($("#qr-small"), Math.round(window.innerWidth * 0.075));

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
    stage.innerHTML = `
      <p class="name">${esc(CFG.BABY_NAME)}</p>
      <p class="sub">Baby Shower</p>
      <div class="boarding">
        <div class="qr" id="qr-big"></div>
        <div class="txt">
          <span class="lbl">Tarjeta de embarque</span>
          <span class="big">Escaneá<br>y subí a bordo</span>
          <span class="t-m" style="font-size:1.8vw">Trivia · Fotos · Postales para Justino</span>
          <span class="lbl" style="margin-top:1vh">Destino: la llegada de ${esc(CFG.BABY_NAME)}</span>
        </div>
      </div>`;
    qr($("#qr-big"), Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.3));
  }

  // ---------- Galería (polaroids)
  function renderGallery() {
    stage.innerHTML = '<div id="slides"></div>';
    let list = [], idx = 0;
    const shown = new Set(), host = $("#slides");
    async function refresh() {
      const { data } = await sb.from("photos").select("id,path,uploader").eq("approved", true).order("created_at", { ascending: false }).limit(300);
      if (!data) return;
      list = data.filter((p) => !shown.has(p.id)).concat(shuffle(data.filter((p) => shown.has(p.id))));
      idx = 0;
    }
    function next() {
      if (!list.length) {
        if (!host.children.length) host.innerHTML = '<div class="slide on" style="flex-direction:column"><p class="t-l">Diario de viaje</p><p class="t-m">Escaneá el QR y subí tus fotos del baby shower</p></div>';
        return;
      }
      const p = list[idx % list.length]; idx++; shown.add(p.id);
      const rot = (Math.random() * 6 - 3).toFixed(1);
      const d = document.createElement("div");
      d.className = "slide";
      d.innerHTML = `<div class="polaroid" style="transform:rotate(${rot}deg)"><img src="${esc(photoUrl(p.path))}" alt=""><div class="who">${esc(p.uploader || "")}</div></div>`;
      d.querySelector("img").onload = () => {
        host.appendChild(d); requestAnimationFrame(() => d.classList.add("on"));
        setTimeout(() => { while (host.children.length > 1) host.firstChild.remove(); }, 1400);
      };
    }
    refresh().then(next);
    timers.push(setInterval(next, 6500));
    timers.push(setInterval(refresh, 20000));
  }

  // ---------- Pregunta
  let qData = null;
  async function renderQuestion() {
    qData = null;
    stage.innerHTML = '<p class="t-m">Preparando la pregunta…</p>';
    if (!state.question_id) return;
    const myMode = mode;
    const { data } = await sb.from("questions").select("id,kind,prompt,options,image_path,hint").eq("id", state.question_id).maybeSingle();
    if (myMode !== mode) return;
    qData = data;
    if (!qData) return;
    const label = { bebe: "¿Quién es este pequeño viajero?", encuesta: "Encuesta a bordo", trivia: "Trivia de los papás" }[qData.kind] || "";
    const bars = `<div class="bars">${(qData.options || []).map((o, i) => `<div class="bar" data-i="${i}"><div class="fill" style="width:0"></div><span class="lbl">${esc(o)}</span><span class="n">0</span></div>`).join("")}</div>`;
    stage.innerHTML = `<p class="t-m">${label}</p><h1 class="t-l">${esc(qData.prompt)}</h1>
      ${qData.image_path ? `<div class="qwrap"><div class="polaroid"><img src="${esc(photoUrl(qData.image_path))}" alt=""></div><div style="flex:1">${bars}</div></div>` : bars}
      ${qData.hint ? `<p class="t-m">Pista: ${esc(qData.hint)}</p>` : ""}
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
    if (st) st.textContent = revealed ? "¡Esa era la respuesta! +100 millas para quienes acertaron"
      : `${total} de ${count || 0} pasajeros respondieron` + (state.accepting ? " · ¡respondé desde el celu!" : " · votación cerrada");
  }

  // ---------- Ranking
  function renderRanking() {
    stage.innerHTML = '<p class="t-m">Ranking</p><h1 class="t-l">Los pasajeros con más millas</h1><div class="rank" id="rank"></div>';
    every(async () => {
      const { data } = await sb.from("scores").select("name,points").order("points", { ascending: false }).limit(8);
      $("#rank").innerHTML = (data || []).map((r, i) => `<div><span>${i + 1}. ${esc(r.name)}</span><span>${nf(r.points)} millas</span></div>`).join("") || '<p class="t-m">Todavía nadie sumó millas</p>';
    }, 4000);
  }

  // ---------- Postales (deseos)
  function renderWishes() {
    const d = new Date(CFG.EVENT_DATE);
    const pm = isNaN(d) ? "BABY SHOWER" : d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
    stage.innerHTML = `<p class="t-m">Postales para ${esc(CFG.BABY_NAME)}</p>
      <div class="postcard" id="pc">
        <div class="msg"><span id="wish"></span><span class="from" id="wish-by"></span></div>
        <div class="addr">
          <div class="stamp"><img src="assets/img/globo-azul.svg" alt=""></div>
          <div class="postmark">SANTA ROSA<br>${esc(pm)}</div>
          <div><div class="to">Para: <b>${esc(CFG.BABY_NAME)}</b></div><div class="to">&nbsp;</div><div class="to">&nbsp;</div></div>
        </div>
      </div>`;
    let list = [], idx = 0;
    async function refresh() {
      const { data } = await sb.from("wishes").select("name,text").eq("approved", true).order("created_at", { ascending: false }).limit(300);
      if (data) list = data;
    }
    function next() {
      if (!list.length) { $("#wish").textContent = "Escaneá el QR y mandale una postal a Justino para su viaje."; $("#wish-by").textContent = ""; return; }
      const w = list[idx % list.length]; idx++;
      const pc = $("#pc"); pc.style.opacity = 0; pc.style.transform = "rotate(1deg) translateY(2vh)";
      setTimeout(() => {
        $("#wish").textContent = "“" + w.text + "”"; $("#wish-by").textContent = w.name;
        pc.style.opacity = 1; pc.style.transform = `rotate(${idx % 2 ? -1 : 1}deg)`;
        if (voice && window.speechSynthesis) {
          const u = new SpeechSynthesisUtterance(w.text + ". De " + w.name);
          u.lang = "es-AR"; u.rate = 0.95; speechSynthesis.cancel(); speechSynthesis.speak(u);
        }
      }, 800);
    }
    refresh().then(next);
    timers.push(setInterval(next, 11000));
    timers.push(setInterval(refresh, 20000));
  }

  // ---------- Predicciones
  function renderPredictions() {
    stage.innerHTML = '<p class="t-m">Bitácora de predicciones</p><h1 class="t-l">¿Cómo llegará Justino?</h1><div class="stats" id="stats"></div><p class="t-m" id="pcount"></p>';
    every(async () => {
      const { data } = await sb.from("predictions").select("*");
      const d = data || [];
      const avg = (k) => { const v = d.map((x) => +x[k]).filter((x) => x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
      const top = (k) => { const c = {}; d.forEach((x) => { if (x[k]) c[x[k]] = (c[x[k]] || 0) + 1; }); const e = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return e ? e[0] : "—"; };
      const w = avg("weight_kg"), h = avg("height_cm"), fd = top("birth_date");
      const fdTxt = fd !== "—" ? new Date(fd + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" }) : "—";
      $("#stats").innerHTML = [
        [fdTxt, "fecha de llegada más votada"], [w ? w.toFixed(2).replace(".", ",") + " kg" : "—", "peso promedio"], [h ? h.toFixed(1).replace(".", ",") + " cm" : "—", "altura promedio"],
        [top("looks_like"), "se va a parecer a"], [top("eyes"), "color de ojos"], [top("first_word"), "primera palabra"],
      ].map(([b, s]) => `<div><b>${esc(b)}</b><span>${s}</span></div>`).join("");
      $("#pcount").textContent = d.length + " predicciones en la bitácora";
    }, 8000);
  }

  loadState();
  sb.channel("state-tv")
    .on("postgres_changes", { event: "*", schema: "public", table: "state" }, (p) => p.new && applyState(p.new))
    .subscribe();
  setInterval(loadState, 5000);
})();
