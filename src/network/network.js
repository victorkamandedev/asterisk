/**
 * Asterisk — Network Layer (v1.1)
 */

import { initializeApp }      from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getDatabase, ref, set, get, update, remove, onValue, onDisconnect, serverTimestamp } from 'firebase/database';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

const DISCONNECT_TIMEOUT_MS  = 30_000;
const MATCHMAKING_TIMEOUT_MS = 30_000;

class NetworkService {
  constructor() {
    this._user               = null;
    this._roomCode           = null;
    this._localPlayer        = null;
    this._roomCallback       = null;
    this._stateCallback      = null;
    this._disconnectCallback = null;
    this._rematchCallback    = null;
    this._statusRef          = null;
    this._unsubscribers      = [];
    this._disconnectTimer    = null;
    this._matchmakingTimeout = null;
    this._matchmakingUnsub   = null;

    onAuthStateChanged(auth, user => { this._user = user; });
  }

  // ─── Auth ─────────────────────────────────────────────────────

  get currentUser()  { return this._user; }
  isSignedIn()       { return !!this._user; }
  isOnline()         { return !!this._roomCode; }
  get localPlayer()  { return this._localPlayer; }
  get roomCode()     { return this._roomCode; }

  async signIn() {
    const provider = new GoogleAuthProvider();
    const result   = await signInWithPopup(auth, provider);
    const user     = result.user;
    const snap     = await get(ref(db, `users/${user.uid}`));
    if (!snap.exists()) {
      await set(ref(db, `users/${user.uid}`), {
        name: user.displayName, photoURL: user.photoURL || null,
        createdAt: serverTimestamp(),
        stats: { onlineWins: 0, onlineLosses: 0, gamesPlayed: 0, easyWins: 0, mediumWins: 0, hardWins: 0, fastestWin: null },
      });
    }
    this._user = user;
    return user;
  }

  async signOut() {
    await this.disconnect();
    await signOut(auth);
    this._user = null;
  }

  onAuthChange(cb) { return onAuthStateChanged(auth, cb); }

  // ─── Profile ──────────────────────────────────────────────────

  async getProfile(uid) {
    const snap = await get(ref(db, `users/${uid}`));
    return snap.exists() ? { uid, ...snap.val() } : null;
  }

  async updateName(name) {
    if (!this._user) return;
    await update(ref(db, `users/${this._user.uid}`), { name });
  }

  // ─── Room management ──────────────────────────────────────────

  async createRoom() {
    if (!this._user) throw new Error('Must be signed in');
    const code = _generateCode();
    await set(ref(db, `rooms/${code}`), {
      status: 'waiting', mode: 'private',
      createdAt: serverTimestamp(), lastActivity: serverTimestamp(),
      moveCount: 0,
      players: { 1: { uid: this._user.uid, name: this._user.displayName } },
      state: null,
    });
    this._roomCode    = code;
    this._localPlayer = 1;
    this._setupDisconnectCleanup(code);
    return code;
  }

  async joinRoom(code) {
    if (!this._user) throw new Error('Must be signed in');
    const snap = await get(ref(db, `rooms/${code}`));
    if (!snap.exists())                         throw new Error('Room not found');
    const room = snap.val();
    if (room.status !== 'waiting')              throw new Error('Room is not available');
    if (room.players?.[2])                      throw new Error('Room is full');
    if (room.players?.[1]?.uid === this._user.uid) throw new Error('Cannot join your own room');

    await update(ref(db, `rooms/${code}`), {
      status: 'active', lastActivity: serverTimestamp(),
      'players/2': { uid: this._user.uid, name: this._user.displayName },
    });
    this._roomCode    = code;
    this._localPlayer = 2;
    this._setupDisconnectCleanup(code);
  }

  // ─── Matchmaking ──────────────────────────────────────────────
  // Use Date.now() for joinedAt — serverTimestamp() is a sentinel that
  // hasn't resolved when Player 2 reads the queue, breaking sort order.

  async joinMatchmaking(onMatched, onTimeout) {
    if (!this._user) throw new Error('Must be signed in');
    const myRef = ref(db, `matchmaking/${this._user.uid}`);
    const snap  = await get(ref(db, 'matchmaking'));
    const waiting = [];

    if (snap.exists()) {
      snap.forEach(child => {
        const val = child.val();
        if (child.key !== this._user.uid && !val.roomCode) {
          waiting.push({ uid: child.key, ...val });
        }
      });
    }

    if (waiting.length > 0) {
      // Sort by joinedAt ascending — earliest waiter goes first
      waiting.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
      const opponent = waiting[0];
      const code     = _generateCode();

      await set(ref(db, `rooms/${code}`), {
        status: 'active', mode: 'matchmaking',
        createdAt: serverTimestamp(), lastActivity: serverTimestamp(),
        moveCount: 0,
        players: {
          1: { uid: this._user.uid, name: this._user.displayName },
          2: { uid: opponent.uid,   name: opponent.name },
        },
        state: null,
      });

      // Write roomCode to opponent's queue entry so their listener fires
      await update(ref(db, `matchmaking/${opponent.uid}`), { roomCode: code });
      // Write our own entry with roomCode so we can clean up
      await set(myRef, { roomCode: code, joinedAt: Date.now(), name: this._user.displayName });

      this._roomCode    = code;
      this._localPlayer = 1;
      this._setupDisconnectCleanup(code);
      onMatched(code, 1);
      return;
    }

    // No one waiting — add ourselves and listen for a match
    await set(myRef, {
      uid: this._user.uid, name: this._user.displayName,
      joinedAt: Date.now(),  // real timestamp, not sentinel
      roomCode: null,
    });
    onDisconnect(myRef).remove();

    this._matchmakingUnsub = onValue(myRef, snap => {
      if (!snap.exists()) return;
      const data = snap.val();
      if (data.roomCode) {
        clearTimeout(this._matchmakingTimeout);
        if (this._matchmakingUnsub) { this._matchmakingUnsub(); this._matchmakingUnsub = null; }
        this._roomCode    = data.roomCode;
        this._localPlayer = 2;
        this._setupDisconnectCleanup(data.roomCode);
        onMatched(data.roomCode, 2);
      }
    });

    this._matchmakingTimeout = setTimeout(async () => {
      if (this._matchmakingUnsub) { this._matchmakingUnsub(); this._matchmakingUnsub = null; }
      await remove(myRef);
      onTimeout();
    }, MATCHMAKING_TIMEOUT_MS);
  }

  async cancelMatchmaking() {
    clearTimeout(this._matchmakingTimeout);
    if (this._matchmakingUnsub) { this._matchmakingUnsub(); this._matchmakingUnsub = null; }
    if (this._user) await remove(ref(db, `matchmaking/${this._user.uid}`));
  }

  // ─── Game state sync ──────────────────────────────────────────

  async initGameState(state) {
    if (!this._roomCode) return;
    await update(ref(db, `rooms/${this._roomCode}`), { state, lastActivity: serverTimestamp() });
  }

  async sendMove(from, to, newState) {
    if (!this._roomCode) return;
    await update(ref(db, `rooms/${this._roomCode}`), {
      state: newState, lastActivity: serverTimestamp(),
    });
  }

  /**
   * Callback fired on ANY room document change — players joining, state updates, disconnects.
   * Used by lobby to detect opponent joining before game starts.
   */
  onRoomChange(cb)         { this._roomCallback      = cb; }
  onRoomStateChange(cb)    { this._stateCallback      = cb; }
  onOpponentDisconnect(cb) { this._disconnectCallback = cb; }
  onRematchUpdate(cb)      { this._rematchCallback    = cb; }

  /**
   * Writes 'left' to room status before a clean disconnect so the
   * opponent's listener fires and they see a proper notification.
   */
  async notifyLeave() {
    if (!this._roomCode || !this._user) return;
    try {
      const dbUrl  = import.meta.env.VITE_FIREBASE_DATABASE_URL;
      const token  = await this._user.getIdToken();
      const url = `${dbUrl}/rooms/${this._roomCode}/playerLeft.json?auth=${token}`;
      await fetch(url, { method: 'PUT', body: JSON.stringify(this._localPlayer) });
    } catch (e) {
      console.warn('[notifyLeave] failed:', e);
    }
  }

  /** Player requests a rematch — writes flag to room */
  async requestRematch() {
    if (!this._roomCode) return;
    await update(ref(db, `rooms/${this._roomCode}`), {
      [`rematch/${this._localPlayer}`]: true,
    });
  }

  /** Clears rematch flags — called by Player 1 when starting fresh game */
  async clearRematch() {
    if (!this._roomCode) return;
    await update(ref(db, `rooms/${this._roomCode}`), { rematch: null });
  }

  startListening() {
    if (!this._roomCode) return;
    let gameStarted   = false; // don't fire disconnect until game is active
    let disconnectFired = false; // only fire disconnect once

    const unsub = onValue(ref(db, `rooms/${this._roomCode}`), snap => {
      if (!snap.exists()) return;
      const room = snap.val();

      // Room-level callback — lobby uses this to detect player 2 joining
      if (this._roomCallback) this._roomCallback(room);

      // Game is active once state exists
      if (room.state) gameStarted = true;

      // Only fire disconnect/leave once after game has started
      if (gameStarted && !disconnectFired && this._disconnectCallback) {
        if (room.playerLeft && room.playerLeft !== this._localPlayer) {
          disconnectFired = true;
          this._disconnectCallback('left');
        } else if (room.status === 'disconnected') {
          disconnectFired = true;
          this._disconnectCallback('disconnected');
        }
      }

      // Rematch flags changed
      if (room.rematch && this._rematchCallback) {
        this._rematchCallback(room.rematch);
      }

      // In-game state updates
      if (room.state && this._stateCallback) {
        this._stateCallback(room.state, room);
      }
    });
    this._unsubscribers.push(unsub);
  }

  // ─── Stats ────────────────────────────────────────────────────

  async recordOnlineResult(won, moveCount) {
    if (!this._user) return;
    const statsRef = ref(db, `users/${this._user.uid}/stats`);
    const snap     = await get(statsRef);
    const stats    = snap.exists() ? snap.val() : {};
    const updates  = {
      onlineWins:   (stats.onlineWins   || 0) + (won ? 1 : 0),
      onlineLosses: (stats.onlineLosses || 0) + (won ? 0 : 1),
      gamesPlayed:  (stats.gamesPlayed  || 0) + 1,
    };
    if (won && moveCount) {
      const prev = stats.fastestWin;
      if (!prev || moveCount < prev) updates.fastestWin = moveCount;
    }
    await update(statsRef, updates);
  }

  async recordAIWin(difficulty) {
    if (!this._user) return;
    const statsRef = ref(db, `users/${this._user.uid}/stats`);
    const snap     = await get(statsRef);
    const stats    = snap.exists() ? snap.val() : {};
    const key      = `${difficulty}Wins`;
    await update(statsRef, { [key]: (stats[key] || 0) + 1 });
  }

  // ─── Leaderboard ──────────────────────────────────────────────

  async getLeaderboard() {
    const snap = await get(ref(db, 'users'));
    if (!snap.exists()) return [];
    const users = [];
    snap.forEach(child => users.push({ uid: child.key, ...child.val() }));
    return users;
  }

  /**
   * Real-time leaderboard subscription.
   * Fires cb immediately with current data, then on every change.
   * Returns an unsubscribe function — call it to stop listening.
   */
  subscribeToLeaderboard(cb) {
    // Firebase cascading rules prevent collection reads when authenticated.
    // Workaround: read /users via the public REST API which bypasses SDK auth rules.
    const dbUrl = import.meta.env.VITE_FIREBASE_DATABASE_URL;
    const fetchUsers = async () => {
      try {
        const res   = await fetch(`${dbUrl}/users.json`);
        const data  = await res.json();
        if (!data) { cb([]); return; }
        const users = Object.entries(data).map(([uid, val]) => ({ uid, ...val }));
        cb(users);
      } catch (e) {
        cb([]);
      }
    };

    // Fetch immediately and every 30s as a lightweight polling fallback
    fetchUsers();
    const interval = setInterval(fetchUsers, 30_000);
    return () => clearInterval(interval);
  }

  // ─── Disconnect ───────────────────────────────────────────────

  _setupDisconnectCleanup(code) {
    this._statusRef = ref(db, `rooms/${code}/status`);
    onDisconnect(this._statusRef).set('disconnected');
  }

  async handleDisconnectResult(opponentDisconnected) {
    if (!this._roomCode || !this._user) return;
    clearTimeout(this._disconnectTimer);
    if (opponentDisconnected) {
      this._disconnectTimer = setTimeout(async () => {
        await this.recordOnlineResult(true, 0);
        await update(ref(db, `rooms/${this._roomCode}`), { status: 'finished' });
        await this.disconnect();
      }, DISCONNECT_TIMEOUT_MS);
    }
  }

  async disconnect() {
    clearTimeout(this._disconnectTimer);
    clearTimeout(this._matchmakingTimeout);
    if (this._matchmakingUnsub) { this._matchmakingUnsub(); this._matchmakingUnsub = null; }
    this._unsubscribers.forEach(fn => fn());
    this._unsubscribers      = [];
    this._roomCode           = null;
    this._localPlayer        = null;
    this._roomCallback       = null;
    this._stateCallback      = null;
    this._disconnectCallback = null;
    this._rematchCallback    = null;
    this._statusRef          = null;
  }
}

function _generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export const network = new NetworkService();
