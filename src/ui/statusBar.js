/**
 * Nexus — Status Bar
 * Updates the status text and player orb highlights based on game state.
 */

import { GAME_MODE, PLAYERS } from '../game/constants.js';

export class StatusBar {
  constructor(textEl, p1OrbEl, p2OrbEl) {
    this._text   = textEl;
    this._p1Orb  = p1OrbEl;
    this._p2Orb  = p2OrbEl;
  }

  update(state, mode) {
    const isAI = mode === GAME_MODE.VS_AI;

    if (state.winner) {
      this._renderWin(state, isAI);
    } else if (isAI && state.turn === PLAYERS.TWO && !state.selected) {
      this._renderAIThinking();
    } else if (state.selected) {
      this._renderSelected(state, isAI);
    } else {
      this._renderIdle(state, isAI);
    }

    // Orb active highlight
    this._p1Orb.classList.toggle('active-turn', !state.winner && state.turn === PLAYERS.ONE);
    this._p2Orb.classList.toggle('active-turn', !state.winner && state.turn === PLAYERS.TWO);
  }

  _renderWin(state, isAI) {
    const name = isAI && state.winner === PLAYERS.TWO ? 'AI' : `PLAYER ${state.winner}`;
    // winLine is null when win came from trapping the opponent
    const reason = state.winLine ? 'WINS!' : 'WINS — OPPONENT TRAPPED!';
    this._set(`${name} ${reason}`, 'win-text');
  }

  _renderAIThinking() {
    this._set('AI IS THINKING…', 'p2-turn');
  }

  _renderSelected(state, isAI) {
    const name = isAI && state.turn === PLAYERS.TWO ? 'AI' : `PLAYER ${state.turn}`;
    this._set(`${name} — CHOOSE DESTINATION`, state.turn === 1 ? 'p1-turn' : 'p2-turn');
  }

  _renderIdle(state, isAI) {
    const name = isAI && state.turn === PLAYERS.TWO ? 'AI' : `PLAYER ${state.turn}`;
    this._set(`${name}'S TURN`, state.turn === 1 ? 'p1-turn' : 'p2-turn');
  }

  _set(text, cls) {
    this._text.textContent = text;
    this._text.className   = cls || '';
  }
}

