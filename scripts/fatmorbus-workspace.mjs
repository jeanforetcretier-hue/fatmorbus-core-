const state = {
  moduleId: "",
  brand: "Fatmorbus",
  getModules: () => [],
  isFatmorbusModule: () => false,
  openHub: () => {},
  registry: new Map(),
  libraryCache: null,
  hooksInstalled: false
};

const PANEL_SELECTOR = "[data-fatmorbus-workspace-panel]";
const COMPENDIUM_PANEL_SELECTOR = "[data-fatmorbus-virtual-compendiums]";

export function configureWorkspace(options = {}) {
  state.moduleId = options.moduleId ?? state.moduleId;
  state.brand = options.brand ?? state.brand;
  state.getModules = options.getModules ?? state.getModules;
  state.isFatmorbusModule = options.isFatmorbusModule ?? state.isFatmorbusModule;
  state.openHub = options.openHub ?? state.openHub;
}

export function registerWorkspaceSettings() {
  const id = state.moduleId;
  if (!id) throw new Error("Fatmorbus Workspace must be configured before registering settings.");

  game.settings.register(id, "showSceneControl", {
    name: "Fatmorbus consolidated control",
    hint: "Adds one Fatmorbus control to the left Scene Controls bar with access to modules, settings, and the Fatmorbus Library.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => refreshSceneControls()
  });

  game.settings.register(id, "hideRegisteredDuplicateControls", {
    name: "Hide registered duplicate Fatmorbus controls",
    hint: "When a Fatmorbus module explicitly declares its old Scene Control buttons, hide those duplicates and keep access through the consolidated Fatmorbus control.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => refreshSceneControls()
  });

  game.settings.register(id, "virtualCompendiumFolders", {
    name: "Fatmorbus folder in Compendiums",
    hint: "Collects all compendium packs from By Fatmorbus modules inside one virtual FATMORBUS folder without moving, copying, renaming, or changing the original packs or UUIDs.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => refreshCompendiumDirectory()
  });
}

export function installWorkspaceHooks() {
  if (state.hooksInstalled) return;
  state.hooksInstalled = true;

  /* Every shared hook is wrapped: an uncaught error inside getSceneControlButtons
     or a sidebar render hook can break the toolbar/sidebar for the whole world,
     including third-party modules. Core must fail silently instead. */
  Hooks.on("getSceneControlButtons", controls => guard("getSceneControlButtons", () => injectSceneControl(controls)));
  Hooks.on("renderCompendiumDirectory", (_app, html) => queueMicrotask(() => guard("renderCompendiumDirectory", () => organizeNativeCompendiumDirectory(getRoot(html)))));
  Hooks.on("renderSidebarTab", (app, html) => {
    const name = app?.constructor?.name ?? "";
    if (!/CompendiumDirectory/i.test(name)) return;
    queueMicrotask(() => guard("renderSidebarTab", () => organizeNativeCompendiumDirectory(getRoot(html) ?? getRoot(app?.element))));
  });
  Hooks.on("changeSidebarTab", app => {
    const name = app?.constructor?.name ?? "";
    if (!/CompendiumDirectory/i.test(name) && app?.tabName !== "compendium") return;
    queueMicrotask(() => guard("changeSidebarTab", () => organizeNativeCompendiumDirectory(getRoot(app?.element))));
  });
}

/* Reads a Core setting without ever throwing. A settings read can fail when a
   hook fires before "init" finished, and an exception inside a shared hook
   would break every module that depends on that hook. */
function safeSetting(key, fallback) {
  try { return game.settings.get(state.moduleId, key); } catch { return fallback; }
}

function guard(label, callback) {
  try { return callback(); } catch (error) {
    console.warn(`${state.brand} Core | ${label} handler failed and was ignored`, error);
    return undefined;
  }
}

export function registerModuleMetadata(metadata = {}) {
  try {
    if (!metadata?.id) return false;
    const id = String(metadata.id);
    const existing = state.registry.get(id) ?? {};
    state.registry.set(id, mergeMetadata(existing, { ...metadata, id }));
    state.libraryCache = null;
    return true;
  } catch (error) {
    console.warn(`${state.brand} Core | Module metadata could not be registered`, error);
    return false;
  }
}

export function registerTool(moduleId, tool = {}) {
  try {
    if (!moduleId || !tool || typeof tool !== "object") return false;
    const key = String(moduleId);
    const existing = state.registry.get(key) ?? { id: key };
    const tools = Array.isArray(existing.tools) ? [...existing.tools] : [];
    const id = String(tool.id ?? tool.name ?? `tool-${tools.length + 1}`);
    const index = tools.findIndex(item => (item.id ?? item.name) === id);
    const normalized = { ...tool, id };
    if (index >= 0) tools[index] = { ...tools[index], ...normalized };
    else tools.push(normalized);
    state.registry.set(key, { ...existing, tools });
    return true;
  } catch (error) {
    console.warn(`${state.brand} Core | Module tool could not be registered`, error);
    return false;
  }
}

export function getRegisteredMetadata(moduleId) {
  return state.registry.get(moduleId) ?? null;
}

export function getWorkspaceApi() {
  return Object.freeze({
    registerModule: registerModuleMetadata,
    registerTool,
    openModules: () => openConsolidatedMenu(),
    openLibrary: options => openLibrary(options),
    openSettings: moduleId => openSettingsCenter(moduleId),
    refreshLibrary: () => { state.libraryCache = null; return buildLibraryIndex({ force: true }); },
    getPacks: () => getFatmorbusPackRecords().map(record => ({ ...record, pack: undefined }))
  });
}

export function openConsolidatedMenu() {
  closeWorkspacePanels("modules");
  const existing = document.querySelector('[data-fatmorbus-workspace-panel="modules"]');
  if (existing) { existing.remove(); return; }

  const modules = state.getModules();
  const panel = document.createElement("section");
  panel.className = "fatmorbus-workspace-drawer";
  panel.dataset.fatmorbusWorkspacePanel = "modules";
  panel.innerHTML = `
    <header class="fatmorbus-workspace-header">
      <div><span class="fatmorbus-workspace-kicker">BY FATMORBUS</span><h2>Module Console</h2></div>
      <button type="button" class="fatmorbus-workspace-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
    </header>
    <div class="fatmorbus-workspace-quick-actions">
      <button type="button" data-action="library"><i class="fa-solid fa-book"></i><span>Library</span></button>
      <button type="button" data-action="settings"><i class="fa-solid fa-gears"></i><span>Settings</span></button>
      <button type="button" data-action="hub"><i class="fa-solid fa-crown"></i><span>Hub</span></button>
    </div>
    <label class="fatmorbus-workspace-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="Search Fatmorbus modules…"></label>
    <div class="fatmorbus-module-accordion"></div>`;

  const list = panel.querySelector(".fatmorbus-module-accordion");
  for (const module of modules) list.append(createModuleAccordion(module));
  if (!modules.length) list.innerHTML = '<p class="fatmorbus-workspace-empty">No active By Fatmorbus modules were detected.</p>';

  panel.querySelector(".fatmorbus-workspace-close")?.addEventListener("click", () => panel.remove());
  panel.querySelector('[data-action="library"]')?.addEventListener("click", () => openLibrary());
  panel.querySelector('[data-action="settings"]')?.addEventListener("click", () => openSettingsCenter());
  panel.querySelector('[data-action="hub"]')?.addEventListener("click", () => state.openHub({ modules: state.getModules(), automatic: false }));
  panel.querySelector("input[type=search]")?.addEventListener("input", event => {
    const query = normalizeText(event.currentTarget.value);
    panel.querySelectorAll(".fatmorbus-module-entry").forEach(entry => {
      entry.hidden = Boolean(query) && !normalizeText(entry.dataset.search).includes(query);
    });
  });

  document.body.append(panel);
}

function createModuleAccordion(module) {
  const entry = document.createElement("details");
  entry.className = "fatmorbus-module-entry";
  entry.dataset.moduleId = module.id;
  entry.dataset.search = `${module.title} ${module.id} ${module.description ?? ""}`;
  const metadata = state.registry.get(module.id) ?? {};
  const tools = visibleTools(metadata.tools ?? []);
  const settings = collectSettings(module.id);
  const menus = collectSettingsMenus(module.id);
  const packs = getFatmorbusPackRecords().filter(record => record.moduleId === module.id);
  const actions = [];

  for (const tool of tools) {
    actions.push(`<button type="button" data-module-tool="${escapeAttribute(tool.id)}"><i class="${escapeAttribute(tool.icon ?? "fa-solid fa-wand-magic-sparkles")}"></i><span>${escapeHtml(tool.label ?? tool.name ?? tool.id)}</span></button>`);
  }
  for (const menu of menus) {
    actions.push(`<button type="button" data-settings-menu="${escapeAttribute(menu.mapKey)}"><i class="${escapeAttribute(menu.icon ?? "fa-solid fa-sliders")}"></i><span>${escapeHtml(localize(menu.label ?? menu.name ?? "Settings"))}</span></button>`);
  }

  entry.innerHTML = `
    <summary>
      <span class="fatmorbus-module-summary-icon"><i class="${escapeAttribute(metadata.iconClass ?? "fa-solid fa-puzzle-piece")}"></i></span>
      <span class="fatmorbus-module-summary-copy"><strong>${escapeHtml(module.title)}</strong><small>v${escapeHtml(module.version)} · ${settings.length} settings · ${packs.length} packs</small></span>
      <i class="fa-solid fa-chevron-down fatmorbus-module-chevron"></i>
    </summary>
    <div class="fatmorbus-module-actions">
      ${actions.join("")}
      <button type="button" data-core-action="module-settings"><i class="fa-solid fa-gears"></i><span>Module Settings</span></button>
      <button type="button" data-core-action="module-library"><i class="fa-solid fa-box-archive"></i><span>Module Library</span></button>
      <button type="button" data-core-action="module-info"><i class="fa-solid fa-shield-halved"></i><span>Module / Integrity</span></button>
    </div>`;

  entry.querySelectorAll("[data-module-tool]").forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    const tool = tools.find(item => String(item.id) === button.dataset.moduleTool);
    invokeTool(tool, module);
  }));
  entry.querySelectorAll("[data-settings-menu]").forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    const menu = menus.find(item => item.mapKey === button.dataset.settingsMenu);
    openRegisteredSettingsMenu(menu);
  }));
  entry.querySelector('[data-core-action="module-settings"]')?.addEventListener("click", event => { event.preventDefault(); openSettingsCenter(module.id); });
  entry.querySelector('[data-core-action="module-library"]')?.addEventListener("click", event => { event.preventDefault(); openLibrary({ moduleId: module.id }); });
  entry.querySelector('[data-core-action="module-info"]')?.addEventListener("click", event => { event.preventDefault(); state.openHub({ modules: [module], automatic: false }); });
  return entry;
}

export function openSettingsCenter(moduleId = null) {
  closeWorkspacePanels("settings");
  const existing = document.querySelector('[data-fatmorbus-workspace-panel="settings"]');
  if (existing) {
    /* Asking for a specific module re-targets the open window instead of
       closing it; only the toolbar toggle (no module) closes it. */
    if (!moduleId) { existing.remove(); return; }
    renderSettingsModule(existing, moduleId);
    return;
  }

  const modules = state.getModules();
  const selectedId = moduleId && modules.some(module => module.id === moduleId) ? moduleId : (modules[0]?.id ?? state.moduleId);
  const overlay = createWorkspaceWindow("settings", "Settings Center");
  overlay.querySelector(".fatmorbus-workspace-window-body").innerHTML = `
    <aside class="fatmorbus-settings-modules"></aside>
    <main class="fatmorbus-settings-content"></main>`;
  const moduleList = overlay.querySelector(".fatmorbus-settings-modules");
  for (const module of modules) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.settingsModule = module.id;
    button.innerHTML = `<i class="fa-solid fa-puzzle-piece"></i><span>${escapeHtml(module.title)}</span>`;
    button.addEventListener("click", () => renderSettingsModule(overlay, module.id));
    moduleList.append(button);
  }
  if (!modules.length) moduleList.innerHTML = '<p class="fatmorbus-workspace-empty">No Fatmorbus modules detected.</p>';
  document.body.append(overlay);
  renderSettingsModule(overlay, selectedId);
}

function renderSettingsModule(overlay, moduleId) {
  const module = state.getModules().find(item => item.id === moduleId) ?? { id: moduleId, title: moduleId, version: "?" };
  overlay.querySelectorAll("[data-settings-module]").forEach(button => button.classList.toggle("is-active", button.dataset.settingsModule === moduleId));
  const content = overlay.querySelector(".fatmorbus-settings-content");
  const settings = collectSettings(moduleId);
  const menus = collectSettingsMenus(moduleId);
  content.innerHTML = `
    <div class="fatmorbus-settings-title"><div><span>MODULE SETTINGS</span><h3>${escapeHtml(module.title)}</h3><small>v${escapeHtml(module.version ?? "?")}</small></div>
      <button type="button" data-open-native-settings><i class="fa-solid fa-arrow-up-right-from-square"></i> Native Settings</button>
    </div>
    <div class="fatmorbus-settings-menu-list"></div>
    <div class="fatmorbus-setting-list"></div>`;

  content.querySelector("[data-open-native-settings]")?.addEventListener("click", () => openNativeSettings());
  const menuList = content.querySelector(".fatmorbus-settings-menu-list");
  if (menus.length) {
    const label = document.createElement("div");
    label.className = "fatmorbus-settings-section-label";
    label.textContent = "Configuration Menus";
    menuList.append(label);
    for (const menu of menus) {
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `<i class="${escapeAttribute(menu.icon ?? "fa-solid fa-sliders")}"></i><span><strong>${escapeHtml(localize(menu.label ?? menu.name ?? "Settings"))}</strong><small>${escapeHtml(localize(menu.hint ?? "Open module configuration"))}</small></span><i class="fa-solid fa-chevron-right"></i>`;
      button.addEventListener("click", () => openRegisteredSettingsMenu(menu));
      menuList.append(button);
    }
  }

  const list = content.querySelector(".fatmorbus-setting-list");
  if (!settings.length) {
    list.innerHTML = '<p class="fatmorbus-workspace-empty">This module does not expose standard Foundry settings. Use Native Settings or a configuration menu above.</p>';
    return;
  }

  const label = document.createElement("div");
  label.className = "fatmorbus-settings-section-label";
  label.textContent = "Registered Settings";
  list.append(label);
  for (const setting of settings) list.append(createSettingRow(setting));
}

function createSettingRow(setting) {
  const row = document.createElement("div");
  row.className = "fatmorbus-setting-row";
  const canEdit = canEditSetting(setting);
  const value = safeGetSetting(setting.namespace, setting.key);
  const control = createSettingControl(setting, value, canEdit);
  row.innerHTML = `
    <div class="fatmorbus-setting-copy">
      <label>${escapeHtml(localize(setting.name ?? setting.key))}${setting.requiresReload ? '<span class="fatmorbus-reload-badge">Reload</span>' : ""}</label>
      <small>${escapeHtml(localize(setting.hint ?? ""))}</small>
      <em>${escapeHtml(setting.scope ?? "client")}</em>
    </div>`;
  row.append(control);
  return row;
}

function createSettingControl(setting, value, canEdit) {
  const wrap = document.createElement("div");
  wrap.className = "fatmorbus-setting-control";
  const choices = normalizeChoices(setting.choices);
  const kind = settingType(setting);
  let input;

  if (choices.length) {
    input = document.createElement("select");
    for (const [key, label] of choices) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = localize(label);
      option.selected = String(value) === String(key);
      input.append(option);
    }
  } else if (kind === "boolean") {
    input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(value);
  } else if (kind === "number") {
    input = document.createElement("input");
    input.type = "number";
    if (Number.isFinite(Number(setting.range?.min))) input.min = String(setting.range.min);
    if (Number.isFinite(Number(setting.range?.max))) input.max = String(setting.range.max);
    if (Number.isFinite(Number(setting.range?.step))) input.step = String(setting.range.step);
    input.value = Number.isFinite(Number(value)) ? String(value) : "0";
  } else if (kind === "string") {
    input = document.createElement("input");
    input.type = "text";
    input.value = value == null ? "" : String(value);
  } else {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fatmorbus-complex-setting";
    button.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i> Native Settings';
    button.addEventListener("click", () => openNativeSettings());
    wrap.append(button);
    return wrap;
  }

  input.disabled = !canEdit;
  input.dataset.settingNamespace = setting.namespace;
  input.dataset.settingKey = setting.key;
  input.addEventListener("change", async event => {
    const element = event.currentTarget;
    const newValue = readSettingControl(element, kind);
    element.disabled = true;
    try {
      await game.settings.set(setting.namespace, setting.key, newValue);
      ui.notifications?.info?.(`${state.brand} Core | ${localize(setting.name ?? setting.key)} updated.`);
    } catch (error) {
      console.error(`${state.brand} Core | Could not update setting ${setting.namespace}.${setting.key}`, error);
      ui.notifications?.error?.(`${state.brand} Core | Could not update that setting.`);
      restoreSettingControl(element, value, kind);
    } finally {
      element.disabled = !canEdit;
    }
  });
  wrap.append(input);
  return wrap;
}

export function openLibrary({ moduleId = "", query = "" } = {}) {
  closeWorkspacePanels("library");
  const existing = document.querySelector('[data-fatmorbus-workspace-panel="library"]');
  if (existing) {
    if (!moduleId) { existing.remove(); return; }
    const select = existing.querySelector("[data-library-module]");
    if (select) {
      select.value = moduleId;
      renderLibraryResults(existing);
    }
    return;
  }

  const overlay = createWorkspaceWindow("library", "Fatmorbus Library");
  const body = overlay.querySelector(".fatmorbus-workspace-window-body");
  body.classList.add("fatmorbus-library-layout");
  body.innerHTML = `
    <div class="fatmorbus-library-toolbar">
      <label class="fatmorbus-library-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" value="${escapeAttribute(query)}" placeholder="Search every Fatmorbus compendium…"></label>
      <select data-library-module><option value="">All modules</option></select>
      <select data-library-type><option value="">All document types</option></select>
      <button type="button" data-library-refresh title="Refresh library index"><i class="fa-solid fa-rotate"></i></button>
    </div>
    <div class="fatmorbus-library-status"><i class="fa-solid fa-circle-notch fa-spin"></i><span>Indexing Fatmorbus compendiums…</span></div>
    <div class="fatmorbus-library-results"></div>`;
  document.body.append(overlay);

  const moduleSelect = body.querySelector("[data-library-module]");
  for (const module of state.getModules()) {
    const option = document.createElement("option");
    option.value = module.id;
    option.textContent = module.title;
    option.selected = module.id === moduleId;
    moduleSelect.append(option);
  }
  const rerender = () => renderLibraryResults(overlay);
  body.querySelector("input[type=search]")?.addEventListener("input", rerender);
  moduleSelect?.addEventListener("change", rerender);
  body.querySelector("[data-library-type]")?.addEventListener("change", rerender);
  body.querySelector("[data-library-refresh]")?.addEventListener("click", async buttonEvent => {
    const button = buttonEvent.currentTarget;
    button.disabled = true;
    state.libraryCache = null;
    await prepareLibrary(overlay, true);
    button.disabled = false;
  });
  prepareLibrary(overlay);
}

async function prepareLibrary(overlay, force = false) {
  const status = overlay.querySelector(".fatmorbus-library-status");
  try {
    const index = await buildLibraryIndex({ force, onProgress: ({ complete, total, label }) => {
      if (status) status.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i><span>Indexing ${escapeHtml(label)} · ${complete}/${total}</span>`;
    }});
    if (!document.body.contains(overlay)) return;
    const typeSelect = overlay.querySelector("[data-library-type]");
    const current = typeSelect?.value ?? "";
    const types = [...new Set(index.map(record => record.documentName).filter(Boolean))].sort();
    if (typeSelect) {
      typeSelect.innerHTML = '<option value="">All document types</option>';
      for (const type of types) {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = type;
        typeSelect.append(option);
      }
      typeSelect.value = current;
    }
    if (status) status.innerHTML = `<i class="fa-solid fa-box-archive"></i><span>${index.length.toLocaleString()} indexed documents · source packs unchanged</span>`;
    renderLibraryResults(overlay);
  } catch (error) {
    console.error(`${state.brand} Core | Library index failed`, error);
    if (status) status.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><span>Library indexing could not be completed.</span>';
  }
}

function renderLibraryResults(overlay) {
  const cache = state.libraryCache?.documents;
  if (!Array.isArray(cache)) return;
  const search = normalizeText(overlay.querySelector(".fatmorbus-library-search input")?.value ?? "");
  const moduleId = overlay.querySelector("[data-library-module]")?.value ?? "";
  const type = overlay.querySelector("[data-library-type]")?.value ?? "";
  const results = cache.filter(record => {
    if (moduleId && record.moduleId !== moduleId) return false;
    if (type && record.documentName !== type) return false;
    if (search && !record.search.includes(search)) return false;
    return true;
  });
  const limit = 400;
  const shown = results.slice(0, limit);
  const container = overlay.querySelector(".fatmorbus-library-results");
  container.innerHTML = "";
  if (!shown.length) {
    container.innerHTML = '<p class="fatmorbus-workspace-empty">No Fatmorbus library results match the current filters.</p>';
    return;
  }
  for (const record of shown) container.append(createLibraryRow(record));
  if (results.length > limit) {
    const note = document.createElement("p");
    note.className = "fatmorbus-library-limit";
    note.textContent = `Showing the first ${limit} of ${results.length} matches. Narrow the search to see more.`;
    container.append(note);
  }
}

function createLibraryRow(record) {
  const row = document.createElement("article");
  row.className = "fatmorbus-library-row";
  row.draggable = true;
  row.dataset.uuid = record.uuid;
  row.innerHTML = `
    <span class="fatmorbus-library-icon">${record.img ? `<img src="${escapeAttribute(record.img)}" alt="">` : '<i class="fa-solid fa-scroll"></i>'}</span>
    <span class="fatmorbus-library-copy"><strong>${escapeHtml(record.name)}</strong><small>${escapeHtml(record.moduleTitle)} · ${escapeHtml(record.packLabel)}</small></span>
    <span class="fatmorbus-library-type">${escapeHtml(record.documentName)}</span>
    <button type="button" title="Open source compendium"><i class="fa-solid fa-box-archive"></i></button>`;
  row.addEventListener("click", event => {
    if (event.target.closest("button")) return;
    openUuid(record.uuid);
  });
  row.querySelector("button")?.addEventListener("click", event => { event.stopPropagation(); openPack(record.collection); });
  row.addEventListener("dragstart", event => {
    const data = { type: record.documentName, uuid: record.uuid };
    event.dataTransfer?.setData("text/plain", JSON.stringify(data));
    event.dataTransfer?.setData("text", JSON.stringify(data));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
  });
  return row;
}

async function buildLibraryIndex({ force = false, onProgress = null } = {}) {
  const packs = getFatmorbusPackRecords();
  const signature = packs.map(record => `${record.collection}:${record.pack?.index?.size ?? 0}`).join("|");
  if (!force && state.libraryCache?.signature === signature) return state.libraryCache.documents;

  const documents = [];
  let complete = 0;
  const batchSize = 4;
  for (let i = 0; i < packs.length; i += batchSize) {
    const batch = packs.slice(i, i + batchSize);
    await Promise.all(batch.map(async record => {
      const entries = await getPackIndex(record.pack);
      for (const entry of entries) {
        const id = entry._id ?? entry.id;
        if (!id) continue;
        const name = entry.name ?? "Unnamed Document";
        const uuid = `Compendium.${record.collection}.${id}`;
        documents.push({
          uuid,
          id,
          name,
          img: entry.img ?? entry.thumbnail ?? "",
          collection: record.collection,
          packLabel: record.label,
          moduleId: record.moduleId,
          moduleTitle: record.moduleTitle,
          system: record.system,
          documentName: record.documentName,
          search: normalizeText(`${name} ${record.label} ${record.moduleTitle} ${record.documentName} ${record.system}`)
        });
      }
      complete += 1;
      onProgress?.({ complete, total: packs.length, label: record.label });
    }));
  }
  documents.sort((a, b) => a.name.localeCompare(b.name));
  state.libraryCache = { signature, documents };
  return documents;
}

function getFatmorbusPackRecords() {
  const packs = Array.from(game.packs?.values?.() ?? game.packs?.contents ?? []);
  const modules = new Map(state.getModules().map(module => [module.id, module]));
  return packs.map(pack => normalizePack(pack, modules)).filter(Boolean).sort((a, b) => a.label.localeCompare(b.label));
}

function normalizePack(pack, modules) {
  const collection = String(pack?.collection ?? pack?.metadata?.id ?? "");
  if (!collection) return null;
  const packageId = String(
    pack?.metadata?.packageName ??
    pack?.metadata?.package ??
    pack?.metadata?.packageId ??
    collection.split(".")[0] ?? ""
  );
  const module = modules.get(packageId) ?? Array.from(modules.values()).find(item => collection.startsWith(`${item.id}.`));
  if (!module) return null;
  const documentName = String(pack?.documentName ?? pack?.metadata?.type ?? pack?.metadata?.documentName ?? "Document");
  const system = String(pack?.metadata?.system ?? pack?.metadata?.systemId ?? "agnostic") || "agnostic";
  return {
    pack,
    collection,
    moduleId: module.id,
    moduleTitle: module.title,
    label: String(pack?.metadata?.label ?? pack?.title ?? pack?.metadata?.name ?? collection),
    name: String(pack?.metadata?.name ?? collection.split(".").at(-1) ?? collection),
    documentName,
    system
  };
}

async function getPackIndex(pack) {
  try {
    if (typeof pack?.getIndex === "function") {
      const result = await pack.getIndex({ fields: ["name", "img", "type"] });
      return collectionToArray(result);
    }
  } catch (error) {
    console.warn(`${state.brand} Core | Could not request extended index for ${pack?.collection}`, error);
  }
  return collectionToArray(pack?.index);
}

function collectionToArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value.values === "function") return Array.from(value.values());
  if (Array.isArray(value.contents)) return value.contents;
  try { return Array.from(value); } catch { return []; }
}

function injectSceneControl(controls) {
  if (!safeSetting("showSceneControl", true)) return;
  if (!controls || typeof controls !== "object") return;

  if (safeSetting("hideRegisteredDuplicateControls", true)) hideDeclaredSceneControls(controls);

  /* Foundry v13/v14 pass a record keyed by control name. Older builds passed an
     array; support both so the control never silently disappears. */
  const isArrayForm = Array.isArray(controls);
  if (isArrayForm ? controls.some(control => control?.name === "fatmorbus") : controls.fatmorbus) return;

  const list = isArrayForm ? controls : Object.values(controls);
  const orders = list.map(control => Number(control?.order)).filter(Number.isFinite);
  const fatmorbusControl = {
    name: "fatmorbus",
    title: "Herramientas By Fatmorbus",
    icon: "fa-solid fa-gift",
    order: (orders.length ? Math.max(...orders) : 10) + 1,
    activeTool: "fatmorbus-modules",
    visible: true,
    tools: {
      "fatmorbus-modules": {
        name: "fatmorbus-modules",
        title: "Herramientas By Fatmorbus",
        icon: "fa-solid fa-star",
        order: 0,
        button: true,
        visible: true,
        onChange: () => openConsolidatedMenu()
      },
      "fatmorbus-library": {
        name: "fatmorbus-library",
        title: "Biblioteca Fatmorbus",
        icon: "fa-solid fa-briefcase",
        order: 1,
        button: true,
        visible: true,
        onChange: () => openLibrary()
      },
      "fatmorbus-settings": {
        name: "fatmorbus-settings",
        title: "Settings Center",
        icon: "fa-solid fa-rectangle-list",
        order: 2,
        button: true,
        visible: true,
        onChange: () => openSettingsCenter()
      },
      "fatmorbus-hub": {
        name: "fatmorbus-hub",
        title: "Fatmorbus Core",
        icon: "fa-solid fa-skull",
        order: 3,
        button: true,
        visible: true,
        onChange: () => state.openHub({ modules: state.getModules(), automatic: false })
      }
    }
  };

  if (isArrayForm) {
    fatmorbusControl.tools = Object.values(fatmorbusControl.tools);
    controls.push(fatmorbusControl);
  } else {
    controls.fatmorbus = fatmorbusControl;
  }
}

function hideDeclaredSceneControls(controls) {
  if (Array.isArray(controls)) return;
  for (const metadata of state.registry.values()) {
    for (const ref of metadata.sceneControls ?? []) {
      if (typeof ref === "string") {
        if (controls[ref] && ref !== "fatmorbus") delete controls[ref];
        continue;
      }
      const controlName = ref.control ?? ref.group;
      const toolName = ref.tool ?? ref.name;
      if (!controlName || controlName === "fatmorbus") continue;
      if (!toolName && controls[controlName]) delete controls[controlName];
      else if (toolName && controls[controlName]?.tools?.[toolName]) delete controls[controlName].tools[toolName];
    }
  }

  // Never hide undeclared third-party or legacy controls. A module must explicitly register sceneControls before Core consolidates them.
}

export function organizeNativeCompendiumDirectory(root) {
  if (!(root instanceof HTMLElement)) return;
  restoreNativePackRows(root);
  root.querySelector(COMPENDIUM_PANEL_SELECTOR)?.remove();
  if (!safeSetting("virtualCompendiumFolders", true)) return;

  const packs = getFatmorbusPackRecords();
  if (!packs.length) return;
  hideNativePackRows(root, packs);

  // Keep the native Compendium Directory simple: one FATMORBUS folder only.
  // Packs remain owned by their original modules; this is purely a visual index.
  const panel = document.createElement("section");
  panel.className = "fatmorbus-virtual-compendiums";
  panel.dataset.fatmorbusVirtualCompendiums = "true";
  panel.innerHTML = `
    <details open class="fatmorbus-vfolder-root">
      <summary><i class="fa-solid fa-folder-open"></i><strong>FATMORBUS</strong><span>${packs.length}</span><i class="fa-solid fa-chevron-down"></i></summary>
      <div class="fatmorbus-vfolder-packs"></div>
    </details>`;

  const packContainer = panel.querySelector(".fatmorbus-vfolder-packs");
  const ordered = [...packs].sort((a, b) => {
    const moduleCompare = String(a.moduleTitle ?? "").localeCompare(String(b.moduleTitle ?? ""));
    return moduleCompare || String(a.label ?? "").localeCompare(String(b.label ?? ""));
  });
  for (const record of ordered) packContainer.append(createVirtualPackButton(record));

  const directoryList = root.querySelector(".directory-list, ol.directory-list, .compendium-list, [data-part='directory']");
  if (directoryList?.parentElement) directoryList.parentElement.insertBefore(panel, directoryList);
  else root.prepend(panel);

  const searchInput = root.querySelector("input[name='search'], input[type='search'], .header-search input");
  if (searchInput && !searchInput.dataset.fatmorbusVirtualSearch) {
    searchInput.dataset.fatmorbusVirtualSearch = "true";
    searchInput.addEventListener("input", () => {
      const currentPanel = root.querySelector(COMPENDIUM_PANEL_SELECTOR);
      if (currentPanel) filterVirtualCompendiums(currentPanel, searchInput.value);
    });
  }
  if (searchInput?.value) filterVirtualCompendiums(panel, searchInput.value);
}

function createVirtualPackButton(record) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "fatmorbus-vpack";
  button.dataset.search = normalizeText(`${record.label} ${record.moduleTitle} ${record.documentName} ${record.system}`);
  button.innerHTML = `<i class="fa-solid fa-box-archive"></i><span><strong>${escapeHtml(record.label)}</strong><small>${escapeHtml(record.moduleTitle)}</small></span><i class="fa-solid fa-chevron-right"></i>`;
  button.addEventListener("click", () => openPack(record.collection));
  return button;
}

function groupPacks(packs) {
  const systems = new Map();
  for (const record of packs) {
    const system = record.system || "agnostic";
    if (!systems.has(system)) systems.set(system, new Map());
    const categories = systems.get(system);
    const category = record.documentName || "Documents";
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category).push(record);
  }
  return new Map([...systems.entries()].sort(([a], [b]) => prettySystem(a).localeCompare(prettySystem(b))).map(([system, categories]) => [
    system,
    new Map([...categories.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([category, records]) => [category, records.sort((a, b) => a.label.localeCompare(b.label))]))
  ]));
}

/* Only exact pack collections are hidden. The previous endsWith() heuristic
   could match third-party packs (e.g. "otherpkg.magic-items" ends with "items")
   and silently remove compendiums that do not belong to Fatmorbus. */
function hideNativePackRows(root, packs) {
  const ids = new Set();
  for (const record of packs) {
    if (!record.collection) continue;
    ids.add(record.collection);
    ids.add(`Compendium.${record.collection}`);
  }
  const candidates = root.querySelectorAll("[data-pack], [data-entry-id], [data-uuid], [data-pack-id]");
  for (const element of candidates) {
    if (element.closest(COMPENDIUM_PANEL_SELECTOR)) continue;
    const values = [element.dataset.pack, element.dataset.entryId, element.dataset.uuid, element.dataset.packId].filter(Boolean);
    if (!values.some(value => ids.has(value))) continue;
    element.dataset.fatmorbusNativePackHidden = "true";
    element.hidden = true;
  }
}

function restoreNativePackRows(root) {
  root.querySelectorAll("[data-fatmorbus-native-pack-hidden]").forEach(element => {
    element.hidden = false;
    delete element.dataset.fatmorbusNativePackHidden;
  });
}

function filterVirtualCompendiums(panel, rawQuery) {
  const query = normalizeText(rawQuery);
  panel.querySelectorAll(".fatmorbus-vpack").forEach(button => {
    button.hidden = Boolean(query) && !button.dataset.search.includes(query);
  });
}

function collectSettings(moduleId) {
  const entries = Array.from(game.settings?.settings?.entries?.() ?? []);
  return entries.map(([mapKey, setting]) => normalizeSetting(mapKey, setting)).filter(setting => setting.namespace === moduleId && setting.config !== false).sort((a, b) => localize(a.name ?? a.key).localeCompare(localize(b.name ?? b.key)));
}

function collectSettingsMenus(moduleId) {
  const entries = Array.from(game.settings?.menus?.entries?.() ?? []);
  return entries.map(([mapKey, menu]) => normalizeMenu(mapKey, menu)).filter(menu => menu.namespace === moduleId && (!menu.restricted || game.user?.isGM));
}

function normalizeSetting(mapKey, setting = {}) {
  const parsed = splitNamespacedKey(mapKey);
  return { ...setting, mapKey, namespace: setting.namespace ?? parsed.namespace, key: setting.key ?? parsed.key };
}

function normalizeMenu(mapKey, menu = {}) {
  const parsed = splitNamespacedKey(mapKey);
  return { ...menu, mapKey, namespace: menu.namespace ?? parsed.namespace, key: menu.key ?? parsed.key };
}

function splitNamespacedKey(mapKey) {
  const value = String(mapKey ?? "");
  const index = value.indexOf(".");
  return index < 0 ? { namespace: value, key: "" } : { namespace: value.slice(0, index), key: value.slice(index + 1) };
}

function canEditSetting(setting) {
  if (setting.scope === "world" && !game.user?.isGM) return false;
  return true;
}

function settingType(setting) {
  const type = setting.type;
  if (type === Boolean || type?.name === "Boolean") return "boolean";
  if (type === Number || type?.name === "Number") return "number";
  if (type === String || type?.name === "String") return "string";
  const ctor = type?.constructor?.name ?? "";
  if (/BooleanField/i.test(ctor)) return "boolean";
  if (/NumberField/i.test(ctor)) return "number";
  if (/StringField/i.test(ctor)) return "string";
  return "complex";
}

function normalizeChoices(choices) {
  if (!choices) return [];
  if (typeof choices === "function") {
    try { choices = choices(); } catch { return []; }
  }
  if (choices instanceof Map) return Array.from(choices.entries());
  if (Array.isArray(choices)) return choices.map(value => [String(value), String(value)]);
  if (typeof choices === "object") return Object.entries(choices);
  return [];
}

function readSettingControl(element, kind) {
  if (kind === "boolean") return Boolean(element.checked);
  if (kind === "number") return Number(element.value);
  return element.value;
}

function restoreSettingControl(element, value, kind) {
  if (kind === "boolean") element.checked = Boolean(value);
  else element.value = value == null ? "" : String(value);
}

function safeGetSetting(namespace, key) {
  try { return game.settings.get(namespace, key); } catch { return undefined; }
}

async function openRegisteredSettingsMenu(menu) {
  if (!menu) return;
  try {
    const app = typeof menu.type === "function" ? new menu.type() : menu.type;
    await safeRenderApplication(app);
  } catch (error) {
    console.error(`${state.brand} Core | Could not open settings menu`, error);
    ui.notifications?.error?.(`${state.brand} Core | Could not open that module settings menu.`);
  }
}

async function openNativeSettings() {
  try {
    const sheet = game.settings?.sheet;
    if (!sheet) throw new Error("Settings sheet is unavailable.");
    await safeRenderApplication(sheet);
  } catch (error) {
    console.error(`${state.brand} Core | Could not open native settings`, error);
    ui.notifications?.error?.(`${state.brand} Core | Could not open Foundry's native settings.`);
  }
}

async function openUuid(uuid) {
  try {
    const document = await globalThis.fromUuid?.(uuid);
    if (!document) throw new Error(`Document not found: ${uuid}`);
    await safeRenderApplication(document.sheet);
  } catch (error) {
    console.error(`${state.brand} Core | Could not open library document ${uuid}`, error);
    ui.notifications?.warn?.(`${state.brand} Core | That library document could not be opened.`);
  }
}

async function openPack(collection) {
  const pack = game.packs?.get?.(collection);
  if (!pack) return;
  try {
    if (typeof pack.render === "function") {
      const result = pack.render(true);
      if (result?.then) await result;
      return;
    }
    if (pack.application) await safeRenderApplication(pack.application);
  } catch (error) {
    console.error(`${state.brand} Core | Could not open compendium ${collection}`, error);
    ui.notifications?.warn?.(`${state.brand} Core | That compendium could not be opened.`);
  }
}

async function safeRenderApplication(app) {
  if (!app?.render) throw new Error("Application is not renderable.");
  try {
    const result = app.render({ force: true });
    if (result?.then) await result;
  } catch (firstError) {
    try {
      const result = app.render(true);
      if (result?.then) await result;
    } catch {
      throw firstError;
    }
  }
}

function invokeTool(tool, module) {
  if (!tool) return;
  try {
    const action = tool.action ?? tool.onClick ?? tool.callback;
    if (typeof action === "function") return action({ module, game, ui, FatmorbusCore: globalThis.FatmorbusCore });
    if (typeof tool.hook === "string") return Hooks.callAll(tool.hook, { moduleId: module.id, source: state.moduleId });
    ui.notifications?.warn?.(`${state.brand} Core | This module tool has no callable action.`);
  } catch (error) {
    console.error(`${state.brand} Core | Module tool failed`, error);
    ui.notifications?.error?.(`${state.brand} Core | Module tool failed. Check the console for details.`);
  }
}

function visibleTools(tools) {
  return (Array.isArray(tools) ? tools : []).filter(tool => {
    if (tool.visible === false) return false;
    if (typeof tool.visible === "function") {
      try { return Boolean(tool.visible()); } catch { return false; }
    }
    if (tool.gmOnly && !game.user?.isGM) return false;
    return true;
  });
}

function createWorkspaceWindow(kind, title) {
  const overlay = document.createElement("div");
  overlay.className = "fatmorbus-workspace-overlay";
  overlay.dataset.fatmorbusWorkspacePanel = kind;
  overlay.innerHTML = `
    <section class="fatmorbus-workspace-window" role="dialog" aria-modal="true" aria-label="${escapeAttribute(title)}">
      <header class="fatmorbus-workspace-window-header"><div><span>FATMORBUS CORE</span><h2>${escapeHtml(title)}</h2></div><button type="button" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></header>
      <div class="fatmorbus-workspace-window-body"></div>
    </section>`;
  overlay.querySelector("header button")?.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("mousedown", event => { if (event.target === overlay) overlay.remove(); });
  return overlay;
}

function closeWorkspacePanels(except = "") {
  document.querySelectorAll(PANEL_SELECTOR).forEach(panel => {
    if (panel.dataset.fatmorbusWorkspacePanel !== except) panel.remove();
  });
}

function mergeMetadata(existing, incoming) {
  const result = { ...existing, ...incoming };
  if (existing.tools || incoming.tools) result.tools = mergeArrayById(asArray(existing.tools), asArray(incoming.tools));
  if (existing.sceneControls || incoming.sceneControls) result.sceneControls = [...asArray(existing.sceneControls), ...asArray(incoming.sceneControls)];
  return result;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function mergeArrayById(a, b) {
  const map = new Map();
  for (const item of [...a, ...b]) {
    if (!item || typeof item !== "object") continue;
    map.set(String(item.id ?? item.name ?? map.size), item);
  }
  return Array.from(map.values());
}

function refreshSceneControls() {
  try {
    const controls = ui.controls;
    const result = controls?.render?.({ force: true }) ?? controls?.render?.(true);
    if (result?.catch) result.catch(() => {});
  } catch { /* Foundry will rebuild controls naturally. */ }
}

function refreshCompendiumDirectory() {
  try {
    const compendium = ui.compendium ?? ui.sidebar?.tabs?.compendium;
    const result = compendium?.render?.({ force: true }) ?? compendium?.render?.(true);
    if (result?.catch) result.catch(() => {});
  } catch { /* The next sidebar render will apply organization. */ }
}

function getRoot(html) {
  const root = html?.[0] ?? html;
  return root instanceof HTMLElement ? root : null;
}

function localize(value) {
  const text = String(value ?? "");
  if (!text) return "";
  try { return game.i18n?.has?.(text) ? game.i18n.localize(text) : text; } catch { return text; }
}

function prettySystem(system) {
  const value = String(system || "agnostic");
  if (/^dnd5e$/i.test(value)) return "D&D 5e";
  if (/shadowdark/i.test(value)) return "Shadowdark RPG";
  if (/agnostic|none|null/i.test(value)) return "System Agnostic";
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function escapeAttribute(value) { return escapeHtml(value); }
