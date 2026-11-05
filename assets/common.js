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

  // Íconos de línea estilo grabado (stroke = color del texto)
  const ICONS = {
    ticket: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M15 7v10" stroke-dasharray="2 2"/>',
    valija: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M7 8v12M17 8v12"/>',
    camara: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
    brujula: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    sobre: '<rect x="3" y="6" width="18" height="13" rx="1.5"/><path d="M3 7.5l9 6.5 9-6.5"/>',
    avion: '<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    globo: '<path d="M12 2a7 7 0 0 0-7 7c0 3.6 3 6.2 5 8h4c2-1.8 5-4.4 5-8a7 7 0 0 0-7-7z"/><path d="M12 2c-2 2-3 4.5-3 7s1 5.5 1 8M12 2c2 2 3 4.5 3 7s-1 5.5-1 8"/><rect x="10" y="19.5" width="4" height="2.5" rx=".5"/><path d="M10 17l.3 2.5M14 17l-.3 2.5"/>',
    mapa: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
    pasaporte: '<rect x="5" y="2.5" width="14" height="19" rx="1.5"/><circle cx="12" cy="10" r="3.5"/><path d="M8.5 10h7M12 6.5c-1 1-1.4 2.2-1.4 3.5s.4 2.5 1.4 3.5c1-1 1.4-2.2 1.4-3.5S13 7.5 12 6.5M9 17h6"/>',
    copa: '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3.5M17 6h2.5a2.5 2.5 0 0 1-2.6 3.5"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`;
  function fillIcons(root) { $$("[data-icon]", root).forEach((el) => { el.classList.add("ico"); el.innerHTML = icon(el.dataset.icon); }); }
  const nf = (n) => Number(n || 0).toLocaleString("es-AR");

  window.App = { CFG, sb, store, esc, $, $$, toast, photoUrl, resizeImage, uploadPhoto, requireConfig, fillConfigText, baseUrl, errMsg, shuffle, icon, fillIcons, nf };
  const init = () => { fillConfigText(); fillIcons(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
