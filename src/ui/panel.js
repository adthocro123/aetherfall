// In-world UI drawn on canvas textures. The same panels serve desktop (aim with the crosshair)
// and VR (aim with the right controller), so talking to Pell works identically in both.
import * as THREE from 'three';
import { S } from '../core/audio.js';

const FONT = "Rajdhani, 'Arial Narrow', sans-serif", MONO = "'JetBrains Mono', Menlo, monospace", SERIF = "Cinzel, Georgia, serif";
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();

export class Panel {
  constructor(w, h, ppm = 620) {
    this.w = w; this.h = h; this.W = Math.round(w * ppm); this.H = Math.round(h * ppm); this.s = ppm / 620;
    this.canvas = document.createElement('canvas'); this.canvas.width = this.W; this.canvas.height = this.H;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.mesh.renderOrder = 30; this.buttons = []; this.hover = -1;
  }
  hit(uv) { const x = uv.x * this.W, y = (1 - uv.y) * this.H; return this.buttons.findIndex(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h); }
  glass(accent = 'rgba(139,232,255,.55)') {
    const g = this.ctx, W = this.W, H = this.H, r = 26 * this.s;
    g.clearRect(0, 0, W, H);
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, 'rgba(10,22,46,.9)'); grd.addColorStop(1, 'rgba(4,10,24,.86)');
    g.fillStyle = grd; round(g, 3, 3, W - 6, H - 6, r); g.fill();
    g.lineWidth = 2.5 * this.s; g.strokeStyle = accent; round(g, 3, 3, W - 6, H - 6, r); g.stroke();
    g.strokeStyle = '#8be8ff'; g.lineWidth = 4 * this.s; const c = 34 * this.s;
    g.beginPath(); g.moveTo(3, c + r * .4); g.lineTo(3, 3 + r * .4); g.quadraticCurveTo(3, 3, 3 + r * .4, 3); g.lineTo(c + r * .4, 3); g.stroke();
    g.beginPath(); g.moveTo(W - 3, H - c - r * .4); g.lineTo(W - 3, H - 3 - r * .4); g.quadraticCurveTo(W - 3, H - 3, W - 3 - r * .4, H - 3); g.lineTo(W - c - r * .4, H - 3); g.stroke();
  }
  commit() { this.tex.needsUpdate = true; }
}
function round(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export function wrap(g, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) { const t = line ? line + ' ' + word : word; if (g.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t; }
    out.push(line);
  }
  return out;
}

/* Aim helper: desktop uses the screen center, VR the right controller's ray. */
export function aimRay(game, ray) {
  if (game.mode === 'vr' && game.xr.ctrl.right) {
    const r = game.xr.ctrl.right.ray; r.getWorldPosition(v1); r.getWorldDirection(v2).negate();
    ray.set(v1, v2);
  } else ray.setFromCamera({ x: 0, y: 0 }, game.camera);
  return ray;
}

export class Dialog {
  constructor(game) {
    this.game = game; this.panel = new Panel(1.36, .74); this.panel.mesh.visible = false; game.scene.add(this.panel.mesh);
    this.open = false; this.queue = []; this.node = null; this.typed = 0; this.shown = -1; this.ray = new THREE.Raycaster(); this.anchor = new THREE.Vector3(); this.speaker = null;
  }
  start(nodes, anchor) {
    if (!nodes || !nodes.length) return;
    this.queue = nodes.slice(); this.anchor.copy(anchor); this.open = true; this.panel.mesh.visible = true;
    this.game.setState('dialog'); this.next(); S.click();
  }
  next() {
    this.node = this.queue.shift() || null;
    if (!this.node) return this.close();
    this.typed = 0; this.shown = -1; this.panel.hover = -1;
  }
  choose(i) {
    const ch = this.node?.choices?.[i]; if (!ch) return;
    S.click();
    const r = ch.act ? ch.act() : null;
    if (Array.isArray(r) && r.length) { this.queue = r; this.next(); } else this.close();
  }
  close() { if (!this.open) return; this.open = false; this.panel.mesh.visible = false; this.node = null; this.game.setState('playing'); }
  advance() {
    const n = this.node; if (!n) return;
    if (this.typed < n.text.length) { this.typed = n.text.length; return; }
    if (n.choices?.length) { if (this.panel.hover >= 0) this.choose(this.panel.hover); return; }
    S.hover(); this.next();
  }
  update(dt) {
    if (!this.open || !this.node) return;
    const g = this.game, p = this.panel, head = g.player.head(v1);
    const pos = v2.copy(this.anchor); pos.y += 2.3; const toHead = head.clone().sub(pos).setY(0).normalize();
    pos.addScaledVector(toHead, .7); pos.x += -toHead.z * .45; pos.z += toHead.x * .45;
    p.mesh.position.copy(pos); p.mesh.lookAt(head);
    const len = this.node.text.length; if (this.typed < len) this.typed = Math.min(len, this.typed + dt * 60);
    const hit = aimRay(g, this.ray).intersectObject(p.mesh)[0];
    const hover = hit ? p.hit(hit.uv) : -1;
    if (hover !== p.hover) { p.hover = hover; if (hover >= 0) S.hover(); this.shown = -1; }
    g.hud.crossHot(hover >= 0);
    if ((this.typed | 0) !== this.shown) { this.shown = this.typed | 0; this.draw(); }
    const inp = g.input, xr = g.xr.state;
    for (let i = 0; i < 3; i++) if (inp.hit(`Digit${i + 1}`) && this.typed >= len) this.choose(i);
    if (inp.clicked(0) || inp.hit('KeyE', 'Enter', 'Space') || xr.right.triggerDown || xr.right.aDown) this.advance();
    if (inp.hit('Escape') || xr.right.bDown) this.close();
  }
  draw() {
    const p = this.panel, g = p.ctx, n = this.node, W = p.W, s = p.s;
    p.glass(); p.buttons = [];
    g.fillStyle = '#ffd9a2'; g.font = `600 ${30 * s}px ${SERIF}`; g.textBaseline = 'top'; g.fillText(n.who.toUpperCase(), 40 * s, 32 * s);
    g.fillStyle = 'rgba(206,224,255,.55)'; g.font = `500 ${16 * s}px ${MONO}`; g.textAlign = 'right'; g.fillText('CARTOGRAPHER · SKYREACH', W - 40 * s, 40 * s); g.textAlign = 'left';
    g.fillStyle = '#eaf2ff'; g.font = `500 ${31 * s}px ${FONT}`;
    const lines = wrap(g, n.text.slice(0, this.typed | 0), W - 80 * s);
    lines.forEach((l, i) => g.fillText(l, 40 * s, (88 + i * 38) * s));
    const done = this.typed >= n.text.length;
    if (done && n.choices?.length) {
      const bh = 50 * s, gap = 10 * s; let y = p.H - 28 * s - n.choices.length * (bh + gap) + gap;
      n.choices.forEach((c, i) => {
        const b = { x: 36 * s, y, w: W - 72 * s, h: bh }; p.buttons.push(b);
        const hot = i === p.hover;
        g.fillStyle = hot ? 'rgba(255,206,140,.28)' : 'rgba(139,232,255,.08)'; round(g, b.x, b.y, b.w, b.h, 14 * s); g.fill();
        g.strokeStyle = hot ? 'rgba(255,217,162,.95)' : 'rgba(139,232,255,.35)'; g.lineWidth = 2 * s; round(g, b.x, b.y, b.w, b.h, 14 * s); g.stroke();
        g.fillStyle = hot ? '#fff' : '#dbe8ff'; g.font = `600 ${25 * s}px ${FONT}`; g.textBaseline = 'middle';
        g.fillText(`${i + 1}   ${c.label}`, b.x + 22 * s, b.y + b.h / 2 + 1); g.textBaseline = 'top';
        y += bh + gap;
      });
    } else if (done) {
      g.fillStyle = 'rgba(139,232,255,.85)'; g.font = `500 ${17 * s}px ${MONO}`; g.textAlign = 'right';
      g.fillText(this.game.mode === 'vr' ? 'TRIGGER ▸' : 'CLICK OR E ▸', W - 40 * s, p.H - 50 * s); g.textAlign = 'left';
    }
    p.commit();
  }
}

/* VR-only pieces: the wrist display, floating prompts and the pause menu. */
export class WristPanel {
  constructor(game) { this.game = game; this.panel = new Panel(.17, .11, 2400); this.panel.mesh.renderOrder = 31; this.key = ''; this.t = 0; }
  attach(parent) { parent.add(this.panel.mesh); this.panel.mesh.position.set(0, .06, .12); this.panel.mesh.rotation.set(-Math.PI / 2.4, 0, 0); }
  update(dt) {
    this.t -= dt; if (this.t > 0) return; this.t = .12;
    const g = this.game, pl = g.player, q = g.quests.objective();
    const key = [pl.level, pl.hp | 0, pl.ae | 0, pl.shards, q?.text].join('|'); if (key === this.key) return; this.key = key;
    const p = this.panel, c = p.ctx, W = p.W, H = p.H;
    p.glass();
    c.fillStyle = '#eaf2ff'; c.font = `700 ${26 * p.s}px ${FONT}`; c.textBaseline = 'top'; c.fillText(`LV ${pl.level}`, 26 * p.s, 22 * p.s);
    c.fillStyle = '#ffd9a2'; c.textAlign = 'right'; c.fillText(`◆ ${pl.shards}`, W - 26 * p.s, 22 * p.s); c.textAlign = 'left';
    const bar = (y, k, a, b) => { c.fillStyle = 'rgba(255,255,255,.1)'; round(c, 26 * p.s, y, W - 52 * p.s, 16 * p.s, 8 * p.s); c.fill(); const grd = c.createLinearGradient(0, 0, W, 0); grd.addColorStop(0, a); grd.addColorStop(1, b); c.fillStyle = grd; round(c, 26 * p.s, y, Math.max(16 * p.s, (W - 52 * p.s) * k), 16 * p.s, 8 * p.s); c.fill(); };
    bar(68 * p.s, pl.hp / pl.maxHp, '#3fdc93', '#c4ff8e'); bar(96 * p.s, pl.ae / pl.maxAe, '#3b84ff', '#8be8ff');
    c.fillStyle = 'rgba(222,234,255,.8)'; c.font = `500 ${15 * p.s}px ${FONT}`;
    wrap(c, q ? q.text : '', W - 52 * p.s).slice(0, 3).forEach((l, i) => c.fillText(l, 26 * p.s, (130 + i * 19) * p.s));
    p.commit();
  }
}

export class VRMenu {
  constructor(game) { this.game = game; this.panel = new Panel(.9, .8); this.panel.mesh.visible = false; game.scene.add(this.panel.mesh); this.open = false; this.ray = new THREE.Raycaster(); }
  items() {
    const g = this.game, s = g.settings;
    return [
      { label: 'Resume', act: () => this.toggle(false) },
      { label: `Snap turn: ${s.snap}°`, act: () => { s.snap = s.snap === 30 ? 45 : s.snap === 45 ? 60 : 30; g.saveSettings(); } },
      { label: `Comfort vignette: ${s.vignette ? 'On' : 'Off'}`, act: () => { s.vignette = !s.vignette; g.saveSettings(); } },
      { label: `Sword angle: ${s.swordAngle}°`, act: () => { s.swordAngle = s.swordAngle >= 45 ? -45 : s.swordAngle + 15; g.hands.applyAngle(); g.saveSettings(); } },
      { label: 'Log out', act: () => { this.toggle(false); g.logoutGag(); } },
      { label: 'Exit VR', act: () => { this.toggle(false); g.xr.exit(); } },
    ];
  }
  toggle(on = !this.open) {
    this.open = on; this.panel.mesh.visible = on;
    if (on) { const g = this.game, head = g.player.head(v1), f = g.player.forward(v2).setY(0).normalize(); this.panel.mesh.position.copy(head).addScaledVector(f, 1.1); this.panel.mesh.position.y -= .1; this.panel.mesh.lookAt(head); this.draw(); }
    this.game.setState(on ? 'menu' : 'playing');
  }
  update() {
    if (!this.open) return;
    const g = this.game, hit = aimRay(g, this.ray).intersectObject(this.panel.mesh)[0], hv = hit ? this.panel.hit(hit.uv) : -1;
    if (hv !== this.panel.hover) { this.panel.hover = hv; this.draw(); if (hv >= 0) S.hover(); }
    if (g.xr.state.right.triggerDown && hv >= 0) { S.click(); this.items()[hv].act(); if (this.open) this.draw(); }
  }
  draw() {
    const p = this.panel, g = p.ctx, s = p.s; p.glass(); p.buttons = [];
    g.fillStyle = '#ffd9a2'; g.font = `600 ${30 * s}px ${SERIF}`; g.textBaseline = 'top'; g.fillText('AETHERFALL', 40 * s, 30 * s);
    this.items().forEach((it, i) => {
      const b = { x: 36 * s, y: (90 + i * 64) * s, w: p.W - 72 * s, h: 54 * s }; p.buttons.push(b);
      const hot = i === p.hover;
      g.fillStyle = hot ? 'rgba(255,206,140,.28)' : 'rgba(139,232,255,.08)'; round(g, b.x, b.y, b.w, b.h, 14 * s); g.fill();
      g.fillStyle = hot ? '#fff' : '#dbe8ff'; g.font = `600 ${27 * s}px ${FONT}`; g.textBaseline = 'middle'; g.fillText(it.label, b.x + 24 * s, b.y + b.h / 2); g.textBaseline = 'top';
    });
    p.commit();
  }
}

export class FloatText {
  constructor(game, w = 1.6, h = .34) { this.game = game; this.panel = new Panel(w, h, 500); this.panel.mesh.visible = false; game.scene.add(this.panel.mesh); this.t = 0; this.text = ''; }
  show(title, sub = '', dur = 3.2, place = null) {
    const p = this.panel, g = p.ctx, s = p.s; g.clearRect(0, 0, p.W, p.H);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 16 * s;
    g.fillStyle = '#ffffff'; g.font = `600 ${74 * s}px ${SERIF}`; g.fillText(title.toUpperCase(), p.W / 2, p.H * .42);
    if (sub) { g.fillStyle = '#ffd9a2'; g.font = `600 ${28 * s}px ${FONT}`; g.fillText(sub.toUpperCase(), p.W / 2, p.H * .82); }
    g.shadowBlur = 0; p.commit();
    this.t = dur; this.dur = dur; p.mesh.visible = true; this.place = place;
    this.position();
  }
  position() {
    const g = this.game, head = g.player.head(v1), f = g.player.forward(v2).setY(0).normalize();
    if (this.place) this.panel.mesh.position.copy(this.place); else this.panel.mesh.position.copy(head).addScaledVector(f, 2.4).setY(head.y + .35);
    this.panel.mesh.lookAt(head);
  }
  update(dt) {
    if (this.t <= 0) return;
    this.t -= dt; const k = Math.min(1, (this.dur - this.t) * 2, this.t * 1.5);
    this.panel.mesh.material.opacity = Math.max(0, k); if (!this.place) this.position();
    if (this.t <= 0) this.panel.mesh.visible = false;
  }
}
