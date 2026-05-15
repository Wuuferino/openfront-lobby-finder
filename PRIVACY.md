# Privacy Policy — OpenFront Lobby Finder

_Last updated: 2026-05-15_

## TL;DR

**This extension does not collect, store, transmit, or share any personal data.** It does not have a server. It does not track you. It does not phone home. It does not use any analytics service.

## What the extension does

OpenFront Lobby Finder is a browser extension that:

1. Injects a side panel into [https://openfront.io](https://openfront.io).
2. Subscribes to OpenFront's **own public lobby WebSocket** (`wss://openfront.io/wN/lobbies`) — the same connection the OpenFront homepage opens by itself.
3. Filters the incoming lobby list against criteria you set (map, mode, team setup, player counts, modifiers).
4. Lets you click **Join** to navigate to a matching lobby, or auto-joins it on your behalf.

That is the entire functionality.

## What data is collected, stored, or transmitted

- **Collected by the extension:** none.
- **Stored on your device:** your filter settings and any profiles you save, in `localStorage` belonging to the extension's own origin (`chrome-extension://<extension-id>/`). This data never leaves your browser. There is an Export button if you wish to back it up to a local JSON file; that file goes wherever you save it.
- **Transmitted to any server:** none, with one exception — when you press **Start watching**, the extension opens a WebSocket to OpenFront's own public lobby endpoint (`wss://openfront.io/wN/lobbies`). This is the same WebSocket the openfront.io homepage opens on its own when you visit it. The extension only reads from it; no payload is sent beyond the standard WebSocket handshake.
- **Sold or shared with third parties:** never. There are no third parties.

## What data is **not** collected

The extension does **not** collect, process, or transmit any of the following:

- Personally identifiable information (name, email, address, identifier, age, etc.)
- Health information
- Financial or payment information
- Authentication information (passwords, credentials, PINs)
- Personal communications (messages, chats, emails)
- Location data
- Browsing history
- User activity tracking (clicks, keystrokes, mouse movement, scrolling)
- Website content from sites you visit

## Permissions and scope

The extension's manifest declares:

- `"permissions": []` (none)
- `"host_permissions": []` (none)
- Content scripts that run **only** on `https://openfront.io/*` and `https://*.openfront.io/*`.
- A toolbar-click handler that opens or focuses an `openfront.io` tab.

No other websites are touched. No remote code is fetched or executed; all JavaScript is bundled inside the extension package.

## Children's privacy

The extension does not collect any data, so it does not knowingly collect data from anyone, including children under 13.

## Changes to this policy

If this policy ever changes, the change will be tracked in the project's git history at [https://github.com/Wuuferino/openfront-lobby-finder](https://github.com/Wuuferino/openfront-lobby-finder) and a new "Last updated" date will appear above. The policy itself is part of the source code, so changes are version-controlled and visible to anyone who wishes to verify them.

## Contact

Open an issue at [https://github.com/Wuuferino/openfront-lobby-finder/issues](https://github.com/Wuuferino/openfront-lobby-finder/issues).

## Affiliation

This extension is not affiliated with, endorsed by, or sponsored by the developers of OpenFront. It is an independent, community-built tool released under the MIT license.
