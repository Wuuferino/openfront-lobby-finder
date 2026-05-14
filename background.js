// Toolbar action: open openfront.io. The content script auto-injects the
// side panel there, so the user never needs another tab.

chrome.action.onClicked.addListener(async () => {
  const url = "https://openfront.io/";
  const existing = await chrome.tabs.query({ url: "https://openfront.io/*" });
  if (existing.length > 0) {
    chrome.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId !== undefined) {
      chrome.windows.update(existing[0].windowId, { focused: true });
    }
    return;
  }
  chrome.tabs.create({ url });
});
