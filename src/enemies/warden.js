// The Stone Warden, guardian of the First Chain.
// Its body shrugs off blades. Make it slam: its fists stick in the arena and its chest opens.
// Strike the exposed core. Its orb volleys can be swung straight back at it.
import * as THREE from 'three';
import { Enemy, mat } from './enemy.js';
import { S } from '../core/audio.js';
import { hash2, TAU, damp, clamp } from '../core/util.js';

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();

function stone(w, h, d, seed) {
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = hash2(Math.round(x * 50) + Math.round(z * 50) * 13, Math.round(y * 50), seed);
    p.setXYZ(i, x * (.94 + k * .12), y * (.95 + k * .08), z * (.94 + (1 - k) * .12));
  }
  g.computeVertexNormals();
  return g;
}

export class Warden extends Enemy {
  static def = { name: 'The Stone Warden', hp: 1400, radius: 2.1, height: 3.2, xp: 400, shards: 60, material: 'stone', spark: 0xffe0a0, speed: 2.1, knock: 0, staggerable: false, burst: 2.6, deathTime: 2.8 };
  build() {
    const rock = mat(0xb3afc4, 0x1a1830, 1), dark = mat(0x7d7894, 0x120f22, 1), moss = mat(0x7fa876), crys = mat(0x8fe9ff, 0x1d8fb8, 1.4);
    this.fistMat = mat(0x9c98b0, 0x000000, 1); this.coreMat = new THREE.MeshBasicMaterial({ color: 0x8be8ff, toneMapped: false });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x8be8ff, toneMapped: false });
    const root = this.root = new THREE.Group(); this.body.add(root);
    this.legs = [-1, 1].map((s, i) => {
      const hip = new THREE.Group(); hip.position.set(s * .78, 2.2, 0);
      const thigh = new THREE.Mesh(stone(.9, 1.25, .95, 3 + i), dark); thigh.position.y = -.55; hip.add(thigh);
      const shin = new THREE.Mesh(stone(1.0, 1.1, 1.15, 5 + i), rock); shin.position.set(0, -1.55, .05); hip.add(shin);
      root.add(hip); return hip;
    });
    const torso = this.torso = new THREE.Group(); torso.position.y = 2.35; root.add(torso);
    const chest = new THREE.Mesh(stone(2.4, 2.35, 1.5, 9), rock); chest.position.y = 1.2; torso.add(chest);
    const belt = new THREE.Mesh(stone(2.0, .5, 1.3, 11), dark); belt.position.y = .05; torso.add(belt);
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(.42, 0), this.coreMat); this.core.position.set(0, 1.25, .58); torso.add(this.core);
    this.plates = [-1, 1].map((s, i) => {
      const hinge = new THREE.Group(); hinge.position.set(s * .95, 1.25, .78);
      const p = new THREE.Mesh(stone(.95, 1.3, .22, 13 + i), rock); p.position.x = -s * .47; hinge.add(p); torso.add(hinge); return hinge;
    });
    for (const s of [-1, 1]) {
      const pad = new THREE.Mesh(stone(1.0, .6, 1.2, 17), dark); pad.position.set(s * 1.45, 2.4, 0); torso.add(pad);
      for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(.16, 0).scale(.7, 2.2, .7), crys); c.position.set(s * (1.3 + k * .15), 2.85 + k * .05, -.2 + k * .2); c.rotation.z = s * -.4; torso.add(c); }
      const m = new THREE.Mesh(new THREE.BoxGeometry(.7, .08, .8), moss); m.position.set(s * 1.4, 2.72, .1); torso.add(m);
    }
    this.head = new THREE.Group(); this.head.position.set(0, 2.6, .1); torso.add(this.head);
    this.head.add(new THREE.Mesh(stone(1.05, .85, .95, 21), rock));
    const brow = new THREE.Mesh(stone(1.15, .22, .3, 23), dark); brow.position.set(0, .2, .42); this.head.add(brow);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(.72, .09, .06), this.eyeMat); eye.position.set(0, .02, .49); this.head.add(eye);
    const hm = new THREE.Mesh(new THREE.BoxGeometry(.8, .1, .7), moss); hm.position.y = .46; this.head.add(hm);
    this.arms = [-1, 1].map((s, i) => {
      const sh = new THREE.Group(); sh.position.set(s * 1.6, 2.05, 0);
      const upper = new THREE.Mesh(stone(.78, 1.45, .78, 31 + i), rock); upper.position.y = -.6; sh.add(upper);
      const elbow = new THREE.Group(); elbow.position.y = -1.3; sh.add(elbow);
      const fore = new THREE.Mesh(stone(.88, 1.35, .88, 35 + i), dark); fore.position.y = -.6; elbow.add(fore);
      const fist = new THREE.Mesh(stone(1.1, .95, 1.1, 39 + i), this.fistMat); fist.position.y = -1.45; elbow.add(fist);
      torso.add(sh); return { sh, elbow, fist, s };
    });
    this.rocks = [];
    for (let i = 0; i < 7; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(.18 + Math.random() * .2, 0), dark); root.add(r); this.rocks.push({ m: r, a: i / 7 * TAU, h: 1 + Math.random() * 4, sp: .4 + Math.random() * .5, d: 2.8 + Math.random() }); }
    this.state = 'dormant'; this.open = 0; this.wake = 0; this.glowFist = 0; this.sweepA = 0; this.summons = 0; this.phase = 1;
  }
  get exposed() { return this.open > .45; }
  spheres() {
    const out = [], p = this.pos;
    if (this.exposed) out.push({ c: this.core.getWorldPosition(new THREE.Vector3()), r: .62, mult: 3.2 });
    out.push({ c: new THREE.Vector3(p.x, p.y + 3.55, p.z), r: 1.45, mult: .7 });
    out.push({ c: this.head.getWorldPosition(new THREE.Vector3()), r: .62, mult: 1 });
    for (const a of this.arms) out.push({ c: a.fist.getWorldPosition(new THREE.Vector3()), r: .62, mult: .45 });
    out.push({ c: new THREE.Vector3(p.x, p.y + 1.2, p.z), r: .95, mult: .55 });
    return out;
  }
  aimPoint() { return this.core.getWorldPosition(new THREE.Vector3()); }
  center(out = new THREE.Vector3()) { return out.copy(this.pos).setY(this.pos.y + 3.2); }
  arenaDist() { const c = this.game.world.arena.center, p = this.player.pos; return Math.hypot(p.x - c.x, p.z - c.z); }
  wind(t) { return t * (this.phase === 2 ? .78 : 1); }

  awaken() {
    const g = this.game; this.set('waking'); this.aggro = true;
    S.rumble(this.pos); setTimeout(() => S.roar(this.center()), 900);
    g.shake(1.2); g.onBossAwake(this);
  }
  think(dt) {
    const d = this.dist(), g = this.game;
    if (this.hp < this.maxHp * .5 && this.phase === 1) { this.phase = 2; g.hud.toast('The Warden grows furious', 'warn'); }
    switch (this.state) {
      case 'dormant': if (this.arenaDist() < 12.5) this.awaken(); break;
      case 'waking': if (this.st > 2.8) this.set('chase'); break;
      case 'chase': {
        this.face(dt, 1.8);
        if (d > 4.3) { const to = this.dirTo(); this.step(to.x, to.z, this.def.speed * (this.phase === 2 ? 1.25 : 1), dt); }
        if (this.cool > 0) break;
        const frac = this.hp / this.maxHp;
        if ((frac < .66 && this.summons === 0) || (frac < .33 && this.summons === 1)) { this.set('summon'); break; }
        const r = Math.random();
        if (d < 6.8) this.set(r < .58 ? 'slamWind' : 'sweepWind');
        else if (d > 8.5 && r < .5) this.set('volleyWind');
        break;
      }
      case 'slamWind': this.face(dt, 2.5); this.glowFist = this.st / this.wind(1.15); if (this.st > this.wind(1.15)) this.set('slam'); break;
      case 'slam':
        if (!this.hitDone && this.st > .16) {
          this.hitDone = true;
          const f = v1.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)), at = v2.copy(this.pos).addScaledVector(f, 3.3);
          at.y = this.groundY();
          g.fx.ring(at, { radius: 9.5, life: 1.0, color: 0x8be8ff, width: .12 }); g.fx.ring(at, { radius: 4, life: .5, color: 0xffffff, width: .3 });
          g.fx.burst(at, { n: 50, speed: 7, color: 0xcfc6b8, size: .35, life: .9, grav: -12, up: 4 });
          S.slam(at); g.shake(1.6);
          const pd = Math.hypot(this.player.pos.x - at.x, this.player.pos.z - at.z);
          if (this.playerHere()) { if (pd < 3.6) this.player.hurt(30, at, { knock: 10 }); else if (pd < 7.5 && this.player.grounded) this.player.hurt(12, at, { knock: 6 }); }
        }
        if (this.st > .35) { this.set('stuck'); this.game.hud.toast('Its core is exposed!', 'gold'); }
        break;
      case 'stuck': this.glowFist = 0; if (this.st > 2.7) this.set('recover'); break;
      case 'recover': if (this.st > .8) { this.cool = (this.phase === 2 ? .7 : 1.2) + Math.random() * .8; this.set('chase'); } break;
      case 'sweepWind': this.face(dt, 3); this.glowFist = this.st / this.wind(.85); if (this.st > this.wind(.85)) { this.set('sweep'); S.swing(9, this.center()); } break;
      case 'sweep':
        if (!this.hitDone && this.st > .14 && this.st < .4 && this.playerHere() && this.dist() < 5.6 && this.facing() > -.1) { this.hitDone = true; this.player.hurt(20, this.center(), { knock: 9 }); }
        if (this.st > .5) { this.glowFist = 0; this.set('recover'); }
        break;
      case 'volleyWind': this.face(dt, 3); if (this.st > this.wind(.95)) { this.volley(); this.set('recover'); } break;
      case 'summon':
        if (this.st > 1.1 && !this.hitDone) {
          this.hitDone = true; this.summons++; S.roar(this.center()); g.shake(.8);
          const c = g.world.arena.center, isl = this.isl, em = g.enemies;
          for (const [t, a] of [['skitter', .6], ['skitter', 2.6], ['shardling', 4.4]]) {
            const e = em.spawn(t, isl, c.x + Math.cos(a) * 11, c.z + Math.sin(a) * 11);
            if (e) { e.aggro = true; e.set(t === 'shardling' ? 'kite' : 'chase'); g.fx.shatter(e.center(), 0x8be8ff, .6); }
          }
        }
        if (this.st > 2) this.set('recover');
        break;
    }
  }
  volley() {
    const n = this.phase === 2 ? 7 : 5, from = this.core.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(Math.sin(this.yaw), .3, Math.cos(this.yaw)));
    const head = this.player.head(new THREE.Vector3()), base = Math.atan2(head.x - from.x, head.z - from.z);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * .13, tgt = new THREE.Vector3(from.x + Math.sin(a) * 10, head.y, from.z + Math.cos(a) * 10);
      const o = this.game.combat.enemyOrb(from.clone(), tgt, this, 13); o.homing = .25; o.vel.multiplyScalar(.85 + Math.random() * .2);
    }
  }
  takeHit(dmg, dir, point, opts) {
    if (this.state === 'dormant' || this.state === 'waking') { if (this.state === 'dormant') this.awaken(); return 0; }
    return super.takeHit(dmg, dir, point, opts);
  }
  damageMult() { return 1; }
  onHit(d) { this.game.hud.bossHit(); }
  update(dt) { super.update(dt); if (!this.dead && this.state !== 'dormant') this.game.hud.boss(this.def.name, this.hp / this.maxHp); }
  animate(dt) {
    const t = this.anim, st = this.state, k = this.st;
    this.wake = damp(this.wake, st === 'dormant' ? 0 : 1, st === 'waking' ? 1.4 : 6, dt);
    this.open = damp(this.open, st === 'stuck' ? 1 : st === 'volleyWind' ? .35 : 0, 8, dt);
    const crouch = 1 - this.wake;
    this.root.position.y = -crouch * 1.1; this.torso.rotation.x = crouch * .55; this.head.rotation.x = crouch * .5;
    this.eyeMat.color.setRGB(.55 * this.wake + .05, .91 * this.wake + .05, this.wake + .08);
    const walking = st === 'chase' && this.dist() > 4.3;
    const w = walking ? Math.sin(t * 3.2) : 0;
    this.legs[0].rotation.x = w * .45; this.legs[1].rotation.x = -w * .45;
    this.root.position.y += walking ? Math.abs(Math.cos(t * 3.2)) * .12 : 0;
    let lx = 0, rx = 0, lz = 0, rz = 0, el = .25, lean = 0, twist = 0;
    if (st === 'slamWind') { const u = Math.min(1, k / this.wind(1.15)); lx = rx = -2.9 * u; el = .2 + .6 * u; lean = -.2 * u; }
    else if (st === 'slam') { const u = Math.min(1, k / .16); lx = rx = -2.9 + 2.0 * u; el = .8 - .6 * u; lean = .45 * u; }
    else if (st === 'stuck') { lx = rx = -.9; el = .2; lean = .45; }
    else if (st === 'recover') { const u = Math.min(1, k / .8); lx = rx = -.9 * (1 - u); lean = .45 * (1 - u); }
    else if (st === 'sweepWind') { const u = Math.min(1, k / this.wind(.85)); rz = 1.3 * u; rx = -.4 * u; twist = -.7 * u; }
    else if (st === 'sweep') { const u = Math.min(1, k / .4); rz = 1.3; rx = -.4; twist = -.7 + 2.0 * Math.sin(u * Math.PI / 2); }
    else if (st === 'volleyWind') { lean = -.25 * Math.min(1, k / .5); lx = rx = -.5; el = .9; }
    else if (st === 'summon') { lx = rx = -2.6 * Math.min(1, k / .8); el = .3; lean = -.15; }
    else { lx = w * .3; rx = -w * .3; }
    const [L, R] = this.arms;
    L.sh.rotation.x = damp(L.sh.rotation.x, lx, 14, dt); R.sh.rotation.x = damp(R.sh.rotation.x, rx, 14, dt);
    L.sh.rotation.z = damp(L.sh.rotation.z, -lz, 12, dt); R.sh.rotation.z = damp(R.sh.rotation.z, rz, 12, dt);
    L.elbow.rotation.x = R.elbow.rotation.x = damp(L.elbow.rotation.x, -el, 10, dt);
    this.lean = damp(this.lean ?? 0, lean, 12, dt);
    this.torso.rotation.x = crouch * .55 + this.lean; this.torso.rotation.y = damp(this.torso.rotation.y, twist, 12, dt);
    this.plates.forEach((p, i) => { p.rotation.y = (i ? -1 : 1) * this.open * 1.6; });
    this.core.rotation.y = t * 2; this.core.scale.setScalar(1 + this.open * .35 + Math.sin(t * 8) * .05 * this.open);
    this.coreMat.color.setRGB(.5 + this.open * .5, .9, 1);
    this.fistMat.emissive.setRGB(.15 * this.glowFist, .6 * this.glowFist, .8 * this.glowFist);
    for (const r of this.rocks) { const a = r.a + t * r.sp; r.m.position.set(Math.cos(a) * r.d, r.h * this.wake + (1 - this.wake) * .2 + Math.sin(t + r.a) * .2, Math.sin(a) * r.d); r.m.rotation.set(t, t * .7, 0); }
  }
  dying(dt) {
    const k = this.deathT / this.def.deathTime;
    this.root.position.y = -k * k * 3; this.torso.rotation.x = k * .9; this.body.rotation.z = Math.sin(this.deathT * 18) * .05 * (1 - k);
    if (Math.random() < .3) this.game.fx.burst(v1.copy(this.pos).add(v2.set((Math.random() - .5) * 3, 1 + Math.random() * 3, (Math.random() - .5) * 3)), { n: 10, speed: 3, color: 0xcfc6b8, size: .3, life: .8, grav: -9 });
    this.eyeMat.color.setRGB(.5 * (1 - k), .9 * (1 - k), 1 - k);
    if (k > .8) this.body.scale.setScalar(Math.max(.01, (1 - k) * 5));
  }
}
