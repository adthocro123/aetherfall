// Particles, shockwave rings and floating damage numbers. One draw call for all particles.
import * as THREE from 'three';
import { glowScale } from '../world/props.js';

const MAX = 3000;
const tmpC = new THREE.Color();

export class FX {
  constructor(game) {
    this.game = game;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3); this.col = new Float32Array(MAX * 3); this.size = new Float32Array(MAX); this.alpha = new Float32Array(MAX);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uTex: { value: game.tex.glow }, uScale: glowScale },
      vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;
        void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = aSize * uScale / max(.05, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA; void main(){ float a = texture2D(uTex, gl_PointCoord).a * vA; if (a < .004) discard; gl_FragColor = vec4(vC * a, 1.); }`,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false,
    }));
    this.points.frustumCulled = false; this.points.renderOrder = 5;
    game.scene.add(this.points);
    this.v = new Float32Array(MAX * 3); this.life = new Float32Array(MAX); this.maxLife = new Float32Array(MAX); this.s0 = new Float32Array(MAX);
    this.drag = new Float32Array(MAX); this.grav = new Float32Array(MAX);
    this.next = 0;
    this.rings = [];
    this.numbers = new Numbers(game);
  }
  emit(x, y, z, vx, vy, vz, life, size, color, drag = 2, grav = 0) {
    const i = this.next; this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    tmpC.set(color); this.col[i * 3] = tmpC.r; this.col[i * 3 + 1] = tmpC.g; this.col[i * 3 + 2] = tmpC.b;
    this.life[i] = this.maxLife[i] = life; this.s0[i] = size; this.drag[i] = drag; this.grav[i] = grav;
  }
  burst(p, { n = 20, speed = 4, color = 0x8be8ff, size = .25, life = .6, grav = -4, drag = 2.5, up = 0, dir = null, spread = 1, jitter = .5 } = {}) {
    for (let i = 0; i < n; i++) {
      let x = Math.random() * 2 - 1, y = Math.random() * 2 - 1, z = Math.random() * 2 - 1;
      const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
      if (dir) { x = dir.x + x * spread; y = dir.y + y * spread; z = dir.z + z * spread; const m = Math.hypot(x, y, z) || 1; x /= m; y /= m; z /= m; }
      const s = speed * (1 - jitter + Math.random() * jitter * 2);
      this.emit(p.x, p.y, p.z, x * s, y * s + up, z * s, life * (.6 + Math.random() * .8), size * (.6 + Math.random() * .8), color, drag, grav);
    }
  }
  sparks(p, dir, color = 0xfff2c0, n = 14) { this.burst(p, { n, speed: 7, color, size: .14, life: .35, grav: -9, drag: 3, dir, spread: .9 }); this.burst(p, { n: 2, speed: 0, color, size: .9, life: .12, grav: 0 }); }
  shatter(p, color = 0x8be8ff, scale = 1) {
    this.burst(p, { n: 46 * scale, speed: 5.5 * scale, color, size: .3, life: .9, grav: -5, drag: 2 });
    this.burst(p, { n: 22 * scale, speed: 1.5, color: 0xffffff, size: .22, life: 1.8, grav: 1.2, drag: 1, up: 1 });
    this.burst(p, { n: 2, speed: 0, color, size: 2.6 * scale, life: .25, grav: 0 });
  }
  motes(p, n = 10, color = 0x8be8ff) { this.burst(p, { n, speed: .8, color, size: .2, life: 1.6, grav: 1.4, drag: 1, up: .8 }); }
  ring(p, { radius = 8, life = .9, color = 0x8be8ff, width = .25, y = .12 } = {}) {
    const m = new THREE.Mesh(new THREE.RingGeometry(1 - width, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.position.set(p.x, p.y + y, p.z); m.scale.setScalar(.3); this.game.scene.add(m);
    this.rings.push({ m, t: 0, life, radius });
    return m;
  }
  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]), d = Math.exp(-this.drag[i] * dt), j = i * 3;
      this.v[j] *= d; this.v[j + 1] = this.v[j + 1] * d + this.grav[i] * dt; this.v[j + 2] *= d;
      this.pos[j] += this.v[j] * dt; this.pos[j + 1] += this.v[j + 1] * dt; this.pos[j + 2] += this.v[j + 2] * dt;
      this.alpha[i] = k < .7 ? k / .7 : 1; this.size[i] = this.s0[i] * (.4 + .6 * k);
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt; const k = r.t / r.life;
      r.m.scale.setScalar(.3 + (r.radius - .3) * (1 - Math.pow(1 - k, 2))); r.m.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { this.game.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    this.numbers.update(dt);
  }
}

class Numbers {
  constructor(game) {
    this.game = game; this.pool = []; this.i = 0;
    for (let k = 0; k < 28; k++) {
      const c = document.createElement('canvas'); c.width = 192; c.height = 96;
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      s.visible = false; s.renderOrder = 20; s.scale.set(.6, .3, 1); game.scene.add(s);
      this.pool.push({ s, c, t, life: 0, vy: 0 });
    }
  }
  spawn(p, value, { crit = false, color = '#ffffff', text = null } = {}) {
    const n = this.pool[this.i]; this.i = (this.i + 1) % this.pool.length;
    const g = n.c.getContext('2d'); g.clearRect(0, 0, 192, 96);
    g.font = `700 ${crit ? 64 : 52}px Rajdhani, 'Arial Narrow', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = 'rgba(10,14,30,.75)'; const s = text ?? String(Math.round(value));
    g.strokeText(s, 96, 50); g.fillStyle = crit ? '#ffd27a' : color; g.fillText(s, 96, 50);
    n.t.needsUpdate = true; n.s.visible = true; n.life = 1; n.vy = 1.2 + Math.random() * .4;
    n.s.position.set(p.x + (Math.random() - .5) * .3, p.y + .2, p.z + (Math.random() - .5) * .3);
    const k = crit ? 1.3 : 1; n.s.scale.set(.62 * k, .31 * k, 1); n.s.material.opacity = 1;
  }
  update(dt) {
    for (const n of this.pool) {
      if (n.life <= 0) continue;
      n.life -= dt * 1.1; n.s.position.y += n.vy * dt; n.vy *= Math.exp(-2.5 * dt);
      n.s.material.opacity = Math.min(1, n.life * 2.5);
      if (n.life <= 0) n.s.visible = false;
    }
  }
}
