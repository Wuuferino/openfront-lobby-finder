// Injects the lobby finder as a slide-out panel on the right edge of
// openfront.io. Auto-hides whenever gameplay is active
// (document.body.classList contains "in-game" — set by Main.ts when the
// game has actually started).

(() => {
  const HOST_ID = "ofbt-host";
  const OPEN_KEY = "ofbt.panelOpen.v1";

  // Don't double-inject if the extension re-runs (e.g. SPA-style nav).
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.classList.add("ofbt-collapsed"); // start collapsed for non-disruptive entry

  const toggle = document.createElement("button");
  toggle.id = "ofbt-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Toggle OpenFront Lobby Finder");
  toggle.innerHTML = '<span class="ofbt-arrow">‹</span>';
  host.appendChild(toggle);

  const panel = document.createElement("div");
  panel.id = "ofbt-panel";

  const iframe = document.createElement("iframe");
  iframe.id = "ofbt-iframe";
  iframe.src = chrome.runtime.getURL("index.html") + "?embed=1";
  iframe.setAttribute("title", "OpenFront Lobby Finder");
  panel.appendChild(iframe);

  host.appendChild(panel);
  document.documentElement.appendChild(host);

  function setOpen(open) {
    host.classList.toggle("ofbt-collapsed", !open);
    host.classList.toggle("ofbt-open", open);
    toggle.querySelector(".ofbt-arrow").textContent = open ? "›" : "‹";
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      // ignore quota / privacy errors
    }
  }

  function isOpen() {
    return host.classList.contains("ofbt-open");
  }

  // Restore the last open/closed state — except never auto-open during gameplay.
  let initialOpen = false;
  try {
    initialOpen = localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    // ignore
  }
  setOpen(initialOpen);

  toggle.addEventListener("click", () => setOpen(!isOpen()));

  // Listen for in-game class on body. When the game actually starts the
  // OpenFront client adds `in-game` to <body> (Main.ts). Hide the entire
  // panel + toggle so it never disturbs gameplay.
  function applyGameState() {
    const inGame = document.body?.classList.contains("in-game") ?? false;
    host.classList.toggle("ofbt-hidden", inGame);
    if (inGame && isOpen()) {
      // collapse, but don't persist this as "user closed" — keep prior pref
      host.classList.remove("ofbt-open");
      host.classList.add("ofbt-collapsed");
    }
  }

  if (document.body) {
    applyGameState();
    new MutationObserver(applyGameState).observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
  } else {
    // body shouldn't be missing at document_idle, but guard anyway
    document.addEventListener("DOMContentLoaded", () => {
      applyGameState();
      new MutationObserver(applyGameState).observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
    });
  }

  // Background-tab notification: when a match is found and the user is
  // looking at another tab, we flash the document title and swap the
  // favicon. The iframe sends "match" / "match-cleared" via postMessage;
  // we restore everything on the first visibilitychange that brings the
  // tab back to the foreground.
  const MATCH_FAVICON_URL = chrome.runtime.getURL("icons/icon128.png");
  let titleFlashId = null;
  let originalTitle = null;
  let originalFaviconHref = null;
  let currentMatchLabel = null;

  function getFaviconLink() {
    let link = document.querySelector('link[rel~="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    return link;
  }

  function startMatchAlert(label) {
    currentMatchLabel = label;
    // No point flashing while the user is already looking at the tab.
    if (!document.hidden) return;
    if (titleFlashId !== null) return; // already flashing
    if (originalTitle === null) originalTitle = document.title;
    const link = getFaviconLink();
    if (originalFaviconHref === null) originalFaviconHref = link.href;
    link.href = MATCH_FAVICON_URL;
    let on = false;
    const tick = () => {
      on = !on;
      document.title = on
        ? `🟢 MATCH — ${currentMatchLabel ?? "OpenFront"}`
        : (originalTitle ?? "OpenFront.io");
    };
    tick();
    titleFlashId = setInterval(tick, 1000);
  }

  function stopMatchAlert() {
    currentMatchLabel = null;
    if (titleFlashId !== null) {
      clearInterval(titleFlashId);
      titleFlashId = null;
    }
    if (originalTitle !== null) {
      document.title = originalTitle;
      originalTitle = null;
    }
    if (originalFaviconHref !== null) {
      const link = getFaviconLink();
      link.href = originalFaviconHref;
      originalFaviconHref = null;
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) stopMatchAlert();
  });

  // Messages from the iframe (extension origin):
  //   join          — navigate this tab to /game/<id>
  //   match         — start background-tab alert (sound is fired separately)
  //   match-cleared — stop the alert
  //   close         — collapse the panel
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object" || data.source !== "ofbt") return;
    if (data.type === "join" && typeof data.gameID === "string") {
      const id = data.gameID;
      if (!/^[A-Za-z0-9]{8}$/.test(id)) return;
      if (data.newTab) {
        const win = window.open("/game/" + id, "_blank", "noopener,noreferrer");
        if (!win) window.location.href = "/game/" + id;
      } else {
        window.location.href = "/game/" + id;
      }
    } else if (data.type === "match") {
      const label = typeof data.lobbyTitle === "string" ? data.lobbyTitle : null;
      startMatchAlert(label);
    } else if (data.type === "match-cleared") {
      stopMatchAlert();
    } else if (data.type === "close") {
      setOpen(false);
    }
  });
})();
