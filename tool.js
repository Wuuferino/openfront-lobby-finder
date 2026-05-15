// OpenFront lobby targeter — full filter version.
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
  map: document.getElementById("map"),
  mapSize: document.getElementById("mapSize"),
  teamConfig: document.getElementById("teamConfig"),
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
  profileName: document.getElementById("profileName"),
  saveProfile: document.getElementById("saveProfile"),
  profileList: document.getElementById("profileList"),
};

const modifierState = {}; // key -> "any" | "require" | "exclude"
for (const m of MODIFIERS) modifierState[m.key] = "any";

let ws = null;
let reconnectTimer = null;
let userStopped = true;
let lastAutoJoinedGameId = null;
let lastNotifiedGameId = null;
let lastFlat = [];
let lastServerTime = 0;
let audioCtx = null;

function setStatus(text, kind) {
  els.status.textContent = text;
  els.status.className = "status " + (kind ?? "dim");
}

function populateSelects() {
  const mapSel = els.map;
  mapSel.innerHTML = "";
  const anyOpt = document.createElement("option");
  anyOpt.value = "any";
  anyOpt.textContent = "Any map";
  mapSel.appendChild(anyOpt);
  for (const cat of MAP_CATEGORIES) {
    const group = document.createElement("optgroup");
    group.label = cat.name;
    for (const m of cat.maps) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      group.appendChild(opt);
    }
    mapSel.appendChild(group);
  }

  const tSel = els.teamConfig;
  tSel.innerHTML = "";
  for (const p of TEAM_PRESETS) {
    const opt = document.createElement("option");
    opt.value = p.value;
    opt.textContent = p.label;
    tSel.appendChild(opt);
  }
}

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
      b.dataset.state = state;
      b.textContent = state;
      b.addEventListener("click", () => {
        modifierState[m.key] = state;
        updateTri(tri, state);
        saveFilter();
        rerender();
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
    map: els.map.value,
    mapSize: els.mapSize.value,
    teamConfig: els.teamConfig.value,
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
  if (f.host !== undefined) els.host.value = f.host;
  if (f.workerIdx !== undefined) els.worker.value = f.workerIdx;
  if (f.mode !== undefined) els.mode.value = f.mode;
  if (f.map !== undefined) els.map.value = f.map;
  if (f.mapSize !== undefined) els.mapSize.value = f.mapSize;
  if (f.teamConfig !== undefined) els.teamConfig.value = f.teamConfig;
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
    for (const row of els.modifiers.querySelectorAll(".modifier")) {
      // re-render handled below
    }
    buildModifiers();
  }
  els.goldMin.value = f.goldMin ?? "";
  els.goldMax.value = f.goldMax ?? "";
  els.multMin.value = f.multMin ?? "";
  els.multMax.value = f.multMax ?? "";
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

function loadProfiles() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.profiles) ?? "{}");
  } catch {
    return {};
  }
}

function saveProfiles(p) {
  try {
    localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(p));
  } catch {
    // ignore
  }
}

function renderProfiles() {
  const profiles = loadProfiles();
  els.profileList.innerHTML = "";
  const names = Object.keys(profiles).sort();
  if (names.length === 0) {
    const note = document.createElement("span");
    note.className = "hint";
    note.textContent = "No saved profiles.";
    els.profileList.appendChild(note);
    return;
  }
  for (const name of names) {
    const pill = document.createElement("div");
    pill.className = "profile";
    const label = document.createElement("span");
    label.className = "name";
    label.textContent = name;
    label.title = "Click to load";
    label.addEventListener("click", () => {
      setFilter(profiles[name]);
      saveFilter();
      rerender();
    });
    pill.appendChild(label);

    const del = document.createElement("button");
    del.className = "delete";
    del.textContent = "✕";
    del.title = "Delete profile";
    del.addEventListener("click", () => {
      const p = loadProfiles();
      delete p[name];
      saveProfiles(p);
      renderProfiles();
    });
    pill.appendChild(del);
    els.profileList.appendChild(pill);
  }
}

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
  // Resume the audio context on this user gesture (browsers require one
  // before AudioContext can play). We allocate lazily in playMatchSound,
  // but a resume here keeps subsequent beeps reliable.
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
    // Ignore close events from a connection we've already replaced or stopped.
    if (myWs !== ws) return;
    els.connect.disabled = false;
    els.disconnect.disabled = true;
    if (userStopped) return; // user-initiated; stop() already set status
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

// Two-note rising chime via Web Audio. Plays even when the tab is
// backgrounded (Chromium does not throttle Web Audio in inactive tabs).
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
    // ignore — audio is optional
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
    // Re-arm so the next match (even the same gameID after a brief drop) chimes.
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
  if (teams === "Humans Vs Nations") return max; // not meaningful — skip filter
  if (typeof teams === "number" && teams > 0)
    return Math.floor(max / Math.max(1, teams));
  return null;
}

function isMatch(g, cfg) {
  const gc = g.gameConfig;
  if (!gc) return false;

  if (cfg.mode !== "any" && gc.gameMode !== cfg.mode) return false;
  if (cfg.map !== "any" && gc.gameMap !== cfg.map) return false;
  if (cfg.mapSize !== "any" && gc.gameMapSize !== cfg.mapSize) return false;

  if (cfg.teamConfig !== "any") {
    const want = cfg.teamConfig;
    const got = gc.playerTeams;
    if (/^\d+$/.test(want)) {
      if (got !== parseInt(want, 10)) return false;
    } else {
      if (got !== want) return false;
    }
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
  if (games.length === 0) {
    els.lobbies.innerHTML = "";
    els.lobbies.className = "empty";
    els.lobbies.textContent = "No public lobbies right now.";
    return;
  }
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
// the extension's content script. In that case we ask the parent tab (which
// is already on openfront.io) to navigate in place, rather than spawning a
// new tab — the "Open in new tab" preference is force-ignored.
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
      // fall through to normal nav if postMessage fails
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

function init() {
  if (EMBEDDED) document.body.classList.add("embed");
  populateSelects();
  buildModifiers();
  loadFilter();
  renderProfiles();

  // wire change events on every input so saving/rerender stay in sync
  const inputs = [
    els.host,
    els.worker,
    els.mode,
    els.map,
    els.mapSize,
    els.teamConfig,
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
    });
    el.addEventListener("input", () => {
      saveFilter();
    });
  }

  els.connect.addEventListener("click", start);
  els.disconnect.addEventListener("click", stop);
  els.autoJoin.addEventListener("change", () => {
    // re-arm so a current match can fire once after toggling
    lastAutoJoinedGameId = null;
  });

  els.sound.addEventListener("change", () => {
    // Preview the chime when enabling — the click is a user gesture, so it
    // also "primes" the AudioContext for subsequent backgrounded triggers.
    if (els.sound.checked) {
      ensureAudioContext();
      playMatchSound();
    }
    // Re-arm notifier so the next match (or current match) chimes again.
    lastNotifiedGameId = null;
  });

  els.saveProfile.addEventListener("click", () => {
    const name = els.profileName.value.trim();
    if (!name) return;
    const profiles = loadProfiles();
    profiles[name] = getFilter();
    saveProfiles(profiles);
    els.profileName.value = "";
    renderProfiles();
  });

  setStatus("idle");
}

init();
