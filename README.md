# OpenFront Lobby Targeter

A browser extension (Manifest V3) for Brave / Chrome / Edge / any Chromium
browser. Injects a slide-out **side panel** into openfront.io that targets
public lobbies by exact criteria and auto-hides while you're playing.

## Features

- **Side panel on openfront.io**, not a separate tab. A small arrow on the
  right edge slides the panel in or out.
- **Auto-hides during gameplay** — when the game actually starts, the panel
  and its toggle disappear so they can't disturb you. They come back when
  you're in the lobby / menu.
- Pick **exact map** (every `GameMapType`, grouped by Continental / Regional
  / Fantasy / Arcade / Tournament) or any.
- **Game mode** filter: Team / FFA / any.
- **Map size**: Normal / Compact / any.
- **Team config**: Duos / Trios / Quads / Humans Vs Nations, or an exact
  team count (2..8).
- Min players per team, min total, max total.
- **3-state modifier filter** (any / require / exclude) for every public
  modifier (random spawn, compact, crowded, hard nations, alliances off,
  ports off, nukes off, SAMs off, peace time, water nukes).
- Numeric ranges for **starting gold** and **gold multiplier**.
- **Saved profiles** in localStorage — switch presets with one click.
- **Auto-join** when a lobby matches; in-tab navigation by default (no new
  tab, since the panel is already on openfront.io).

## Install

1. Download `openfront_browsertool.zip` from the latest
   [release](https://github.com/Wuuferino/openfront_browsertool/releases)
   and **unzip it somewhere you'll keep it** (the browser loads the folder
   directly — moving or deleting it later breaks the extension).
2. Open `brave://extensions/` (or `chrome://extensions/`).
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and pick the unzipped folder (the one with
   `manifest.json`).
5. Pin the toolbar icon if you want a quick way to jump to openfront.io.

## Usage

1. Visit `https://openfront.io/`. A small `‹` tab sits at the right edge —
   click it to slide the panel out.
2. Set your filter, click **Start watching**. Matching lobbies bubble to
   the top and a green "Match found" panel appears with a one-click Join.
3. Tick **Auto-join when a lobby matches** to fire the join automatically
   the first time a matching lobby appears.
4. Save the current filter as a named **Profile** to switch between presets
   (e.g. "Big Team", "Peace Time Crowded", "Mars only").
5. When the game actually starts, the panel and arrow disappear. They
   reappear when you're back at the menu.

## How it works

OpenFront's home page opens a WebSocket to `wss://<host>/wN/lobbies` and
receives a JSON broadcast of all current public lobbies:

```ts
{ serverTime, games: { ffa: [...], team: [...], special: [...] } }
```

Every worker receives the same broadcast from the master, so a single
connection to any worker is enough to see every lobby.

The extension's content script injects a fixed-position iframe on
openfront.io. The iframe runs the tool UI, subscribes to the lobby feed,
and posts a `join` message to the parent tab when you click Join — the
parent navigates to `/game/<gameID>` in place, which the OpenFront home
page route catches (`/^\/(?:w\d+\/)?game\/([^/]+)/`) and feeds straight
into the join-lobby modal.

A `MutationObserver` on `document.body`'s `class` attribute watches for
`in-game`, which OpenFront's `Main.ts` adds the instant the game starts.
When present, the panel and toggle are translated off-screen so they
can't catch clicks or distract you. They come back automatically when the
class is removed.

## Files

| File             | Purpose                                                  |
| ---------------- | -------------------------------------------------------- |
| `manifest.json`  | MV3 manifest (content script + action)                   |
| `background.js`  | Toolbar click — opens openfront.io                       |
| `content.js`     | Injects the panel iframe + watches `body.in-game`        |
| `content.css`    | Side-panel positioning + slide animation                 |
| `index.html`     | The tool UI (runs inside the iframe)                     |
| `tool.js`        | Filter logic, WebSocket client, rendering, postMessage   |
| `maps.js`        | Map / modifier / team-preset enums (mirrors core)        |
| `style.css`      | Dark theme + embedded-mode layout                        |
| `icons/`         | Toolbar icons                                            |

No build step, no dependencies.
