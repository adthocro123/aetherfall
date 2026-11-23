// Keyboard and mouse. Pointer lock when the browser allows it; drag-to-look when it doesn't.
export class Input {
  constructor(game) {
    this.game = game; this.keys = new Set(); this.edges = new Set();
    this.mdx = 0; this.mdy = 0; this.clicks = [0, 0, 0]; this.held = [false, false, false];
    this.locked = false; this.lockFailed = false; this.drag = null; this.sens = 1; this.invert = false;
    const c = game.canvas;
    const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
    addEventListener('keydown', e => {
      if (typing(e)) return;
      if (!e.repeat) this.edges.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code) && game.state !== 'landing') e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.held = [false, false, false]; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === c;
      game.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
    c.addEventListener('mousedown', e => {
      if (game.state === 'landing') return;
      if (!this.locked && !this.lockFailed && game.wantsLock()) { this.lock(); return; }
      if (this.locked) { this.clicks[e.button] = (this.clicks[e.button] || 0) + 1; this.held[e.button] = true; return; }
      this.drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
      this.held[e.button] = true;
    });
    addEventListener('mousemove', e => {
      if (this.locked) { this.mdx += e.movementX; this.mdy += e.movementY; return; }
      if (this.drag) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        this.drag.moved += Math.abs(dx) + Math.abs(dy); this.drag.x = e.clientX; this.drag.y = e.clientY;
        this.mdx += dx * 1.6; this.mdy += dy * 1.6;
      }
      this.mouseX = e.clientX; this.mouseY = e.clientY;
    });
    addEventListener('mouseup', e => {
      this.held[e.button] = false;
      if (this.drag && this.drag.button === e.button) { if (this.drag.moved < 8) this.clicks[e.button] = (this.clicks[e.button] || 0) + 1; this.drag = null; }
    });
    c.addEventListener('contextmenu', e => e.preventDefault());
  }
  lock() {
    const c = this.game.canvas;
    try {
      const p = c.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { const q = c.requestPointerLock(); if (q && q.catch) q.catch(() => { this.lockFailed = true; }); } catch { this.lockFailed = true; } });
    } catch { try { c.requestPointerLock(); } catch { this.lockFailed = true; } }
    setTimeout(() => { if (!this.locked && document.hasFocus()) this.lockFailed = true; }, 900);
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(code) { return this.keys.has(code); }
  hit(...codes) { return codes.some(c => this.edges.has(c)); }
  move() {
    const k = c => this.keys.has(c) ? 1 : 0;
    let x = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft'), y = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown');
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  get sprint() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
  look() { return { x: this.mdx * this.sens, y: this.mdy * this.sens * (this.invert ? -1 : 1) }; }
  clicked(b) { return this.clicks[b] > 0; }
  endFrame() { this.edges.clear(); this.clicks = [0, 0, 0]; this.mdx = this.mdy = 0; }
}
