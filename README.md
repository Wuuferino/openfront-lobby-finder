# OpenFront Lobby Targeter

A browser extension (Manifest V3) for Brave / Chrome / Edge / any Chromium
browser. Watches OpenFront.io's public lobby feed and flags or auto-joins any
lobby that matches your exact targeting:

- Game mode (Team / FFA / any)
- Map — every map from `GameMapType`, grouped by Continental / Regional /
  Fantasy / Arcade / Tournament
- Map size (Normal / Compact / any)
- Team config (Duos / Trios / Quads / Humans Vs Nations, or an exact team
  count 2..8)
- Min per team, min total, max total
- 3-state modifier filter (any / require / exclude) for every public modifier
  (random spawn, compact, crowded, hard nations, alliances off, ports off,
  nukes off, SAMs off, peace time, water nukes)
- Numeric ranges for starting gold and gold multiplier
- Saved profiles in `localStorage` — switch presets with one click

## Install as a browser extension

1. Download `openfront_browsertool.zip` from the latest
   [release](https://github.com/Wuuferino/openfront_browsertool/releases)
   and **unzip it somewhere you'll keep it** (the browser loads the folder
   directly — moving or deleting it later breaks the extension).
2. Open `brave://extensions/` (or `chrome://extensions/`).
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and pick the unzipped folder
   (the one containing `manifest.json`). Or drag the folder onto the page.
5. Click the toolbar puzzle-piece → pin the **OpenFront Lobby Targeter** icon.
6. Click the icon — the tool opens in a new tab.

> Some Brave versions also accept the raw `.zip` if you drop it directly on
> the extensions page with Developer mode on. If that doesn't work, unzip
> first and use **Load unpacked**.

## Run without installing

The folder also works as a plain static site — serve it with anything (`python3 -m http.server`)
and open `index.html`. **Note:** opening `index.html` directly with `file://`
will not load the JavaScript because the tool uses ES modules, which
Chromium blocks on `file://`. Use the extension install or a local server.

## How it works

OpenFront's home page opens a WebSocket to `wss://<host>/wN/lobbies` and
receives a JSON broadcast of all public lobbies:

```ts
{ serverTime, games: { ffa: [...], team: [...], special: [...] } }
```

Every worker process receives the same broadcast from the master, so a
single connection to any worker (default `w0`) is enough to see every
lobby. The extension's toolbar icon opens `index.html`, which subscribes to
that feed, runs your filter on every update, and shows a **Join** button
plus optional auto-join for matching lobbies.

The **Join** button opens `https://<host>/game/<gameID>`, which the
OpenFront home page route picks up (`/^\/(?:w\d+\/)?game\/([^/]+)/`) and
feeds straight into the join-lobby modal.

## Files

| File             | Purpose                                                  |
| ---------------- | -------------------------------------------------------- |
| `manifest.json`  | MV3 manifest                                             |
| `background.js`  | Service worker — opens `index.html` on toolbar click     |
| `index.html`     | The tool UI                                              |
| `tool.js`        | Filter logic, WebSocket client, rendering                |
| `maps.js`        | Map / modifier / team-preset enums (mirrors core)        |
| `style.css`      | Dark theme                                               |
| `icons/`         | Toolbar icons                                            |

No build step, no dependencies.
