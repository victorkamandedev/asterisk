/**
 * Asterisk — Lobby (v1.1)
 *
 * Handles only the online room screens:
 *   - Create room (waiting + code share)
 *   - Join room (code entry)
 *   - Matchmaking (quick match)
 *
 * Sign-in is handled by the sign-in overlay in index.html, not here.
 */

import { network } from '../network/network.js';

export class Lobby {
  /**
   * @param {HTMLElement} containerEl  #lobby
   * @param {{ onGameStart, onClose }} callbacks
   */
  constructor(containerEl, { onGameStart, onClose }) {
    this._el          = containerEl;
    this._onGameStart = onGameStart;
    this._onClose     = onClose;
  }

  show() {
    if (!network.isSignedIn()) {
      // Shouldn't reach here — 1v1 button should be blocked
      // but guard just in case
      this._onClose();
      return;
    }
    this._showMain();
  }

  hide() {
    this._el.style.display = 'none';
    this._el.innerHTML     = '';
  }

  // ─── Screens ──────────────────────────────────────────────────

  _showMain() {
    const user = network.currentUser;
    this._render(`
      <div class="lobby-screen">
        <div class="lobby-user">
          ${user?.photoURL
            ? `<img src="${user.photoURL}" class="lobby-avatar" referrerpolicy="no-referrer" />`
            : '<div class="lobby-avatar-placeholder"></div>'}
          <span class="lobby-username">${user?.displayName || 'Player'}</span>
        </div>
        <div class="lobby-actions">
          <button class="lobby-btn primary" id="lb-quick-match">⚡ Quick Match</button>
          <button class="lobby-btn"         id="lb-create">Create Room</button>
          <button class="lobby-btn"         id="lb-join">Join Room</button>
        </div>
        <button class="lobby-btn ghost" id="lb-cancel">Cancel</button>
      </div>
    `);

    this._el.querySelector('#lb-quick-match').addEventListener('click', () => this._showMatchmaking());
    this._el.querySelector('#lb-create').addEventListener('click',      () => this._showCreateRoom());
    this._el.querySelector('#lb-join').addEventListener('click',        () => this._showJoinRoom());
    this._el.querySelector('#lb-cancel').addEventListener('click',      () => { this.hide(); this._onClose(); });
  }

  _showCreateRoom() {
    this._render(`
      <div class="lobby-screen">
        <p class="lobby-sub">Creating room…</p>
        <div class="lobby-spinner"></div>
      </div>
    `);

    network.createRoom().then(code => {
      this._showWaiting(code);
    }).catch(e => this._showError(e.message));
  }

  _showWaiting(code) {
    this._render(`
      <div class="lobby-screen">
        <p class="lobby-sub">Share this code with your opponent</p>
        <div class="lobby-code">${code}</div>
        <button class="lobby-btn ghost" id="lb-copy">Copy code</button>
        <p class="lobby-sub" style="margin-top:0.75rem;opacity:0.5">Waiting for opponent…</p>
        <div class="lobby-spinner"></div>
        <button class="lobby-btn ghost" id="lb-cancel" style="margin-top:0.75rem">Cancel</button>
      </div>
    `);

    this._el.querySelector('#lb-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(code).then(() => {
        this._el.querySelector('#lb-copy').textContent = 'Copied!';
      });
    });

    this._el.querySelector('#lb-cancel').addEventListener('click', async () => {
      await network.disconnect();
      this._showMain();
    });

    // Listen for opponent joining — use onRoomChange (not onRoomStateChange)
    // which fires on all room document changes including players joining
    network.startListening();
    network.onRoomChange(room => {
      if (room.players?.[2]) {
        // Clear the room callback so it doesn't fire again during game
        network.onRoomChange(null);
        const { createInitialState } = window._asteriskLogic;
        // Player 1 writes initial state then starts the game
        network.initGameState(createInitialState()).then(() => {
          this.hide();
          this._onGameStart(code, 1);
        });
      }
    });
  }

  _showJoinRoom() {
    this._render(`
      <div class="lobby-screen">
        <p class="lobby-sub">Enter the room code</p>
        <input id="lb-code-input" class="lobby-input" maxlength="4"
               placeholder="XXXX" autocomplete="off" spellcheck="false" />
        <button class="lobby-btn primary" id="lb-join-confirm">Join</button>
        <button class="lobby-btn ghost"   id="lb-back">Back</button>
        <p class="lobby-error" id="lb-join-error" style="display:none"></p>
      </div>
    `);

    const input   = this._el.querySelector('#lb-code-input');
    const errorEl = this._el.querySelector('#lb-join-error');

    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z]/g, '');
    });

    this._el.querySelector('#lb-join-confirm').addEventListener('click', async () => {
      const code = input.value.trim();
      if (code.length !== 4) { this._showInlineError(errorEl, 'Code must be 4 letters'); return; }
      try {
        await network.joinRoom(code);
        network.startListening();  // start listening before handing off
        this.hide();
        this._onGameStart(code, 2);
      } catch (e) {
        this._showInlineError(errorEl, e.message);
      }
    });

    this._el.querySelector('#lb-back').addEventListener('click', () => this._showMain());
    input.addEventListener('keydown', e => { if (e.key === 'Enter') this._el.querySelector('#lb-join-confirm').click(); });
    input.focus();
  }

  _showMatchmaking() {
    this._render(`
      <div class="lobby-screen">
        <p class="lobby-sub">Finding an opponent…</p>
        <div class="lobby-spinner"></div>
        <p id="lb-mm-status" class="lobby-sub" style="font-size:11px;opacity:0.4">Searching</p>
        <button class="lobby-btn ghost" id="lb-mm-cancel" style="margin-top:0.75rem">Cancel</button>
      </div>
    `);

    let dots = 0;
    const statusEl = this._el.querySelector('#lb-mm-status');
    const dotTimer = setInterval(() => {
      dots = (dots + 1) % 4;
      statusEl.textContent = 'Searching' + '.'.repeat(dots);
    }, 500);

    this._el.querySelector('#lb-mm-cancel').addEventListener('click', async () => {
      clearInterval(dotTimer);
      await network.cancelMatchmaking();
      this._showMain();
    });

    network.joinMatchmaking(
      (code, player) => {
        network.startListening();
        if (player === 1) {
          const { createInitialState } = window._asteriskLogic;
          network.initGameState(createInitialState()).then(() => {
            clearInterval(dotTimer);
            this.hide();
            this._onGameStart(code, player);
          });
        } else {
          clearInterval(dotTimer);
          this.hide();
          this._onGameStart(code, player);
        }
      },
      () => {
        clearInterval(dotTimer);
        this._showError('No opponent found. Try creating a room instead.');
      }
    ).catch(e => { clearInterval(dotTimer); this._showError(e.message); });
  }

  // ─── Helpers ──────────────────────────────────────────────────

  _render(html) {
    this._el.style.display = 'flex';
    this._el.innerHTML     = html;
  }

  _showError(msg) {
    this._render(`
      <div class="lobby-screen">
        <p class="lobby-error">${msg}</p>
        <button class="lobby-btn ghost" id="lb-err-back">Back</button>
      </div>
    `);
    this._el.querySelector('#lb-err-back').addEventListener('click', () => this._showMain());
  }

  _showInlineError(el, msg) {
    el.textContent   = msg;
    el.style.display = 'block';
  }
}
