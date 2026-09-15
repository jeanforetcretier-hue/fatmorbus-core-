import {
  configureWorkspace,
  registerWorkspaceSettings,
  installWorkspaceHooks,
  registerModuleMetadata,
  getRegisteredMetadata,
  getWorkspaceApi
} from "./fatmorbus-workspace.mjs";

const MODULE_ID = "fatmorbus-core-by-fatmorbus";
const BRAND = "Fatmorbus";
const CORE_VERSION = "1.5.3";

/* The hub artwork (assets/fatmorbus-core-frame.png) is exactly 2048 x 1060.
   The panel is laid out at that size in real pixels and uniformly scaled, so
   the content always lands inside the frame openings on any resolution. */
const DESIGN_WIDTH = 2048;
const DESIGN_HEIGHT = 1060;
const HUB_MARGIN = 24;

const SOCIALS = Object.freeze({
  discord: "https://discord.gg/uEc36zgrrM",
  youtube: "https://www.youtube.com/@Fatmorbus/videos",
  instagram: "https://www.instagram.com/fatmorbus_studio/",
  patreon: "https://www.patreon.com/c/FatmorbusStudio/home"
});

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA1xASsjOGGcOOQeJ9Hfic
TJIQXmzn5C916lPzOXCiUuXcqMu/Wy4q+ydxKHtT421dCFDAZ/RxWZlJCCfIoJha
VoD7j81L/bFOkhAoLIUnON6VdEEMbgRTKMN+1c+3yBNz93jZsInQTGHKdUPKiE5d
SOzxCNrNX15gil2rsxgsDRH0aediSasq8T1XQvg+QZmfr6x0ZfZj5KdOnRvRVlbI
laSWE1vxG7caP22PoJGbK8PesAy2jzLQy7bCRYLwfR0vsmRIi1rpl+58AHZcpb4f
wvz0UdZ6A9wU2tir4c2u3Q/O6TDqab4KASCwMzzeNYz7lGBdUhXirVoY6jCnnNpK
OqsivtkUREIgjd3hZEq9LTrjzX+dGnn2RPv+DuXSK8STGPVtRxWJ3vYFkT7LLno7
e/XSz568MlnnKFpWXhvL3agwVR4kBWKESNlPTfnKkT7JjlAAo2QQsv/RfuzmyP/E
SjNeEEyHI7RqoWSDsT8PufHXB5nBDamXJZTlV6n9LnDBAgMBAAE=
-----END PUBLIC KEY-----`;

/* Default emblems so the Recognized Modules list reads like a catalogue even
   when a module has not registered its own icon. Keyword order matters. */
const DEFAULT_ICONS = Object.freeze([
  [/core/, "fa-solid fa-crown"],
  [/retro/, "fa-solid fa-gamepad"],
  [/sheet/, "fa-solid fa-scroll"],
  [/(dungeon|crawl)/, "fa-solid fa-dungeon"],
  [/(legendary|boss)/, "fa-solid fa-skull-crossbones"],
  [/(monster|forge|bestiar)/, "fa-solid fa-dragon"],
  [/(delete|clean|purge)/, "fa-solid fa-trash"],
  [/(location|reveal)/, "fa-solid fa-compass"],
  [/(ammo|arrow|quiver)/, "fa-solid fa-crosshairs"],
  [/(coin|gold|loot)/, "fa-solid fa-coins"],
  [/(reliquary|inventor|piles|item)/, "fa-solid fa-box-archive"],
  [/(hub|combat)/, "fa-solid fa-shield-halved"],
  [/(numbers|damage)/, "fa-solid fa-bolt"],
  [/(memento|death|mori)/, "fa-solid fa-ghost"],
  [/(activit|spell|magic)/, "fa-solid fa-wand-sparkles"],
  [/(grimdark|crpg|shadowdark)/, "fa-solid fa-skull"]
]);

const integrityCache = new Map();
let coreReady = false;
let coreApi = null;


/* =========================================================================
   Public integration API
   Exposed at module-evaluation time so By Fatmorbus modules can register
   safely regardless of script/hook ordering. See INTEGRATION.md.
   ========================================================================= */

configureWorkspace({
  moduleId: MODULE_ID,
  brand: BRAND,
  getModules: getActiveFatmorbusModules,
  isFatmorbusModule,
  openHub
});

coreApi = buildCoreApi();
globalThis.FatmorbusCore = coreApi;

/* Ordering-proof registration channel: a module may simply emit the hook from
   its own init without ever touching game.fatmorbus or depending on Core. */
Hooks.on("fatmorbusRegisterModule", data => safeRegisterModule(data));

function buildCoreApi() {
  const workspaceApi = getWorkspaceApi();
  return Object.freeze({
    ...workspaceApi,
    version: CORE_VERSION,
    socials: SOCIALS,
    get isReady() { return coreReady; },
    whenReady: callback => whenCoreReady(callback),
    registerModule: data => safeRegisterModule(data),
    openHub: options => openHub(options),
    verifyModule: id => verifyModuleIntegrity(id)
  });
}

/* registerModule must NEVER throw: an exception here would escape into the
   caller's init hook and break that module instead of Core. */
function safeRegisterModule(data) {
  try {
    const payload = sanitizeMetadata(data);
    if (!payload) {
      console.warn(`${BRAND} Core | Ignored an invalid registerModule payload.`, data);
      return false;
    }
    return registerModuleMetadata(payload);
  } catch (error) {
    console.warn(`${BRAND} Core | registerModule failed and was ignored.`, error);
    return false;
  }
}

function sanitizeMetadata(data) {
  if (!data || typeof data !== "object") return null;
  const id = String(data.id ?? "").trim();
  if (!id) return null;
  const payload = { id };
  if (data.name != null) payload.name = String(data.name);
  if (data.description != null) payload.description = String(data.description);
  if (data.version != null) payload.version = String(data.version);
  if (data.system != null) payload.system = String(data.system);
  const iconClass = sanitizeIconClass(data.iconClass ?? data.faIcon);
  if (iconClass) payload.iconClass = iconClass;
  const icon = sanitizeImagePath(data.icon);
  if (icon) payload.icon = icon;
  payload.tools = sanitizeTools(data.tools);
  payload.sceneControls = sanitizeSceneControls(data.sceneControls);
  return payload;
}

function sanitizeTools(tools) {
  const list = Array.isArray(tools) ? tools : [];
  const result = [];
  for (const tool of list) {
    if (!tool || typeof tool !== "object") continue;
    const id = String(tool.id ?? tool.name ?? "").trim();
    if (!id) continue;
    const entry = { id, label: String(tool.label ?? tool.name ?? id) };
    const icon = sanitizeIconClass(tool.icon);
    if (icon) entry.icon = icon;
    if (typeof tool.action === "function") entry.action = tool.action;
    else if (typeof tool.onClick === "function") entry.action = tool.onClick;
    else if (typeof tool.callback === "function") entry.action = tool.callback;
    if (typeof tool.hook === "string") entry.hook = tool.hook;
    if (typeof tool.visible === "function" || typeof tool.visible === "boolean") entry.visible = tool.visible;
    if (tool.gmOnly) entry.gmOnly = true;
    result.push(entry);
  }
  return result;
}

function sanitizeSceneControls(controls) {
  const list = Array.isArray(controls) ? controls : [];
  const result = [];
  for (const ref of list) {
    if (typeof ref === "string") {
      const name = ref.trim();
      if (name) result.push(name);
      continue;
    }
    if (!ref || typeof ref !== "object") continue;
    const control = String(ref.control ?? ref.group ?? "").trim();
    if (!control) continue;
    const tool = String(ref.tool ?? ref.name ?? "").trim();
    result.push(tool ? { control, tool } : { control });
  }
  return result;
}

function sanitizeIconClass(value) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 80) return "";
  return /^[a-z0-9 _-]+$/i.test(text) ? text : "";
}

function sanitizeImagePath(value) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 400) return "";
  if (/^(javascript|data|vbscript):/i.test(text)) return "";
  return text;
}

function whenCoreReady(callback) {
  if (typeof callback !== "function") return;
  if (coreReady) {
    try { callback(coreApi); } catch (error) { console.warn(`${BRAND} Core | whenReady callback failed`, error); }
    return;
  }
  Hooks.once("fatmorbusCoreReady", api => {
    try { callback(api); } catch (error) { console.warn(`${BRAND} Core | whenReady callback failed`, error); }
  });
}


/* =========================================================================
   Lifecycle
   ========================================================================= */

Hooks.once("init", () => {
  registerWorkspaceSettings();

  game.settings.register(MODULE_ID, "showWelcome", {
    name: "Show Fatmorbus module presentations",
    hint: "Show the Fatmorbus presentation every time this Foundry world opens. Disable this only if you do not want the presentation to appear automatically.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "verifyIntegrity", {
    name: "Verify signed Fatmorbus releases",
    hint: "Checks signed integrity manifests when available and warns if official release files have changed.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "seenVersions", {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  try {
    Object.defineProperty(game, "fatmorbus", { configurable: true, enumerable: false, value: coreApi });
  } catch {
    try { game.fatmorbus = coreApi; } catch { /* Non-extensible Game instance; global API remains available. */ }
  }

  coreReady = true;
  Hooks.callAll("fatmorbusCoreReady", coreApi);
});

Hooks.once("setup", () => installWorkspaceHooks());

Hooks.once("ready", async () => {
  try {
    // The Fatmorbus presentation is intentionally shown on every world load.
    // The client-side "showWelcome" setting is the single opt-out switch and
    // is controlled by the checkbox in the presentation itself.
    if (!readSetting("showWelcome", true)) return;
    const modules = getActiveFatmorbusModules();
    const seen = readSetting("seenVersions", {}) ?? {};
    const changed = modules.filter(module => seen[module.id] !== module.version);
    await delay(450);
    await openHub({ modules: changed, automatic: true });
  } catch (error) {
    console.warn(`${BRAND} Core | Welcome presentation could not be opened`, error);
  }
});


/* =========================================================================
   Module discovery
   ========================================================================= */

function getActiveFatmorbusModules() {
  try {
    const entries = Array.from(game.modules?.values?.() ?? []);
    return entries
      .filter(module => module?.active && isFatmorbusModule(module))
      .map(module => normalizeModule(module))
      .sort((a, b) => a.title.localeCompare(b.title));
  } catch (error) {
    console.warn(`${BRAND} Core | Could not read the module list`, error);
    return [];
  }
}

function isFatmorbusModule(module) {
  const authors = normalizeAuthors(module?.authors);
  return module?.id === MODULE_ID
    || /fatmorbus/i.test(String(module?.title ?? ""))
    || authors.some(author => /fatmorbus/i.test(author));
}

function normalizeAuthors(authors) {
  if (!authors) return [];
  let list;
  try { list = Array.from(authors); } catch { list = []; }
  return list.map(author => typeof author === "string" ? author : String(author?.name ?? "")).filter(Boolean);
}

function normalizeModule(module) {
  const custom = getRegisteredMetadata(module.id) ?? {};
  const title = String(custom.name ?? module.title ?? module.id ?? "");
  return {
    id: String(module.id ?? ""),
    title: title || String(module.id ?? ""),
    version: String(custom.version ?? module.version ?? "?"),
    description: String(custom.description ?? stripHtml(module.description ?? "Module By Fatmorbus")),
    icon: sanitizeImagePath(custom.icon),
    iconClass: sanitizeIconClass(custom.iconClass) || defaultModuleIcon(module.id, title)
  };
}

function defaultModuleIcon(id, title) {
  const haystack = `${id} ${title}`.toLowerCase();
  for (const [pattern, icon] of DEFAULT_ICONS) {
    if (pattern.test(haystack)) return icon;
  }
  return "fa-solid fa-puzzle-piece";
}

function stripHtml(value) {
  const div = document.createElement("div");
  div.innerHTML = String(value ?? "");
  return (div.textContent ?? "").trim();
}


/* =========================================================================
   Hub
   ========================================================================= */

async function openHub({ modules = null, automatic = false } = {}) {
  closeExistingHub();

  const recognized = getActiveFatmorbusModules();
  const changed = Array.isArray(modules) && modules.length ? modules : [];

  const overlay = document.createElement("div");
  overlay.className = "fatmorbus-core-overlay";
  overlay.dataset.fatmorbusCore = "true";

  const panel = document.createElement("section");
  panel.className = "fatmorbus-core-panel fatmorbus-core-frame-ui";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Fatmorbus Core Hub");

  const currentSystem = getCurrentSystemInfo();
  const logoPath = assetPath("assets/fatmorbus-studio-logo.jpg");
  panel.innerHTML = `
    <button class="fatmorbus-core-close" type="button" aria-label="Close Fatmorbus Hub"><i class="fas fa-times"></i></button>

    <div class="fatmorbus-ui-top-center">
      <strong>Fatmorbus Core</strong>
    </div>

    <aside class="fatmorbus-ui-left" aria-label="Supported systems">
      <section class="fatmorbus-supported-system-section">
        <h2>Supported<br>System</h2>
        <div class="fatmorbus-supported-system-list">
          <a class="fatmorbus-supported-system fatmorbus-supported-dnd${currentSystem.id === "dnd5e" ? " is-active" : ""}" href="https://foundryvtt.com/packages/dnd5e" target="_blank" rel="noopener noreferrer" title="D&D 5e on Foundry VTT">
            <img src="${assetPath("assets/dnd5e-logo.jpg")}" alt="D&D 5e">
          </a>
          <a class="fatmorbus-supported-system fatmorbus-supported-shadowdark${/shadowdark/i.test(currentSystem.id) ? " is-active" : ""}" href="https://foundryvtt.com/packages/shadowdark" target="_blank" rel="noopener noreferrer" title="Shadowdark RPG on Foundry VTT">
            <img src="${assetPath("assets/shadowdark-rpg-logo.jpg")}" alt="Shadowdark RPG">
          </a>
        </div>
      </section>
    </aside>

    <main class="fatmorbus-ui-center" aria-live="polite">
      <div class="fatmorbus-center-top-rule" aria-hidden="true"></div>
      <div class="fatmorbus-featured-module"></div>
    </main>

    <aside class="fatmorbus-ui-right" aria-label="Recognized Fatmorbus modules">
      <h2>Recognized Modules</h2>
      <div class="fatmorbus-recognized-list"></div>
    </aside>

    <div class="fatmorbus-ui-footer-band"><span>Social Media</span></div>

    <div class="fatmorbus-ui-bottom-strip">
      <label class="fatmorbus-welcome-toggle"><input type="checkbox" data-action="toggle-welcome"><span>No volver a desplegar esta casilla cuando se abre Foundry</span></label>
      <nav class="fatmorbus-ui-social-strip" aria-label="Fatmorbus social links">
        <a href="${SOCIALS.discord}" target="_blank" rel="noopener noreferrer" title="Fatmorbus Discord"><i class="fab fa-discord"></i><span>discord.gg/uEc36zgrrM</span></a>
        <a href="${SOCIALS.youtube}" target="_blank" rel="noopener noreferrer" title="Fatmorbus YouTube"><i class="fab fa-youtube"></i><span>@Fatmorbus/videos</span></a>
        <a href="${SOCIALS.instagram}" target="_blank" rel="noopener noreferrer" title="Fatmorbus Instagram"><i class="fab fa-instagram"></i><span>@fatmorbus_studio</span></a>
        <a href="${SOCIALS.patreon}" target="_blank" rel="noopener noreferrer" title="Support Fatmorbus on Patreon"><i class="fab fa-patreon"></i><span>Patreon / FatmorbusStudio</span></a>
      </nav>
    </div>`;

  const recognizedList = panel.querySelector(".fatmorbus-recognized-list");
  if (!recognized.length) {
    recognizedList.innerHTML = '<div class="fatmorbus-recognized-empty">No active modules detected.</div>';
  } else {
    for (const module of recognized) recognizedList.append(createRecognizedModuleRow(module, panel));
  }

  renderCoreOverview(panel, recognized.length, logoPath, changed.length);

  const welcomeToggle = panel.querySelector('[data-action="toggle-welcome"]');
  if (welcomeToggle) {
    welcomeToggle.checked = !readSetting("showWelcome", true);
    welcomeToggle.addEventListener("change", async event => {
      try {
        await game.settings.set(MODULE_ID, "showWelcome", !event.currentTarget.checked);
      } catch (error) {
        console.warn(`${BRAND} Core | Could not update welcome preference`, error);
      }
    });
  }

  const detachScaling = attachHubScaling(overlay, panel);
  let closing = false;

  const close = async () => {
    if (closing) return;
    closing = true;
    document.removeEventListener("keydown", onKeyDown);
    detachScaling();
    await markSeen(changed.length ? changed : recognized);
    overlay.classList.add("fatmorbus-core-closing");
    setTimeout(() => overlay.remove(), 170);
  };

  function onKeyDown(event) {
    if (event.key === "Escape") close();
  }

  panel.querySelector(".fatmorbus-core-close")?.addEventListener("click", () => close());
  overlay.addEventListener("mousedown", event => { if (event.target === overlay) close(); });
  document.addEventListener("keydown", onKeyDown);

  overlay.append(panel);
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add("fatmorbus-core-open"));

  if (readSetting("verifyIntegrity", true)) {
    for (const module of recognized) updateIntegrityBadge(module.id, verifyModuleIntegrity(module.id), panel);
  } else {
    for (const module of recognized) setIntegrityVisual(panel, module.id, { status: "unsigned", message: "Integrity verification disabled." });
  }
}

/* Uniform scaling of the 2048x1060 design canvas. This replaces the viewport
   units used in v1.3.0, which made the content overflow the frame openings. */
function attachHubScaling(overlay, panel) {
  const apply = () => {
    const width = overlay.clientWidth || window.innerWidth || DESIGN_WIDTH;
    const height = overlay.clientHeight || window.innerHeight || DESIGN_HEIGHT;
    const scale = Math.min(
      (width - HUB_MARGIN) / DESIGN_WIDTH,
      (height - HUB_MARGIN) / DESIGN_HEIGHT,
      1
    );
    panel.style.setProperty("--fm-hub-scale", String(Math.max(scale, 0.3)));
  };

  apply();
  let observer = null;
  if (typeof ResizeObserver === "function") {
    try {
      observer = new ResizeObserver(() => apply());
      observer.observe(overlay);
    } catch { observer = null; }
  }
  window.addEventListener("resize", apply);
  return () => {
    window.removeEventListener("resize", apply);
    try { observer?.disconnect(); } catch { /* already detached */ }
  };
}


function renderCoreOverview(panel, moduleCount, logoPath = assetPath("assets/fatmorbus-studio-logo.jpg"), changedCount = 0) {
  panel.querySelectorAll(".fatmorbus-recognized-row").forEach(row => row.classList.remove("is-selected"));
  const featured = panel.querySelector(".fatmorbus-featured-module");
  if (!featured) return;
  featured.dataset.moduleId = MODULE_ID;
  featured.innerHTML = `
    <div class="fatmorbus-featured-split fatmorbus-featured-overview">
      <div class="fatmorbus-featured-art">
        <img src="${escapeAttribute(logoPath)}" alt="Fatmorbus Studio">
      </div>
      <div class="fatmorbus-featured-copy">
        <h1>¡Bienvenido al ecosistema de módulos de Fatmorbus!</h1>
        <div class="fatmorbus-center-rule"><span></span><i class="fas fa-skull"></i><span></span></div>
        <p>Quiero agradecer a todas las personas que me apoyan en <strong>Patreon</strong> y están suscritas al canal. Su apoyo me permite seguir motivándome a mejorar y expandir mis módulos para Foundry VTT. ¡Muchas gracias por ser parte de este proyecto!</p>
        <p><strong>Fatmorbus Core</strong> funciona como el centro de integración para mis módulos, ayudando a mantenerlos organizados dentro de Foundry VTT.</p>
        <h3>Entre sus principales funciones:</h3>
        <ul class="fatmorbus-center-list">
          <li>Reúne las herramientas de mis módulos en un único botón desplegable dentro de la interfaz de Foundry.</li>
          <li>Permite acceder rápidamente a los <strong>menús y configuraciones</strong> de cada módulo instalado.</li>
          <li>Crea una Biblioteca Fatmorbus que detecta e indexa el contenido disponible.</li>
          <li>Organiza los compendios de mis módulos dentro del panel nativo de <strong>Compendios</strong>, agrupándolos bajo carpetas Fatmorbus.</li>
          <li>Mantiene los packs y datos originales en su ubicación, sin modificar ni duplicar su contenido.</li>
          <li>Funciona como base común para la integración, organización y futuras funcionalidades de los módulos By Fatmorbus.</li>
        </ul>
        <p>La idea es que, a medida que la colección de módulos crezca, todo permanezca accesible desde un único lugar.</p>
        <div class="fatmorbus-center-footer">
          <span><strong>${moduleCount}</strong> módulos reconocidos</span>
          <b>✦</b>
          <span><strong>${changedCount}</strong> actualizaciones</span>
          <b>✦</b>
          <span>Foundry VTT <strong>v13 / v14</strong></span>
        </div>
      </div>
    </div>`;
}


function renderFeaturedModule(panel, module) {
  panel.querySelectorAll(".fatmorbus-recognized-row").forEach(row => row.classList.toggle("is-selected", row.dataset.moduleId === module.id));
  const featured = panel.querySelector(".fatmorbus-featured-module");
  if (!featured) return;
  featured.dataset.moduleId = module.id;
  const title = escapeHtml(module.title);
  const version = escapeHtml(module.version);
  const description = escapeHtml(module.description || "Official module By Fatmorbus.");
  const iconMarkup = module.icon
    ? `<img src="${escapeAttribute(module.icon)}" alt="">`
    : `<i class="${escapeAttribute(module.iconClass)}"></i>`;
  featured.innerHTML = `
    <div class="fatmorbus-featured-split fatmorbus-featured-module-view">
      <div class="fatmorbus-featured-art fatmorbus-module-art">
        <div class="fatmorbus-module-emblem">${iconMarkup}</div>
        <div class="fatmorbus-module-art-copy">
          <span>Official Fatmorbus Module</span>
          <strong>${title}</strong>
          <small>Version ${version}</small>
        </div>
      </div>
      <div class="fatmorbus-featured-copy">
        <h1>${title}</h1>
        <div class="fatmorbus-center-version">Version ${version}</div>
        <div class="fatmorbus-center-rule"><span></span><i class="fas fa-skull"></i><span></span></div>
        <p>${description}</p>
        <div class="fatmorbus-center-module-integrity" data-center-integrity-for="${escapeAttribute(module.id)}">
          <i class="fas fa-circle-notch fa-spin"></i><span>Checking official release integrity…</span>
        </div>
        <div class="fatmorbus-featured-actions">
          <button type="button" data-featured-action="settings"><i class="fas fa-gears"></i><span>Settings Center</span></button>
          <button type="button" data-featured-action="configuration"><i class="fas fa-circle-question"></i><span>Module Configuration</span></button>
          <button type="button" data-featured-action="library"><i class="fas fa-book"></i><span>Module Library</span></button>
          <button type="button" class="fatmorbus-back-core" data-featured-action="back"><i class="fas fa-arrow-left"></i><span>Volver al Core</span></button>
        </div>
      </div>
    </div>`;
  featured.querySelector('[data-featured-action="back"]')?.addEventListener("click", () => renderCoreOverview(panel, getActiveFatmorbusModules().length));
  featured.querySelector('[data-featured-action="settings"]')?.addEventListener("click", () => openModuleSettingsCenter(module.id));
  featured.querySelector('[data-featured-action="configuration"]')?.addEventListener("click", () => openModuleConfiguration(module.id));
  featured.querySelector('[data-featured-action="library"]')?.addEventListener("click", () => {
    try { coreApi?.openLibrary?.({ moduleId: module.id }); }
    catch (error) { console.warn(`${BRAND} Core | Could not open the module library`, error); }
  });

  const existingRow = panel.querySelector(`[data-module-id="${cssEscape(module.id)}"]`);
  const status = existingRow?.dataset.integrityStatus;
  if (status) setCenterIntegrity(panel, module.id, { status, message: existingRow.dataset.integrityMessage || "" });
}


function createRecognizedModuleRow(module, panel) {
  const row = document.createElement("div");
  row.className = "fatmorbus-recognized-row";
  row.dataset.moduleId = module.id;
  const iconMarkup = module.icon
    ? `<img src="${escapeAttribute(module.icon)}" alt="">`
    : `<i class="${escapeAttribute(module.iconClass)}"></i>`;
  row.innerHTML = `
    <button type="button" class="fatmorbus-recognized-main" title="${escapeAttribute(module.title)}">
      <span class="fatmorbus-recognized-icon">${iconMarkup}</span>
      <span class="fatmorbus-recognized-copy"><strong>${escapeHtml(module.title)}</strong><small>v${escapeHtml(module.version)}</small></span>
    </button>
    <div class="fatmorbus-recognized-actions">
      <span class="fatmorbus-recognized-status" data-integrity-for="${escapeAttribute(module.id)}" title="Checking integrity"><i class="fas fa-circle-notch fa-spin"></i></span>
      <button type="button" class="fatmorbus-recognized-action" data-action="settings" title="Abrir Settings Center"><i class="fas fa-gears"></i></button>
      <button type="button" class="fatmorbus-recognized-action" data-action="configuration" title="Abrir configuración del módulo"><i class="fas fa-circle-question"></i></button>
    </div>`;
  row.querySelector(".fatmorbus-recognized-main")?.addEventListener("click", () => renderFeaturedModule(panel, module));
  row.querySelector('[data-action="settings"]')?.addEventListener("click", event => { event.stopPropagation(); openModuleSettingsCenter(module.id); });
  row.querySelector('[data-action="configuration"]')?.addEventListener("click", event => { event.stopPropagation(); openModuleConfiguration(module.id); });
  return row;
}

function getCurrentSystemInfo() {
  const system = game.system ?? {};
  return {
    id: String(system.id ?? ""),
    label: String(system.title ?? system.name ?? system.id ?? "Unknown System"),
    version: String(system.version ?? system.data?.version ?? "")
  };
}

function openModuleSettingsCenter(moduleId) {
  try {
    coreApi?.openSettings?.(moduleId);
  } catch (error) {
    console.warn(`${BRAND} Core | Could not open Settings Center`, error);
  }
}

function openModuleConfiguration(moduleId) {
  const menu = findModuleSettingsMenu(moduleId);
  if (menu) return openSettingsMenuEntry(menu);
  return openModuleSettingsCenter(moduleId);
}

function findModuleSettingsMenu(moduleId) {
  try {
    const entries = Array.from(game.settings?.menus?.entries?.() ?? []);
    for (const [mapKey, menu] of entries) {
      const namespace = menu?.namespace ?? String(mapKey ?? "").split(".")[0];
      if (namespace !== moduleId) continue;
      if (menu?.restricted && !game.user?.isGM) continue;
      return { mapKey, ...menu };
    }
  } catch (error) {
    console.warn(`${BRAND} Core | Could not inspect registered settings menus`, error);
  }
  return null;
}

async function openSettingsMenuEntry(menu) {
  if (!menu) return;
  try {
    const app = typeof menu.type === "function" ? new menu.type() : menu.type;
    if (app?.render) {
      const result = app.render({ force: true });
      if (result?.then) await result;
      return;
    }
    throw new Error("Application is not renderable.");
  } catch (error) {
    console.warn(`${BRAND} Core | Could not open module configuration menu`, error);
    openModuleSettingsCenter(menu.namespace ?? menu.mapKey?.split?.(".")?.[0]);
  }
}

async function markSeen(modules) {
  if (!Array.isArray(modules) || !modules.length) return;
  try {
    const seen = { ...(readSetting("seenVersions", {}) ?? {}) };
    for (const module of modules) seen[module.id] = module.version;
    await game.settings.set(MODULE_ID, "seenVersions", seen);
  } catch (error) {
    console.warn(`${BRAND} Core | Could not save seen versions`, error);
  }
}

function closeExistingHub() {
  document.querySelectorAll("[data-fatmorbus-core]").forEach(node => node.remove());
}

function readSetting(key, fallback) {
  try { return game.settings.get(MODULE_ID, key); } catch { return fallback; }
}

function assetPath(relative) {
  const path = `modules/${MODULE_ID}/${relative}`;
  try { return foundry?.utils?.getRoute?.(path) ?? path; } catch { return path; }
}

function modulePath(moduleId, relative) {
  const path = `modules/${moduleId}/${relative}`;
  try { return foundry?.utils?.getRoute?.(path) ?? path; } catch { return path; }
}


/* =========================================================================
   Signed release verification
   ========================================================================= */

async function updateIntegrityBadge(moduleId, promise, panel = document) {
  try {
    const result = await promise;
    if (panel !== document && !document.body.contains(panel)) return;
    setIntegrityVisual(panel, moduleId, result);
  } catch (error) {
    console.warn(`${BRAND} Core | Integrity badge could not be updated for ${moduleId}`, error);
  }
}

function setIntegrityVisual(panel, moduleId, result) {
  const row = panel.querySelector(`[data-module-id="${cssEscape(moduleId)}"]`);
  const badge = panel.querySelector(`[data-integrity-for="${cssEscape(moduleId)}"]`);
  if (row) {
    row.dataset.integrityStatus = result.status;
    row.dataset.integrityMessage = result.message || "";
  }
  if (badge) {
    badge.classList.remove("is-ok", "is-warn", "is-bad");
    if (result.status === "verified") {
      badge.classList.add("is-ok");
      badge.innerHTML = '<i class="fas fa-circle-check"></i>';
      badge.title = "Official Fatmorbus release verified.";
    } else if (result.status === "modified") {
      badge.classList.add("is-bad");
      badge.innerHTML = '<i class="fas fa-triangle-exclamation"></i>';
      badge.title = result.message || "Official signature or signed files do not match.";
    } else {
      badge.classList.add("is-warn");
      badge.innerHTML = '<i class="fas fa-circle-question"></i>';
      badge.title = result.message || "Unsigned Fatmorbus module.";
    }
  }
  setCenterIntegrity(panel, moduleId, result);
}

function setCenterIntegrity(panel, moduleId, result) {
  const featured = panel.querySelector(".fatmorbus-featured-module");
  if (!featured || featured.dataset.moduleId !== moduleId) return;
  const center = featured.querySelector(`[data-center-integrity-for="${cssEscape(moduleId)}"]`);
  if (!center) return;
  center.classList.remove("is-ok", "is-warn", "is-bad");
  if (result.status === "verified") {
    center.classList.add("is-ok");
    center.innerHTML = '<i class="fas fa-shield-halved"></i><span>Official Fatmorbus release verified.</span>';
  } else if (result.status === "modified") {
    center.classList.add("is-bad");
    center.innerHTML = `<i class="fas fa-triangle-exclamation"></i><span>${escapeHtml(result.message || "Modified or unverifiable release.")}</span>`;
  } else {
    center.classList.add("is-warn");
    center.innerHTML = '<i class="fas fa-shield"></i><span>This Fatmorbus module has not been signed yet.</span>';
  }
}

/* Statuses: verified | unsigned | modified.
   Anything merely missing, unreadable, or not signed stays "unsigned" so a
   legacy By Fatmorbus module is never flagged as tampered by mistake. */
function verifyModuleIntegrity(moduleId) {
  const module = game.modules?.get?.(moduleId);
  if (!module) return Promise.resolve({ status: "unsigned", message: "Module is not installed." });

  const cacheKey = `${moduleId}@${module.version}`;
  if (integrityCache.has(cacheKey)) return integrityCache.get(cacheKey);

  const promise = runIntegrityCheck(moduleId, module).catch(error => {
    console.warn(`${BRAND} Core | Integrity verification failed`, error);
    return { status: "unsigned", message: "Integrity verification could not be completed." };
  });
  integrityCache.set(cacheKey, promise);
  return promise;
}

async function runIntegrityCheck(moduleId, module) {
  let manifestResponse;
  try {
    manifestResponse = await fetch(modulePath(moduleId, "fatmorbus-integrity.json"), { cache: "no-store" });
  } catch {
    return { status: "unsigned", message: "No signed integrity manifest could be read." };
  }
  if (!manifestResponse.ok) return { status: "unsigned", message: "No signed integrity manifest." };

  let signed;
  try {
    signed = await manifestResponse.json();
  } catch {
    return { status: "unsigned", message: "No signed integrity manifest." };
  }
  if (!signed || typeof signed !== "object" || typeof signed.signature !== "string") {
    return { status: "unsigned", message: "No signed integrity manifest." };
  }

  if (signed.moduleId !== moduleId || String(signed.version) !== String(module.version)) {
    return { status: "modified", message: "Signed metadata does not match the installed module." };
  }

  const payload = canonicalPayload(signed);
  const key = await importPublicKey(PUBLIC_KEY_PEM);
  const signatureOk = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    base64ToBytes(signed.signature),
    new TextEncoder().encode(payload)
  );
  if (!signatureOk) return { status: "modified", message: "Fatmorbus digital signature is invalid." };

  for (const file of signed.files ?? []) {
    if (!isSafeRelativePath(file?.path)) return { status: "modified", message: "Integrity manifest contains an invalid path." };
    const response = await fetch(modulePath(moduleId, file.path), { cache: "no-store" });
    if (!response.ok) return { status: "modified", message: `Signed file is missing: ${file.path}` };
    const digest = await sha256Hex(await response.arrayBuffer());
    if (digest.toLowerCase() !== String(file.sha256).toLowerCase()) {
      return { status: "modified", message: `Signed file changed: ${file.path}` };
    }
  }
  return { status: "verified", message: "Official Fatmorbus release verified." };
}

function canonicalPayload(signed) {
  const files = Array.from(signed.files ?? []).map(file => ({ path: String(file.path), sha256: String(file.sha256) }));
  return JSON.stringify({
    schema: Number(signed.schema ?? 1),
    moduleId: String(signed.moduleId ?? ""),
    version: String(signed.version ?? ""),
    algorithm: String(signed.algorithm ?? "RSASSA-PKCS1-v1_5-SHA256"),
    files
  });
}

async function importPublicKey(pem) {
  const b64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "");
  return crypto.subtle.importKey(
    "spki",
    base64ToBytes(b64),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function isSafeRelativePath(path) {
  const value = String(path ?? "");
  return value.length > 0 && !value.startsWith("/") && !value.includes("..") && !value.includes("\\");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function escapeAttribute(value) { return escapeHtml(value); }
function cssEscape(value) { return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
