// OpenFront Lobby Finder — full filter version.
//
// Connects to wss://<host>/wN/lobbies (same feed the official client uses),
// applies the user's filter, and flags or auto-joins matching lobbies.

import { MAP_CATEGORIES, MODIFIERS, TEAM_PRESETS } from "./maps.js";

const STORAGE_KEYS = {
  filter: "ofbt.filter.v1",
  profiles: "ofbt.profiles.v1",
};

const els = {
  host: document.getElementById("host"),
  worker: document.getElementById("worker"),
  mode: document.getElementById("mode"),
  mapSize: document.getElementById("mapSize"),
  perTeam: document.getElementById("perTeam"),
  minTotal: document.getElementById("minTotal"),
  maxTotal: document.getElementById("maxTotal"),
  modifiers: document.getElementById("modifiers"),
  goldMin: document.getElementById("goldMin"),
  goldMax: document.getElementById("goldMax"),
  multMin: document.getElementById("multMin"),
  multMax: document.getElementById("multMax"),
  autoJoin: document.getElementById("autoJoin"),
  sound: document.getElementById("sound"),
  newTab: document.getElementById("newTab"),
  connect: document.getElementById("connect"),
  disconnect: document.getElementById("disconnect"),
  status: document.getElementById("status"),
  match: document.getElementById("match"),
  lobbies: document.getElementById("lobbies"),
  lobbyCount: document.getElementById("lobbyCount"),
  filterSummary: document.getElementById("filterSummary"),
  resetFilter: document.getElementById("resetFilter"),
  profileName: document.getElementById("profileName"),
  profileFolder: document.getElementById("profileFolder"),
  folderSuggestions: document.getElementById("folderSuggestions"),
  saveProfile: document.getElementById("saveProfile"),
  profileList: document.getElementById("profileList"),
  // Multi-selects
  mapChips: document.getElementById("mapChips"),
  mapToggle: document.getElementById("mapToggle"),
  mapPanel: document.getElementById("mapPanel"),
  mapOptions: document.getElementById("mapOptions"),
  mapSearch: document.getElementById("mapSearch"),
  mapsClear: document.getElementById("mapsClear"),
  teamChips: document.getElementById("teamChips"),
  teamToggle: document.getElementById("teamToggle"),
  teamPanel: document.getElementById("teamPanel"),
  teamOptions: document.getElementById("teamOptions"),
};

const modifierState = {}; // key -> "any" | "require" | "exclude"
for (const m of MODIFIERS) modifierState[m.key] = "any";

// Selected maps / team configs are arrays. Empty = "any".
const selectedMaps = new Set();
const selectedTeamConfigs = new Set();

let ws = null;
let reconnectTimer = null;
let userStopped = true;
let lastAutoJoinedGameId = null;
let lastNotifiedGameId = null;
let lastFlat = [];
let lastServerTime = 0;
let audioCtx = null;

const ALL_MAPS = MAP_CATEGORIES.flatMap((c) => c.maps);
const TEAM_PRESET_LABEL = Object.fromEntries(
  TEAM_PRESETS.filter((p) => p.value !== "any").map((p) => [p.value, p.label]),
);

function setStatus(text, kind) {
  els.status.textContent = text;
  els.status.className = "status " + (kind ?? "dim");
}

// ---- Multi-select: maps ----

function buildMapOptions() {
  els.mapOptions.innerHTML = "";
  for (const cat of MAP_CATEGORIES) {
    const group = document.createElement("div");
    group.className = "ms-group";

    const head = document.createElement("div");
    head.className = "ms-group-head";
    const title = document.createElement("span");
    title.className = "ms-group-title";
    title.textContent = cat.name;
    head.appendChild(title);

    const groupActions = document.createElement("div");
    groupActions.className = "ms-group-actions";
    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "ms-link";
    allBtn.textContent = "All";
    allBtn.addEventListener("click", () => {
      for (const m of cat.maps) selectedMaps.add(m);
      onMapsChanged();
    });
    groupActions.appendChild(allBtn);
    const noneBtn = document.createElement("button");
    noneBtn.type = "button";
    noneBtn.className = "ms-link";
    noneBtn.textContent = "None";
    noneBtn.addEventListener("click", () => {
      for (const m of cat.maps) selectedMaps.delete(m);
      onMapsChanged();
    });
    groupActions.appendChild(noneBtn);
    head.appendChild(groupActions);
    group.appendChild(head);

    const list = document.createElement("div");
    list.className = "ms-grid";
    for (const m of cat.maps) {
      const lab = document.createElement("label");
      lab.className = "ms-opt";
      lab.dataset.map = m;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = m;
      input.addEventListener("change", () => {
        if (input.checked) selectedMaps.add(m);
        else selectedMaps.delete(m);
        onMapsChanged();
      });
      lab.appendChild(input);
      const span = document.createElement("span");
      span.textContent = m;
      lab.appendChild(span);
      list.appendChild(lab);
    }
    group.appendChild(list);
    els.mapOptions.appendChild(group);
  }
}

function renderMapChips() {
  els.mapChips.innerHTML = "";
  if (selectedMaps.size === 0) {
    const note = document.createElement("span");
    note.className = "ms-any";
    note.textContent = "Any map";
    els.mapChips.appendChild(note);
    return;
  }
  for (const m of [...selectedMaps].sort()) {
    const chip = document.createElement("span");
    chip.className = "ms-chip";
    const name = document.createElement("span");
    name.textContent = m;
    chip.appendChild(name);
    const x = document.createElement("button");
    x.type = "button";
    x.className = "ms-chip-x";
    x.textContent = "×";
    x.title = `Remove ${m}`;
    x.addEventListener("click", () => {
      selectedMaps.delete(m);
      onMapsChanged();
    });
    chip.appendChild(x);
    els.mapChips.appendChild(chip);
  }
}

function syncMapOptionCheckboxes() {
  for (const lab of els.mapOptions.querySelectorAll(".ms-opt")) {
    const input = lab.querySelector("input");
    input.checked = selectedMaps.has(lab.dataset.map);
  }
}

function onMapsChanged() {
  renderMapChips();
  syncMapOptionCheckboxes();
  saveFilter();
  rerender();
  renderFilterSummary();
}

function filterMapOptions(query) {
  const q = query.trim().toLowerCase();
  for (const lab of els.mapOptions.querySelectorAll(".ms-opt")) {
    const visible = !q || lab.dataset.map.toLowerCase().includes(q);
    lab.classList.toggle("hidden", !visible);
  }
  for (const group of els.mapOptions.querySelectorAll(".ms-group")) {
    const hasVisible = !!group.querySelector(".ms-opt:not(.hidden)");
    group.classList.toggle("hidden", !hasVisible);
  }
}

// ---- Multi-select: team configs ----

function buildTeamOptions() {
  els.teamOptions.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "ms-grid";
  for (const p of TEAM_PRESETS) {
    if (p.value === "any") continue; // empty selection = any
    const lab = document.createElement("label");
    lab.className = "ms-opt";
    lab.dataset.team = p.value;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = p.value;
    input.addEventListener("change", () => {
      if (input.checked) selectedTeamConfigs.add(p.value);
      else selectedTeamConfigs.delete(p.value);
      onTeamsChanged();
    });
    lab.appendChild(input);
    const span = document.createElement("span");
    span.textContent = p.label;
    lab.appendChild(span);
    grid.appendChild(lab);
  }
  els.teamOptions.appendChild(grid);
}

function renderTeamChips() {
  els.teamChips.innerHTML = "";
  if (selectedTeamConfigs.size === 0) {
    const note = document.createElement("span");
    note.className = "ms-any";
    note.textContent = "Any team setup";
    els.teamChips.appendChild(note);
    return;
  }
  for (const v of [...selectedTeamConfigs]) {
    const chip = document.createElement("span");
    chip.className = "ms-chip";
    const name = document.createElement("span");
    name.textContent = TEAM_PRESET_LABEL[v] ?? v;
    chip.appendChild(name);
    const x = document.createElement("button");
    x.type = "button";
    x.className = "ms-chip-x";
    x.textContent = "×";
    x.addEventListener("click", () => {
      selectedTeamConfigs.delete(v);
      onTeamsChanged();
    });
    chip.appendChild(x);
    els.teamChips.appendChild(chip);
  }
}

function syncTeamOptionCheckboxes() {
  for (const lab of els.teamOptions.querySelectorAll(".ms-opt")) {
    const input = lab.querySelector("input");
    input.checked = selectedTeamConfigs.has(lab.dataset.team);
  }
}

function onTeamsChanged() {
  renderTeamChips();
  syncTeamOptionCheckboxes();
  saveFilter();
  rerender();
  renderFilterSummary();
}

// ---- Modifiers ----

function buildModifiers() {
  els.modifiers.innerHTML = "";
  for (const m of MODIFIERS) {
    const row = document.createElement("div");
    row.className = "modifier";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = m.label;
    row.appendChild(name);

    const tri = document.createElement("div");
    tri.className = "tri";
    for (const state of ["any", "require", "exclude"]) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.state = state;
      b.textContent = state;
      b.addEventListener("click", () => {
        modifierState[m.key] = state;
        updateTri(tri, state);
        saveFilter();
        rerender();
        renderFilterSummary();
      });
      tri.appendChild(b);
    }
    updateTri(tri, modifierState[m.key]);
    row.appendChild(tri);
    els.modifiers.appendChild(row);
  }
}

function updateTri(tri, active) {
  for (const b of tri.querySelectorAll("button")) {
    b.classList.remove("on-any", "on-require", "on-exclude");
    if (b.dataset.state === active) b.classList.add("on-" + active);
  }
}

// ---- Filter get/set/migrate ----

function migrateFilter(f) {
  if (!f || typeof f !== "object") return f;
  // Legacy single-value map → array
  if (f.maps === undefined) {
    if (typeof f.map === "string" && f.map !== "any" && f.map !== "") {
      f.maps = [f.map];
    } else {
      f.maps = [];
    }
    delete f.map;
  }
  // Legacy single-value teamConfig → array
  if (f.teamConfigs === undefined) {
    if (
      typeof f.teamConfig === "string" &&
      f.teamConfig !== "any" &&
      f.teamConfig !== ""
    ) {
      f.teamConfigs = [f.teamConfig];
    } else {
      f.teamConfigs = [];
    }
    delete f.teamConfig;
  }
  return f;
}

function getFilter() {
  const maxTotalRaw = els.maxTotal.value.trim();
  const goldMinRaw = els.goldMin.value.trim();
  const goldMaxRaw = els.goldMax.value.trim();
  const multMinRaw = els.multMin.value.trim();
  const multMaxRaw = els.multMax.value.trim();
  return {
    host: els.host.value.trim() || "openfront.io",
    workerIdx: Math.max(0, parseInt(els.worker.value, 10) || 0),
    mode: els.mode.value,
    maps: [...selectedMaps],
    mapSize: els.mapSize.value,
    teamConfigs: [...selectedTeamConfigs],
    perTeam: Math.max(0, parseInt(els.perTeam.value, 10) || 0),
    minTotal: Math.max(0, parseInt(els.minTotal.value, 10) || 0),
    maxTotal: maxTotalRaw === "" ? null : parseInt(maxTotalRaw, 10),
    autoJoin: els.autoJoin.checked,
    sound: els.sound.checked,
    newTab: els.newTab.checked,
    modifiers: { ...modifierState },
    goldMin: goldMinRaw === "" ? null : parseFloat(goldMinRaw),
    goldMax: goldMaxRaw === "" ? null : parseFloat(goldMaxRaw),
    multMin: multMinRaw === "" ? null : parseFloat(multMinRaw),
    multMax: multMaxRaw === "" ? null : parseFloat(multMaxRaw),
  };
}

function setFilter(f) {
  if (!f) return;
  f = migrateFilter(f);
  if (f.host !== undefined) els.host.value = f.host;
  if (f.workerIdx !== undefined) els.worker.value = f.workerIdx;
  if (f.mode !== undefined) els.mode.value = f.mode;
  if (f.mapSize !== undefined) els.mapSize.value = f.mapSize;
  if (f.perTeam !== undefined) els.perTeam.value = f.perTeam;
  if (f.minTotal !== undefined) els.minTotal.value = f.minTotal;
  if (f.maxTotal !== undefined && f.maxTotal !== null)
    els.maxTotal.value = f.maxTotal;
  else els.maxTotal.value = "";
  els.autoJoin.checked = !!f.autoJoin;
  els.sound.checked = f.sound !== false;
  els.newTab.checked = f.newTab !== false;
  if (f.modifiers) {
    for (const m of MODIFIERS) {
      modifierState[m.key] = f.modifiers[m.key] ?? "any";
    }
    buildModifiers();
  }
  els.goldMin.value = f.goldMin ?? "";
  els.goldMax.value = f.goldMax ?? "";
  els.multMin.value = f.multMin ?? "";
  els.multMax.value = f.multMax ?? "";

  selectedMaps.clear();
  if (Array.isArray(f.maps)) for (const m of f.maps) selectedMaps.add(m);
  renderMapChips();
  syncMapOptionCheckboxes();

  selectedTeamConfigs.clear();
  if (Array.isArray(f.teamConfigs))
    for (const v of f.teamConfigs) selectedTeamConfigs.add(v);
  renderTeamChips();
  syncTeamOptionCheckboxes();
}

function resetFilter() {
  els.mode.value = "any";
  els.mapSize.value = "any";
  els.perTeam.value = 0;
  els.minTotal.value = 0;
  els.maxTotal.value = "";
  els.goldMin.value = "";
  els.goldMax.value = "";
  els.multMin.value = "";
  els.multMax.value = "";
  for (const m of MODIFIERS) modifierState[m.key] = "any";
  buildModifiers();
  selectedMaps.clear();
  renderMapChips();
  syncMapOptionCheckboxes();
  selectedTeamConfigs.clear();
  renderTeamChips();
  syncTeamOptionCheckboxes();
  saveFilter();
  rerender();
  renderFilterSummary();
}

function saveFilter() {
  try {
    localStorage.setItem(STORAGE_KEYS.filter, JSON.stringify(getFilter()));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

function loadFilter() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.filter);
    if (raw) setFilter(JSON.parse(raw));
  } catch {
    // ignore parse errors
  }
}

// ---- Profiles (with folders) ----

function migrateProfileEntry(name, entry) {
  if (!entry || typeof entry !== "object") return null;
  // New format already has `filter` key
  if (entry.filter && typeof entry.filter === "object") {
    entry.filter = migrateFilter(entry.filter);
    entry.folder = typeof entry.folder === "string" ? entry.folder : "";
    if (typeof entry.createdAt !== "number") entry.createdAt = Date.now();
    return entry;
  }
  // Legacy: the entry IS the filter
  return {
    filter: migrateFilter(entry),
    folder: "",
    createdAt: Date.now(),
  };
}

function loadProfiles() {
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.profiles) ?? "{}");
  } catch {
    return {};
  }
  const out = {};
  for (const [name, entry] of Object.entries(raw)) {
    const m = migrateProfileEntry(name, entry);
    if (m) out[name] = m;
  }
  return out;
}

function saveProfiles(p) {
  try {
    localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(p));
  } catch {
    // ignore
  }
}

function summarizeFilter(f) {
  const parts = [];
  if (f.mode && f.mode !== "any") parts.push(f.mode);
  if (Array.isArray(f.maps) && f.maps.length > 0) {
    parts.push(
      f.maps.length <= 3 ? f.maps.join(" / ") : `${f.maps.length} maps`,
    );
  }
  if (Array.isArray(f.teamConfigs) && f.teamConfigs.length > 0) {
    parts.push(
      f.teamConfigs
        .map((v) => TEAM_PRESET_LABEL[v] ?? v)
        .join(" / "),
    );
  }
  if (f.mapSize && f.mapSize !== "any") parts.push(f.mapSize);
  if (f.perTeam > 0) parts.push(`≥${f.perTeam}/team`);
  if (f.minTotal > 0) parts.push(`≥${f.minTotal} total`);
  if (typeof f.maxTotal === "number") parts.push(`≤${f.maxTotal} total`);
  if (f.modifiers) {
    const req = [];
    const exc = [];
    for (const m of MODIFIERS) {
      if (f.modifiers[m.key] === "require") req.push(m.label);
      if (f.modifiers[m.key] === "exclude") exc.push(m.label);
    }
    if (req.length) parts.push(`+${req.join(", ")}`);
    if (exc.length) parts.push(`−${exc.join(", ")}`);
  }
  return parts.length ? parts.join(" · ") : "any lobby";
}

function renderProfiles() {
  const profiles = loadProfiles();
  els.profileList.innerHTML = "";

  const names = Object.keys(profiles);
  if (names.length === 0) {
    const note = document.createElement("div");
    note.className = "empty";
    note.textContent = "No saved profiles yet. Save the current filter above.";
    els.profileList.appendChild(note);
    refreshFolderSuggestions(profiles);
    return;
  }

  // Group by folder. "" is the ungrouped bucket.
  const byFolder = new Map();
  for (const n of names) {
    const f = profiles[n].folder || "";
    if (!byFolder.has(f)) byFolder.set(f, []);
    byFolder.get(f).push(n);
  }

  // Order: named folders alphabetically, ungrouped last.
  const folderNames = [...byFolder.keys()]
    .filter((f) => f !== "")
    .sort((a, b) => a.localeCompare(b));
  if (byFolder.has("")) folderNames.push("");

  for (const folder of folderNames) {
    const list = byFolder.get(folder).sort((a, b) => a.localeCompare(b));
    els.profileList.appendChild(renderFolder(folder, list, profiles));
  }

  refreshFolderSuggestions(profiles);
}

function renderFolder(folder, names, profiles) {
  const wrap = document.createElement("details");
  wrap.className = "profile-folder";
  wrap.open = true;

  const summary = document.createElement("summary");
  const head = document.createElement("div");
  head.className = "folder-head";
  const title = document.createElement("span");
  title.className = "folder-title";
  title.textContent = folder === "" ? "Ungrouped" : folder;
  head.appendChild(title);
  const badge = document.createElement("span");
  badge.className = "folder-count";
  badge.textContent = String(names.length);
  head.appendChild(badge);
  summary.appendChild(head);
  wrap.appendChild(summary);

  const cards = document.createElement("div");
  cards.className = "profile-cards";
  for (const name of names) {
    cards.appendChild(renderProfileCard(name, profiles[name], profiles));
  }
  wrap.appendChild(cards);
  return wrap;
}

function renderProfileCard(name, entry, allProfiles) {
  const card = document.createElement("div");
  card.className = "profile-card";

  const main = document.createElement("div");
  main.className = "profile-main";

  const nameRow = document.createElement("div");
  nameRow.className = "profile-name-row";
  const nameSpan = document.createElement("span");
  nameSpan.className = "profile-name";
  nameSpan.textContent = name;
  nameRow.appendChild(nameSpan);
  if (entry.folder) {
    const fb = document.createElement("span");
    fb.className = "folder-pill";
    fb.textContent = entry.folder;
    nameRow.appendChild(fb);
  }
  main.appendChild(nameRow);

  const summary = document.createElement("div");
  summary.className = "profile-summary";
  summary.textContent = summarizeFilter(entry.filter);
  main.appendChild(summary);

  card.appendChild(main);

  const actions = document.createElement("div");
  actions.className = "profile-actions";

  const loadBtn = document.createElement("button");
  loadBtn.type = "button";
  loadBtn.className = "primary";
  loadBtn.textContent = "Load";
  loadBtn.addEventListener("click", () => {
    setFilter(entry.filter);
    saveFilter();
    rerender();
    renderFilterSummary();
  });
  actions.appendChild(loadBtn);

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.title = "Rename or move to another folder";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => editProfile(name, entry, allProfiles));
  actions.appendChild(editBtn);

  const updateBtn = document.createElement("button");
  updateBtn.type = "button";
  updateBtn.title = "Replace this profile with the current filter";
  updateBtn.textContent = "Update";
  updateBtn.addEventListener("click", () => {
    const profiles = loadProfiles();
    if (!profiles[name]) return;
    profiles[name].filter = getFilter();
    saveProfiles(profiles);
    renderProfiles();
  });
  actions.appendChild(updateBtn);

  const del = document.createElement("button");
  del.type = "button";
  del.className = "danger";
  del.textContent = "Delete";
  del.addEventListener("click", () => {
    if (!confirm(`Delete profile "${name}"?`)) return;
    const profiles = loadProfiles();
    delete profiles[name];
    saveProfiles(profiles);
    renderProfiles();
  });
  actions.appendChild(del);

  card.appendChild(actions);
  return card;
}

function editProfile(name, entry, allProfiles) {
  const newName = (
    prompt("Rename profile (leave blank to keep)", name) ?? name
  ).trim();
  const folderInput = prompt(
    "Folder for this profile (blank for ungrouped)",
    entry.folder ?? "",
  );
  if (folderInput === null) return; // cancel
  const finalName = newName || name;
  const profiles = loadProfiles();
  if (finalName !== name) {
    if (profiles[finalName] && finalName !== name) {
      alert(`A profile named "${finalName}" already exists.`);
      return;
    }
    delete profiles[name];
  }
  profiles[finalName] = {
    ...entry,
    folder: folderInput.trim(),
  };
  saveProfiles(profiles);
  renderProfiles();
}

function refreshFolderSuggestions(profiles) {
  els.folderSuggestions.innerHTML = "";
  const folders = new Set();
  for (const e of Object.values(profiles)) {
    if (e.folder) folders.add(e.folder);
  }
  for (const f of [...folders].sort()) {
    const opt = document.createElement("option");
    opt.value = f;
    els.folderSuggestions.appendChild(opt);
  }
}

// ---- Filter summary line ----

function renderFilterSummary() {
  const summary = summarizeFilter(getFilter());
  els.filterSummary.innerHTML = "";
  const label = document.createElement("span");
  label.className = "fs-label";
  label.textContent = "Hunting:";
  els.filterSummary.appendChild(label);
  const body = document.createElement("span");
  body.className = "fs-body";
  body.textContent = summary;
  els.filterSummary.appendChild(body);
}

// ---- WebSocket / runtime ----

function start() {
  stop();
  userStopped = false;
  const cfg = getFilter();
  const url = `wss://${cfg.host}/w${cfg.workerIdx}/lobbies`;
  setStatus(`connecting ${url}…`);
  let myWs;
  try {
    myWs = new WebSocket(url);
  } catch (e) {
    setStatus(`bad URL: ${e.message}`, "err");
    return;
  }
  ws = myWs;
  ensureAudioContext();

  myWs.addEventListener("open", () => {
    if (myWs !== ws) return;
    setStatus(`connected to w${cfg.workerIdx}@${cfg.host}`, "ok");
    els.connect.disabled = true;
    els.disconnect.disabled = false;
  });
  myWs.addEventListener("message", (ev) => {
    if (myWs !== ws) return;
    onMessage(ev.data);
  });
  myWs.addEventListener("close", () => {
    if (myWs !== ws) return;
    els.connect.disabled = false;
    els.disconnect.disabled = true;
    if (userStopped) return;
    setStatus("disconnected — retrying in 3s", "err");
    if (reconnectTimer === null) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (userStopped) return;
        if (ws === null || ws.readyState === WebSocket.CLOSED) start();
      }, 3000);
    }
  });
  myWs.addEventListener("error", () => {
    if (myWs !== ws) return;
    setStatus("websocket error", "err");
  });
}

function stop() {
  userStopped = true;
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws !== null) {
    try {
      ws.close();
    } catch {
      // ignore
    }
    ws = null;
  }
  els.connect.disabled = false;
  els.disconnect.disabled = true;
  setStatus("idle");
}

function ensureAudioContext() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  } catch {
    // ignore — audio is optional
  }
}

function playMatchSound() {
  ensureAudioContext();
  if (!audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    const tones = [
      { freq: 740, start: 0, dur: 0.16 },
      { freq: 988, start: 0.14, dur: 0.32 },
    ];
    for (const t of tones) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = t.freq;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      const s = now + t.start;
      gain.gain.setValueAtTime(0, s);
      gain.gain.linearRampToValueAtTime(0.28, s + 0.02);
      gain.gain.linearRampToValueAtTime(0, s + t.dur);
      osc.start(s);
      osc.stop(s + t.dur + 0.02);
    }
  } catch {
    // ignore
  }
}

function onMessage(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }
  const games = (data && data.games) || {};
  lastFlat = []
    .concat(games.ffa ?? [])
    .concat(games.team ?? [])
    .concat(games.special ?? []);
  lastServerTime = data.serverTime ?? 0;
  rerender();
}

function rerender() {
  const cfg = getFilter();
  renderLobbies(lastFlat, lastServerTime, cfg);
  const match = lastFlat.find((g) => isMatch(g, cfg));
  renderMatch(match, cfg);

  if (match) {
    if (cfg.sound && match.gameID !== lastNotifiedGameId) {
      playMatchSound();
    }
    lastNotifiedGameId = match.gameID;
  } else {
    lastNotifiedGameId = null;
  }

  if (
    match &&
    cfg.autoJoin &&
    match.gameID !== lastAutoJoinedGameId &&
    !isStarted(match, lastServerTime)
  ) {
    lastAutoJoinedGameId = match.gameID;
    openJoin(match.gameID, cfg);
  }
}

function effectivePlayersPerTeam(gc) {
  if (gc.gameMode !== "Team") return null;
  const teams = gc.playerTeams;
  const max = gc.maxPlayers ?? 0;
  if (teams === "Duos") return 2;
  if (teams === "Trios") return 3;
  if (teams === "Quads") return 4;
  if (teams === "Humans Vs Nations") return max;
  if (typeof teams === "number" && teams > 0)
    return Math.floor(max / Math.max(1, teams));
  return null;
}

function teamConfigMatches(want, got) {
  if (/^\d+$/.test(want)) return got === parseInt(want, 10);
  return got === want;
}

function isMatch(g, cfg) {
  const gc = g.gameConfig;
  if (!gc) return false;

  if (cfg.mode !== "any" && gc.gameMode !== cfg.mode) return false;
  if (Array.isArray(cfg.maps) && cfg.maps.length > 0) {
    if (!cfg.maps.includes(gc.gameMap)) return false;
  }
  if (cfg.mapSize !== "any" && gc.gameMapSize !== cfg.mapSize) return false;

  if (Array.isArray(cfg.teamConfigs) && cfg.teamConfigs.length > 0) {
    const got = gc.playerTeams;
    if (!cfg.teamConfigs.some((w) => teamConfigMatches(w, got))) return false;
  }

  const max = typeof gc.maxPlayers === "number" ? gc.maxPlayers : 0;
  if (cfg.minTotal > 0 && max < cfg.minTotal) return false;
  if (cfg.maxTotal !== null && max > cfg.maxTotal) return false;

  if (cfg.perTeam > 0) {
    const per = effectivePlayersPerTeam(gc);
    if (per === null) return false;
    if (per < cfg.perTeam) return false;
  }

  const mods = gc.publicGameModifiers ?? {};
  for (const m of MODIFIERS) {
    const state = cfg.modifiers[m.key];
    const active = !!mods[m.key];
    if (state === "require" && !active) return false;
    if (state === "exclude" && active) return false;
  }

  if (cfg.goldMin !== null && (mods.startingGold ?? 0) < cfg.goldMin)
    return false;
  if (cfg.goldMax !== null && (mods.startingGold ?? 0) > cfg.goldMax)
    return false;
  if (cfg.multMin !== null && (mods.goldMultiplier ?? 1) < cfg.multMin)
    return false;
  if (cfg.multMax !== null && (mods.goldMultiplier ?? 1) > cfg.multMax)
    return false;

  return true;
}

function isStarted(g, serverTime) {
  if (!g.startsAt || !serverTime) return false;
  return serverTime >= g.startsAt;
}

function categoryOf(g) {
  if (g.publicGameType) return g.publicGameType;
  if (g.gameConfig?.gameMode === "Team") return "team";
  return "ffa";
}

function lobbyTitle(g) {
  const map = g.gameConfig?.gameMap ?? "Unknown map";
  const mode = g.gameConfig?.gameMode ?? "?";
  const teams = g.gameConfig?.playerTeams;
  if (mode === "Team") {
    if (typeof teams === "number") return `${map} — ${teams} teams`;
    if (typeof teams === "string") return `${map} — ${teams}`;
    return `${map} — Team`;
  }
  return `${map} — ${mode}`;
}

function fmtCountdown(g, serverTime) {
  if (!g.startsAt || !serverTime) return "";
  const secs = Math.max(0, Math.round((g.startsAt - serverTime) / 1000));
  if (secs <= 0) return "starting";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function renderLobbies(games, serverTime, cfg) {
  const matchCount = games.filter((g) => isMatch(g, cfg)).length;
  if (games.length === 0) {
    els.lobbyCount.textContent = "";
    els.lobbies.innerHTML = "";
    els.lobbies.className = "empty";
    els.lobbies.textContent = "No public lobbies right now.";
    return;
  }
  els.lobbyCount.textContent = `${games.length} public · ${matchCount} match${matchCount === 1 ? "" : "es"}`;
  els.lobbyCount.className = "count-badge" + (matchCount > 0 ? " has-match" : "");

  els.lobbies.className = "";
  els.lobbies.innerHTML = "";

  const sorted = games.slice().sort((a, b) => {
    const am = isMatch(a, cfg) ? 0 : 1;
    const bm = isMatch(b, cfg) ? 0 : 1;
    if (am !== bm) return am - bm;
    return (b.numClients ?? 0) - (a.numClients ?? 0);
  });

  for (const g of sorted) {
    els.lobbies.appendChild(renderLobby(g, serverTime, cfg));
  }
}

function renderLobby(g, serverTime, cfg) {
  const matched = isMatch(g, cfg);
  const root = document.createElement("div");
  root.className = "lobby" + (matched ? " matched" : "");

  const meta = document.createElement("div");
  meta.className = "meta";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = lobbyTitle(g);
  meta.appendChild(title);

  const badges = document.createElement("div");
  badges.className = "badges";
  const cat = categoryOf(g);
  const catBadge = document.createElement("span");
  catBadge.className = "badge " + cat;
  catBadge.textContent = cat;
  badges.appendChild(catBadge);

  if (g.gameConfig?.gameMapSize) {
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = g.gameConfig.gameMapSize;
    badges.appendChild(b);
  }
  if (g.gameConfig?.rankedType) {
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = g.gameConfig.rankedType;
    badges.appendChild(b);
  }
  const mods = g.gameConfig?.publicGameModifiers ?? {};
  for (const [k, v] of Object.entries(mods)) {
    if (v === true) {
      const b = document.createElement("span");
      b.className = "badge";
      b.textContent = k.replace(/^is/, "");
      badges.appendChild(b);
    }
  }
  if (typeof mods.startingGold === "number" && mods.startingGold > 0) {
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = `Gold ${(mods.startingGold / 1_000_000).toFixed(1)}M`;
    badges.appendChild(b);
  }
  if (typeof mods.goldMultiplier === "number" && mods.goldMultiplier !== 1) {
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = `x${mods.goldMultiplier} gold`;
    badges.appendChild(b);
  }
  if (matched) {
    const b = document.createElement("span");
    b.className = "badge hit";
    b.textContent = "MATCH";
    badges.appendChild(b);
  }
  meta.appendChild(badges);

  const count = document.createElement("div");
  count.className = "count";
  const max = g.gameConfig?.maxPlayers ?? "?";
  const per = effectivePlayersPerTeam(g.gameConfig ?? {});
  const perStr = per ? ` (${per}/team)` : "";
  const cd = fmtCountdown(g, serverTime);
  count.textContent = `${g.numClients ?? 0}/${max} players${perStr}${cd ? " · starts in " + cd : ""}`;
  meta.appendChild(count);

  root.appendChild(meta);

  const right = document.createElement("div");
  right.className = "right";

  const id = document.createElement("span");
  id.className = "badge";
  id.textContent = g.gameID;
  right.appendChild(id);

  const join = document.createElement("button");
  join.className = "join";
  join.textContent = "Join";
  join.addEventListener("click", () => openJoin(g.gameID, getFilter()));
  right.appendChild(join);

  root.appendChild(right);
  return root;
}

function renderMatch(match, cfg) {
  if (!match) {
    els.match.className = "empty";
    els.match.textContent = "No matching lobby yet — waiting…";
    return;
  }
  els.match.className = "match";
  els.match.innerHTML = "";

  const h3 = document.createElement("h3");
  h3.textContent = `${lobbyTitle(match)} — ${match.gameID}`;
  els.match.appendChild(h3);

  const max = match.gameConfig?.maxPlayers ?? 0;
  const per = effectivePlayersPerTeam(match.gameConfig ?? {});
  const info = document.createElement("div");
  info.textContent =
    `${match.numClients ?? 0}/${max} joined` +
    (per ? ` · ${per}/team max` : "");
  info.style.color = "var(--text)";
  info.style.fontSize = "13px";
  info.style.marginBottom = "10px";
  els.match.appendChild(info);

  const btn = document.createElement("button");
  btn.className = "join";
  btn.textContent = `Join ${match.gameID}`;
  btn.addEventListener("click", () => openJoin(match.gameID, cfg));
  els.match.appendChild(btn);

  if (cfg.autoJoin && lastAutoJoinedGameId === match.gameID) {
    const note = document.createElement("div");
    note.style.color = "var(--dim)";
    note.style.fontSize = "12px";
    note.style.marginTop = "8px";
    note.textContent =
      "Auto-join fired — if a popup was blocked, click the button above.";
    els.match.appendChild(note);
  }
}

// True when the tool is running inside the side-panel iframe injected by
// the extension's content script.
const EMBEDDED =
  new URLSearchParams(location.search).get("embed") === "1" ||
  window.parent !== window;

function openJoin(gameID, cfg) {
  if (EMBEDDED) {
    try {
      window.parent.postMessage(
        { source: "ofbt", type: "join", gameID, newTab: false },
        "*",
      );
      return;
    } catch {
      // fall through to normal nav
    }
  }
  const url = `https://${cfg.host}/game/${gameID}`;
  if (cfg.newTab) {
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      window.location.href = url;
    }
  } else {
    window.location.href = url;
  }
}

function setupMultiSelectToggle(toggleEl, panelEl) {
  toggleEl.addEventListener("click", () => {
    const open = panelEl.classList.toggle("hidden");
    toggleEl.setAttribute("aria-expanded", open ? "false" : "true");
    const text = toggleEl.querySelector(".ms-toggle-text");
    if (text) {
      text.textContent = open
        ? text.dataset.closedText || text.textContent.replace("− Hide", "+ Add")
        : text.dataset.openText || text.textContent.replace(/^\+ Add/, "− Hide");
    }
  });
}

function init() {
  if (EMBEDDED) document.body.classList.add("embed");
  buildMapOptions();
  buildTeamOptions();
  buildModifiers();
  renderMapChips();
  renderTeamChips();
  loadFilter();
  renderProfiles();
  renderFilterSummary();

  // wire change events on every input so saving/rerender stay in sync
  const inputs = [
    els.host,
    els.worker,
    els.mode,
    els.mapSize,
    els.perTeam,
    els.minTotal,
    els.maxTotal,
    els.goldMin,
    els.goldMax,
    els.multMin,
    els.multMax,
    els.autoJoin,
    els.sound,
    els.newTab,
  ];
  for (const el of inputs) {
    el.addEventListener("change", () => {
      saveFilter();
      rerender();
      renderFilterSummary();
    });
    el.addEventListener("input", () => {
      saveFilter();
    });
  }

  els.connect.addEventListener("click", start);
  els.disconnect.addEventListener("click", stop);
  els.autoJoin.addEventListener("change", () => {
    lastAutoJoinedGameId = null;
  });

  els.sound.addEventListener("change", () => {
    if (els.sound.checked) {
      ensureAudioContext();
      playMatchSound();
    }
    lastNotifiedGameId = null;
  });

  els.resetFilter.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Clear all targeting (maps, modes, modifiers)?")) return;
    resetFilter();
  });

  setupMultiSelectToggle(els.mapToggle, els.mapPanel);
  setupMultiSelectToggle(els.teamToggle, els.teamPanel);

  els.mapSearch.addEventListener("input", () => {
    filterMapOptions(els.mapSearch.value);
  });
  els.mapsClear.addEventListener("click", () => {
    selectedMaps.clear();
    onMapsChanged();
  });

  els.saveProfile.addEventListener("click", () => {
    const name = els.profileName.value.trim();
    if (!name) return;
    const folder = els.profileFolder.value.trim();
    const profiles = loadProfiles();
    profiles[name] = {
      filter: getFilter(),
      folder,
      createdAt: profiles[name]?.createdAt ?? Date.now(),
    };
    saveProfiles(profiles);
    els.profileName.value = "";
    renderProfiles();
  });

  setStatus("idle");
}

init();
