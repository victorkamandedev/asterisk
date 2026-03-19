/**
 * Asterisk — Leaderboard
 * Real-time subscription via Firebase onValue.
 * Starts once on boot and stays alive — re-renders automatically on any data change.
 */

import { network } from '../network/network.js';

export class Leaderboard {
  constructor(bodyEl, nudgeEl) {
    this._body        = bodyEl;
    this._nudge       = nudgeEl;
    this._unsubscribe = null;
    this._lastUsers   = [];
  }

  /**
   * Start the real-time subscription.
   * Safe to call multiple times — only creates one listener.
   * Call with forceReload=true to restart (e.g. ↻ button).
   */
  load(forceReload = false) {
    if (this._unsubscribe && !forceReload) {
      // Already listening — just re-render with current auth state
      // so "you" badge updates after sign-in without restarting subscription
      this.render(this._lastUsers);
      return;
    }
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this._body.innerHTML = '<div class="lb-loading"><div class="lobby-spinner"></div></div>';
    this._unsubscribe = network.subscribeToLeaderboard(users => {
      this._lastUsers = users;
      this.render(users);
    });
  }

  unload() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  render(users) {
    const sorted = [...users].sort((a, b) => (b.stats?.onlineWins || 0) - (a.stats?.onlineWins || 0));
    const top    = sorted.slice(0, 10);

    if (top.length === 0) {
      this._body.innerHTML = `<p class="lb-empty" style="padding:1.5rem;text-align:center;opacity:0.5">No ranked players yet</p>`;
      this._nudge.style.display = network.isSignedIn() ? 'none' : 'block';
      return;
    }

    const myUid = network.currentUser?.uid;

    const rows = top.map((u, i) => {
      const s        = u.stats || {};
      const wins     = s.onlineWins   || 0;
      const losses   = s.onlineLosses || 0;
      const fastest  = s.fastestWin   ? `${s.fastestWin}` : '—';
      const isMe     = u.uid === myUid;
      const medal    = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
      const youBadge = isMe ? ' <span class="lb-you">you</span>' : '';

      return `<tr class="${isMe ? 'lb-me' : ''}${i < 3 ? ' lb-top' : ''}">
        <td class="lb-rank">${medal}</td>
        <td class="lb-name">${_esc(u.name || 'Unknown')}${youBadge}</td>
        <td class="lb-stat">${wins}</td>
        <td class="lb-stat lb-muted">${wins}/${losses}</td>
        <td class="lb-stat lb-muted">${fastest}</td>
      </tr>`;
    }).join('');

    this._body.innerHTML = `
      <div class="lb-table-wrap">
        <table class="lb-table">
          <thead><tr>
            <th>#</th><th>Player</th><th>Wins</th><th>W/L</th>
            <th title="Fewest moves to win">Fastest</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="lb-footer">Online wins · ${top.length} of ${users.length} players</p>`;

    this._nudge.style.display = network.isSignedIn() ? 'none' : 'block';
  }
}

function _esc(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}
