# OpenFront Lobby Watcher

A tiny static browser tool that watches OpenFront.io's public lobby feed and
flags any **Team** game that matches your team / per-team thresholds — by
default **2 teams with 40+ players each** (i.e. `maxPlayers >= 80`).

## How it works

OpenFront's home page opens a WebSocket to `wss://<host>/wN/lobbies` and
receives a JSON broadcast of all current public lobbies:

```ts
{ serverTime, games: { ffa: [...], team: [...], special: [...] } }
```

Every worker process receives the same broadcast from the master, so a single
connection to any worker (default `w0`) is enough to see every public lobby.

A lobby counts as a "match" when:

- `gameConfig.gameMode === "Team"`
- `gameConfig.playerTeams === <teams>` (default `2`)
- `gameConfig.maxPlayers >= <teams> * <perTeam>` (default `2 * 40 = 80`)

The **Join** button opens `https://<host>/game/<gameID>`, which the OpenFront
home page route catches and feeds straight into the join-lobby modal.

## Usage

1. Serve the folder (any static server works):

   ```bash
   python3 -m http.server -d /var/browser/openfront_browsertool 8080
   ```

   …or just open `index.html` directly in a browser (works on `file://`).

2. Click **Start watching**. You should see lobbies populate within a few
   seconds — the master broadcasts on a tick.

3. Optional: tick **Auto-join when matched** to have the tool auto-open the
   game URL the moment a matching lobby appears. Browsers block popups not
   triggered by user clicks, so if a popup is blocked the tool falls back to
   redirecting the current tab. Untick **Open in new tab** to skip the popup
   attempt entirely.

## Notes

- The lobby WebSocket has no Origin check, so cross-origin connections from a
  `file://` page or any other host work fine.
- If `w0` ever isn't running on the production cluster, bump the **Worker**
  field — any worker (`0`..`numWorkers-1`) receives the same broadcast.
- The page is plain HTML + CSS + a single JS file, no build step.
