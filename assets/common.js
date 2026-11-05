(function () {
  const CFG = window.BABY_CONFIG || {};
  const configured =
    CFG.SUPABASE_URL && !/TU-PROYECTO/.test(CFG.SUPABASE_URL) &&
    CFG.SUPABASE_ANON_KEY && !/TU-ANON/.test(CFG.SUPABASE_ANON_KEY);
  const sb = configured && window.supabase
    ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY)
    : null;

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  function toast(msg, kind) {
    const t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, 3500);
  }

  function photoUrl(path) {
    if (!path) return "";
    if (/^https?:/.test(path)) return path;
    return sb.storage.from("fotos").getPublicUrl(path).data.publicUrl;
  }

  async function resizeImage(file, max = 1600, quality = 0.82) {
    let img;
    try {
      img = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (e) {
      img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error("No se pudo leer la imagen (probá con otra foto)"));
        i.src = URL.createObjectURL(file);
      });
    }
    const w = img.width, h = img.height, s = Math.min(1, max / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo procesar la imagen"))), "image/jpeg", quality));
  }

  async function uploadPhoto(file, folder) {
    const blob = await resizeImage(file);
    const path = folder + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
    const { error } = await sb.storage.from("fotos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) throw error;
    return path;
  }

  function requireConfig() {
    if (sb) return true;
    const d = document.createElement("div");
    d.className = "config-banner";
    d.innerHTML = "⚙️ Falta configurar Supabase en <code>config.js</code> (ver README).";
    document.body.prepend(d);
    return false;
  }

  function fillConfigText() {
    $$("[data-cfg]").forEach((el) => { const v = CFG[el.dataset.cfg]; if (v != null) el.textContent = v; });
    $$("[data-cfg-href]").forEach((el) => { const v = CFG[el.dataset.cfgHref]; if (v) el.href = v; });
  }

  const baseUrl = () => location.href.replace(/[^/]*([?#].*)?$/, "");
  const errMsg = (e) => (e && (e.message || e.error_description)) || String(e);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  window.App = { CFG, sb, store, esc, $, $$, toast, photoUrl, resizeImage, uploadPhoto, requireConfig, fillConfigText, baseUrl, errMsg, shuffle };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fillConfigText);
  else fillConfigText();
})();
