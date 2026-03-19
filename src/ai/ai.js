/**
 * Asterisk — AI Opponent
 *
 * Three difficulty modes:
 *
 *   EASY    — plays like a cautious beginner. Always takes an immediate win
 *             and always blocks an immediate opponent win. Makes a suboptimal
 *             strategic move ~25% of the time otherwise.
 *
 *   MEDIUM  — mirrors the original single-mode AI. Always wins, always blocks,
 *             always picks the best heuristic move. Ties broken randomly.
 *             No minimax — purely reactive but plays correctly every time.
 *             A solid opponent that doesn't make tactical errors.
 *
 *   HARD    — minimax at depth 4 with alpha-beta pruning, plus a ~15%
 *             mistake rate on non-critical moves. Punishes poor play and
 *             contests the centre intelligently, but leaves enough gaps
 *             that a focused human can find winning lines.
 *
 * All modes fully respect the no-reversal rule via getAllLegalMoves().
 */

import { WIN_LINES } from '../game/constants.js';
import {
  getAllLegalMoves,
  applyMove,
  checkWin,
} from '../game/logic.js';

export const AI_DIFFICULTY = {
  EASY:   'easy',
  MEDIUM: 'medium',
  HARD:   'hard',
};

const EASY_MISTAKE_RATE = 0.25; // slips on strategic moves 1 in 4
const HARD_MISTAKE_RATE = 0.15; // slips on strategic moves 1 in 7
const HARD_DEPTH        = 4;

// ─── Public API ────────────────────────────────────────────────────

export function getAIMove(board, lastMove, player, difficulty) {
  const moves = getAllLegalMoves(board, player, lastMove);
  if (!moves.length) return null;

  const opp = player === 1 ? 2 : 1;

  // 1 — always take an immediate win (all difficulties)
  for (const m of moves) {
    if (checkWin(applyMove(board, m.from, m.to))) return m;
  }

  // 2 — always block an immediate opponent win (all difficulties)
  const oppMoves  = getAllLegalMoves(board, opp, lastMove);
  const mustBlock = new Set();
  for (const m of oppMoves) {
    if (checkWin(applyMove(board, m.from, m.to))) mustBlock.add(m.to);
  }
  const blocking = moves.filter(m => mustBlock.has(m.to));
  if (blocking.length) {
    return blocking[Math.floor(Math.random() * blocking.length)];
  }

  // 3 — strategic play per difficulty
  if (difficulty === AI_DIFFICULTY.MEDIUM) {
    // Check if any opponent move creates a fork (2+ winning threats simultaneously)
    // If yes, prioritise breaking it up before falling back to best heuristic
    const forkBreaker = _findForkBreaker(board, lastMove, player, opp, moves);
    if (forkBreaker) return forkBreaker;
    return _bestHeuristic(board, moves, player);
  }

  const mistakeRate = difficulty === AI_DIFFICULTY.HARD
    ? HARD_MISTAKE_RATE
    : EASY_MISTAKE_RATE;

  if (Math.random() < mistakeRate) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  return difficulty === AI_DIFFICULTY.HARD
    ? _minimaxMove(board, lastMove, player)
    : _bestHeuristic(board, moves, player);
}

// ─── Fork detection (Medium) ───────────────────────────────────────

/**
 * Counts how many moves the given player has that would win immediately.
 * This is the number of "threats" they hold on this board.
 */
function _countWinningThreats(board, lastMove, player) {
  const moves = getAllLegalMoves(board, player, lastMove);
  let threats = 0;
  for (const m of moves) {
    if (checkWin(applyMove(board, m.from, m.to))) threats++;
  }
  return threats;
}

/**
 * Looks one move ahead for the opponent — if any opponent move would give
 * them 2+ winning threats (a fork), find a move that either:
 *   a) occupies the destination the fork depends on, or
 *   b) reduces the opponent's threats to <2 after our move
 *
 * Returns the best such disrupting move, or null if no fork is coming.
 */
function _findForkBreaker(board, lastMove, player, opp, myMoves) {
  const oppMoves = getAllLegalMoves(board, opp, lastMove);

  // Find all opponent moves that create a fork
  const forkDestinations = new Set();
  for (const m of oppMoves) {
    const nb      = applyMove(board, m.from, m.to);
    const nlm     = { ...lastMove, [opp]: { from: m.from, to: m.to } };
    const threats = _countWinningThreats(nb, nlm, opp);
    if (threats >= 2) forkDestinations.add(m.to);
  }

  if (forkDestinations.size === 0) return null;

  // Prefer moves that land on a fork destination (deny the square)
  const denying = myMoves.filter(m => forkDestinations.has(m.to));
  if (denying.length) {
    // Among denying moves, pick the one with the best heuristic score
    const scored = denying.map(m => ({
      ...m,
      score: _evaluate(applyMove(board, m.from, m.to), player),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0];
  }

  // No square to deny — find a move that leaves opponent with <2 threats
  // after our move (i.e. we've broken up the fork setup positionally)
  const disrupting = myMoves.filter(m => {
    const nb  = applyMove(board, m.from, m.to);
    const nlm = { ...lastMove, [player]: { from: m.from, to: m.to } };
    // Simulate opponent's best fork attempt after our move
    const oppMovesNext = getAllLegalMoves(nb, opp, nlm);
    for (const om of oppMovesNext) {
      const nb2     = applyMove(nb, om.from, om.to);
      const nlm2    = { ...nlm, [opp]: { from: om.from, to: om.to } };
      const threats = _countWinningThreats(nb2, nlm2, opp);
      if (threats >= 2) return false; // this move doesn't stop the fork
    }
    return true;
  });

  if (disrupting.length) {
    const scored = disrupting.map(m => ({
      ...m,
      score: _evaluate(applyMove(board, m.from, m.to), player),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0];
  }

  return null; // fork coming but we can't stop it — fall through to heuristic
}

// ─── Hard (minimax) ────────────────────────────────────────────────

const WIN_SCORE = 1000;

function _minimaxMove(board, lastMove, player) {
  const moves = getAllLegalMoves(board, player, lastMove);
  if (!moves.length) return null;

  let bestScore = -Infinity;
  let bestMove  = moves[0];
  const opp     = player === 1 ? 2 : 1;

  for (const m of moves) {
    const nb  = applyMove(board, m.from, m.to);
    const nlm = { ...lastMove, [player]: { from: m.from, to: m.to } };
    const s   = _minimax(nb, nlm, player, opp, HARD_DEPTH - 1, -Infinity, Infinity, false);
    if (s > bestScore) { bestScore = s; bestMove = m; }
  }

  return bestMove;
}

function _minimax(board, lastMove, rootPlayer, currentTurn, depth, alpha, beta, isMax) {
  const win = checkWin(board);
  if (win) {
    return (win.winner === rootPlayer ? 1 : -1) * (WIN_SCORE + depth);
  }

  const moves = getAllLegalMoves(board, currentTurn, lastMove);
  if (!moves.length) {
    return (currentTurn === rootPlayer ? -1 : 1) * (WIN_SCORE + depth);
  }

  if (depth === 0) return _evaluate(board, rootPlayer);

  const nextTurn = currentTurn === 1 ? 2 : 1;

  if (isMax) {
    let best = -Infinity;
    for (const m of moves) {
      const nb  = applyMove(board, m.from, m.to);
      const nlm = { ...lastMove, [currentTurn]: { from: m.from, to: m.to } };
      const s   = _minimax(nb, nlm, rootPlayer, nextTurn, depth - 1, alpha, beta, false);
      best  = Math.max(best, s);
      alpha = Math.max(alpha, s);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      const nb  = applyMove(board, m.from, m.to);
      const nlm = { ...lastMove, [currentTurn]: { from: m.from, to: m.to } };
      const s   = _minimax(nb, nlm, rootPlayer, nextTurn, depth - 1, alpha, beta, true);
      best = Math.min(best, s);
      beta = Math.min(beta, s);
      if (beta <= alpha) break;
    }
    return best;
  }
}

// ─── Heuristic ─────────────────────────────────────────────────────

function _evaluate(board, player) {
  const opp = player === 1 ? 2 : 1;
  let score = 0;
  for (const line of WIN_LINES) {
    const vals   = line.map(n => board[n]);
    const mine   = vals.filter(v => v === player).length;
    const theirs = vals.filter(v => v === opp).length;
    if (theirs === 0) score += mine * mine * 3;
    if (mine   === 0) score -= theirs * theirs * 3;
  }
  if (board['E'] === player) score += 8;
  if (board['E'] === opp)    score -= 8;
  return score;
}

function _bestHeuristic(board, moves, player) {
  const scored = moves.map(m => ({
    ...m,
    score: _evaluate(applyMove(board, m.from, m.to), player),
  }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter(m => m.score === scored[0].score);
  return top[Math.floor(Math.random() * top.length)];
}
