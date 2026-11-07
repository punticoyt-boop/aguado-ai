// AGUADO AI - pagina (navegador)
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const KEY = "aguadoai_chats_v1";
  const MAX_TEXT_FILE = 200 * 1024;

  const el = {
    msgs: $("#msgs"), welcome: $("#welcome"), input: $("#input"), send: $("#send"), stop: $("#stop"),
    form: $("#composer"), chats: $("#chats"), files: $("#files"), fileInput: $("#fileInput"),
    status: $("#status"), model: $("#model"), hint: $("#hint"),
  };

  // ---------------- guardado (solo en este navegador) ----------------
  let chats = [];
  let current = null;
  try { chats = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { chats = []; }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(chats.slice(0, 60))); } catch {
      // si se llena (por imagenes), quitamos imagenes viejas y probamos otra vez
      chats.forEach((c) => c.messages.forEach((m) => delete m.images));
      try { localStorage.setItem(KEY, JSON.stringify(chats.slice(0, 60))); } catch {}
    }
  }
  // Version web (GitHub Pages): habla directo con el Ollama de esta PC, sin control de PC
  const ENWEB = !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  // En la web: si tu servidor local (iniciar.bat) esta prendido, lo usamos (con control de PC). Si no, directo a Ollama.
  let DIRECTO = ENWEB;
  let API = "";
  async function buscarServidor() {
    if (!ENWEB) return;
    try {
      const r = await fetch("http://localhost:3000/api/estado", { signal: AbortSignal.timeout(1500) });
      if (!r.ok) throw 0;
      await r.json();
      DIRECTO = false;
      API = "http://localhost:3000";
    } catch {
      DIRECTO = true;
      API = "";
    }
  }
  const OLLAMA = "http://localhost:11434";
  let PERSONALIDAD = "Eres AGUADO AI, la inteligencia artificial de AGUADO STUDIO. Ayudas a crear juegos de Roblox. Responde siempre en espanol y da el codigo Luau completo.";
  if (ENWEB) fetch("personalidad.txt").then((r) => (r.ok ? r.text() : "")).then((t) => { if (t) PERSONALIDAD = t; }).catch(() => {});

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------------- navegacion ----------------
  function route() {
    const view = location.hash === "#instalar" || location.pathname.replace(/\/+$/, "") === "/instalar" ? "instalar" : "chat";
    document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== "view-" + view));
    document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("on", a.dataset.view === view));
    if (view === "chat") el.input.focus();
  }
  window.addEventListener("hashchange", route);

  // ---------------- estado de la IA ----------------
  let estado = { ok: false, modelos: [] };
  async function checkEstado() {
    try {
      await buscarServidor();
      if (ENWEB) el.hint.textContent = DIRECTO ? "Versión web: la IA corre en tu PC con Ollama. Para que pueda usar tu PC, abre iniciar.bat." : "Conectada a tu PC (iniciar.bat): puede usar tu PC, siempre con tu permiso.";
      if (!DIRECTO) estado = await (await fetch(API + "/api/estado")).json();
      else {
        const j = await (await fetch(OLLAMA + "/api/tags", { signal: AbortSignal.timeout(4000) })).json();
        const modelos = (j.models || []).map((m) => m.name);
        estado = { ok: true, modelos, modelo: modelos.find((m) => /coder/.test(m)) || modelos[0] || "qwen2.5-coder:7b" };
      }
    } catch {
      estado = { ok: false, modelos: [] };
    }
    const s = el.status;
    s.classList.toggle("ok", estado.ok && estado.modelos.length > 0);
    s.classList.toggle("bad", !estado.ok || !estado.modelos.length);
    s.querySelector("span").textContent = !estado.ok ? "Ollama apagado" : !estado.modelos.length ? "Falta el modelo" : "IA conectada";
    const prev = el.model.value || localStorage.getItem("aguadoai_model") || estado.modelo;
    const list = estado.modelos.length ? estado.modelos : [estado.modelo || "qwen2.5-coder:7b"];
    el.model.innerHTML = list.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join("");
    el.model.value = list.includes(prev) ? prev : list[0];
    if (typeof showSetup === "function") showSetup();
  }
  // ---------------- instalar el cerebro con un boton ----------------
  const setup = $("#setup"), installBtn = $("#installBtn"), installLog = $("#installLog");
  let instalandoUI = false;
  function showSetup() { if (!instalandoUI) setup.hidden = estado.ok && estado.modelos.length > 0; }
  if (ENWEB) {
    setup.innerHTML = `<b>Conecta la IA de tu PC</b><p>Esta página usa la IA gratis que corre en tu computadora (Ollama). Solo se hace una vez:</p>
      <ol><li>Instala Ollama desde <a href="https://ollama.com/download" target="_blank" rel="noopener">ollama.com/download</a> y descarga el cerebro: <code>ollama pull qwen2.5-coder:7b</code></li>
      <li>Permite esta página. En PowerShell escribe:<pre>setx OLLAMA_ORIGINS "${location.origin}"</pre></li>
      <li>Cierra Ollama (clic derecho en la llamita de la barra de Windows → Quit) y vuelve a abrirlo.</li>
      <li>Recarga esta página. Si el navegador pregunta si puede acceder a tu red local o a otros dispositivos, dale <b>Permitir</b>.</li></ol>`;
  }
  installBtn.addEventListener("click", async () => {
    if (instalandoUI) return;
    instalandoUI = true;
    installBtn.disabled = true;
    installBtn.textContent = "INSTALANDO…";
    installLog.hidden = false;
    installLog.textContent = "";
    try {
      const r = await fetch(API + "/api/instalar", { method: "POST", headers: { "X-AguadoAI": "1" } });
      if (!r.ok || !r.body) throw new Error(r.status === 409 ? "Ya se está instalando." : "No se pudo empezar la instalación.");
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        installLog.textContent += dec.decode(value, { stream: true });
        installLog.scrollTop = installLog.scrollHeight;
      }
    } catch (err) {
      installLog.textContent += "\n" + err.message;
    }
    instalandoUI = false;
    installBtn.disabled = false;
    installBtn.textContent = "INSTALAR CEREBRO GRATIS";
    await checkEstado();
  });

  el.model.addEventListener("change", () => { try { localStorage.setItem("aguadoai_model", el.model.value); } catch {} });

  // ---------------- texto con formato (markdown simple) ----------------
  const LUA_KW = /\b(local|function|end|if|then|else|elseif|for|in|do|while|repeat|until|return|and|or|not|nil|true|false|break|continue|export|type)\b/g;
  function highlight(code, lang) {
    let h = esc(code);
    if (!/^(lua|luau|)$/i.test(lang || "")) return h;
    const parts = [];
    h = h.replace(/(--\[\[[\s\S]*?\]\]|--[^\n]*)/g, (m) => { parts.push(`<span class="tk-c">${m}</span>`); return "\u0001" + String.fromCharCode(0xe000 + parts.length - 1) + "\u0001"; });
    h = h.replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;|&#39;(?:[^&]|&(?!#39;))*?&#39;)/g, (m) => { parts.push(`<span class="tk-s">${m}</span>`); return "\u0001" + String.fromCharCode(0xe000 + parts.length - 1) + "\u0001"; });
    h = h.replace(LUA_KW, '<span class="tk-k">$1</span>').replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tk-n">$1</span>');
    return h.replace(/\u0001([\ue000-\uf8ff])\u0001/g, (_, ch) => parts[ch.charCodeAt(0) - 0xe000]);
  }
  function inline(t) {
    return esc(t)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>");
  }
  function render(md) {
    const out = [];
    const re = /```([\w+-]*)\n?([\s\S]*?)(```|$)/g;
    let last = 0, m;
    while ((m = re.exec(md))) {
      out.push(textBlock(md.slice(last, m.index)));
      const lang = m[1] || "lua";
      out.push(`<div class="code"><div class="bar2"><span>${esc(lang)}</span><button type="button" data-copy>COPIAR</button></div><pre><code>${highlight(m[2].replace(/\n$/, ""), lang)}</code></pre></div>`);
      last = re.lastIndex;
    }
    out.push(textBlock(md.slice(last)));
    return out.join("");
  }
  function textBlock(t) {
    if (!t.trim()) return "";
    const lines = t.replace(/\r/g, "").split("\n");
    let html = "", list = null, para = [];
    const flushP = () => { if (para.length) { html += `<p>${para.map(inline).join("<br>")}</p>`; para = []; } };
    const flushL = () => { if (list) { html += `<${list.t}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.t}>`; list = null; } };
    for (const line of lines) {
      let mm;
      if ((mm = line.match(/^\s*[-*•]\s+(.*)/))) { flushP(); if (!list || list.t !== "ul") { flushL(); list = { t: "ul", items: [] }; } list.items.push(mm[1]); }
      else if ((mm = line.match(/^\s*\d+[.)]\s+(.*)/))) { flushP(); if (!list || list.t !== "ol") { flushL(); list = { t: "ol", items: [] }; } list.items.push(mm[1]); }
      else if ((mm = line.match(/^#{1,4}\s+(.*)/))) { flushP(); flushL(); html += `<h4>${inline(mm[1])}</h4>`; }
      else if (!line.trim()) { flushP(); flushL(); }
      else { flushL(); para.push(line); }
    }
    flushP(); flushL();
    return html;
  }
  el.msgs.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    const code = b.closest(".code").querySelector("code").innerText;
    try { await navigator.clipboard.writeText(code); b.textContent = "¡COPIADO!"; } catch { b.textContent = "NO SE PUDO"; }
    setTimeout(() => (b.textContent = "COPIAR"), 1500);
  });

  // ---------------- mensajes en pantalla ----------------
  function bubbleHTML(m) {
    if (m.role === "user") {
      const imgs = (m.images || []).length ? `<div class="imgs">${m.images.map((b) => `<img src="data:image/*;base64,${b}" alt="">`).join("")}</div>` : "";
      const atts = (m.attachNames || []).map((n) => `<span class="att">${esc(n)}</span>`).join("");
      return imgs + atts + textBlock(m.display ?? m.content);
    }
    return render(m.content) + (m.tool_calls || []).map((tc) => toolCardHTML(tc, "old")).join("");
  }
  function addMsg(m, extraClass = "") {
    if (m.role === "tool") return null;
    el.welcome.hidden = true;
    const d = document.createElement("div");
    d.className = "msg fade-in " + (m.role === "user" ? "me" : "ai");
    d.innerHTML = `<div class="av">${m.role === "user" ? "" : '<img src="logo-aguado.png" alt="">'}</div><div class="bubble ${extraClass}">${bubbleHTML(m)}</div>`;
    el.msgs.appendChild(d);
    scroll();
    return d.querySelector(".bubble");
  }
  function scroll() { el.msgs.scrollTop = el.msgs.scrollHeight; }
  function showChat(c) {
    current = c;
    el.msgs.querySelectorAll(".msg").forEach((n) => n.remove());
    el.welcome.hidden = !!(c && c.messages.length);
    if (c) c.messages.forEach((m) => addMsg(m));
    renderList();
  }
  function renderList() {
    el.chats.innerHTML = chats
      .map((c) => `<div class="chat-item ${current && c.id === current.id ? "on" : ""}" data-id="${c.id}"><span>${esc(c.title || "Chat nuevo")}</span><button type="button" title="Borrar chat" data-del="${c.id}">×</button></div>`)
      .join("");
  }
  el.chats.addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    if (del) {
      chats = chats.filter((c) => c.id !== del.dataset.del);
      save();
      if (current && current.id === del.dataset.del) showChat(null); else renderList();
      return;
    }
    const it = e.target.closest(".chat-item");
    if (it && !busy) { toChat(); showChat(chats.find((c) => c.id === it.dataset.id)); }
  });
  const toChat = () => { if (location.hash) { history.pushState({}, "", location.pathname); route(); } };
  $("#newChat").addEventListener("click", () => { if (!busy) { toChat(); showChat(null); el.input.focus(); } });
  document.querySelectorAll(".sug").forEach((b) => b.addEventListener("click", () => { el.input.value = b.dataset.q; grow(); el.input.focus(); }));

  // ---------------- adjuntos ----------------
  let pending = []; // {name, kind:"img"|"txt", data}
  function renderFiles() {
    el.files.hidden = !pending.length;
    el.files.innerHTML = pending
      .map((f, i) => `<div class="file">${f.kind === "img" ? `<img src="data:image/*;base64,${f.data}" alt="">` : `<span class="ext">${esc((f.name.split(".").pop() || "TXT").slice(0, 4).toUpperCase())}</span>`}<span>${esc(f.name)}</span><button type="button" data-rm="${i}" title="Quitar">×</button></div>`)
      .join("");
  }
  el.files.addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (b) { pending.splice(+b.dataset.rm, 1); renderFiles(); } });
  const readAs = (file, how) => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r[how](file); });
  async function addFiles(list) {
    for (const f of list) {
      if (f.type.startsWith("image/")) {
        const url = await readAs(f, "readAsDataURL");
        pending.push({ name: f.name || "imagen.png", kind: "img", data: String(url).split(",")[1] });
      } else if (f.size <= MAX_TEXT_FILE) {
        pending.push({ name: f.name, kind: "txt", data: await readAs(f, "readAsText") });
      } else {
        alert(`"${f.name}" es muy grande (máximo 200 KB para archivos de texto).`);
      }
    }
    renderFiles();
  }
  el.fileInput.addEventListener("change", () => { addFiles([...el.fileInput.files]); el.fileInput.value = ""; });
  el.input.addEventListener("paste", (e) => {
    const imgs = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (imgs.length) { e.preventDefault(); addFiles(imgs); }
  });

  // ---------------- enviar ----------------
  let busy = false;
  let ctrl = null;
  function grow() { el.input.style.height = "auto"; el.input.style.height = Math.min(220, el.input.scrollHeight) + "px"; }
  el.input.addEventListener("input", grow);
  el.input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); el.form.requestSubmit(); } });
  el.stop.addEventListener("click", () => { ctrl && ctrl.abort(); cancelarPermisos(); });
  function setBusy(b) { busy = b; el.send.hidden = b; el.stop.hidden = !b; }

  const ERRORES = {
    OLLAMA_APAGADO: "La IA no está prendida. Abre **Ollama** en tu PC (o instálalo desde ollama.com) y vuelve a intentar. Mira la pestaña *Cómo instalar*.",
    MODELO_NO_INSTALADO: "Ese modelo no está descargado. En la terminal escribe: `ollama pull qwen2.5-coder:7b`",
    SIN_CLAVE: "Para usar Claude falta la clave. Ponla en el archivo `.env` como `ANTHROPIC_API_KEY=...` y reinicia `iniciar.bat`.",
    CLAVE_MALA: "La clave de Claude no es válida. Revisa `ANTHROPIC_API_KEY` en el archivo `.env`.",
    SIN_SALDO: "Tu cuenta de Claude no tiene saldo. Agrega crédito en platform.claude.com (Billing).",
    LIMITE: "Claude recibió demasiados mensajes seguidos. Espera un momento y vuelve a intentar.",
    OCUPADO: "Claude está muy ocupado ahora mismo. Intenta en un momento.",
    CLAUDE_ERROR: "Claude devolvió un error. Intenta de nuevo; si sigue, mira la consola donde corre `iniciar.bat`.",
    SIN_INTERNET: "No me pude conectar con Claude. Revisa tu internet.",
    SIN_CONEXION: "No me pude conectar con **Ollama** en tu PC. Revisa que esté abierto y que hayas permitido esta página (los pasos están en la pantalla de inicio: dale a *Nuevo chat*). Si el navegador te pregunta si la página puede acceder a tu red local, dale **Permitir**.",
    MUY_GRANDE: "Los archivos que adjuntaste son muy grandes. Prueba con menos o más pequeños.",
  };

  // ---------- herramientas (la IA usando la PC) ----------
  const TOOLS = {
    listar_carpeta: { t: "Ver carpeta", k: "ruta", i: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>' },
    leer_archivo: { t: "Leer archivo", k: "ruta", i: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>' },
    escribir_archivo: { t: "Crear / cambiar archivo", k: "ruta", i: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>' },
    ejecutar_comando: { t: "Correr comando", k: "comando", i: '<path d="m4 17 6-5-6-5M12 19h8"/>' },
    abrir: { t: "Abrir", k: "que", i: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>' },
    ver_pantalla: { t: "Ver la pantalla", k: () => "", i: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>' },
    clic: { t: "Clic", k: (a) => `${a.doble ? "doble " : ""}${a.boton === "derecho" ? "derecho " : ""}en ${a.x}, ${a.y}`, i: '<path d="m5 3 14 7-6 2-2 6Z"/>' },
    escribir: { t: "Escribir", k: "texto", i: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>' },
    tecla: { t: "Tecla", k: "combo", i: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9z"/>' },
    desplazar: { t: "Scroll", k: "direccion", i: '<rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 7v4"/>' },
    esperar: { t: "Esperar", k: (a) => `${a.segundos} s`, i: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
  };
  const segura = (n) => (estado.seguras || ["listar_carpeta", "leer_archivo"]).includes(n);
  function toolCardHTML(tc, st) {
    const f = tc.function || {};
    const d = TOOLS[f.name] || { t: f.name, k: "", i: "" };
    const a = f.arguments || {};
    const extra = f.name === "escribir_archivo" ? a.contenido : f.name === "ejecutar_comando" ? "" : "";
    return `<div class="tool ${st || ""}"><div class="tool-head"><svg viewBox="0 0 24 24">${d.i}</svg><b>${esc(d.t)}</b><code>${esc(String((typeof d.k === "function" ? d.k(a) : a[d.k]) ?? ""))}</code><span class="tool-st"></span></div>${
      extra ? `<details><summary>Ver contenido</summary><pre>${esc(String(extra).slice(0, 20000))}</pre></details>` : ""
    }<div class="tool-out" hidden></div><div class="tool-actions" hidden><button type="button" class="btn sm" data-ok>Permitir</button><button type="button" class="btn sm ghost" data-all>Permitir todo en este chat</button><button type="button" class="btn sm ghost" data-no>Cancelar</button></div></div>`;
  }
  let pendientes = [];
  function cancelarPermisos() { pendientes.forEach((fn) => fn(false)); pendientes = []; }
  function pedirPermiso(card) {
    const acts = card.querySelector(".tool-actions");
    acts.hidden = false;
    card.classList.add("ask");
    card.querySelector(".tool-st").textContent = "Esperando tu permiso";
    scroll();
    return new Promise((resolve) => {
      const done = (ok) => { acts.hidden = true; card.classList.remove("ask"); pendientes = pendientes.filter((x) => x !== done); resolve(ok); };
      pendientes.push(done);
      acts.querySelector("[data-ok]").onclick = () => done(true);
      acts.querySelector("[data-no]").onclick = () => done(false);
      acts.querySelector("[data-all]").onclick = () => { if (current) current.autoOk = true; save(); done(true); };
    });
  }
  async function correrHerramienta(tc, card) {
    const f = tc.function || {};
    const st = card.querySelector(".tool-st");
    const out = card.querySelector(".tool-out");
    if (!TOOLS[f.name]) return { texto: "Error: esa herramienta no existe." };
    if (!segura(f.name) && !(current && current.autoOk) && !(await pedirPermiso(card))) {
      card.classList.add("no");
      st.textContent = "Cancelado";
      return { texto: "El usuario NO dio permiso. No se hizo nada." };
    }
    st.textContent = "Trabajando…";
    card.classList.add("run");
    let r;
    try {
      r = await (await fetch(API + "/api/herramienta", { method: "POST", headers: { "Content-Type": "application/json", "X-AguadoAI": "1" }, body: JSON.stringify({ name: f.name, arguments: f.arguments || {} }) })).json();
    } catch { r = { ok: false, resultado: "Error: no se pudo hablar con el servidor." }; }
    card.classList.remove("run");
    card.classList.add(r.ok ? "ok" : "bad");
    st.textContent = r.ok ? "Hecho" : "Falló";
    out.hidden = false;
    out.innerHTML = r.imagen
      ? `<details><summary>Ver captura</summary><img class="shot" src="data:image/jpeg;base64,${r.imagen}" alt=""></details>`
      : `<details><summary>Resultado</summary><pre>${esc(r.resultado)}</pre></details>`;
    return { texto: String(r.resultado ?? ""), imagen: r.imagen };
  }
  // Este modelo escribe la herramienta como texto JSON en vez de usarla: la buscamos en el texto
  function toolDeTexto(text) {
    const re = /\{\s*"(?:name|function)"/g;
    let m;
    while ((m = re.exec(text))) {
      let depth = 0, inStr = false, esc2 = false, end = -1;
      for (let i = m.index; i < text.length; i++) {
        const ch = text[i];
        if (inStr) { if (esc2) esc2 = false; else if (ch === "\\") esc2 = true; else if (ch === '"') inStr = false; continue; }
        if (ch === '"') inStr = true;
        else if (ch === "{") depth++;
        else if (ch === "}" && --depth === 0) { end = i + 1; break; }
      }
      if (end < 0) continue;
      try {
        const j = JSON.parse(text.slice(m.index, end));
        const f = typeof j.function === "object" ? j.function : j;
        const name = f.name || j.function;
        let args = f.arguments || f.parameters || j.arguments || {};
        if (typeof args === "string") args = JSON.parse(args);
        if (TOOLS[name]) {
          const antes = text.slice(0, m.index).replace(/```(?:json)?\s*$/i, "").trim();
          return { calls: [{ function: { name, arguments: args } }], antes };
        }
      } catch {}
    }
    return null;
  }
  const pareceTool = (t) => /^\s*(```(json)?\s*)?\{/.test(t);

  // Un turno de la IA: pide al servidor y va mostrando el texto. Devuelve {content, tool_calls}
  async function turnoIA(bubble) {
    bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    let r;
    try {
      r = !DIRECTO
        ? await fetch(API + "/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-AguadoAI": "1" },
            signal: ctrl.signal,
            body: JSON.stringify({ model: el.model.value, messages: current.messages.map(({ role, content, images, tool_calls, tool_name, tool_call_id }) => ({ role, content, images, tool_calls, tool_name, tool_call_id })) }),
          })
        : await fetch(OLLAMA + "/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: ctrl.signal,
            body: JSON.stringify({
              model: el.model.value,
              stream: true,
              keep_alive: "60m",
              messages: [{ role: "system", content: PERSONALIDAD }, ...current.messages.filter((m) => m.role === "user" || (m.role === "assistant" && !m.tool_calls)).slice(-40).map(({ role, content, images }) => ({ role, content, images }))],
              options: { temperature: 0.4, num_ctx: 8192 },
            }),
          });
    } catch (e) {
      if (e.name === "AbortError") throw e;
      throw new Error(DIRECTO ? "SIN_CONEXION" : "OLLAMA_APAGADO");
    }
    if (!r.ok || !r.body) {
      let j = {};
      try { j = await r.json(); } catch {}
      if (DIRECTO) throw new Error(/not found/i.test(j.error || "") ? "MODELO_NO_INSTALADO" : "ERROR");
      throw new Error(j.error || "ERROR");
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "", answer = "", calls = [], raf = 0;
    const pintar = () => { bubble.innerHTML = (pareceTool(answer) ? "" : render(answer)) || '<span class="typing"><i></i><i></i><i></i></span>'; scroll(); };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let j;
        try { j = JSON.parse(line); } catch { continue; }
        if (j.error) throw new Error(/not found/i.test(j.error) ? "MODELO_NO_INSTALADO" : "ERROR");
        if (j.message && j.message.content) answer += j.message.content;
        if (j.message && Array.isArray(j.message.tool_calls)) calls.push(...j.message.tool_calls);
      }
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; pintar(); });
    }
    if (raf) cancelAnimationFrame(raf);
    if (!calls.length && !DIRECTO && !/^claude-/.test(el.model.value)) {
      const t = toolDeTexto(answer);
      if (t) { calls = t.calls; answer = t.antes; }
    }
    return { content: answer, tool_calls: calls };
  }

  el.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = el.input.value.trim();
    if (busy || (!text && !pending.length)) return;

    if (!current) {
      current = { id: uid(), title: (text || pending[0].name).slice(0, 48), messages: [] };
      chats.unshift(current);
    }
    const txtFiles = pending.filter((f) => f.kind === "txt");
    const images = pending.filter((f) => f.kind === "img").map((f) => f.data);
    let content = text;
    for (const f of txtFiles) content += `\n\nArchivo adjunto "${f.name}":\n\`\`\`\n${f.data}\n\`\`\``;
    const userMsg = { role: "user", content: content || "Mira esta imagen.", display: text, attachNames: txtFiles.map((f) => f.name) };
    if (images.length) userMsg.images = images;
    const inicio = current.messages.length;
    current.messages.push(userMsg);
    addMsg(userMsg);
    renderList();
    save();
    el.input.value = "";
    grow();
    pending = [];
    renderFiles();

    setBusy(true);
    ctrl = new AbortController();
    let respondio = false;
    let bubble = addMsg({ role: "assistant", content: "" });
    try {
      for (let paso = 0; paso < 40; paso++) {
        const t = await turnoIA(bubble);
        if (!t.tool_calls.length) {
          bubble.innerHTML = render(t.content || "(sin respuesta)");
          current.messages.push({ role: "assistant", content: t.content || "(sin respuesta)" });
          respondio = true;
          break;
        }
        // La IA quiere usar la PC
        bubble.innerHTML = render(t.content) + t.tool_calls.map((tc) => toolCardHTML(tc)).join("");
        current.messages.push({ role: "assistant", content: t.content || "", tool_calls: t.tool_calls });
        respondio = true;
        save();
        const cards = bubble.querySelectorAll(".tool");
        for (let i = 0; i < t.tool_calls.length; i++) {
          const res = await correrHerramienta(t.tool_calls[i], cards[i]);
          // solo guardamos la ultima captura de pantalla (las imagenes ocupan mucho)
          if (res.imagen) current.messages.forEach((m) => { if (m.role === "tool") delete m.images; });
          current.messages.push({ role: "tool", tool_name: t.tool_calls[i].function.name, tool_call_id: t.tool_calls[i].id, content: res.texto, ...(res.imagen ? { images: [res.imagen] } : {}) });
          save();
        }
        if (ctrl.signal.aborted) throw Object.assign(new Error("detenido"), { name: "AbortError" });
        bubble = addMsg({ role: "assistant", content: "" });
      }
    } catch (err) {
      if (err.name === "AbortError") {
        if (!bubble.querySelector(".tool")) {
          const parcial = bubble.innerText.trim() && !bubble.querySelector(".typing") ? bubble.innerText : "";
          bubble.innerHTML = render((parcial ? parcial + "\n\n" : "") + "*(detenido)*");
          if (parcial) { current.messages.push({ role: "assistant", content: parcial }); respondio = true; }
        }
      } else {
        bubble.classList.add("err");
        bubble.innerHTML = render(ERRORES[err.message] || "Algo salió mal al hablar con la IA. Revisa que Ollama esté abierto y vuelve a intentar.");
        checkEstado();
      }
    }
    if (!respondio) {
      current.messages.splice(inicio); // quitamos la pregunta que fallo para poder reintentar
      el.input.value = userMsg.display || "";
      grow();
    }
    save();
    renderList();
    setBusy(false);
    ctrl = null;
    scroll();
  });

  // ---------------- menu en celular ----------------
  const shell = $("#shell");
  const closeMenu = () => shell.classList.remove("menu");
  $("#openSide").addEventListener("click", () => shell.classList.add("menu"));
  $("#closeSide").addEventListener("click", closeMenu);
  $("#scrim").addEventListener("click", closeMenu);
  $("#side").addEventListener("click", (e) => { if (e.target.closest(".chat-item span, .new, .nav a")) closeMenu(); });

  // ---------------- arranque ----------------
  route();
  renderList();
  if (chats[0]) showChat(chats[0]);
  checkEstado();
  setInterval(checkEstado, 15000);
})();
