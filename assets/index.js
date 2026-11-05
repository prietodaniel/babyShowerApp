(function () {
  const { CFG, sb, store, $, toast, uploadPhoto, requireConfig, errMsg } = App;
  

  // Cuenta regresiva
  const target = new Date(CFG.EVENT_DATE).getTime();
  function tick() {
    const el = $("#countdown");
    let d = Math.max(0, target - Date.now());
    if (!d) { el.innerHTML = '<div><b>¡Hoy!</b><span>despegamos</span></div>'; return; }
    const parts = [["días", 864e5], ["horas", 36e5], ["min", 6e4], ["seg", 1e3]].map(([l, ms]) => {
      const v = Math.floor(d / ms); d -= v * ms; return `<div><b>${v}</b><span>${l}</span></div>`;
    });
    el.innerHTML = parts.join("");
  }
  if (!isNaN(target)) { tick(); setInterval(tick, 1000); }

  const ok = requireConfig();
  function guard(btn, fn) {
    return async (ev) => {
      ev.preventDefault();
      if (!ok) return toast("La app todavía no está configurada", "err");
      btn.disabled = true;
      try { await fn(); } catch (e) { toast("Error: " + errMsg(e), "err"); }
      finally { btn.disabled = false; }
    };
  }

  // Asistencia
  const rf = $("#rsvp-form");
  if (store.get("rsvp_done")) { rf.classList.add("hidden"); $("#rsvp-done").classList.remove("hidden"); }
  $("#rsvp-again").onclick = () => { rf.reset(); rf.classList.remove("hidden"); $("#rsvp-done").classList.add("hidden"); };
  rf.addEventListener("change", () => {
    $("#r-count").classList.toggle("hidden", rf.att.value === "0");
  });
  rf.addEventListener("submit", guard($("button[type=submit]", rf), async () => {
    const attending = rf.att.value === "1";
    const row = {
      name: $("#r-name").value.trim(),
      attending,
      adults: attending ? +$("#r-adults").value || 0 : 0,
      kids: attending ? +$("#r-kids").value || 0 : 0,
      phone: $("#r-phone").value.trim() || null,
      message: $("#r-msg").value.trim() || null,
    };
    const { error } = await sb.from("rsvps").insert(row);
    if (error) throw error;
    store.set("rsvp_done", true);
    store.set("guest_name", row.name);
    rf.classList.add("hidden"); $("#rsvp-done").classList.remove("hidden");
    toast(attending ? "¡Te esperamos a bordo! ✈" : "¡Gracias por avisar!");
  }));

  // Prellenar nombres
  const n = store.get("guest_name");
  if (n) ["#r-name", "#b-name", "#p-name"].forEach((s) => { if (!$(s).value) $(s).value = n; });

  // Foto de bebé
  const bf = $("#baby-form");
  bf.addEventListener("submit", guard($("button", bf), async () => {
    const file = $("#b-file").files[0];
    if (!file) throw new Error("Elegí una foto");
    const name = $("#b-name").value.trim();
    const path = await uploadPhoto(file, "bebes");
    const { error } = await sb.from("baby_submissions").insert({ name, path });
    if (error) throw error;
    store.set("guest_name", name);
    bf.reset(); $("#b-name").value = name;
    toast("¡Foto recibida! Shhh… es un secreto");
  }));

  // Predicciones
  const pf = $("#pred-form");
  pf.addEventListener("submit", guard($("button", pf), async () => {
    const v = (s) => $(s).value.trim() || null;
    const row = {
      name: v("#p-name"), birth_date: v("#p-date"),
      weight_kg: v("#p-weight") ? +$("#p-weight").value : null,
      height_cm: v("#p-height") ? +$("#p-height").value : null,
      hair: v("#p-hair"), eyes: v("#p-eyes"), looks_like: v("#p-like"), first_word: v("#p-word"),
    };
    const { error } = await sb.from("predictions").insert(row);
    if (error) throw error;
    store.set("guest_name", row.name);
    pf.reset(); $("#p-name").value = row.name;
    toast("¡Predicción guardada en la bitácora!");
  }));
})();
