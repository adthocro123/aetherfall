// Your two hands. Right: the aether blade. Left: bolts and the hex shield.
// On desktop the hands are posed in front of the camera and swings are animated;
// in VR they ride the controllers and the blade hits whatever you physically swing it through.
// Both paths feed the same sweep test, so desktop play exercises the VR combat code.
import * as THREE from 'three';
import { clamp, easeInOut, easeOut, damp } from '../core/util.js';
import { S } from '../core/audio.js';
import { BLADE_TIERS } from './player.js';

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
const FWD = new THREE.Vector3(0, 0, -1);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const dirQ = (d, out = new THREE.Quaternion()) => out.setFromUnitVectors(FWD, v1.copy(d).normalize());

// Camera-space keyframes: hand position and blade direction at start, middle and end of each swing.
const SWINGS = [
  { p: [V(.44, -.04, -.32), V(.02, -.1, -.62), V(-.46, -.2, -.34)], d: [V(.95, .3, .45), V(-.08, .06, -1), V(-.9, -.15, .4)], dur: .22, power: 1 },
  { p: [V(-.4, -.26, -.34), V(0, -.06, -.62), V(.44, .12, -.32)], d: [V(-.85, -.35, .3), V(.15, .15, -1), V(.9, .45, .25)], dur: .22, power: 1 },
  { p: [V(.14, .34, -.2), V(.06, .02, -.62), V(.02, -.42, -.42)], d: [V(.05, 1, .55), V(0, .22, -1), V(0, -.85, -.5)], dur: .3, power: 1.65 },
];
const REST = { p: V(.3, -.35, -.46), d: V(.3, .7, -.65) };
const LEFT_REST = V(-.32, -.33, -.48), LEFT_SHIELD = V(-.06, -.14, -.42), LEFT_CAST = V(-.18, -.16, -.62);

function bezier(out, a, b, c, t) { // passes through b at t = .5
  const cx = 2 * b.x - (a.x + c.x) / 2, cy = 2 * b.y - (a.y + c.y) / 2, cz = 2 * b.z - (a.z + c.z) / 2, u = 1 - t;
  return out.set(u * u * a.x + 2 * u * t * cx + t * t * c.x, u * u * a.y + 2 * u * t * cy + t * t * c.y, u * u * a.z + 2 * u * t * cz + t * t * c.z);
}

function makeSword(tier) {
  const g = new THREE.Group(), t = BLADE_TIERS[tier];
  const leather = new THREE.MeshLambertMaterial({ color: 0x3a2a2a, flatShading: true }), gold = new THREE.MeshLambertMaterial({ color: 0xd9a84e, emissive: 0x4a2c08, flatShading: true });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(.021, .024, .17, 6).rotateX(Math.PI / 2), leather); g.add(grip);
  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(.035, 0), gold); pommel.position.z = .1; g.add(pommel);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(.2, .03, .045), gold); guard.position.z = -.095; g.add(guard);
  const bladeGeo = new THREE.CylinderGeometry(.004, .034, 1.0, 6).scale(1, 1, .3).rotateX(-Math.PI / 2).translate(0, 0, -.62);
  const bladeMat = new THREE.MeshLambertMaterial({ color: t.color, emissive: t.glow, emissiveIntensity: .7, flatShading: true });
  const blade = new THREE.Mesh(bladeGeo, bladeMat); g.add(blade);
  const shellMat = new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(t.color) }, uK: { value: .6 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vZ; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); vZ = position.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uC; uniform float uK; varying vec3 vN; varying vec3 vV; varying float vZ; void main(){ float f = pow(1. - abs(dot(vN, vV)), 2.); gl_FragColor = vec4(uC * (f * 1.4 + .25) * uK * smoothstep(-1.15, -.9, vZ) , 1.); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false,
  });
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(.012, .055, 1.04, 6).scale(1, 1, .45).rotateX(-Math.PI / 2).translate(0, 0, -.62), shellMat); g.add(shell);
  const base = new THREE.Object3D(); base.position.z = -.14; g.add(base);
  const tip = new THREE.Object3D(); tip.position.z = -1.12; g.add(tip);
  return { group: g, base, tip, bladeMat, shellMat };
}
function makeGauntlet(left) {
  const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: 0x4a3f5c, flatShading: true }), trim = new THREE.MeshLambertMaterial({ color: 0xd9a84e, emissive: 0x3a2208, flatShading: true });
  const hand = new THREE.Mesh(new THREE.BoxGeometry(.085, .075, .11), m); g.add(hand);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.052, .046, .14, 7).rotateX(Math.PI / 2), m); cuff.position.z = .12; g.add(cuff);
  const band = new THREE.Mesh(new THREE.TorusGeometry(.054, .009, 4, 14), trim); band.position.z = .06; g.add(band);
  if (left) {
    const rune = new THREE.Mesh(new THREE.CircleGeometry(.03, 16), new THREE.MeshBasicMaterial({ color: 0x8be8ff, toneMapped: false }));
    rune.position.set(0, -.039, -.01); rune.rotation.x = Math.PI / 2; g.add(rune); g.userData.rune = rune;
  }
  return g;
}
function makeShield() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uHit: { value: 0 } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform float uTime, uK, uHit; varying vec2 vP;
      float hex(vec2 p){ p = abs(p); return max(p.x * .866 + p.y * .5, p.y); }
      void main(){ float r = hex(vP) / .44;
        vec2 g = vP * 14.; vec2 h = vec2(g.x + g.y * .577, g.y * 1.155); vec2 f = fract(h) - .5;
        float cell = smoothstep(.42, .5, max(abs(f.x), abs(f.y)));
        float edge = smoothstep(.86, 1., r) * (1. - smoothstep(1., 1.03, r));
        float a = (edge * 1.4 + cell * .25 + .08 + uHit * .6) * (1. - smoothstep(1., 1.04, r)) * uK;
        a *= .8 + .2 * sin(uTime * 6. + r * 9.);
        gl_FragColor = vec4(vec3(.45, .9, 1.) * a, 1.); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide, toneMapped: false,
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(.46, 6), mat);
  m.visible = false; m.renderOrder = 6;
  return m;
}

class Trail {
  constructor(scene, n = 22) {
    this.n = n; this.samples = [];
    const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 2 * 3), al = new Float32Array(n * 2), idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aA', new THREE.BufferAttribute(al, 1)); g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uC: { value: new THREE.Color(0x9fe8ff) } },
      vertexShader: `attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform vec3 uC; varying float vA; void main(){ gl_FragColor = vec4(uC * vA * vA * .9, 1.); }`,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; scene.add(this.mesh);
    this.geo = g;
  }
  update(base, tip, add, t) {
    if (add) this.samples.unshift({ b: base.clone(), t: tip.clone(), time: t });
    while (this.samples.length > this.n || (this.samples.length && t - this.samples[this.samples.length - 1].time > .16)) this.samples.pop();
    const pos = this.geo.attributes.position.array, al = this.geo.attributes.aA.array, s = this.samples;
    for (let i = 0; i < this.n; i++) {
      const smp = s[Math.min(i, s.length - 1)];
      if (!smp) { al[i * 2] = al[i * 2 + 1] = 0; continue; }
      const k = i < s.length ? Math.max(0, 1 - (t - smp.time) / .16) * (1 - i / this.n) : 0;
      v1.lerpVectors(smp.b, smp.t, .35);
      pos.set([v1.x, v1.y, v1.z, smp.t.x, smp.t.y, smp.t.z], i * 6);
      al[i * 2] = k * .15; al[i * 2 + 1] = k;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aA.needsUpdate = true;
  }
}

export class Hands {
  constructor(game) {
    this.game = game; this.mode = 'desktop';
    this.right = new THREE.Group(); this.left = new THREE.Group();
    this.tier = -1; this.setTier(0);
    this.gauntR = makeGauntlet(false); this.right.add(this.gauntR);
    this.gauntL = makeGauntlet(true); this.left.add(this.gauntL);
    this.shield = makeShield(); this.left.add(this.shield); this.shield.position.set(0, 0, -.18);
    this.base = new THREE.Vector3(); this.tip = new THREE.Vector3(); this.prevBase = new THREE.Vector3(); this.prevTip = new THREE.Vector3();
    this.speed = 0; this.swingId = 0; this.fast = false; this.power = 1; this.lastWhoosh = 0;
    this.swing = null; this.queued = false; this.combo = 0; this.lastSwing = -9; this.cast = 0; this.boltCd = 0; this.shieldK = 0;
    this.trail = new Trail(game.scene);
    this.xr = { left: null, right: null };
    this.attachDesktop();
  }
  setTier(t) {
    if (t === this.tier) return;
    if (this.sword) this.right.remove(this.sword.group);
    this.tier = t; this.sword = makeSword(t); this.right.add(this.sword.group);
    if (this.trail) this.trail.mat.uniforms.uC.value.set(BLADE_TIERS[t].color);
    this.applyAngle();
  }
  applyAngle() {
    if (!this.sword) return;
    this.sword.group.rotation.set(this.mode === 'vr' ? (this.game.settings?.swordAngle ?? 0) * Math.PI / 180 : 0, 0, 0);
  }
  attachDesktop() {
    this.mode = 'desktop';
    const cam = this.game.camera;
    cam.add(this.right); cam.add(this.left);
    this.right.position.copy(REST.p); dirQ(REST.d, this.right.quaternion);
    this.left.position.copy(LEFT_REST); this.left.quaternion.identity();
    this.gauntR.visible = true; this.applyAngle();
  }
  attachVR(hand, ray, grip) {
    this.mode = 'vr'; this.xr[hand] = { ray, grip };
    const obj = hand === 'left' ? this.left : this.right;
    obj.position.set(0, 0, 0); obj.quaternion.identity();
    (hand === 'left' ? ray : grip).add(obj);
    this.applyAngle();
  }
  shieldCenter(out) { return this.shield.getWorldPosition(out); }
  shieldNormal(out) { this.shield.getWorldDirection(out); return out.negate(); }
  shieldFaces(from) {
    const c = this.shieldCenter(v1), n = this.shieldNormal(v2), d = from.clone().sub(c);
    if (this.game.mode !== 'vr') { n.copy(this.game.player.forward(v2)); }
    d.y *= .4; return n.setY(n.y * .4).normalize().dot(d.normalize()) > .3;
  }
  shieldBlocks(p, r) {
    if (!this.game.player.shieldUp) return false;
    const c = this.shieldCenter(v1); if (c.distanceTo(p) > .75 + r) return false;
    return this.shieldFaces(p);
  }

  startSwing() {
    const now = this.game.time;
    if (this.swing) { if (this.swing.t > this.swing.windup + this.swing.dur * .35) this.queued = true; return; }
    this.combo = now - this.lastSwing < .45 ? (this.combo + 1) % 3 : 0;
    const sw = SWINGS[this.combo];
    this.swing = { sw, t: 0, windup: .07, dur: sw.dur, recover: .18, fromP: this.right.position.clone(), fromQ: this.right.quaternion.clone() };
    this.swingId++; this.power = sw.power;
    S.swing(sw.power > 1.2 ? 9 : 6.5);
  }

  castBolt() {
    const g = this.game, pl = g.player;
    if (this.boltCd > 0) return;
    if (!pl.useAe(12)) { g.hud.toast('Not enough aether', 'dim'); S.deny(); return; }
    this.boltCd = .38; this.cast = .22;
    const origin = this.left.getWorldPosition(new THREE.Vector3());
    let dir;
    if (this.mode === 'vr') { dir = new THREE.Vector3(); this.left.getWorldDirection(dir).negate(); }
    else { const head = pl.head(v1), f = pl.forward(v2); dir = head.addScaledVector(f, 40).sub(origin).normalize(); origin.addScaledVector(f, .15); }
    g.combat.playerBolt(origin, dir);
    g.fx.burst(origin, { n: 10, speed: 2, color: 0x8be8ff, size: .18, life: .3, grav: 0 });
    g.haptic('left', .5, 40);
  }

  update(dt) {
    const g = this.game, pl = g.player, playing = g.state === 'playing' && pl.alive;
    this.boltCd = Math.max(0, this.boltCd - dt); this.cast = Math.max(0, this.cast - dt);
    this.prevBase.copy(this.base); this.prevTip.copy(this.tip);
    let active = false;
    if (this.mode === 'desktop') active = this.animateDesktop(dt, playing);
    const want = playing && (this.mode === 'vr' ? g.xr.state.left.squeeze : g.input.down('KeyQ')) && pl.ae > 1;
    if (want && !pl.shieldUp) S.shieldUp();
    pl.shieldUp = want;
    this.shieldK = damp(this.shieldK, want ? 1 : 0, 14, dt);
    this.shield.visible = this.shieldK > .02; this.shield.scale.setScalar(.6 + this.shieldK * .4);
    this.shield.material.uniforms.uK.value = this.shieldK; this.shield.material.uniforms.uTime.value = g.time;
    this.shield.material.uniforms.uHit.value = Math.max(0, this.shield.material.uniforms.uHit.value - dt * 3);

    this.sword.base.getWorldPosition(this.base); this.sword.tip.getWorldPosition(this.tip);
    const raw = dt > 0 ? this.tip.distanceTo(this.prevTip) / dt : 0;
    this.speed = raw > 60 ? 0 : raw;
    if (this.mode === 'vr') {
      const fast = this.speed > 2.4;
      if (fast && !this.fast) { this.swingId++; this.power = 1; }
      if (fast && this.speed > 4 && g.time - this.lastWhoosh > .35) { S.swing(this.speed, this.tip); this.lastWhoosh = g.time; }
      this.fast = fast; active = fast && playing;
    }
    if (active && this.prevTip.lengthSq() > 0) g.combat.sweep(this);
    if (this.assistNext) { this.assistNext = false; if (playing) g.combat.assist(this); }
    this.trail.update(this.base, this.tip, active && this.speed > 3, g.time);
    this.sword.shellMat.uniforms.uK.value = damp(this.sword.shellMat.uniforms.uK.value, active ? 1.2 : .55, 10, dt);
    if (this.gauntL.userData.rune) this.gauntL.userData.rune.scale.setScalar(1 + this.cast * 4 + (pl.ae / pl.maxAe) * .2);
  }

  animateDesktop(dt, playing) {
    const g = this.game, pl = g.player, R = this.right, L = this.left;
    if (playing && g.input.clicked(0) && !g.dialog.open) this.startSwing();
    if (playing && g.input.clicked(2) && !g.dialog.open) this.castBolt();
    let active = false;
    if (this.swing) {
      const s = this.swing, sw = s.sw; s.t += dt;
      if (s.t < s.windup) {
        const k = easeOut(s.t / s.windup);
        R.position.lerpVectors(s.fromP, sw.p[0], k); R.quaternion.slerpQuaternions(s.fromQ, dirQ(sw.d[0], q1), k);
      } else if (s.t < s.windup + s.dur) {
        const k = easeInOut((s.t - s.windup) / s.dur);
        bezier(R.position, sw.p[0], sw.p[1], sw.p[2], k);
        if (k < .5) R.quaternion.slerpQuaternions(dirQ(sw.d[0], q1), dirQ(sw.d[1], q2), k * 2);
        else R.quaternion.slerpQuaternions(dirQ(sw.d[1], q1), dirQ(sw.d[2], q2), k * 2 - 1);
        active = k > .08 && k < .92;
        if (!s.assisted && k > .42) { s.assisted = true; this.assistNext = true; }
      } else if (this.queued) {
        this.queued = false; this.lastSwing = g.time; this.swing = null; this.startSwing();
      } else {
        const k = easeInOut(clamp((s.t - s.windup - s.dur) / s.recover));
        R.position.lerpVectors(sw.p[2], REST.p, k); R.quaternion.slerpQuaternions(dirQ(sw.d[2], q1), dirQ(REST.d, q2), k);
        if (k >= 1) { this.swing = null; this.lastSwing = g.time; }
      }
    } else {
      const sp = Math.hypot(pl.vel.x, pl.vel.z), b = pl.bob;
      v2.copy(REST.p); v2.x += Math.sin(b) * .012 * Math.min(1, sp / 4); v2.y += Math.cos(b * 2) * .01 * Math.min(1, sp / 4) + Math.sin(g.time * 1.6) * .004;
      R.position.lerp(v2, 1 - Math.exp(-14 * dt)); R.quaternion.slerp(dirQ(REST.d, q1), 1 - Math.exp(-14 * dt));
    }
    const lt = pl.shieldUp ? LEFT_SHIELD : this.cast > 0 ? LEFT_CAST : LEFT_REST;
    L.position.lerp(lt, 1 - Math.exp(-(this.cast > 0 ? 30 : 12) * dt));
    L.rotation.set(pl.shieldUp ? 0 : -.2, pl.shieldUp ? 0 : .3, 0);
    return active;
  }
}
