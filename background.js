// Service worker.
//
// Two jobs:
//   1) Toolbar action — open or focus an openfront.io tab.
//   2) Match notifications — when the iframe finds a matching lobby it
//      sends a runtime message; we forward it to the OS via
//      chrome.notifications. The OS-level notification is the only
//      reliable way to alert a user whose openfront.io tab is in the
//      background or whose Chrome window is minimized — the iframe's own
//      audio path can be throttled or suspended in that state.

const MATCH_NOTIF_ID = "ofbt-match";

async function focusOpenFrontTab() {
  const existing = await chrome.tabs.query({ url: "https://openfront.io/*" });
  if (existing.length > 0) {
    await chrome.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId !== undefined) {
      await chrome.windows.update(existing[0].windowId, { focused: true });
    }
    return true;
  }
  return false;
}

chrome.action.onClicked.addListener(async () => {
  if (await focusOpenFrontTab()) return;
  chrome.tabs.create({ url: "https://openfront.io/" });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "ofbt-match") {
    const lobby = typeof msg.lobbyTitle === "string" ? msg.lobbyTitle : "A matching lobby is open";
    const opts = {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: "OpenFront — match found",
      message: lobby,
      priority: 2,
      requireInteraction: true,
    };
    // create() with the same ID replaces an existing notification, so the
    // user never sees a queue if multiple matches come in quick succession.
    chrome.notifications.create(MATCH_NOTIF_ID, opts, () => {
      // Swallow chrome.runtime.lastError — the alert is best-effort; the
      // tab-flash + chime are independent and continue working regardless.
      void chrome.runtime.lastError;
    });
    sendResponse?.({ ok: true });
  } else if (msg.type === "ofbt-match-cleared") {
    chrome.notifications.clear(MATCH_NOTIF_ID, () => {
      void chrome.runtime.lastError;
    });
    sendResponse?.({ ok: true });
  }
  return false; // synchronous reply
});

chrome.notifications.onClicked.addListener(async (id) => {
  if (id !== MATCH_NOTIF_ID) return;
  await focusOpenFrontTab();
  chrome.notifications.clear(MATCH_NOTIF_ID);
});
