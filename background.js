// Open the tool's index.html in a new tab whenever the toolbar icon is
// clicked. Reuse an existing tab if one is already open.

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("index.html");
  const existing = await chrome.tabs.query({ url });
  if (existing.length > 0) {
    chrome.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId !== undefined) {
      chrome.windows.update(existing[0].windowId, { focused: true });
    }
    return;
  }
  chrome.tabs.create({ url });
});
