/**
 * Asterisk — Core Game Logic
 * Pure functions only. No DOM, no side effects.
 * Safe to run server-side for v1.1 online validation.
 *
 * Rules implemented here:
 *   - No-reversal: a player cannot immediately reverse their last move
 *     (move the same piece back to the node it just came from).
 *     Tracked via lastMove per player in state. Resets after any other move.
 *   - Forced loss: if a player has no legal moves (all options are reversals
 *     or physically blocked), they lose immediately.
 */

import { ADJACENCY, WIN_LINES, INITIAL_BOARD, CELL, PLAYERS } from './constants.js';

export function createInitialBoard() {
  return { ...INITIAL_BOARD };
}

/**
 * Game state shape:
 * {
 *   board:     { A:0|1|2, B:..., ... }
 *   turn:      1 | 2
 *   selected:  string | null
 *   winner:    1 | 2 | null
 *   winLine:   string[] | null
 *   lastMove:  { 1: { from, to } | null, 2: { from, to } | null }
 * }
 */
export function createInitialState() {
  return {
    board:    createInitialBoard(),
    turn:     PLAYERS.ONE,
    selected: null,
    winner:   null,
    winLine:  null,
    lastMove: { 1: null, 2: null },
  };
}

export function getPlayerPieces(board, player) {
  return Object.keys(board).filter(k => board[k] === player);
}

export function checkWin(board) {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] !== CELL.EMPTY && board[a] === board[b] && board[b] === board[c]) {
      return { winner: board[a], line };
    }
  }
  return null;
}

export function applyMove(board, from, to) {
  return { ...board, [to]: board[from], [from]: CELL.EMPTY };
}

/**
 * Returns all physically reachable empty nodes from a given node,
 * WITHOUT applying the no-reversal rule.
 * Used internally and by the AI when building the full move tree.
 */
export function getReachableNodes(board, nodeId) {
  return ADJACENCY[nodeId].filter(n => board[n] === CELL.EMPTY);
}

/**
 * Returns the legal destination nodes for a piece, applying the no-reversal rule.
 * A destination is blocked if:
 *   - It is the node the piece came from on the player's last move (reversal ban).
 *
 * @param {Object} board
 * @param {string} nodeId   — the piece being moved
 * @param {Object} lastMove — lastMove[player] = { from, to } | null
 * @param {number} player
 * @returns {string[]}
 */
export function getLegalDestinations(board, nodeId, lastMove, player) {
  const reachable = getReachableNodes(board, nodeId);
  const last = lastMove[player];

  if (!last || last.to !== nodeId) {
    // This piece was not the one moved last turn — no restriction
    return reachable;
  }

  // This IS the piece that moved last turn: ban reversing back to last.from
  return reachable.filter(n => n !== last.from);
}

/**
 * Returns ALL legal moves for a player given the current state.
 * Applies the no-reversal rule per piece.
 * An empty array means the player has no legal moves → forced loss.
 *
 * @param {Object} board
 * @param {number} player
 * @param {Object} lastMove
 * @returns {{ from: string, to: string }[]}
 */
export function getAllLegalMoves(board, player, lastMove) {
  const moves = [];
  getPlayerPieces(board, player).forEach(from => {
    getLegalDestinations(board, from, lastMove, player).forEach(to => {
      moves.push({ from, to });
    });
  });
  return moves;
}

/**
 * Full move legality check — used by controller and server-side v1.1 validation.
 * Checks adjacency, ownership, destination empty, and no-reversal rule.
 */
export function isLegalMove(board, from, to, player, lastMove) {
  if (board[from] !== player)          return false;
  if (board[to]   !== CELL.EMPTY)      return false;
  if (!ADJACENCY[from].includes(to))   return false;

  const last = lastMove[player];
  if (last && last.to === from && last.from === to) return false; // reversal

  return true;
}

/**
 * Central state transition. Applies a move and returns the next full state.
 * Also checks for forced loss (no legal moves for the next player).
 */
export function advanceState(state, from, to) {
  const newBoard    = applyMove(state.board, from, to);
  const winResult   = checkWin(newBoard);
  const nextPlayer  = state.turn === PLAYERS.ONE ? PLAYERS.TWO : PLAYERS.ONE;

  // Record this move for the no-reversal rule
  const newLastMove = {
    ...state.lastMove,
    [state.turn]: { from, to },
  };

  if (winResult) {
    return {
      ...state,
      board:    newBoard,
      selected: null,
      winner:   winResult.winner,
      winLine:  winResult.line,
      lastMove: newLastMove,
    };
  }

  // Check if the next player has any legal moves — if not, current player wins
  const nextMoves = getAllLegalMoves(newBoard, nextPlayer, newLastMove);
  if (nextMoves.length === 0) {
    return {
      ...state,
      board:    newBoard,
      selected: null,
      winner:   state.turn,   // current player wins by trapping opponent
      winLine:  null,
      lastMove: newLastMove,
    };
  }

  return {
    ...state,
    board:    newBoard,
    selected: null,
    winner:   null,
    winLine:  null,
    turn:     nextPlayer,
    lastMove: newLastMove,
  };
}
