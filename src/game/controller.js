/**
 * Asterisk — Game Controller v1.2
 */

import { GAME_MODE, PLAYERS } from '../game/constants.js';
import {
  createInitialState,
  getLegalDestinations,
  isLegalMove,
  advanceState,
} from '../game/logic.js';
import { getAIMove, AI_DIFFICULTY } from '../ai/ai.js';
import { network } from '../network/network.js';

const AI_DELAY_MS = 560;

export class GameController {
  constructor(onStateChange, onWin, onShakePiece) {
    this._onStateChange = onStateChange;
    this._onWin         = onWin;
    this._onShakePiece  = onShakePiece;
    this._mode          = GAME_MODE.TWO_PLAYER;
    this._difficulty    = AI_DIFFICULTY.EASY;
    this._state         = createInitialState();
    this._animating     = false;
  }

  // ─── Public API ────────────────────────────────────────────────

  get state()      { return this._state; }
  get mode()       { return this._mode;  }
  get difficulty() { return this._difficulty; }

  setMode(mode) {
    this._mode = mode;
    if (mode !== GAME_MODE.ONLINE) {
      network.disconnect();
      this._animating = false;
      this._state     = createInitialState();
      this._emit();
    }
  }

  setDifficulty(diff) {
    this._difficulty = diff;
    if (this._mode !== GAME_MODE.ONLINE) {
      this._animating = false;
      this._state     = createInitialState();
      this._emit();
    }
  }

  reset() {
    if (this._mode === GAME_MODE.ONLINE) {
      this._animating = false;
      this._state     = createInitialState();
      this._emit();
      return;
    }
    network.disconnect();
    this._animating = false;
    this._state     = createInitialState();
    this._emit();
  }

  getLegalDestinations(nodeId) {
    const { board, turn, lastMove } = this._state;
    return getLegalDestinations(board, nodeId, lastMove, turn);
  }

  getBannedReversal(nodeId) {
    const { turn, lastMove } = this._state;
    const last = lastMove[turn];
    if (!last || last.to !== nodeId) return null;
    return last.from;
  }

  handleNodeClick(nodeId) {
    if (this._animating)            return;
    if (this._state.winner)         return;
    if (this._isWaitingForRemote()) return;

    const { board, turn, selected, lastMove } = this._state;
    const cell = board[nodeId];

    if (selected === null) {
      if (cell === turn) {
        const destinations = getLegalDestinations(board, nodeId, lastMove, turn);
        if (destinations.length === 0) {
          if (this._onShakePiece) this._onShakePiece(nodeId);
          return;
        }
        this._state = { ...this._state, selected: nodeId };
        this._emit();
      }
    } else {
      if (nodeId === selected) {
        this._state = { ...this._state, selected: null };
        this._emit();
        return;
      }
      if (isLegalMove(board, selected, nodeId, turn, lastMove)) {
        this._executeMove(selected, nodeId);
      } else if (cell === turn) {
        this._state = { ...this._state, selected: nodeId };
        this._emit();
      }
    }
  }

  /**
   * Called by the drag system when a piece is released over a node.
   *
   * Returns one of three outcomes the drag handler acts on:
   *   'move'   — legal drop, move executed, animate via normal pipeline
   *   'shake'  — illegal destination, shake already fired, snap back
   *   'cancel' — silent snap back (origin, off-board, wrong player, etc.)
   *
   * Clears any click-based selection before executing so no stale ring remains.
   *
   * @param {string}      from — node the drag started on
   * @param {string|null} to   — node released over (null = off-board)
   * @returns {'move'|'shake'|'cancel'}
   */
  handleDrop(from, to) {
    if (this._animating)            return 'cancel';
    if (this._state.winner)         return 'cancel';
    if (this._isWaitingForRemote()) return 'cancel';

    const { board, turn, lastMove } = this._state;

    // Piece doesn't belong to current player
    if (board[from] !== turn) return 'cancel';

    // Released with no target or back on origin
    if (!to || to === from) return 'cancel';

    // Legal move — execute
    if (isLegalMove(board, from, to, turn, lastMove)) {
      // Clear any click selection before executing
      this._state = { ...this._state, selected: null };
      this._executeMove(from, to);
      return 'move';
    }

    // Illegal destination — shake the dragged piece
    if (this._onShakePiece) this._onShakePiece(from);
    return 'shake';
  }

  /**
   * Called by the drag system on pointerdown.
   * Returns false (and fires shake) if the piece has zero legal moves,
   * so the player gets instant feedback before the drag starts.
   *
   * @param {string} nodeId
   * @returns {boolean}
   */
  canDragFrom(nodeId) {
    if (this._animating)            return false;
    if (this._state.winner)         return false;
    if (this._isWaitingForRemote()) return false;

    const { board, turn, lastMove } = this._state;
    if (board[nodeId] !== turn) return false;

    const destinations = getLegalDestinations(board, nodeId, lastMove, turn);
    if (destinations.length === 0) {
      if (this._onShakePiece) this._onShakePiece(nodeId);
      return false;
    }
    return true;
  }

  /**
   * Applies a full game state received from Firebase (opponent's move).
   */
  applyRemoteState(remoteState) {
    if (this._animating) return;
    this._animating = true;
    this._state     = { ...remoteState, selected: null };
    this._emit();
  }

  onAnimationComplete() {
    this._animating = false;

    if (this._state.winner) {
      this._onWin(this._state.winner);
      return;
    }

    if (this._mode === GAME_MODE.ONLINE) return;

    if (this._mode === GAME_MODE.VS_AI && this._state.turn === PLAYERS.TWO) {
      this._scheduleAI();
    }
  }

  // ─── Private ───────────────────────────────────────────────────

  _isWaitingForRemote() {
    return (
      (this._mode === GAME_MODE.VS_AI && this._state.turn === PLAYERS.TWO) ||
      (this._mode === GAME_MODE.ONLINE && this._state.turn !== network.localPlayer)
    );
  }

  _executeMove(from, to) {
    this._animating = true;
    this._state     = advanceState(this._state, from, to);
    this._state     = { ...this._state, moveCount: (this._state.moveCount || 0) + 1 };

    if (this._mode === GAME_MODE.ONLINE) {
      network.sendMove(from, to, this._state);
    }

    this._emit();
  }

  _scheduleAI() {
    setTimeout(() => {
      if (this._state.winner || this._animating) return;
      const move = getAIMove(
        this._state.board,
        this._state.lastMove,
        PLAYERS.TWO,
        this._difficulty
      );
      if (move) this._executeMove(move.from, move.to);
    }, AI_DELAY_MS);
  }

  _emit() {
    this._onStateChange({ ...this._state });
  }
}
