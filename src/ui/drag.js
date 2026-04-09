/**
 * Asterisk — Drag Gesture Handler v1.2
 *
 * Owns all pointer-event logic for drag-to-move.
 * Works in parallel with the existing click system — does not replace it.
 *
 * Lifecycle:
 *   const drag = new DragHandler(svgEl, controller, nodePositions, getPieceEls, getPiecePos);
 *   drag.attach(hitTargetEl, nodeId);   // called once per node in _buildHitTargets
 *   drag.destroy();                     // called in build() before rebuilding
 *
 * Cancel cases handled:
 *   1. Released off-board or over origin         → silent snap back
 *   2. Released over illegal destination         → shake + snap back
 *   3. Piece has no legal moves (pointerdown)    → shake in place, no drag starts
 *   4. Released mid-air (no node under pointer)  → silent snap back
 *   5. Animating / opponent's turn               → no drag starts (canDragFrom guard)
 */

const NS            = 'http://www.w3.org/2000/svg';
const DRAG_THRESHOLD = 6;   // px movement before drag is committed
const SNAP_DURATION  = 180; // ms for snap-back animation
const GHOST_OPACITY  = 0.55;

export class DragHandler {
  /**
   * @param {SVGElement}  svgEl
   * @param {GameController} ctrl
   * @param {Object}      np          node positions map { id: {x,y} }
   * @param {Function}    getPieceEls () => { nodeId: {group,outer,inner} }
   * @param {Function}    getPiecePos () => { nodeId: {x,y} }
   * @param {Function}    showDragHighlights (fromNodeId) — activates valid/banned rings
   * @param {Function}    clearDragHighlights ()          — restores normal socket state
   */
  constructor(svgEl, ctrl, np, getPieceEls, getPiecePos, showDragHighlights, clearDragHighlights) {
    this._svg                = svgEl;
    this._ctrl               = ctrl;
    this._np                 = np;
    this._getPieceEls        = getPieceEls;
    this._getPiecePos        = getPiecePos;
    this._showDragHighlights = showDragHighlights;
    this._clearDragHighlights= clearDragHighlights;

    // Per-gesture state — reset on every pointerdown
    this._drag = null;

    // Ghost element lives in SVG during drag
    this._ghost = null;

    // Bound handlers kept for removeEventListener
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp   = this._onPointerUp.bind(this);
    this._onPointerCancel = this._onPointerCancel.bind(this);

    // All hit-target elements registered via attach()
    this._listeners = []; // { el, fn }
  }

  /**
   * Attach drag start listener to a hit-target element.
   * Called once per node during _buildHitTargets.
   */
  attach(el, nodeId) {
    const fn = (e) => this._onPointerDown(e, nodeId);
    el.addEventListener('pointerdown', fn);
    this._listeners.push({ el, fn });
  }

  /** Remove all listeners and clean up any active drag. */
  destroy() {
    this._cancelDrag(true);
    this._listeners.forEach(({ el, fn }) => el.removeEventListener('pointerdown', fn));
    this._listeners = [];
    window.removeEventListener('pointermove',   this._onPointerMove);
    window.removeEventListener('pointerup',     this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerCancel);
  }

  // ─── Pointer handlers ────────────────────────────────────────────

  _onPointerDown(e, nodeId) {
    // Only primary button / first touch
    if (e.button !== undefined && e.button !== 0) return;

    // Gate: check if this piece can be dragged at all
    if (!this._ctrl.canDragFrom(nodeId)) {
      // canDragFrom already fires the shake if relevant
      return;
    }

    e.preventDefault();

    const svgPt = this._svgPoint(e.clientX, e.clientY);

    this._drag = {
      fromNode:    nodeId,
      startSvgX:   svgPt.x,
      startSvgY:   svgPt.y,
      currentSvgX: svgPt.x,
      currentSvgY: svgPt.y,
      committed:   false,   // true once movement exceeds DRAG_THRESHOLD
      pointerId:   e.pointerId,
    };

    // Capture pointer so we receive events outside the SVG
    try { (e.target).setPointerCapture(e.pointerId); } catch (_) {}

    window.addEventListener('pointermove',   this._onPointerMove, { passive: false });
    window.addEventListener('pointerup',     this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerCancel);
  }

  _onPointerMove(e) {
    if (!this._drag || e.pointerId !== this._drag.pointerId) return;
    e.preventDefault();

    const svgPt = this._svgPoint(e.clientX, e.clientY);
    this._drag.currentSvgX = svgPt.x;
    this._drag.currentSvgY = svgPt.y;

    if (!this._drag.committed) {
      const dx = svgPt.x - this._drag.startSvgX;
      const dy = svgPt.y - this._drag.startSvgY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      // Threshold crossed — commit to drag mode
      this._drag.committed = true;
      this._startGhost(this._drag.fromNode);
      this._showDragHighlights(this._drag.fromNode);
    }

    if (this._ghost) {
      this._ghost.outer.setAttribute('cx', svgPt.x);
      this._ghost.outer.setAttribute('cy', svgPt.y);
      this._ghost.inner.setAttribute('cx', svgPt.x);
      this._ghost.inner.setAttribute('cy', svgPt.y);
    }
  }

  _onPointerUp(e) {
    if (!this._drag || e.pointerId !== this._drag.pointerId) return;
    this._clearDragHighlights();

    if (!this._drag.committed) {
      // Tap that never became a drag — let click handler take it
      this._cleanupListeners();
      this._drag = null;
      return;
    }

    const svgPt  = this._svgPoint(e.clientX, e.clientY);
    const dropNode = this._hitTestNode(svgPt.x, svgPt.y);
    const from   = this._drag.fromNode;

    const result = this._ctrl.handleDrop(from, dropNode);

    if (result === 'move') {
      // Successful move — remove ghost immediately, the real piece
      // will animate via _updatePieces as normal
      this._removeGhost();
    } else {
      // 'shake' or 'cancel' — snap ghost back to origin
      // shake is already triggered inside handleDrop via onShakePiece
      this._snapBack(from);
    }

    this._cleanupListeners();
    this._drag = null;
  }

  _onPointerCancel(e) {
    if (!this._drag || e.pointerId !== this._drag.pointerId) return;
    this._clearDragHighlights();
    this._cancelDrag(false);
  }

  // ─── Ghost piece ─────────────────────────────────────────────────

  _startGhost(nodeId) {
    const pieceEls = this._getPieceEls();
    const piecePos = this._getPiecePos();
    const src      = pieceEls[nodeId];
    if (!src) return;

    const pos    = piecePos[nodeId] ?? this._np[nodeId];
    const player = src.inner.getAttribute('fill') === 'url(#grad-p1)' ? 1 : 2;

    // Create ghost circles directly (not a group clone — avoids id conflicts)
    const outer = document.createElementNS(NS, 'circle');
    this._setAttrs(outer, {
      cx: pos.x, cy: pos.y, r: 12,
      fill: 'none',
      stroke: player === 1 ? '#00aaff' : '#ff6a00',
      'stroke-width': '1.5',
      opacity: String(GHOST_OPACITY),
      'pointer-events': 'none',
    });

    const inner = document.createElementNS(NS, 'circle');
    this._setAttrs(inner, {
      cx: pos.x, cy: pos.y, r: 9,
      fill: player === 1 ? 'url(#grad-p1)' : 'url(#grad-p2)',
      stroke: player === 1 ? '#60c8ff' : '#ffb060',
      'stroke-width': '1',
      opacity: String(GHOST_OPACITY),
      'pointer-events': 'none',
    });

    // Insert ghost above the piece layer but below hit targets
    const hitLayer = this._svg.getElementById
      ? this._svg.querySelector('#hit-layer')
      : document.getElementById('hit-layer');

    this._svg.insertBefore(outer, hitLayer);
    this._svg.insertBefore(inner, hitLayer);
    this._ghost = { outer, inner };

    // Dim the real piece while dragging
    src.outer.setAttribute('opacity', '0.2');
    src.inner.setAttribute('opacity', '0.2');
    this._drag._dimmedNode = nodeId;
  }

  _removeGhost() {
    if (!this._ghost) return;
    this._ghost.outer.remove();
    this._ghost.inner.remove();
    this._ghost = null;
    this._restoreRealPiece();
  }

  _restoreRealPiece() {
    if (!this._drag?._dimmedNode) return;
    const pieceEls = this._getPieceEls();
    const src      = pieceEls[this._drag._dimmedNode];
    if (!src) return;
    src.outer.setAttribute('opacity', '0.6');
    src.inner.setAttribute('opacity', '1');
  }

  /**
   * Animate ghost back to origin position, then remove it.
   */
  _snapBack(fromNode) {
    if (!this._ghost) return;

    const pos      = this._getPiecePos()[fromNode] ?? this._np[fromNode];
    const startX   = parseFloat(this._ghost.inner.getAttribute('cx'));
    const startY   = parseFloat(this._ghost.inner.getAttribute('cy'));
    const endX     = pos.x;
    const endY     = pos.y;
    const ghost    = this._ghost;
    const startTime = performance.now();

    // Restore real piece immediately so it doesn't stay dim
    this._restoreRealPiece();

    const tick = (now) => {
      const t    = Math.min((now - startTime) / SNAP_DURATION, 1);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const cx   = startX + (endX - startX) * ease;
      const cy   = startY + (endY - startY) * ease;
      ghost.outer.setAttribute('cx', cx);
      ghost.outer.setAttribute('cy', cy);
      ghost.inner.setAttribute('cx', cx);
      ghost.inner.setAttribute('cy', cy);
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        ghost.outer.remove();
        ghost.inner.remove();
      }
    };

    this._ghost = null; // detach before animating so _removeGhost won't double-remove
    requestAnimationFrame(tick);
  }

  // ─── Hit testing ─────────────────────────────────────────────────

  /**
   * Find the nearest node whose hit radius contains the point.
   * Returns the node id or null.
   */
  _hitTestNode(x, y) {
    let   best     = null;
    let   bestDist = Infinity;
    const HIT_R    = 26; // slightly larger than R_HIT to be forgiving on touch

    Object.entries(this._np).forEach(([id, pos]) => {
      const d = Math.hypot(x - pos.x, y - pos.y);
      if (d < HIT_R && d < bestDist) {
        bestDist = d;
        best     = id;
      }
    });

    return best;
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  _cancelDrag(silent) {
    if (this._drag?.committed) {
      if (!silent) this._snapBack(this._drag.fromNode);
      else         this._removeGhost();
    }
    this._cleanupListeners();
    this._drag = null;
  }

  _cleanupListeners() {
    window.removeEventListener('pointermove',   this._onPointerMove);
    window.removeEventListener('pointerup',     this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerCancel);
  }

  /** Convert a client-space point to SVG viewBox space. */
  _svgPoint(clientX, clientY) {
    const pt  = this._svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(this._svg.getScreenCTM().inverse());
  }

  _setAttrs(el, map) {
    Object.entries(map).forEach(([k, v]) => el.setAttribute(k, v));
  }
}
