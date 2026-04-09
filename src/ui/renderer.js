/**
 * Asterisk — Board Renderer v1.2
 *
 * Owns all SVG DOM manipulation. Receives state snapshots and diffs
 * them onto the board.
 *
 * ANIMATION NOTE: CSS transitions on SVG presentation attributes (cx/cy)
 * are unreliable cross-browser. We use JS requestAnimationFrame instead,
 * lerping the piece position each frame until it reaches the destination.
 *
 * v1.2: Drag-to-move support via DragHandler. The drag system is a parallel
 * input path — click interaction is fully preserved.
 */

import { NODE_POSITIONS, EDGES } from '../game/constants.js';
import { DragHandler }           from './drag.js';

const NS = 'http://www.w3.org/2000/svg';

// Board geometry
const BOARD_PAD   = 50;   // padding inside 340×340 viewBox
const BOARD_SIZE  = 240;  // usable area

// Derived node positions scaled to viewBox
const NP = {};
Object.entries(NODE_POSITIONS).forEach(([id, {x, y}]) => {
  NP[id] = {
    x: BOARD_PAD + (x / 260) * BOARD_SIZE,
    y: BOARD_PAD + (y / 260) * BOARD_SIZE,
  };
});

const R_SOCKET = { default: 13, E: 17 };
const R_PIECE  = 9;
const R_HIT    = 22;

const SLIDE_DURATION = 320; // ms

export class BoardRenderer {
  constructor(svgEl, controller) {
    this._svg        = svgEl;
    this._ctrl       = controller;
    this._defs       = null;
    this._pieceEls   = {};   // nodeId → { group, outer, inner }
    this._piecePos   = {};   // nodeId → { x, y }  current animated position
    this._anims      = [];   // active slide animations
    this._built      = false;
    this._drag       = null; // DragHandler instance
  }

  build(state) {
    // Destroy previous drag handler before clearing the SVG
    if (this._drag) {
      this._drag.destroy();
      this._drag = null;
    }

    this._svg.innerHTML = '';
    this._pieceEls = {};
    this._piecePos = {};
    this._anims    = [];
    this._built    = true;

    this._buildDefs();
    this._buildEdges();
    this._buildSockets();
    this._buildPieces(state);
    this._buildLabels();
    this._buildHitTargets(); // also instantiates DragHandler
  }

  update(prev, next) {
    if (!this._built) { this.build(next); return; }
    this._updateEdges(next);
    this._updateSockets(next);
    this._updatePieces(prev, next);
  }

  // ─── Build ───────────────────────────────────────────────────────

  _buildDefs() {
    const defs = this._make('defs');

    const g1 = this._make('radialGradient');
    this._attrs(g1, { id: 'grad-p1', cx: '35%', cy: '35%', r: '65%' });
    g1.appendChild(this._stop('0%',   '#60c8ff'));
    g1.appendChild(this._stop('100%', '#0055aa'));
    defs.appendChild(g1);

    const g2 = this._make('radialGradient');
    this._attrs(g2, { id: 'grad-p2', cx: '35%', cy: '35%', r: '65%' });
    g2.appendChild(this._stop('0%',   '#ffb060'));
    g2.appendChild(this._stop('100%', '#aa3300'));
    defs.appendChild(g2);

    const gc = this._make('radialGradient');
    this._attrs(gc, { id: 'grad-center', cx: '50%', cy: '50%', r: '50%' });
    gc.appendChild(this._stop('0%',   'rgba(150,220,255,0.25)'));
    gc.appendChild(this._stop('100%', 'rgba(0,80,160,0)'));
    defs.appendChild(gc);

    this._svg.appendChild(defs);
    this._defs = defs;
  }

  _stop(offset, color) {
    const s = this._make('stop');
    s.setAttribute('offset', offset);
    s.setAttribute('stop-color', color);
    return s;
  }

  _buildEdges() {
    const g = this._make('g');
    g.setAttribute('id', 'edges-layer');
    EDGES.forEach(([a, b]) => {
      const line = this._make('line');
      const na = NP[a], nb = NP[b];
      this._attrs(line, {
        id: `edge-${a}-${b}`,
        x1: na.x, y1: na.y,
        x2: nb.x, y2: nb.y,
        class: 'edge-neutral',
      });
      g.appendChild(line);
    });
    this._svg.appendChild(g);
  }

  _buildSockets() {
    const g = this._make('g');
    g.setAttribute('id', 'sockets-layer');
    Object.entries(NP).forEach(([id, pos]) => {
      const r   = R_SOCKET[id] ?? R_SOCKET.default;
      const cls = id === 'E' ? 'node-socket-center' : 'node-socket';
      const el  = this._make('circle');
      this._attrs(el, { id: `socket-${id}`, cx: pos.x, cy: pos.y, r, class: cls });
      g.appendChild(el);

      if (id === 'E') {
        const glow = this._make('circle');
        this._attrs(glow, { cx: pos.x, cy: pos.y, r: 40, fill: 'url(#grad-center)', 'pointer-events': 'none' });
        g.appendChild(glow);
      }
    });
    this._svg.appendChild(g);
  }

  _buildPieces(state) {
    const g = this._make('g');
    g.setAttribute('id', 'pieces-layer');

    Object.entries(state.board).forEach(([id, cell]) => {
      if (!cell) return;
      const pos  = NP[id];
      const els  = this._makePieceEl(id, cell, pos.x, pos.y);
      g.appendChild(els.group);
      this._pieceEls[id] = els;
      this._piecePos[id] = { x: pos.x, y: pos.y };
    });

    this._svg.appendChild(g);
  }

  _makePieceEl(id, player, x, y) {
    const group = this._make('g');
    group.setAttribute('class', 'piece');
    group.setAttribute('id', `piece-${id}`);

    const outer = this._make('circle');
    this._attrs(outer, {
      cx: x, cy: y, r: R_PIECE + 3,
      fill: 'none',
      stroke: player === 1 ? '#00aaff' : '#ff6a00',
      'stroke-width': '1.5',
      opacity: '0.6',
    });

    const inner = this._make('circle');
    this._attrs(inner, {
      cx: x, cy: y, r: R_PIECE,
      fill: player === 1 ? 'url(#grad-p1)' : 'url(#grad-p2)',
      stroke: player === 1 ? '#60c8ff' : '#ffb060',
      'stroke-width': '1',
    });

    group.appendChild(outer);
    group.appendChild(inner);
    return { group, outer, inner };
  }

  _buildLabels() {
    const g = this._make('g');
    g.setAttribute('id', 'labels-layer');
    Object.entries(NP).forEach(([id, pos]) => {
      const r  = R_SOCKET[id] ?? R_SOCKET.default;
      const el = this._make('text');
      this._attrs(el, {
        x: pos.x, y: pos.y + r + 10,
        'text-anchor': 'middle',
        class: 'node-label',
      });
      el.textContent = id;
      g.appendChild(el);
    });
    this._svg.appendChild(g);
  }

  _buildHitTargets() {
    const g = this._make('g');
    g.setAttribute('id', 'hit-layer');

    // Instantiate drag handler — callbacks give it live access to piece state
    this._drag = new DragHandler(
      this._svg,
      this._ctrl,
      NP,
      () => this._pieceEls,
      () => this._piecePos,
      // showDragHighlights: called on drag commit, mirrors click-select visual
      (fromNodeId) => this._applyDragHighlights(fromNodeId),
      // clearDragHighlights: called on release/cancel
      () => this._clearDragHighlights(),
    );

    Object.entries(NP).forEach(([id, pos]) => {
      const el = this._make('circle');
      this._attrs(el, { cx: pos.x, cy: pos.y, r: R_HIT, class: 'node-hit' });

      // Click handler — unchanged
      el.addEventListener('click', () => this._ctrl.handleNodeClick(id));

      // Drag handler — attach per node
      this._drag.attach(el, id);

      g.appendChild(el);
    });

    this._svg.appendChild(g);
  }

  // ─── Drag highlight helpers ───────────────────────────────────────

  /**
   * Applies valid/banned socket rings for a drag in progress.
   * Mirrors the visual produced by _updateSockets when a piece is click-selected,
   * but without touching controller state (no selected node is set).
   */
  _applyDragHighlights(fromNodeId) {
    const valid  = this._ctrl.getLegalDestinations(fromNodeId);
    const banned = this._ctrl.getBannedReversal(fromNodeId);

    Object.keys(NP).forEach(id => {
      const el = document.getElementById(`socket-${id}`);
      if (!el) return;
      if (valid.includes(id))  el.setAttribute('class', 'node-valid-ring');
      else if (id === banned)  el.setAttribute('class', 'node-banned-ring');
      else                     el.setAttribute('class', id === 'E' ? 'node-socket-center' : 'node-socket');
    });
  }

  /**
   * Restores all sockets to their default (non-highlighted) state.
   * Called when a drag ends for any reason.
   * The next _updateSockets call from the controller will override this
   * if there's a click-selected piece, keeping state consistent.
   */
  _clearDragHighlights() {
    Object.keys(NP).forEach(id => {
      const el = document.getElementById(`socket-${id}`);
      if (!el) return;
      el.setAttribute('class', id === 'E' ? 'node-socket-center' : 'node-socket');
    });
  }

  // ─── Update ──────────────────────────────────────────────────────

  _updateEdges(state) {
    EDGES.forEach(([a, b]) => {
      const el = document.getElementById(`edge-${a}-${b}`);
      if (!el) return;

      const isWin = state.winLine &&
        state.winLine.includes(a) && state.winLine.includes(b);

      if (isWin) { el.setAttribute('class', 'edge-win'); return; }

      const ca = state.board[a], cb = state.board[b];
      if (ca && cb && ca === cb) {
        el.setAttribute('class', ca === 1 ? 'edge-p1' : 'edge-p2');
      } else {
        el.setAttribute('class', 'edge-neutral');
      }
    });
  }

  _updateSockets(state) {
    const valid  = state.selected
      ? this._ctrl.getLegalDestinations(state.selected)
      : [];
    const banned = state.selected
      ? this._ctrl.getBannedReversal(state.selected)
      : null;

    Object.keys(NP).forEach(id => {
      const el = document.getElementById(`socket-${id}`);
      if (!el) return;

      const isWin    = state.winLine && state.winLine.includes(id);
      const isValid  = valid.includes(id);
      const isBanned = id === banned;
      const isCenter = id === 'E';

      if (isWin)         el.setAttribute('class', 'node-win-ring');
      else if (isValid)  el.setAttribute('class', 'node-valid-ring');
      else if (isBanned) el.setAttribute('class', 'node-banned-ring');
      else               el.setAttribute('class', isCenter ? 'node-socket-center' : 'node-socket');
    });

    Object.entries(this._pieceEls).forEach(([id, els]) => {
      const isSel = state.selected === id;
      const isWin = state.winLine && state.winLine.includes(id);
      if (!els) return;

      if (isWin) {
        els.outer.setAttribute('stroke', '#f0c040');
        els.outer.setAttribute('opacity', '1');
        els.inner.setAttribute('stroke', '#f0c040');
      } else if (isSel) {
        els.outer.setAttribute('stroke', '#f0c040');
        els.outer.setAttribute('opacity', '1');
        els.outer.setAttribute('r', R_PIECE + 5);
        els.inner.setAttribute('stroke', '#f0c040');
      } else {
        const isP1 = (state.board[id] === 1);
        els.outer.setAttribute('stroke', isP1 ? '#00aaff' : '#ff6a00');
        els.outer.setAttribute('opacity', '0.6');
        els.outer.setAttribute('r', R_PIECE + 3);
        els.inner.setAttribute('stroke', isP1 ? '#60c8ff' : '#ffb060');
      }
    });
  }

  /**
   * Shakes a piece's SVG group to signal it has no legal moves.
   * @param {string} nodeId
   */
  shakePiece(nodeId) {
    const els = this._pieceEls[nodeId];
    if (!els) return;

    const pos     = this._piecePos[nodeId] ?? NP[nodeId];
    const SHAKE   = [0, -5, 5, -4, 4, -2, 2, 0];
    const STEP_MS = 40;
    let   i       = 0;

    const tick = () => {
      if (i >= SHAKE.length) {
        this._setPiecePos(els, pos.x, pos.y);
        return;
      }
      this._setPiecePos(els, pos.x + SHAKE[i], pos.y);
      i++;
      setTimeout(tick, STEP_MS);
    };
    tick();
  }

  _playerFromPiece(id) {
    const el = document.getElementById(`piece-${id}`);
    if (!el) return 0;
    const inner = el.querySelector('circle:last-child');
    if (!inner) return 0;
    return inner.getAttribute('fill') === 'url(#grad-p1)' ? 1 : 2;
  }

  _updatePieces(prev, next) {
    const fromId = Object.keys(prev.board).find(
      k => prev.board[k] !== 0 && next.board[k] === 0
    );
    const toId = fromId
      ? Object.keys(next.board).find(
          k => prev.board[k] === 0 && next.board[k] !== 0
        )
      : null;

    if (!fromId || !toId) return;

    const els = this._pieceEls[fromId];
    if (!els) return;

    // Re-register under new node id
    els.group.setAttribute('id', `piece-${toId}`);
    this._pieceEls[toId] = els;
    delete this._pieceEls[fromId];

    const startX = this._piecePos[fromId]?.x ?? NP[fromId].x;
    const startY = this._piecePos[fromId]?.y ?? NP[fromId].y;
    const endX   = NP[toId].x;
    const endY   = NP[toId].y;

    delete this._piecePos[fromId];
    this._piecePos[toId] = { x: startX, y: startY };

    // Restore opacity in case this piece was being dragged when the move fired
    // (drag succeeded — ghost was removed, real piece may still be dimmed)
    els.outer.setAttribute('opacity', '0.6');
    els.inner.setAttribute('opacity', '1');

    this._anims = this._anims.filter(a => a.els !== els);

    const startTime = performance.now();
    const anim = { els, toId, done: false };
    this._anims.push(anim);

    const tick = (now) => {
      const t    = Math.min((now - startTime) / SLIDE_DURATION, 1);
      const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
      const cx   = startX + (endX - startX) * ease;
      const cy   = startY + (endY - startY) * ease;

      this._setPiecePos(els, cx, cy);
      this._piecePos[toId] = { x: cx, y: cy };

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        this._setPiecePos(els, endX, endY);
        this._piecePos[toId] = { x: endX, y: endY };
        anim.done = true;
        this._ctrl.onAnimationComplete();
      }
    };

    requestAnimationFrame(tick);
  }

  _setPiecePos(els, x, y) {
    els.outer.setAttribute('cx', x);
    els.outer.setAttribute('cy', y);
    els.inner.setAttribute('cx', x);
    els.inner.setAttribute('cy', y);
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  _make(tag) {
    return document.createElementNS(NS, tag);
  }

  _attrs(el, map) {
    Object.entries(map).forEach(([k, v]) => el.setAttribute(k, v));
  }
}
