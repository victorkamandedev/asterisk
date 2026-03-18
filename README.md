# Asterisk

A two-player strategy board game. Slide your three pieces along the network
and be the first to form a line of three through the centre node (E).
The board forms an asterisk (∗) — every line of play passes through the centre.

## Running locally

No build step required — uses native ES modules.

```bash
# Any static file server works, e.g.:
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

> Opening `index.html` directly via `file://` won't work because browsers
> block ES module imports on the file protocol.

---

## Project structure

```
nexus-game/
├── index.html                  # HTML shell — DOM structure only
├── assets/
│   └── style.css               # All visual styles
└── src/
    ├── main.js                 # Entry point — wires modules together
    ├── game/
    │   ├── constants.js        # Board geometry, adjacency, win lines
    │   ├── logic.js            # Pure game logic (no DOM, no side effects)
    │   └── controller.js       # Orchestrates state, AI, network → UI
    ├── ai/
    │   └── ai.js               # AI move selection (one-ply look-ahead)
    ├── ui/
    │   ├── renderer.js         # SVG board renderer + slide animations
    │   ├── statusBar.js        # Status text / badge component
    │   └── confetti.js         # Win celebration canvas effect
    └── network/
        └── network.js          # Network layer (v1 stub, v1.1 implementation)
```

### Module responsibilities

| Module | Knows about | Does NOT know about |
|---|---|---|
| `constants.js` | Board data | Everything else |
| `logic.js` | Constants | DOM, AI, network |
| `ai.js` | logic.js, constants.js | DOM, network |
| `network.js` | Nothing (stub) | Game logic |
| `controller.js` | logic, ai, network | DOM |
| `renderer.js` | SVG DOM, constants | Game logic |
| `statusBar.js` | HTML DOM, constants | Game logic |
| `confetti.js` | Canvas DOM | Game logic |
| `main.js` | All modules, DOM IDs | Game logic internals |

---

## Upgrading to v1.1 — Online multiplayer

The codebase is structured so that **only `network.js` needs a real implementation**.
Everything else is already wired up.

### What to implement in `network.js`

Replace the stub methods with a real backend. Recommended options:

- **Firebase Realtime Database** — easiest, no server required
- **Supabase** — open-source Firebase alternative
- **Ably / Pusher** — if you want pure WebSocket channels

```js
// Example shape of a room document in Firestore:
{
  roomCode: "XKQZ",
  players: { 1: "uid-abc", 2: "uid-xyz" },
  state: { board: {...}, turn: 1, winner: null, winLine: null },
  moves: [
    { from: "A", to: "E", player: 1, timestamp: ... },
  ]
}
```

### Steps for v1.1

1. **`network.js`** — implement `createRoom`, `joinRoom`, `sendMove`, `onMove`
2. **`index.html`** — uncomment the `Online 1v1` button
3. **`main.js`** — add a `setMode(GAME_MODE.ONLINE)` handler that calls
   `network.createRoom()` or `network.joinRoom(code)` before resetting
4. **Add a lobby UI** — a small screen to show/enter the room code
   (a new `src/ui/lobby.js` component)

The game controller already checks `network.isOnline()` before triggering
the AI and already calls `network.sendMove()` after every move — so no
changes are needed in `controller.js`, `logic.js`, or `renderer.js`.

### Server-side move validation (recommended for v1.1)

`logic.js` is side-effect free and has no browser dependencies — it can run
in a Node.js Cloud Function unchanged. Deploy an `onWrite` trigger that calls
`isLegalMove()` and `advanceState()` before committing moves to the database.

---

## Roadmap

| Version | Features |
|---|---|
| v1.0 | Local 2-player, vs AI, sliding pieces, confetti |
| v1.1 | Online 1v1 with room codes |
| v1.2 | Move history, replay |
| v1.3 | Mobile app (React Native / Capacitor) |
