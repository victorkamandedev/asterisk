/**
 * Nexus — Network Layer (v1.1 stub)
 *
 * Defines the interface that online multiplayer will implement.
 * In v1 all methods are no-ops so the rest of the codebase can
 * already import and call them — upgrading to real WebSocket /
 * Firebase logic in v1.1 requires changes ONLY in this file.
 *
 * Expected v1.1 implementation:
 *   - createRoom()  → generates a room code, writes initial state to DB
 *   - joinRoom()    → subscribes to room document, sets localPlayer
 *   - sendMove()    → writes { from, to, player } to DB; server validates via logic.js
 *   - onMove()      → callback fired when remote player's move arrives
 *   - onOpponentJoined() → callback for when second player connects
 *   - disconnect()  → cleans up listeners
 *
 * The game controller (controller.js) already checks `network.isOnline()`
 * before deciding whether to call the AI or await a remote move —
 * so the online mode is a config switch, not a code rewrite.
 */

class NetworkService {
  constructor() {
    this._roomCode      = null;
    this._localPlayer   = null;
    this._moveCallback  = null;
    this._joinCallback  = null;
  }

  /** @returns {boolean} true when an online session is active */
  isOnline() {
    return false; // v1.1: return !!this._roomCode
  }

  /** @returns {number|null} which player number this client controls */
  get localPlayer() {
    return this._localPlayer;
  }

  /**
   * Creates a new room and returns a shareable room code.
   * v1.1: write room to Firestore / Supabase / Ably and return code.
   * @returns {Promise<string>}
   */
  async createRoom() {
    console.warn('[Network] createRoom called — not implemented in v1');
    return null;
  }

  /**
   * Joins an existing room by code.
   * v1.1: subscribe to room document; set localPlayer = 2.
   * @param {string} _roomCode
   * @returns {Promise<void>}
   */
  async joinRoom(_roomCode) {
    console.warn('[Network] joinRoom called — not implemented in v1');
  }

  /**
   * Sends a move to the remote player via the server.
   * v1.1: write { from, to, player, timestamp } to room's moves collection.
   * @param {string} _from
   * @param {string} _to
   * @returns {Promise<void>}
   */
  async sendMove(_from, _to) {
    console.warn('[Network] sendMove called — not implemented in v1');
  }

  /**
   * Registers a callback invoked when the remote player makes a move.
   * v1.1: subscribe to Firestore / Ably channel for move events.
   * @param {function({ from: string, to: string, player: number }): void} cb
   */
  onMove(cb) {
    this._moveCallback = cb;
  }

  /**
   * Registers a callback invoked when the second player joins the room.
   * @param {function(): void} cb
   */
  onOpponentJoined(cb) {
    this._joinCallback = cb;
  }

  /** Tears down all listeners and resets state. */
  disconnect() {
    this._roomCode    = null;
    this._localPlayer = null;
    this._moveCallback  = null;
    this._joinCallback  = null;
  }
}

// Singleton — import `network` anywhere in the app
export const network = new NetworkService();
