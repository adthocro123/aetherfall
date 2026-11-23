// Shared enemy behaviour (movement, damage, death) and the manager that spawns them per island.
import * as THREE from 'three';
import { damp, dampAngle, TAU, rng } from '../core/util.js';
import { S } from '../core/audio.js';

const v1 = new THREE.Vector3(), WHITE = new THREE.Color(1, 1, 1);
let shadowMat = null;
function shadow() {
  if (!shadowMat) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(10,8,24,.55)'); grd.addColorStop(1, 'rgba(10,8,24,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shadowMat); m.renderOrder = 1;
  return m;
}
export function mat(color, emissive = 0x000000, k = 1) {
  return new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: k, flatShading: true });
}

export class Enemy {
  constructor(game, isl, pos) {
    this.game = game; this.def = this.constructor.def; this.island = isl.name; this.isl = isl;
    this.group = new THREE.Group(); this.body = new THREE.Group(); this.group.add(this.body);
    this.pos = this.group.position; this.pos.copy(pos); this.home = pos.clone();
    this.yaw = Math.random() * TAU; this.maxHp = this.def.hp; this.hp = this.maxHp;
    this.state = 'idle'; this.st = 0; this.cool = Math.random(); this.aggro = false;
    this.flash = 0; this.dead = false; this.remove = false; this.deathT = 0; this.lastSwing = -1; this.hitDone = false;
    this.wander = pos.clone(); this.wanderT = 0; this.anim = Math.random() * 10; this.stun = 0; this.knock = new THREE.Vector3();
    this.flashMats = [];
    this.shadow = shadow(); this.shadow.scale.setScalar(this.def.radius * 2.6); game.scene.add(this.shadow);
    this.build();
    this.body.traverse(o => { if (o.material && o.material.emissive && !this.flashMats.includes(o.material)) this.flashMats.push(o.material); });
    this.flashBase = this.flashMats.map(m => ({ c: m.emissive.clone(), k: m.emissiveIntensity }));
    game.scene.add(this.group);
  }
  set(s) { this.state = s; this.st = 0; this.hitDone = false; }
  get player() { return this.game.player; }
  dist() { const p = this.player.pos; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }
  playerHere() { return this.player.island === this.island && this.player.alive; }
  face(dt, k = 8, target = this.player.pos) { this.yaw = dampAngle(this.yaw, Math.atan2(target.x - this.pos.x, target.z - this.pos.z), k, dt); }
  dirTo(target = this.player.pos) { v1.set(target.x - this.pos.x, 0, target.z - this.pos.z); const l = v1.length() || 1; return v1.divideScalar(l); }
  facing(target = this.player.pos) { const d = this.dirTo(target); return Math.sin(this.yaw) * d.x + Math.cos(this.yaw) * d.z; }
  center(out = new THREE.Vector3()) { return out.copy(this.pos).setY(this.pos.y + (this.def.height ?? .5)); }
  aimPoint() { return this.spheres()[0].c; }

  // Move along (dx,dz) at speed, sliding around props, other enemies and the island edge. Returns false if blocked.
  step(dx, dz, speed, dt) {
    let sx = 0, sz = 0;
    for (const o of this.game.enemies.list) {
      if (o === this || o.dead || o.island !== this.island) continue;
      const ex = this.pos.x - o.pos.x, ez = this.pos.z - o.pos.z, m = this.def.radius + o.def.radius + .15, d2 = ex * ex + ez * ez;
      if (d2 < m * m && d2 > 1e-6) { const d = Math.sqrt(d2); sx += ex / d * (m - d); sz += ez / d * (m - d); }
    }
    const t = { x: this.pos.x + dx * speed * dt + sx * 3 * dt, z: this.pos.z + dz * speed * dt + sz * 3 * dt };
    let blocked = false;
    if (!this.isl.contains(t.x, t.z, this.def.radius + .6)) { this.isl.clampInside(t, this.def.radius + .6); blocked = true; }
    if (this.game.world.resolve(t, this.def.radius * .8, this.isl)) blocked = true;
    this.pos.x = t.x; this.pos.z = t.z;
    return !blocked;
  }
  wanderAbout(dt, speed = 1.2, range = 6) {
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      const a = Math.random() * TAU, d = Math.random() * range;
      this.wander.set(this.home.x + Math.cos(a) * d, 0, this.home.z + Math.sin(a) * d); this.wanderT = 2 + Math.random() * 4;
    }
    const dx = this.wander.x - this.pos.x, dz = this.wander.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d > .4) { this.face(dt, 4, this.wander); this.step(dx / d, dz / d, speed, dt); return true; }
    return false;
  }
  chase(dt, speed) { this.face(dt, 7); const d = this.dirTo(); return this.step(d.x, d.z, speed, dt); }
  groundY() { return this.isl.heightAt(this.pos.x, this.pos.z, 0) ?? this.pos.y; }

  update(dt) {
    this.anim += dt; this.st += dt; this.cool = Math.max(0, this.cool - dt); this.flash = Math.max(0, this.flash - dt * 6);
    if (this.dead) { this.deathT += dt; this.dying(dt); if (this.deathT > (this.def.deathTime ?? .5)) this.remove = true; return; }
    if (this.knock.lengthSq() > .01) { this.step(this.knock.x, this.knock.z, 1, dt); this.knock.multiplyScalar(Math.exp(-9 * dt)); }
    if (this.stun > 0) this.stun -= dt;
    else if (this.playerHere()) this.think(dt);
    else this.wanderAbout(dt);
    this.pos.y = damp(this.pos.y, this.groundY() + (this.def.hover || 0), 14, dt);
    this.group.rotation.y = this.yaw;
    this.shadow.position.set(this.pos.x, this.groundY() + .04, this.pos.z);
    this.animate(dt);
    for (let i = 0; i < this.flashMats.length; i++) {
      const m = this.flashMats[i], b = this.flashBase[i];
      m.emissive.copy(b.c).lerp(WHITE, this.flash * .85); m.emissiveIntensity = b.k + this.flash * 1.2;
    }
  }
  takeHit(dmg, dir, point, { heavy = false } = {}) {
    if (this.dead) return 0;
    const d = Math.max(1, Math.round(dmg * (this.damageMult ? this.damageMult(point) : 1)));
    this.hp -= d; this.flash = 1; this.aggro = true;
    if (this.def.knock !== 0) this.knock.set(dir.x, 0, dir.z).normalize().multiplyScalar((heavy ? 5 : 2.4) * (this.def.knock ?? 1));
    if (heavy && this.def.staggerable !== false && !/charge|attack/.test(this.state)) this.stun = Math.max(this.stun, .35);
    this.onHit?.(d, point);
    if (this.hp <= 0) this.die();
    return d;
  }
  die() {
    this.dead = true; this.deathT = 0;
    const c = this.center();
    this.game.fx.shatter(c, this.def.spark ?? 0x8be8ff, this.def.burst ?? 1);
    S.death(this.def.material === 'stone' ? 'stone' : 'crystal', c);
    this.game.onEnemyKilled(this);
  }
  dying() { const k = Math.max(0, 1 - this.deathT / .5); this.body.scale.setScalar(Math.max(.01, k)); this.shadow.scale.setScalar(this.def.radius * 2.6 * k); }
  dispose() { this.game.scene.remove(this.group); this.game.scene.remove(this.shadow); }
  // Attack the player if they're inside reach and roughly in front. Returns true on a hit.
  strike(reach, dmg, arc = .3, knock = 0) {
    if (this.hitDone || !this.playerHere()) return false;
    if (this.dist() < reach && this.facing() > arc) { this.hitDone = true; return this.player.hurt(dmg, this.center(), { knock }); }
    return false;
  }
}

export class EnemyManager {
  constructor(game, types) { this.game = game; this.types = types; this.list = []; this.current = null; this.boss = null; }
  spawn(type, isl, x, z) {
    const T = this.types[type]; if (!T) return null;
    const p = new THREE.Vector3(x, isl.heightAt(x, z, 0) ?? isl.center.y, z);
    const e = new T(this.game, isl, p); e.type = type; this.list.push(e); return e;
  }
  populate(name) {
    if (this.current === name) return;
    this.clear(); this.current = name;
    const g = this.game, isl = g.world.islands[name], groups = g.world.spawns[name] || [], r = rng(Date.now() & 0xffff);
    for (const s of groups) for (let i = 0; i < s.n; i++) {
      const a = r() * TAU, d = s.n > 1 ? 1.5 + r() * 2.5 : 0;
      this.spawn(s.type, isl, isl.center.x + s.x + Math.cos(a) * d, isl.center.z + s.z + Math.sin(a) * d);
    }
    if (name === 'warden' && !g.quests.flag('wardenDown')) { const c = g.world.arena.center; this.boss = this.spawn('warden', isl, c.x, c.z); }
  }
  clear() { for (const e of this.list) e.dispose(); this.list = []; this.boss = null; this.current = null; }
  update(dt) {
    for (const e of this.list) e.update(dt);
    if (this.list.some(e => e.remove)) { for (const e of this.list) if (e.remove) e.dispose(); this.list = this.list.filter(e => !e.remove); }
  }
  nearest(p, max = 30) {
    let best = null, bd = max * max;
    for (const e of this.list) { if (e.dead) continue; const d = e.pos.distanceToSquared(p); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  aimAssist(origin, dir, cone = .25, max = 40) {
    let best = null, bs = -1;
    for (const e of this.list) {
      if (e.dead || e.island !== this.game.player.island) continue;
      const to = v1.subVectors(e.aimPoint(), origin), d = to.length(); if (d > max) continue;
      const c = to.divideScalar(d).dot(dir);
      if (c > Math.cos(cone) && c - d * .002 > bs) { bs = c - d * .002; best = e; }
    }
    return best;
  }
  heat() { let n = 0; for (const e of this.list) if (!e.dead && e.aggro && e.dist() < 25) n++; return n; }
}
