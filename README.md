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
asterisk-game/
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

---

## v1.1 — Online multiplayer

### Setup

```bash
npm install
cp .env.example .env
# Fill in VITE_FIREBASE_API_KEY with your real key
npm run dev
```

### Firebase rules

Paste the contents of `firebase-rules.json` into your Firebase console under
**Realtime Database → Rules** and publish.

### Deploy to Vercel

1. Push repo to GitHub (`.env` is gitignored — never committed)
2. Import project in Vercel
3. Add each `VITE_*` variable from `.env.example` under **Settings → Environment Variables**
4. Deploy — Vercel runs `npm run build` automatically

### New file structure (v1.1 additions)

```
asterisk-game/
├── package.json              # Vite + Firebase deps
├── vite.config.js            # Build config
├── vercel.json               # Vercel deploy config
├── firebase-rules.json       # Paste into Firebase console
├── .env.example              # Shape of env vars (committed)
├── .env                      # Real secrets (gitignored)
├── .gitignore
└── src/
    ├── network/
    │   └── network.js        # Full Firebase implementation (was stub)
    └── ui/
        ├── lobby.js          # Sign-in, create/join/matchmaking screens
        └── leaderboard.js    # Top players overlay
```

### Firebase data structure

```
/users/{uid}          — profile + stats (wins, losses, fastestWin)
/rooms/{code}         — room state, players, board state
/matchmaking/{uid}    — queue entry (cleared once matched)
```

---

## Roadmap

### v1.0 — Local play ✓
- 2-player local, vs AI (Easy / Medium / Hard)
- No-reversal rule, forced-loss trap condition
- Sliding piece animations, confetti celebration
- Sci-fi board UI

### v1.1 — Online multiplayer ✓
- Google sign-in via Firebase Auth
- Online 1v1: create room (shareable code) + quick match
- Real-time game sync via Firebase Realtime Database
- Leaderboard: online wins, W/L ratio, fastest win (fewest moves)
- Disconnect detection — 30s timeout awards win to opponent
- Deployed on Vercel

### v2.0 — Badges + social
**Badge system** — badges are stored in `/users/{uid}/badges[]` and
displayed on the player's leaderboard row and future profile page.

#### Participation badges (games played)
| Badge | Condition |
|---|---|
| First move | Play 1 game |
| Getting started | Play 10 games |
| Regular | Play 25 games |
| Committed | Play 50 games |
| Veteran | Play 75 games |
| Century | Play 100 games |

#### Win badges (online)
| Badge | Condition |
|---|---|
| First blood | Win 1 online game |
| On a roll | Win 10 online games |
| Dominant | Win 50 online games |

#### AI badges (one-time unlocks — beating each difficulty once)
| Badge | Condition |
|---|---|
| Easy rider | Beat Easy AI once |
| Calculated | Beat Medium AI once |
| Strategic | Beat Hard AI once |
| Persistent | Beat Hard AI 10 times |
| Unbeatable? | Beat Very Hard AI (monthly event only) |

#### Leaderboard display
Badges show as small icons on the player's leaderboard row.
Top 3 most prestigious badges shown (rest visible on profile page in v2.1).
Badge icons are SVG — no external assets needed.

**Implementation notes for v2:**
- Add `badges: []` and `gamesPlayed: 0` to `/users/{uid}` in Firebase
- `network.checkAndAwardBadges(result)` runs after every game end
- Badge award logic is a pure function in `src/game/badges.js` — no Firebase reads, just compares stats to thresholds and returns newly earned badge IDs
- Badges are append-only — never removed once earned

#### Friend system (v2.1)
- `/friendRequests/{uid}` — pending requests
- `/friends/{uid}[]` — accepted friends list
- Invite friend to private room directly from friend list
- See friends' recent games and badge progress

### v2.1 — Monthly Very Hard AI event
- Server-side feature flag in Firebase Remote Config: `veryHardEnabled: bool`
- Client reads flag on load — if true, shows "Very Hard" option below Hard
- AI: full minimax depth 8 + 1-in-7 mistake rate (see `ai.js` constants)
- No code deploy needed — toggle the flag in Firebase console
- Badge: "Unbeatable?" awarded to anyone who beats it during the event window

