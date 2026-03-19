/**
 * Asterisk — Confetti Celebration
 * Canvas-based particle burst. Self-contained, no external deps.
 * Call play(winner) to trigger; stop() to cancel early.
 */

const COLORS = {
  1: ['#7F77DD', '#AFA9EC', '#534AB7', '#EEEDFE', '#FAC775'], // player 1 purple
  2: ['#1D9E75', '#5DCAA5', '#0F6E56', '#E1F5EE', '#FAC775'], // player 2 green
};

const PARTICLE_COUNT = 65;
const DURATION_FRAMES = 160;

export class Confetti {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');
    this._raf    = null;
  }

  /**
   * Triggers the confetti burst for the winning player.
   * @param {number} winner  1 or 2
   */
  play(winner) {
    this.stop();
    const { width: W, height: H } = this._canvas;
    const colors = COLORS[winner] ?? COLORS[1];

    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x:     Math.random() * W,
      y:     -10 - Math.random() * 30,
      vx:    (Math.random() - 0.5) * 3,
      vy:    2 + Math.random() * 3,
      w:     5 + Math.random() * 6,
      h:     3 + Math.random() * 4,
      rot:   Math.random() * Math.PI * 2,
      vrot:  (Math.random() - 0.5) * 0.18,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
    }));

    this._canvas.style.display = 'block';
    let frame = 0;

    const tick = () => {
      this._ctx.clearRect(0, 0, W, H);

      particles.forEach(p => {
        p.x   += p.vx;
        p.y   += p.vy;
        p.rot += p.vrot;
        if (frame > 80) p.alpha = Math.max(0, p.alpha - 0.015);

        this._ctx.save();
        this._ctx.translate(p.x, p.y);
        this._ctx.rotate(p.rot);
        this._ctx.globalAlpha = p.alpha;
        this._ctx.fillStyle   = p.color;
        this._ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        this._ctx.restore();
      });

      frame++;
      if (frame < DURATION_FRAMES) {
        this._raf = requestAnimationFrame(tick);
      } else {
        this._cleanup();
      }
    };

    this._raf = requestAnimationFrame(tick);
  }

  /** Cancels an in-progress animation. */
  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._cleanup();
  }

  _cleanup() {
    this._raf = null;
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    this._canvas.style.display = 'none';
  }
}
