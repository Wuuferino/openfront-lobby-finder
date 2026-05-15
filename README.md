# OpenFront Lobby Finder

> Find the public OpenFront lobby you actually want.

A Manifest V3 browser extension (Brave / Chrome / Edge / any Chromium) that
adds a slide-out side panel to **openfront.io**. The panel watches the
public lobby feed and flags any lobby that matches your filter — exact map,
mode, team setup, player counts, and modifiers — with one-click or
automatic join. The panel auto-hides the instant a game starts so it never
interferes with gameplay.

## Why

OpenFront's homepage shows lobbies as they arrive but doesn't let you
*target* a specific one. If you want "Mars, Team mode, 40+ players per
team, Peace Time on" you end up babysitting the menu. This extension does
that watching for you and pings you (or auto-joins) the moment a matching
lobby appears.

## Features

- **Side panel on openfront.io** — not a separate tab. A small arrow on the
  right edge slides it in or out, and the panel auto-hides while you're in
  an active game.
- **Exact map targeting** — every `GameMapType` from the official client,
  grouped by Continental / Regional / Fantasy / Arcade / Tournament.
- **Mode filter** — Team / Free For All / any.
- **Team configuration** — Duos, Trios, Quads, Humans Vs Nations, or an
  exact team count from 2 to 8.
- **Player-count gates** — min players per team, min total, max total.
- **Three-state modifier filter** — for each public modifier (random spawn,
  compact, crowded, hard nations, no alliances, no ports, no nukes, no
  SAMs, peace time, water nukes), choose *any* / *require* / *exclude*.
- **Numeric ranges** for starting gold and gold multiplier.
- **Saved profiles** in `localStorage` — switch presets ("Big Team",
  "Peace Time Crowded", "Mars only") with one click.
- **Auto-join** when a lobby matches; navigation happens in-place so you
  stay in the same tab.
- **Auto-hide during gameplay** — driven by the official client's own
  `in-game` body class, so it can never accidentally appear mid-match.

## Install

1. Download `openfront_lobby_finder.zip` from the latest
   [release](https://github.com/Wuuferino/openfront-lobby-finder/releases)
   and **unzip it somewhere you'll keep it** — Chromium loads the folder
   directly, so moving or deleting it later breaks the extension.
2. Open `brave://extensions/` (or `chrome://extensions/`, `edge://extensions/`).
3. Toggle **Developer mode** on (top-right corner).
4. Click **Load unpacked** and pick the unzipped folder (the one that
   contains `manifest.json`).
5. Optional: pin the toolbar icon for a one-click way to jump to openfront.io.

No accounts, no API keys, no permissions beyond `https://openfront.io/*`.

## Usage

1. Visit `https://openfront.io/`. A small `‹` tab sits at the right edge —
   click it to slide the panel out.
2. Configure your filter, then click **Start watching**. Matching lobbies
   bubble to the top and a green **Match found** card appears with a
   one-click Join button.
3. Tick **Auto-join when a lobby matches** to fire the join automatically
   the first time a matching lobby comes through the feed.
4. Save the current filter as a named **Profile** to switch between presets.
5. When the game actually starts, the panel and arrow disappear. They
   reappear when you're back at the menu.

## How it works

OpenFront's home page opens a WebSocket to `wss://<host>/wN/lobbies` and
receives a JSON broadcast of every current public lobby:

```ts
{ serverTime, games: { ffa: [...], team: [...], special: [...] } }
```

Every OpenFront worker receives the same broadcast from the master, so a
single connection to any one worker (`w0` by default) sees every lobby.

The extension's content script injects a fixed-position iframe on
openfront.io. The iframe runs the tool UI, subscribes to the lobby feed,
and posts a `join` message to its parent tab when you click Join — the
parent navigates to `/game/<gameID>` in place, which the OpenFront home
page route catches (`/^\/(?:w\d+\/)?game\/([^/]+)/`) and feeds straight
into the join-lobby modal.

A `MutationObserver` on `document.body`'s `class` attribute watches for
`in-game`, which OpenFront's `Main.ts` adds the instant the game starts.
When present, the panel and toggle are translated off-screen so they can't
catch clicks or distract you. They come back automatically when the class
is removed.

## Files

| File             | Purpose                                                  |
| ---------------- | -------------------------------------------------------- |
| `manifest.json`  | MV3 manifest (content script + toolbar action)           |
| `background.js`  | Toolbar click handler — opens openfront.io               |
| `content.js`     | Injects the panel iframe + watches `body.in-game`        |
| `content.css`    | Side-panel positioning + slide animation                 |
| `index.html`     | The tool UI (runs inside the iframe)                     |
| `tool.js`        | Filter logic, WebSocket client, rendering, postMessage   |
| `maps.js`        | Map / modifier / team-preset enums (mirrors core)        |
| `style.css`      | Dark theme + embedded-mode layout                        |
| `icons/`         | Toolbar icons                                            |

No build step, no dependencies, no telemetry.

## Contributing

PRs welcome. Particularly useful:

- New map / modifier entries when OpenFront ships them (just mirror
  `src/core/game/Game.ts` from the upstream repo into `maps.js`).
- Bug reports with the lobby feed JSON attached (open DevTools on
  openfront.io → Network → `lobbies` WS → Messages).

## Disclaimer

Not affiliated with the OpenFront developers. The extension only reads the
same public WebSocket the official client opens, and joins by navigating
to a public game URL — no private endpoints, no automation beyond clicking
"join" for you.

## License

MIT.
