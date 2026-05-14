# OpenFront Lobby Targeter

A static browser tool that watches OpenFront.io's public lobby feed and flags
or auto-joins any lobby matching your exact targeting:

- Game mode (Team / FFA / any)
- Map (every map from `GameMapType`, grouped by continental / regional /
  fantasy / arcade / tournament)
- Map size (Normal / Compact / any)
- Team config (Duos, Trios, Quads, Humans Vs Nations, or an exact team count)
- Min players per team, min total, max total
- 3-state modifier filters (any / require / exclude) for every public modifier
  (random spawn, compact, crowded, hard nations, alliances off, ports off,
  nukes off, SAMs off, peace time, water nukes)
- Numeric ranges for starting gold and gold multiplier
- Saved profiles in `localStorage` so you can switch presets in one click

## How it works

OpenFront's home page opens a WebSocket to `wss://<host>/wN/lobbies` and
receives a JSON broadcast of all current public lobbies:

```ts
{ serverTime, games: { ffa: [...], team: [...], special: [...] } }
```

Every worker receives the same broadcast from the master, so connecting to any
single worker (default `w0`) is enough to see every public lobby.

The **Join** button opens `https://<host>/game/<gameID>`, which the OpenFront
home page route catches (`/^\/(?:w\d+\/)?game\/([^/]+)/`) and feeds straight
into the join-lobby modal.

## Usage

1. Serve the folder (any static server works):

   ```bash
   python3 -m http.server -d /var/browser/openfront_browsertool 8080
   ```

   …or just open `index.html` directly in a browser (works on `file://`).

2. Set your filter — at minimum pick a game mode or map. The form auto-saves
   to `localStorage`, so it survives reloads.

3. Click **Start watching**. Matching lobbies bubble to the top of the list
   and a green "Match found" panel appears with a one-click Join button.

4. Tick **Auto-join when a lobby matches** to fire the join automatically the
   first time a matching lobby is seen. If your browser blocks the popup the
   tool falls back to redirecting the current tab; untick **Open in new tab**
   to redirect directly without the popup attempt.

5. Save the current filter as a named **Profile** to switch between presets
   (e.g. "Big team game", "Peace time crowded", "Mars only").

## Notes

- The lobby WebSocket has no Origin check, so cross-origin connections from a
  `file://` page or any other host work fine.
- If `w0` isn't running on the production cluster, bump the **Worker** field —
  any worker (`0`..`numWorkers-1`) receives the same broadcast.
- Plain HTML + CSS + ES module JS. No build step, no dependencies.
- Map list mirrors `src/core/game/Game.ts → GameMapType` at the time of
  release; new maps added upstream may not appear until this list is updated.
