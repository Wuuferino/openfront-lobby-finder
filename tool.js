// OpenFront lobby watcher.
//
// Connects to the same WebSocket the official client uses
// (wss://<host>/wN/lobbies) and listens for the public-games broadcast.
// A "match" is a Team game with exactly N teams and >= K players per team
// (configurable; defaults to 2 teams, 40+ per team => maxPlayers >= 80).

const els = {
  host: document.getElementById("host"),
  worker: document.getElementById("worker"),
  teams: document.getElementById("teams"),
  perTeam: document.getElementById("perTeam"),
  autoJoin: document.getElementById("autoJoin"),
  newTab: document.getElementById("newTab"),
  connect: document.getElementById("connect"),
  disconnect: document.getElementById("disconnect"),
  status: document.getElementById("status"),
  match: document.getElementById("match"),
  lobbies: document.getElementById("lobbies"),
};

let ws = null;
let reconnectTimer = null;
let lastAutoJoinedGameId = null;

function setStatus(text, kind) {
  els.status.textContent = text;
  els.status.className = "status " + (kind ?? "dim");
}

function getConfig() {
  return {
    host: els.host.value.trim() || "openfront.io",
    workerIdx: Math.max(0, parseInt(els.worker.value, 10) || 0),
    teams: Math.max(2, parseInt(els.teams.value, 10) || 2),
    perTeam: Math.max(1, parseInt(els.perTeam.value, 10) || 40),
    autoJoin: els.autoJoin.checked,
    newTab: els.newTab.checked,
  };
}

function start() {
  stop();
  const cfg = getConfig();
  const url = `wss://${cfg.host}/w${cfg.workerIdx}/lobbies`;
  setStatus(`connecting ${url}…`);
  try {
    ws = new WebSocket(url);
  } catch (e) {
    setStatus(`bad URL: ${e.message}`, "err");
    return;
  }
  ws.addEventListener("open", () => {
    setStatus(`connected to w${cfg.workerIdx}@${cfg.host}`, "ok");
    els.connect.disabled = true;
    els.disconnect.disabled = false;
  });
  ws.addEventListener("message", (ev) => onMessage(ev.data));
  ws.addEventListener("close", () => {
    setStatus("disconnected — retrying in 3s", "err");
    els.connect.disabled = false;
    els.disconnect.disabled = true;
    if (reconnectTimer === null) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (ws === null || ws.readyState === WebSocket.CLOSED) start();
      }, 3000);
    }
  });
  ws.addEventListener("error", () => {
    setStatus("websocket error", "err");
  });
}

function stop() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws !== null) {
    try {
      ws.close();
    } catch {
      // ignore close errors during teardown
    }
    ws = null;
  }
  els.connect.disabled = false;
  els.disconnect.disabled = true;
  setStatus("idle");
}

function onMessage(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }
  const games = (data && data.games) || {};
  const flat = []
    .concat(games.ffa ?? [])
    .concat(games.team ?? [])
    .concat(games.special ?? []);
  renderLobbies(flat, data.serverTime);

  const cfg = getConfig();
  const match = flat.find((g) => isMatch(g, cfg));
  renderMatch(match, cfg);

  if (
    match &&
    cfg.autoJoin &&
    match.gameID !== lastAutoJoinedGameId &&
    !isStarted(match, data.serverTime)
  ) {
    lastAutoJoinedGameId = match.gameID;
    openJoin(match.gameID, cfg);
  }
}

function isMatch(g, cfg) {
  const gc = g.gameConfig;
  if (!gc) return false;
  if (gc.gameMode !== "Team") return false;
  if (gc.playerTeams !== cfg.teams) return false;
  const maxPlayers = typeof gc.maxPlayers === "number" ? gc.maxPlayers : 0;
  return maxPlayers >= cfg.teams * cfg.perTeam;
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

function renderLobbies(games, serverTime) {
  if (games.length === 0) {
    els.lobbies.innerHTML = "";
    els.lobbies.className = "empty";
    els.lobbies.textContent = "No public lobbies right now.";
    return;
  }
  const cfg = getConfig();
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
  if (matched) {
    const b = document.createElement("span");
    b.className = "badge hit";
    b.textContent = `MATCH: ${cfg.teams}×${cfg.perTeam}+`;
    badges.appendChild(b);
  }
  meta.appendChild(badges);

  const count = document.createElement("div");
  count.className = "count";
  const max = g.gameConfig?.maxPlayers ?? "?";
  const perTeamShown =
    g.gameConfig?.gameMode === "Team" &&
    typeof g.gameConfig?.playerTeams === "number" &&
    typeof g.gameConfig?.maxPlayers === "number"
      ? ` (${Math.floor(g.gameConfig.maxPlayers / g.gameConfig.playerTeams)}/team)`
      : "";
  const cd = fmtCountdown(g, serverTime);
  count.textContent = `${g.numClients ?? 0}/${max} players${perTeamShown}${cd ? " · starts in " + cd : ""}`;
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
  join.addEventListener("click", () => openJoin(g.gameID, getConfig()));
  right.appendChild(join);

  root.appendChild(right);
  return root;
}

function renderMatch(match, cfg) {
  if (!match) {
    els.match.className = "empty";
    els.match.textContent = `No matching lobby yet — waiting for ${cfg.teams} teams with ${cfg.perTeam}+ per team…`;
    return;
  }
  els.match.className = "match";
  els.match.innerHTML = "";

  const h3 = document.createElement("h3");
  h3.textContent = `${lobbyTitle(match)} — ${match.gameID}`;
  els.match.appendChild(h3);

  const max = match.gameConfig?.maxPlayers ?? 0;
  const teams = match.gameConfig?.playerTeams ?? 0;
  const per = teams ? Math.floor(max / teams) : 0;
  const info = document.createElement("div");
  info.textContent = `${match.numClients ?? 0}/${max} joined · ${teams} teams · ${per}/team max`;
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

function openJoin(gameID, cfg) {
  const url = `https://${cfg.host}/game/${gameID}`;
  if (cfg.newTab) {
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      // popup blocked — fall back to same-tab navigation
      window.location.href = url;
    }
  } else {
    window.location.href = url;
  }
}

els.connect.addEventListener("click", start);
els.disconnect.addEventListener("click", stop);
els.autoJoin.addEventListener("change", () => {
  // arming auto-join from scratch lets a currently-shown match re-fire once
  lastAutoJoinedGameId = null;
});
