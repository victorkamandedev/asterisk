/**
 * Asterisk — Entry Point v1.1
 */

import { GAME_MODE }          from './game/constants.js';
import { AI_DIFFICULTY }      from './ai/ai.js';
import { createInitialState } from './game/logic.js';
import { GameController }     from './game/controller.js';
import { BoardRenderer }      from './ui/renderer.js';
import { StatusBar }          from './ui/statusBar.js';
import { Confetti }           from './ui/confetti.js';
import { Lobby }              from './ui/lobby.js';
import { Leaderboard }        from './ui/leaderboard.js';
import { network }            from './network/network.js';

window._asteriskLogic = { createInitialState };

// ─── DOM refs ─────────────────────────────────────────────────────
const svgEl             = document.getElementById('board');
const statusTextEl      = document.getElementById('status-text');
const p1OrbEl           = document.querySelector('.p1-orb');
const p2OrbEl           = document.querySelector('.p2-orb');
const p1CountEl         = null; // removed — orbs now show 1 and 2, not piece count
const p2CountEl         = null;
const p1LabelEl         = document.getElementById('p1-label');
const p2LabelEl         = document.getElementById('p2-label');
const confettiEl        = document.getElementById('confetti-canvas');
const diffRow           = document.getElementById('diff-row');
const onlineBar         = document.getElementById('online-bar');
const onlineRoomLabel   = document.getElementById('online-room-label');
const onlineOppLabel    = document.getElementById('online-opponent-label');
const disconnectNotice  = document.getElementById('disconnect-notice');
const disconnectTimerEl = document.getElementById('disconnect-timer');
const signinOverlay     = document.getElementById('signin-overlay');
const userBar           = document.getElementById('user-bar');
const userAvatar        = document.getElementById('user-avatar');
const userNameEl        = document.getElementById('user-name');
const lbBody            = document.getElementById('lb-inline-body');
const lbNudge           = document.getElementById('lb-signin-nudge');

// ─── Confetti sizing ──────────────────────────────────────────────
function sizeConfetti() {
  const rect = svgEl.getBoundingClientRect();
  confettiEl.width  = rect.width  || 340;
  confettiEl.height = rect.height || 340;
}
sizeConfetti();
window.addEventListener('resize', sizeConfetti);

// ─── Core modules ─────────────────────────────────────────────────
const statusBar   = new StatusBar(statusTextEl, p1OrbEl, p2OrbEl);
const confetti    = new Confetti(confettiEl);
const leaderboard = new Leaderboard(lbBody, lbNudge);

let renderer;
let controller;
let prevState          = null;
let onlineMode         = false;
let disconnectInterval = null;

// ─── Game callbacks ───────────────────────────────────────────────

function onStateChange(state) {
  if (!renderer) return;
  if (prevState) {
    renderer.update(prevState, state);
  } else {
    renderer.build(state);
  }
  statusBar.update(state, controller.mode);
  prevState = state;
}

function onWin(winner) {
  sizeConfetti();
  confetti.play(winner);
  if (network.isSignedIn()) {
    if (onlineMode) {
      const weWon = winner === network.localPlayer;
      network.recordOnlineResult(weWon, controller.state.moveCount || 0)
        .then(() => setTimeout(() => leaderboard.load(true), 2000));
    } else if (controller.mode === GAME_MODE.VS_AI && winner === 1) {
      network.recordAIWin(controller.difficulty)
        .then(() => setTimeout(() => leaderboard.load(true), 2000));
    }
  }
}

function onShakePiece(nodeId) {
  if (renderer) renderer.shakePiece(nodeId);
}

// ─── Boot ─────────────────────────────────────────────────────────
function boot() {
  controller = new GameController(onStateChange, onWin, onShakePiece);
  renderer   = new BoardRenderer(svgEl, controller);
  prevState  = null;
  controller.reset();
}

// ─── Sign-in overlay ──────────────────────────────────────────────

// Play button — just closes the welcome overlay
document.getElementById('btn-play-now').addEventListener('click', () => {
  signinOverlay.style.display = 'none';
});

// Google sign-in — only triggered from the inline button beside 1v1
document.getElementById('btn-google-signin') && (() => {})(); // no longer in overlay

// Sign-in button next to 1v1 (shown when not signed in)
document.getElementById('btn-signout').addEventListener('click', async () => {
  await network.signOut();
  updateUserBar(null);
  updateSignInButton();
});

// Sign-in nudge inside leaderboard panel
document.getElementById('btn-lb-signin').addEventListener('click', async () => {
  try {
    const user = await network.signIn();
    updateUserBar(user);
    updateSignInButton();
    leaderboard.load();
  } catch (e) {
    console.error('Sign-in failed:', e);
  }
});

// Leaderboard refresh — force restart subscription
document.getElementById('lb-refresh').addEventListener('click', () => leaderboard.load(true));

function updateUserBar(user) {
  if (user) {
    userBar.style.display    = 'flex';
    userAvatar.src           = user.photoURL || '';
    userAvatar.style.display = user.photoURL ? 'block' : 'none';
    userNameEl.textContent   = user.displayName || 'Player';
  } else {
    userBar.style.display = 'none';
  }
}

// Shows a Google-coloured sign-in button beside the 1v1 button
function updateSignInButton() {
  const existing = document.getElementById('btn-inline-signin');
  if (!network.isSignedIn() && !existing) {
    const btn = document.createElement('button');
    btn.id = 'btn-inline-signin';
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 18 18" fill="none">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
      </svg>
      SIGN IN
    `;
    btn.addEventListener('click', async () => {
      try {
        const user = await network.signIn();
        updateUserBar(user);
        updateSignInButton();
        leaderboard.load();
      } catch (e) {
        console.error('Sign-in failed:', e);
      }
    });
    document.getElementById('mode-top-row').appendChild(btn);
  } else if (network.isSignedIn() && existing) {
    existing.remove();
  }
}

// Auth state listener — handles page refresh while already signed in
network.onAuthChange(user => {
  updateUserBar(user);
  updateSignInButton();
});

// ─── Online lobby ─────────────────────────────────────────────────
const lobby = new Lobby(document.getElementById('lobby'), {
  onGameStart: (roomCode, player) => startOnlineGame(roomCode, player),
  onClose: () => {
    document.getElementById('btn-2p').classList.add('active');
    document.getElementById('btn-online-mode').classList.remove('active');
  },
});

async function startOnlineGame(roomCode, player) {
  onlineMode = true;
  const myName = network.currentUser?.displayName || 'You';

  if (player === 1) {
    p1LabelEl.textContent = myName.toUpperCase();
    p2LabelEl.textContent = 'OPPONENT';
  } else {
    p1LabelEl.textContent = 'OPPONENT';
    p2LabelEl.textContent = myName.toUpperCase();
  }

  onlineBar.style.display     = 'flex';
  onlineRoomLabel.textContent = `ROOM: ${roomCode}`;
  onlineOppLabel.textContent  = '';
  controller.setMode(GAME_MODE.ONLINE);
  document.getElementById('mode-row').style.visibility = 'hidden';

  // initGameState was already called by the lobby before handing off here.
  // startListening() was also already called in the lobby.
  // We just register the in-game callbacks now.

  network.onRoomStateChange((remoteState, room) => {
    // Populate opponent name
    const oppKey  = player === 1 ? '2' : '1';
    const oppName = room.players?.[oppKey]?.name;
    if (oppName) {
      onlineOppLabel.textContent = oppName.toUpperCase();
      if (player === 1) p2LabelEl.textContent = oppName.toUpperCase();
      else              p1LabelEl.textContent = oppName.toUpperCase();
    }

    // Rematch reset — fresh state from Player 1, no winner, turn back to 1
    // Use controller.reset() not applyRemoteState to avoid animation lock
    if (controller.state.winner && !remoteState.winner && remoteState.turn === 1) {
      confetti.stop();
      prevState = null;
      const btn = document.getElementById('btn-new-game');
      btn.textContent = 'NEW GAME';
      btn.disabled    = false;
      controller.reset(); // resets board locally — state synced via Firebase
      return;
    }

    // Apply opponent's move when it becomes our turn
    if (remoteState.turn === network.localPlayer && !remoteState.winner) {
      controller.applyRemoteState(remoteState);
    }
    // Apply game-end state written by opponent
    if (remoteState.winner && !controller.state.winner) {
      controller.applyRemoteState(remoteState);
    }
  });

  // Rematch system — show prompt when opponent requests, reset when both agree
  network.onRematchUpdate(async (rematch) => {
    const btn        = document.getElementById('btn-new-game');
    const myKey      = network.localPlayer;
    const theirKey   = myKey === 1 ? 2 : 1;
    const myRequest  = rematch?.[myKey];
    const theirRequest = rematch?.[theirKey];

    // Opponent wants a rematch — show prompt if we haven't pressed yet
    if (theirRequest && !myRequest && controller.state.winner) {
      btn.textContent = 'REMATCH? ✓';
      btn.disabled    = false;
    }

    // Both agreed — Player 1 writes the fresh state
    if (rematch?.[1] && rematch?.[2] && network.localPlayer === 1) {
      await network.clearRematch();
      const freshState = createInitialState();
      await network.initGameState(freshState);
      confetti.stop();
      prevState = null;
      btn.textContent = 'NEW GAME';
      btn.disabled    = false;
      controller.reset();
    }
  });

  network.onOpponentDisconnect((reason) => {
    if (reason === 'left') {
      showDisconnectNotice(true);
    } else {
      showDisconnectNotice(false);
      network.handleDisconnectResult(true); // start 30s win-award timer
    }
  });
}

function showDisconnectNotice(opponentLeft = false) {
  disconnectNotice.style.display = 'flex';
  document.getElementById('disconnect-msg').textContent = opponentLeft
    ? 'Opponent left — returning to menu in'
    : 'Opponent disconnected — awarding win in';

  // Both cases: count down and auto-leave — room is dead either way
  let secs = opponentLeft ? 5 : 30;
  disconnectTimerEl.textContent = `${secs}s`;

  disconnectInterval = setInterval(async () => {
    secs--;
    disconnectTimerEl.textContent = `${secs}s`;
    if (secs <= 0) {
      clearInterval(disconnectInterval);
      if (!opponentLeft) {
        // Abrupt disconnect — record win before leaving
        await network.recordOnlineResult(true, 0);
      }
      leaveOnlineGame(true); // true = already notified, skip notifyLeave
    }
  }, 1000);
}

async function leaveOnlineGame(skipNotify = false) {
  clearInterval(disconnectInterval);
  if (!skipNotify && network.roomCode) {
    try {
      await network.notifyLeave();
    } catch (e) {
      // best effort
    }
  }

  network.disconnect();
  onlineMode = false;
  onlineBar.style.display        = 'none';
  disconnectNotice.style.display = 'none';
  document.getElementById('mode-row').style.visibility = 'visible';
  document.getElementById('btn-new-game').textContent  = 'NEW GAME';
  document.getElementById('btn-new-game').disabled     = false;
  p1LabelEl.textContent = 'PLAYER 1';
  p2LabelEl.textContent = 'PLAYER 2';
  document.getElementById('btn-2p').classList.add('active');
  document.getElementById('btn-online-mode').classList.remove('active');
  diffRow.style.display = 'none';
  confetti.stop();
  prevState = null;
  controller.setMode(GAME_MODE.TWO_PLAYER);
}

// ─── Mode buttons ─────────────────────────────────────────────────

document.getElementById('btn-online-mode').addEventListener('click', async () => {
  if (!network.isSignedIn()) {
    try {
      const user = await network.signIn();
      updateUserBar(user);
      updateSignInButton();
      leaderboard.load();
    } catch (e) {
      console.error('Sign-in failed:', e);
      return;
    }
  }
  document.getElementById('btn-online-mode').classList.add('active');
  document.getElementById('btn-2p').classList.remove('active');
  document.getElementById('btn-ai').classList.remove('active');
  diffRow.style.display = 'none';
  lobby.show();
});

document.getElementById('btn-2p').addEventListener('click', () => {
  if (onlineMode) return;
  document.getElementById('btn-2p').classList.add('active');
  document.getElementById('btn-ai').classList.remove('active');
  document.getElementById('btn-online-mode').classList.remove('active');
  diffRow.style.display = 'none';
  p1LabelEl.textContent = 'PLAYER 1';
  p2LabelEl.textContent = 'PLAYER 2';
  confetti.stop(); prevState = null;
  controller.setMode(GAME_MODE.TWO_PLAYER);
});

document.getElementById('btn-ai').addEventListener('click', () => {
  if (onlineMode) return;
  document.getElementById('btn-ai').classList.add('active');
  document.getElementById('btn-2p').classList.remove('active');
  document.getElementById('btn-online-mode').classList.remove('active');
  diffRow.style.display = 'flex';
  p1LabelEl.textContent = 'PLAYER 1';
  p2LabelEl.textContent = 'AI';
  confetti.stop(); prevState = null;
  controller.setMode(GAME_MODE.VS_AI);
});

// ─── Difficulty ───────────────────────────────────────────────────
function setDifficulty(diff) {
  document.getElementById('btn-easy').classList.toggle('active', diff === AI_DIFFICULTY.EASY);
  document.getElementById('btn-med').classList.toggle('active',  diff === AI_DIFFICULTY.MEDIUM);
  document.getElementById('btn-hard').classList.toggle('active', diff === AI_DIFFICULTY.HARD);
  controller.setDifficulty(diff);
}
document.getElementById('btn-easy').addEventListener('click', () => setDifficulty(AI_DIFFICULTY.EASY));
document.getElementById('btn-med').addEventListener('click',  () => setDifficulty(AI_DIFFICULTY.MEDIUM));
document.getElementById('btn-hard').addEventListener('click', () => setDifficulty(AI_DIFFICULTY.HARD));

// ─── New game / Leave ─────────────────────────────────────────────
document.getElementById('btn-new-game').addEventListener('click', async () => {
  confetti.stop();

  if (!onlineMode) {
    prevState = null;
    controller.reset();
    return;
  }

  // Online: only allow new game when current game has ended
  if (!controller.state.winner) return;

  // Request rematch — both players must press it
  const btn = document.getElementById('btn-new-game');
  btn.textContent = 'WAITING...';
  btn.disabled    = true;
  await network.requestRematch();
});

document.getElementById('btn-online-leave').addEventListener('click', () => leaveOnlineGame());

// ─── Start ────────────────────────────────────────────────────────
boot();
leaderboard.load(); // real-time subscription — updates automatically
signinOverlay.style.display = 'flex';
