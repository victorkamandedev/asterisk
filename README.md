# Asterisk

A two-player strategy board game. Move your three pieces along the network and be the first to form a line of three through the centre node (E). The board forms an asterisk (∗) — every winning line passes through the centre.

---

## How to play

The board has 9 nodes in a 3×3 grid, all connected through the centre node E. Player 1 starts at the top (A, B, C), Player 2 at the bottom (G, H, I). On your turn, slide one piece to any adjacent connected node.

**Win condition:** Form a line of three through centre node E. Valid win lines: A-E-I, C-E-G, B-E-H, D-E-F.

**Rules:**
- You cannot immediately move a piece back to the node it just came from (no-reversal rule)
- If you have no legal moves, you lose immediately

---

## Running locally

```bash
git clone <repo>
cd asterisk-game
npm install
cp .env.example .env   # add your Firebase API key
npm run dev
```

Open `http://localhost:5173`.


### Database structure

```
/users/{uid}
  name, photoURL, createdAt
  stats/
    onlineWins, onlineLosses, gamesPlayed
    easyWins, mediumWins, hardWins
    fastestWin

/rooms/{code}
  status, mode, createdAt, lastActivity
  players/ { 1: {uid, name}, 2: {uid, name} }
  state/   { board, turn, winner, winLine, lastMove, moveCount }
  playerLeft, rematch/

/matchmaking/{uid}
  uid, name, joinedAt, roomCode
```

### Notes on Firebase rules

The leaderboard and leave-room notification both use the **Firebase REST API** (`fetch` with `?auth=token`) rather than the SDK. This bypasses a known issue where the Firebase SDK applies per-`$uid` rules when reading the `/users` collection under an authenticated session, causing only the signed-in user's own data to be returned instead of all users. Using the REST API reads as the collection-level rule which correctly returns all users.

---



## Game modes

| Mode | Description |
|---|---|
| 2P | Local two-player on the same device |
| AI Easy | AI makes random moves with occasional blunders |
| AI Medium | AI blocks threats and detects forks — no mistakes |
| AI Hard | Minimax depth 4 with 15% mistake rate — beatable |
| 1v1 Online | Real-time online match via Firebase (sign-in required) |

**Online flow:** Quick Match pairs you with any waiting player. Create Room gives you a 4-letter code to share. Both players must be signed in with Google.

---

## Versions

### v1.0 — Local play ✓
- 2-player local and vs AI (Easy / Medium / Hard)
- No-reversal rule, forced-loss trap detection
- Sliding piece animations, confetti win celebration
- Sci-fi board UI

### v1.1 — Online multiplayer ✓
- Google sign-in via Firebase Auth
- Online 1v1: Create Room (shareable code) + Quick Match
- Real-time game sync via Firebase Realtime Database
- Disconnect detection — opponent notified, 5s auto-leave on clean exit, 30s win-award on abrupt disconnect
- Rematch system — both players confirm via New Game button
- Leaderboard: online wins, W/L ratio, fastest win in moves — updates in real-time
- Deployed on Vercel

---

## Roadmap

### v2.0 — Badges + social

**Badge system** — stored in `/users/{uid}/badges[]`, displayed on leaderboard rows and profile pages.

#### Participation (games played)
| Badge | Condition |
|---|---|
| First move | Play 1 game |
| Getting started | Play 10 games |
| Regular | Play 25 games |
| Committed | Play 50 games |
| Veteran | Play 75 games |
| Century | Play 100 games |

#### Online wins
| Badge | Condition |
|---|---|
| First blood | Win 1 online game |
| On a roll | Win 10 online games |
| Dominant | Win 50 online games |

#### AI difficulty
| Badge | Condition |
|---|---|
| Easy rider | Beat Easy AI once |
| Calculated | Beat Medium AI once |
| Strategic | Beat Hard AI once |
| Persistent | Beat Hard AI 10 times |
| Unbeatable? | Beat Very Hard AI (monthly event only) |

**Implementation notes:**
- Add `badges: []` and `gamesPlayed: 0` to `/users/{uid}/stats` (already tracked as of v1.1)
- Badge logic lives in `src/game/badges.js` — pure function, no Firebase reads, compares stats to thresholds and returns newly earned badge IDs
- Badges are append-only — never removed once earned
- `gamesPlayed` is already being written to Firebase as of v1.1

#### Friend system (v2.1)
- `/friendRequests/{uid}` — pending requests
- `/friends/{uid}[]` — accepted friends list
- Invite friend directly from friend list to a private room

### v2.1 — Very Hard AI monthly event
- Server-side feature flag in Firebase Remote Config: `veryHardEnabled: bool`
- Toggle in Firebase console — no code deploy needed
- AI: full minimax depth 8 with 1-in-7 mistake rate
- Badge: "Unbeatable?" — earnable only during the event window, permanently rare

### v2.2 — Database migration
- Move user stats and leaderboard to PostgreSQL or MongoDB
- Firebase retained for Auth only (sign-in works well, keep it)
- Eliminates the REST API workarounds currently needed for leaderboard reads
- Enables richer queries: win streaks, head-to-head records, historical rankings