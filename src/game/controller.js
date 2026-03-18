/**
 * Asterisk — Game Controller
 *
 * Sits between game logic / AI / network and the UI renderer.
 * Owns the authoritative game state and exposes a clean API
 * that the UI layer calls — the UI never touches state directly.
 *
 * For v1.1 online mode:
 *   - handleNodeClick sends move via network.sendMove()
 *   - network.onMove() feeds remote moves back through processMove()
 *   - No other file needs to change
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
    this._onShakePiece  = onShakePiece; // renderer callback for shake animation
    this._mode          = GAME_MODE.TWO_PLAYER;
    this._difficulty    = AI_DIFFICULTY.EASY;
    this._state         = createInitialState();
    this._animating     = false;

    network.onMove(({ from, to }) => {
      if (network.isOnline()) this._processMove(from, to);
    });
  }

  // ─── Public API ────────────────────────────────────────────────

  get state()      { return this._state; }
  get mode()       { return this._mode;  }
  get difficulty() { return this._difficulty; }

  setMode(mode) {
    this._mode = mode;
    this.reset();
  }

  setDifficulty(diff) {
    this._difficulty = diff;
    this.reset();
  }

  reset() {
    network.disconnect();
    this._animating = false;
    this._state     = createInitialState();
    this._emit();
  }

  /**
   * Returns the legal destination nodes for a given piece in current state.
   * Used by the renderer to highlight valid moves without exposing state internals.
   */
  getLegalDestinations(nodeId) {
    const { board, turn, lastMove } = this._state;
    return getLegalDestinations(board, nodeId, lastMove, turn);
  }

  /**
   * Returns the single node that is banned by the no-reversal rule for the
   * currently selected piece, or null if there is no ban.
   * Used by the renderer to show the red "can't go back" ring.
   */
  getBannedReversal(nodeId) {
    const { turn, lastMove } = this._state;
    const last = lastMove[turn];
    if (!last || last.to !== nodeId) return null;
    return last.from; // this is the node they came from — banned destination
  }

  handleNodeClick(nodeId) {
    if (this._animating)           return;
    if (this._state.winner)        return;
    if (this._isWaitingForRemote()) return;

    const { board, turn, selected, lastMove } = this._state;
    const cell = board[nodeId];

    if (selected === null) {
      if (cell === turn) {
        // Check if this piece has any legal moves at all — if not, shake it
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

  onAnimationComplete() {
    this._animating = false;

    if (this._state.winner) {
      this._onWin(this._state.winner);
      return;
    }

    if (network.isOnline() && this._state.turn !== network.localPlayer) return;

    if (this._mode === GAME_MODE.VS_AI && this._state.turn === PLAYERS.TWO) {
      this._scheduleAI();
    }
  }

  // ─── Private ───────────────────────────────────────────────────

  _isWaitingForRemote() {
    return (
      (this._mode === GAME_MODE.VS_AI && this._state.turn === PLAYERS.TWO) ||
      (network.isOnline() && this._state.turn !== network.localPlayer)
    );
  }

  _executeMove(from, to) {
    this._animating = true;
    this._state = advanceState(this._state, from, to);
    if (network.isOnline()) network.sendMove(from, to);
    this._emit();
  }

  _processMove(from, to) {
    if (this._animating || this._state.winner) return;
    this._executeMove(from, to);
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

