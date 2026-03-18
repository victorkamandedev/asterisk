import { GAME_MODE } from './game/constants.js';
import { AI_DIFFICULTY } from './ai/ai.js';
import { GameController } from './game/controller.js';
import { BoardRenderer }  from './ui/renderer.js';
import { StatusBar }      from './ui/statusBar.js';
import { Confetti }       from './ui/confetti.js';

// ─── DOM refs ──────────────────────────────────────────────────────
const svgEl        = document.getElementById('board');
const statusTextEl = document.getElementById('status-text');
const p1OrbEl      = document.querySelector('.p1-orb');
const p2OrbEl      = document.querySelector('.p2-orb');
const p1CountEl    = document.getElementById('p1-count');
const p2CountEl    = document.getElementById('p2-count');
const confettiEl   = document.getElementById('confetti-canvas');
const p2LabelEl    = document.getElementById('p2-label');
const diffRow      = document.getElementById('diff-row');

// ─── Size confetti canvas ─────────────────────────────────────────
function sizeConfetti() {
  const rect = svgEl.getBoundingClientRect();
  confettiEl.width  = rect.width  || 340;
  confettiEl.height = rect.height || 340;
}
sizeConfetti();
window.addEventListener('resize', sizeConfetti);

// ─── Modules ─────────────────────────────────────────────────────
const statusBar = new StatusBar(statusTextEl, p1OrbEl, p2OrbEl);
const confetti  = new Confetti(confettiEl);

let renderer;
let controller;
let prevState = null;

function onStateChange(state) {
  if (!renderer) return;
  if (prevState) {
    renderer.update(prevState, state);
  } else {
    renderer.build(state);
  }
  statusBar.update(state, controller.mode);
  p1CountEl.textContent = Object.values(state.board).filter(v => v === 1).length;
  p2CountEl.textContent = Object.values(state.board).filter(v => v === 2).length;
  prevState = state;
}

function onWin(winner) {
  sizeConfetti();
  confetti.play(winner);
}

function onShakePiece(nodeId) {
  if (renderer) renderer.shakePiece(nodeId);
}

function boot() {
  controller = new GameController(onStateChange, onWin, onShakePiece);
  renderer   = new BoardRenderer(svgEl, controller);
  prevState  = null;
  controller.reset();
}

// ─── Mode buttons ─────────────────────────────────────────────────
document.getElementById('btn-2p').addEventListener('click', () => {
  document.getElementById('btn-2p').classList.add('active');
  document.getElementById('btn-ai').classList.remove('active');
  diffRow.style.display = 'none';
  p2LabelEl.textContent = 'PLAYER 2';
  confetti.stop();
  prevState = null;
  controller.setMode(GAME_MODE.TWO_PLAYER);
});

document.getElementById('btn-ai').addEventListener('click', () => {
  document.getElementById('btn-ai').classList.add('active');
  document.getElementById('btn-2p').classList.remove('active');
  diffRow.style.display = 'flex';
  p2LabelEl.textContent = 'AI';
  confetti.stop();
  prevState = null;
  controller.setMode(GAME_MODE.VS_AI);
});

// ─── Difficulty buttons ───────────────────────────────────────────
function setDifficulty(diff) {
  document.getElementById('btn-easy').classList.toggle('active', diff === AI_DIFFICULTY.EASY);
  document.getElementById('btn-med').classList.toggle('active',  diff === AI_DIFFICULTY.MEDIUM);
  document.getElementById('btn-hard').classList.toggle('active', diff === AI_DIFFICULTY.HARD);
  controller.setDifficulty(diff);
}

document.getElementById('btn-easy').addEventListener('click', () => setDifficulty(AI_DIFFICULTY.EASY));
document.getElementById('btn-med').addEventListener('click',  () => setDifficulty(AI_DIFFICULTY.MEDIUM));
document.getElementById('btn-hard').addEventListener('click', () => setDifficulty(AI_DIFFICULTY.HARD));

// ─── New game ──────────────────────────────────────────────────────
document.getElementById('btn-new-game').addEventListener('click', () => {
  confetti.stop();
  prevState = null;
  controller.reset();
});

// ─── Start ────────────────────────────────────────────────────────
boot();

