// The diver: where you stand, how you move, and what you can take.
// In VR the head moves freely inside the rig; on desktop the rig is driven by keys and mouse.
import * as THREE from 'three';
import { clamp, damp } from '../core/util.js';
import { S } from '../core/audio.js';

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
export const BLADE_TIERS = [
  { name: 'Aether Blade', mult: 1, color: 0x9fe8ff, glow: 0x2a9fd0 },
  { name: 'Tempered Aether Blade', mult: 1.35, color: 0x8fffd8, glow: 0x1fb08a, cost: 18 },
  { name: 'Sunforged Blade', mult: 1.8, color: 0xffd98a, glow: 0xd08a20, cost: 40 },
  { name: 'Skybreaker', mult: 2.4, color: 0xdcb8ff, glow: 0x8a4fe0, cost: 80 },
];

export class Player {
  constructor(game) {
    this.game = game;
    this.rig = new THREE.Group(); this.rig.name = 'rig'; game.scene.add(this.rig);
    this.camera = game.camera; this.rig.add(this.camera);
    this.camera.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.vy = 0;
    this.yaw = 0; this.pitch = 0; this.grounded = true; this.island = 'skyreach';
    this.eye = 1.62; this.radius = .32; this.bob = 0; this.stepDist = 0;
    this.name = 'Wanderer'; this.level = 1; this.xp = 0; this.shards = 0; this.bladeTier = 0;
    this.hp = this.maxHp; this.ae = this.maxAe; this.alive = true;
    this.shieldUp = false; this.invuln = 0; this.lastHurt = -99; this.lastAe = -99; this.beat = 0;
    this.dash = 0; this.dashCd = 0; this.dashDir = new THREE.Vector3();
    this.snapCd = 0; this.moveAmount = 0; this.turnFlash = 0; this.fovKick = 0;
  }
  get maxHp() { return 100 + (this.level - 1) * 18; }
  get maxAe() { return 60 + (this.level - 1) * 6; }
  get blade() { return BLADE_TIERS[this.bladeTier]; }
  xpToNext() { return Math.round(40 * Math.pow(this.level, 1.6)); }
  swordDamage(speed, power = 1) {
    const sp = this.game.mode === 'vr' ? clamp((speed - 1.5) / 4, .45, 1.6) : 1;
    return 11 * this.blade.mult * (1 + (this.level - 1) * .09) * sp * power * (.92 + Math.random() * .16);
  }
  boltDamage() { return 16 * (1 + (this.level - 1) * .1) * (1 + this.bladeTier * .15); }

  head(out = new THREE.Vector3()) { return this.camera.getWorldPosition(out); }
  forward(out = new THREE.Vector3()) { return this.camera.getWorldDirection(out); }

  teleport(p, yaw = 0) {
    this.pos.copy(p); this.vel.set(0, 0, 0); this.vy = 0; this.grounded = true;
    if (this.game.mode === 'vr') {
      this.rig.position.copy(p); this.rig.rotation.set(0, 0, 0);
      const head = this.head(v1), dir = this.forward(v2), cur = Math.atan2(-dir.x, -dir.z);
      this.rotateAroundHead(yaw - cur);
      head.copy(this.head(v1));
      this.rig.position.x += p.x - head.x; this.rig.position.z += p.z - head.z;
    } else {
      this.yaw = yaw; this.pitch = 0; this.rig.position.copy(p); this.rig.rotation.set(0, yaw, 0);
    }
    const isl = this.game.world.islandAt(p.x, p.z, 0);
    if (isl) this.island = isl.name;
  }
  rotateAroundHead(angle) {
    const head = this.head(v1), r = this.rig, dx = r.position.x - head.x, dz = r.position.z - head.z, c = Math.cos(angle), s = Math.sin(angle);
    r.position.x = head.x + dx * c + dz * s; r.position.z = head.z - dx * s + dz * c; r.rotation.y += angle;
  }

  update(dt) {
    const g = this.game;
    this.invuln = Math.max(0, this.invuln - dt); this.dashCd = Math.max(0, this.dashCd - dt);
    if (g.mode === 'vr') this.updateVR(dt); else this.updateDesktop(dt);
    if (!this.alive) return;
    const now = g.time;
    if (this.shieldUp) { this.ae = Math.max(0, this.ae - 2.2 * dt); this.lastAe = now; if (this.ae <= 0) this.shieldUp = false; }
    if (now - this.lastAe > 1.2) this.ae = Math.min(this.maxAe, this.ae + 9 * dt);
    if (now - this.lastHurt > 7) this.hp = Math.min(this.maxHp, this.hp + 3 * dt);
    if (this.hp / this.maxHp < .3) { this.beat -= dt; if (this.beat <= 0) { S.heartbeat(); this.beat = .95; } }
  }

  wantsMove() { const g = this.game; return g.state === 'playing' && this.alive; }

  updateDesktop(dt) {
    const g = this.game, inp = g.input;
    if (g.canLook()) {
      const l = inp.look();
      this.yaw -= l.x * .0022; this.pitch = clamp(this.pitch - l.y * .0022, -1.45, 1.45);
    }
    const mv = this.wantsMove() ? inp.move() : { x: 0, y: 0 };
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const speed = (inp.sprint && !this.shieldUp ? 6.6 : 4.4) * (this.shieldUp ? .55 : 1);
    let wx = (fx * mv.y + rx * mv.x) * speed, wz = (fz * mv.y + rz * mv.x) * speed;
    if (this.wantsMove() && inp.hit('Space') && this.dashCd <= 0) this.startDash(mv.x || mv.y ? v1.set(fx * mv.y + rx * mv.x, 0, fz * mv.y + rz * mv.x) : v1.set(-fx, 0, -fz));
    if (this.dash > 0) { this.dash -= dt; wx = this.dashDir.x * 13; wz = this.dashDir.z * 13; }
    this.vel.x = damp(this.vel.x, wx, this.dash > 0 ? 40 : 11, dt); this.vel.z = damp(this.vel.z, wz, this.dash > 0 ? 40 : 11, dt);
    this.moveXZ(this.vel.x * dt, this.vel.z * dt);
    this.vertical(dt);
    const spd = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && spd > .5) {
      this.bob += dt * spd * 1.9; this.stepDist += spd * dt;
      if (this.stepDist > 2.1) { this.stepDist = 0; S.step(); }
    } else this.bob = damp(this.bob, Math.round(this.bob / Math.PI) * Math.PI, 6, dt);
    const bobY = Math.sin(this.bob * 2) * .035 * Math.min(1, spd / 4);
    this.fovKick = damp(this.fovKick, this.dash > 0 ? 6 : inp.sprint && spd > 5 ? 3 : 0, 8, dt);
    const shake = g.shakeAmt > 0 ? g.shakeAmt : 0;
    this.rig.position.copy(this.pos); this.rig.rotation.set(0, this.yaw, 0);
    this.camera.position.set((Math.random() - .5) * shake * .05, this.eye + bobY + (Math.random() - .5) * shake * .05, 0);
    this.camera.rotation.set(this.pitch, 0, Math.sin(this.bob) * .004 * Math.min(1, spd / 4));
  }

  startDash(dir) {
    this.dashDir.copy(dir).setY(0).normalize(); this.dash = .22; this.dashCd = .6; this.invuln = Math.max(this.invuln, .3);
    S.swing(7); this.game.fx.motes(v1.copy(this.pos).setY(this.pos.y + .3), 6, 0x8be8ff);
  }

  moveXZ(dx, dz) {
    const g = this.game, isl = g.world.islands[this.island];
    const t = { x: this.pos.x + dx, z: this.pos.z + dz };
    if (this.grounded && !isl.contains(t.x, t.z, .6)) {
      if (isl.contains(t.x, this.pos.z, .6)) t.z = this.pos.z;
      else if (isl.contains(this.pos.x, t.z, .6)) t.x = this.pos.x;
      else { t.x = this.pos.x; t.z = this.pos.z; isl.clampInside(t, .65); }
    }
    g.world.resolve(t, this.radius, isl);
    this.pos.x = t.x; this.pos.z = t.z;
  }

  vertical(dt) {
    const g = this.game, isl = g.world.islands[this.island];
    const gr = isl.heightAt(this.pos.x, this.pos.z, .2);
    if (gr !== null && this.vy <= 0 && this.pos.y - gr < .7) {
      this.pos.y = this.pos.y < gr ? gr : damp(this.pos.y, gr, 30, dt); this.vy = 0; this.grounded = true;
    } else {
      this.vy -= 20 * dt; this.pos.y += this.vy * dt; this.grounded = false;
      if (gr !== null && this.pos.y <= gr) { this.pos.y = gr; this.vy = 0; this.grounded = true; }
    }
    if (this.pos.y < isl.center.y - 16) g.onFall();
  }

  updateVR(dt) {
    const g = this.game, xr = g.xr, st = xr.state, set = g.settings;
    const ls = st.left.stick, rs = st.right.stick;
    if (Math.abs(rs.x) > .65 && this.snapCd <= 0 && this.wantsMove()) { this.rotateAroundHead(-Math.sign(rs.x) * set.snap * Math.PI / 180); this.snapCd = .32; this.turnFlash = 1; }
    if (Math.abs(rs.x) < .3) this.snapCd = 0; else this.snapCd -= dt;
    const head = this.head(v1), dir = this.forward(v2); dir.y = 0; if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1); dir.normalize();
    this.yaw = Math.atan2(-dir.x, -dir.z);
    let mx = 0, mz = 0;
    if (this.wantsMove()) {
      const k = 3.2 * (this.shieldUp ? .6 : 1), f = -ls.y, s = ls.x;
      mx = (dir.x * f + -dir.z * s) * k; mz = (dir.z * f + dir.x * s) * k;
      if (st.right.bDown && this.dashCd <= 0 && (Math.abs(f) + Math.abs(s) > .2)) this.startDash(new THREE.Vector3(mx, 0, mz));
    }
    if (this.dash > 0) { this.dash -= dt; mx = this.dashDir.x * 9; mz = this.dashDir.z * 9; }
    this.moveAmount = damp(this.moveAmount, Math.min(1, Math.hypot(mx, mz) / 3), 10, dt);
    const isl = g.world.islands[this.island];
    const t = { x: head.x + mx * dt, z: head.z + mz * dt };
    if (!isl.contains(t.x, t.z, .6)) isl.clampInside(t, .6);
    g.world.resolve(t, this.radius, isl);
    this.rig.position.x += t.x - head.x; this.rig.position.z += t.z - head.z;
    const gr = isl.heightAt(t.x, t.z, 0) ?? this.pos.y;
    this.pos.set(t.x, gr, t.z);
    this.rig.position.y = damp(this.rig.position.y, gr, 14, dt);
    this.turnFlash = Math.max(0, this.turnFlash - dt * 4);
  }

  useAe(n) { if (this.ae < n) return false; this.ae -= n; this.lastAe = this.game.time; return true; }
  blockCost(n) { this.ae = Math.max(0, this.ae - n); this.lastAe = this.game.time; }

  hurt(dmg, from, { knock = 0 } = {}) {
    const g = this.game;
    if (!this.alive || this.invuln > 0 || g.state !== 'playing') return false;
    if (this.shieldUp && from && g.hands.shieldFaces(from)) {
      const cost = dmg * .45;
      if (this.ae >= cost) {
        this.blockCost(cost); S.block(from); g.fx.sparks(g.hands.shieldCenter(v1), v2.subVectors(from, v1).normalize(), 0x8be8ff, 16);
        g.haptic('left', 1, 80); dmg *= .12;
      }
    }
    this.hp -= dmg; this.lastHurt = g.time; this.invuln = .45;
    if (knock && from && g.mode !== 'vr') { v1.subVectors(this.pos, from).setY(0).normalize(); this.vel.addScaledVector(v1, knock); }
    g.hud.hurt(Math.min(1, dmg / 25 + .3)); g.shake(.6); g.haptic('left', .8, 90); g.haptic('right', .8, 90);
    if (dmg > 2) S.hurt();
    if (this.hp <= 0) { this.hp = 0; g.onDeath(); }
    return true;
  }
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
  addXp(n) {
    const g = this.game; this.xp += n;
    let up = false;
    while (this.xp >= this.xpToNext() && this.level < 20) { this.xp -= this.xpToNext(); this.level++; up = true; }
    if (up) {
      this.hp = this.maxHp; this.ae = this.maxAe;
      S.levelUp(); g.hud.banner(`Level ${this.level}`, 'Your strength grows with the sky.');
      g.fx.burst(v1.copy(this.pos).setY(this.pos.y + 1), { n: 60, speed: 3, color: 0xffd98a, size: .3, life: 1.4, grav: 2, up: 1 });
      g.save();
    }
  }
  addShards(n) { this.shards += n; }
}
