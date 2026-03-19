/**
 * Asterisk — Game Controller v1.1
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
    // Don't disconnect or reset if switching INTO online mode —
    // the lobby has already set up the room. Reset only for local modes.
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
      // In online mode reset just clears the board display — network handles state
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
   * Applies a full game state received from Firebase (opponent's move).
   * The renderer detects the piece delta and animates the slide.
   */
  applyRemoteState(remoteState) {
    if (this._animating) return;
    this._animating = true;
    this._state     = { ...remoteState, selected: null };
    this._emit();
    // onAnimationComplete() is called by renderer after slide finishes
  }

  onAnimationComplete() {
    this._animating = false;

    if (this._state.winner) {
      this._onWin(this._state.winner);
      return;
    }

    // Online — if it's now our turn, just wait for player input
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
    // Track move count for leaderboard fastest-win stat
    this._state     = { ...this._state, moveCount: (this._state.moveCount || 0) + 1 };

    // In online mode — push full state to Firebase so opponent receives it
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


