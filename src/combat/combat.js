// Sword sweeps, projectiles, damage and the little freeze-frame that makes hits feel heavy.
import * as THREE from 'three';
import { segPointDist, clamp } from '../core/util.js';
import { S } from '../core/audio.js';

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
const SAMPLES = [.2, .45, .7, .95];

export class Combat {
  constructor(game) {
    this.game = game; this.projectiles = [];
    this.orbGeo = new THREE.IcosahedronGeometry(1, 1);
    this.mats = {
      orb: new THREE.MeshBasicMaterial({ color: 0xff8ad8, toneMapped: false }),
      bolt: new THREE.MeshBasicMaterial({ color: 0xbff6ff, toneMapped: false }),
      reflected: new THREE.MeshBasicMaterial({ color: 0xfff0b0, toneMapped: false }),
    };
    this.glowMat = { orb: this.glow(0xff6ad0), bolt: this.glow(0x6fe4ff), reflected: this.glow(0xffd070) };
  }
  glow(color) { return new THREE.SpriteMaterial({ map: this.game.tex.glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }); }

  /* ---------- sword ---------- */
  // Tests the blade's swept path this frame against every enemy, the dummy and enemy orbs.
  sweep(h) {
    const g = this.game, pl = g.player;
    const segHit = (cx, cy, cz, r) => {
      for (const k of SAMPLES) {
        a.lerpVectors(h.prevBase, h.prevTip, k); b.lerpVectors(h.base, h.tip, k);
        if (segPointDist(a.x, a.y, a.z, b.x, b.y, b.z, cx, cy, cz) < r) return k;
      }
      return segPointDist(h.base.x, h.base.y, h.base.z, h.tip.x, h.tip.y, h.tip.z, cx, cy, cz) < r ? .6 : -1;
    };
    const dir = v1.subVectors(h.tip, h.prevTip); if (dir.lengthSq() < 1e-8) dir.set(0, 0, -1); dir.normalize();

    for (const e of g.enemies.list) {
      if (e.dead || e.lastSwing === h.swingId || e.island !== pl.island) continue;
      if (e.pos.distanceToSquared(h.tip) > 49) continue;
      for (const s of e.spheres()) {
        const k = segHit(s.c.x, s.c.y, s.c.z, s.r + .05);
        if (k < 0) continue;
        e.lastSwing = h.swingId;
        const contact = v2.copy(h.prevTip).lerp(h.tip, .5).lerp(s.c, .55);
        const dmg = pl.swordDamage(h.speed, h.power) * (s.mult ?? 1);
        this.hitEnemy(e, dmg, contact, dir, { heavy: h.power > 1.3 || h.speed > 9, weak: (s.mult ?? 1) > 1.5 });
        break;
      }
    }
    const d = g.world.dummy;
    if (d && pl.island === 'skyreach' && d.lastSwing !== h.swingId && segHit(d.center.x, d.center.y, d.center.z, d.hitRadius) >= 0) {
      d.lastSwing = h.swingId; d.hit(dir);
      S.dummy(d.center); g.fx.sparks(v2.copy(d.center).addScaledVector(dir, -.2), dir, 0xffe8b0, 8);
      g.fx.numbers.spawn(d.center, pl.swordDamage(h.speed, h.power));
      g.haptic('right', .6, 40); this.hitstop(.04);
      g.quests.event('dummy');
    }
    for (const p of this.projectiles) {
      if (p.owner !== 'enemy' || p.dead) continue;
      if (segHit(p.pos.x, p.pos.y, p.pos.z, p.r + .12) >= 0) this.deflect(p, dir);
    }
  }

  // Desktop only: a mouse can't swing low, so each swing also hits whatever stands in front of you
  // within reach. The part of the target nearest your crosshair takes the hit, so aiming still matters.
  assist(h) {
    const g = this.game, pl = g.player, head = pl.head(new THREE.Vector3()), fwd = pl.forward(new THREE.Vector3());
    const flat = new THREE.Vector3(fwd.x, 0, fwd.z).normalize(), dir = new THREE.Vector3().subVectors(h.tip, h.prevTip);
    if (dir.lengthSq() < 1e-8) dir.copy(fwd); dir.normalize();
    const inFront = (x, z, reach) => {
      const dx = x - pl.pos.x, dz = z - pl.pos.z, l = Math.hypot(dx, dz);
      return l < reach && (l < .5 || (dx * flat.x + dz * flat.z) / l > .42);
    };
    for (const e of g.enemies.list) {
      if (e.dead || e.lastSwing === h.swingId || e.island !== pl.island || !inFront(e.pos.x, e.pos.z, 2.5 + e.def.radius)) continue;
      let best = null, bc = -2;
      for (const s of e.spheres()) { const c = v1.subVectors(s.c, head).normalize().dot(fwd); if (c > bc && head.distanceTo(s.c) - s.r < 3.4) { bc = c; best = s; } }
      if (!best) continue;
      const mult = (best.mult ?? 1) > 1.5 && bc < .93 ? .7 : (best.mult ?? 1);
      e.lastSwing = h.swingId;
      this.hitEnemy(e, pl.swordDamage(6, h.power) * mult, v2.copy(best.c).lerp(head, .2), dir, { heavy: h.power > 1.3, weak: mult > 1.5 });
    }
    const d = g.world.dummy;
    if (d && pl.island === 'skyreach' && d.lastSwing !== h.swingId && inFront(d.center.x, d.center.z, 2.7)) {
      d.lastSwing = h.swingId; d.hit(dir); S.dummy(d.center); g.fx.sparks(v2.copy(d.center).lerp(head, .3), dir, 0xffe8b0, 8);
      g.fx.numbers.spawn(d.center, pl.swordDamage(6, h.power)); this.hitstop(.04); g.quests.event('dummy');
    }
    for (const p of this.projectiles) {
      if (p.owner !== 'enemy' || p.dead || p.pos.distanceTo(head) > 2.6) continue;
      if (v1.subVectors(p.pos, head).normalize().dot(fwd) > .35) this.deflect(p, dir);
    }
  }

  hitEnemy(e, dmg, point, dir, { heavy = false, weak = false, kind = 'sword' } = {}) {
    const g = this.game, crit = weak || (kind === 'sword' && Math.random() < .08);
    const dealt = e.takeHit(dmg * (crit && !weak ? 1.5 : 1), dir, point, { heavy, kind });
    if (dealt <= 0) { S.block(point); g.fx.sparks(point, dir, 0xd8e4ff, 6); return 0; }
    g.fx.sparks(point, dir, e.def.spark ?? 0xfff2c0, heavy ? 22 : 14);
    g.fx.numbers.spawn(point, dealt, { crit });
    S.hit(e.def.material ?? 'flesh', point, heavy ? 1.2 : .9);
    if (kind === 'sword') { g.haptic('right', heavy ? 1 : .7, heavy ? 70 : 45); this.hitstop(heavy ? .085 : .05); g.shake(heavy ? .5 : .25); }
    return dealt;
  }
  hitstop(t) { this.game.slowmo = Math.max(this.game.slowmo, t); }

  /* ---------- projectiles ---------- */
  spawn(kind, origin, vel, { owner, damage, r = .22, homing = 0, life = 6, source = null }) {
    const m = new THREE.Mesh(this.orbGeo, this.mats[kind]); m.scale.setScalar(r * .8);
    const glow = new THREE.Sprite(this.glowMat[kind]); glow.scale.setScalar(r * 7);
    m.position.copy(origin); glow.position.copy(origin);
    this.game.scene.add(m); this.game.scene.add(glow);
    const p = { kind, m, glow, pos: m.position, vel: vel.clone(), owner, damage, r, homing, life, source, dead: false, t: 0 };
    this.projectiles.push(p);
    return p;
  }
  enemyOrb(origin, target, source, damage = 12) {
    const vel = v1.subVectors(target, origin).normalize().multiplyScalar(7.5);
    S.orb(origin);
    return this.spawn('orb', origin, vel, { owner: 'enemy', damage, r: .24, homing: .9, life: 7, source });
  }
  playerBolt(origin, dir) {
    const g = this.game, target = g.enemies.aimAssist(origin, dir, .26, 40);
    const vel = (target ? v1.subVectors(target.aimPoint(), origin).normalize() : v1.copy(dir).normalize()).multiplyScalar(30);
    S.bolt(origin);
    return this.spawn('bolt', origin, vel, { owner: 'player', damage: g.player.boltDamage(), r: .2, homing: target ? 4 : 0, life: 2.5, source: target });
  }
  deflect(p, dir) {
    const g = this.game, src = p.source && !p.source.dead ? p.source : g.enemies.nearest(p.pos, 30);
    const aim = src ? v2.subVectors(src.aimPoint(), p.pos).normalize() : v2.copy(dir);
    p.owner = 'player'; p.kind = 'reflected'; p.m.material = this.mats.reflected; p.glow.material = this.glowMat.reflected;
    p.vel.copy(aim).multiplyScalar(20); p.homing = src ? 6 : 0; p.source = src; p.damage = Math.max(30, p.damage * 2.6); p.life = 3;
    S.deflect(p.pos); g.fx.sparks(p.pos, aim, 0xfff0b0, 18); g.haptic('right', 1, 60); this.hitstop(.07);
    g.hud.toast('Deflected!', 'gold');
  }
  update(dt) {
    const g = this.game, pl = g.player;
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.t += dt; p.life -= dt;
      if (p.homing > 0) {
        const tgt = p.owner === 'enemy' ? pl.head(v3) : (p.source && !p.source.dead ? p.source.aimPoint() : null);
        if (tgt) { const want = v1.subVectors(tgt, p.pos).normalize().multiplyScalar(p.vel.length()); p.vel.lerp(want, clamp(p.homing * dt, 0, 1)); }
      }
      p.pos.addScaledVector(p.vel, dt); p.glow.position.copy(p.pos);
      p.m.rotation.x += dt * 4; p.m.rotation.y += dt * 3;
      if (Math.random() < .5) g.fx.emit(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, .3, p.r * 1.6, p.kind === 'orb' ? 0xff6ad0 : p.kind === 'bolt' ? 0x6fe4ff : 0xffd070, 1, 0);
      if (p.life <= 0) { this.pop(p); continue; }
      const gr = g.world.groundAt(p.pos.x, p.pos.z);
      if (gr && p.pos.y < gr.y) { this.pop(p); continue; }
      if (p.owner === 'enemy') {
        const head = pl.head(v3);
        if (pl.shieldUp && g.hands.shieldBlocks(p.pos, p.r)) { pl.blockCost(4); S.block(p.pos); g.fx.sparks(p.pos, v1.copy(p.vel).negate().normalize(), 0x8be8ff, 14); g.haptic('left', .8, 50); this.pop(p, false); continue; }
        const feetY = pl.pos.y + .3, topY = head.y - .05;
        if (segPointDist(head.x, feetY, head.z, head.x, topY, head.z, p.pos.x, p.pos.y, p.pos.z) < p.r + .3) { pl.hurt(p.damage, p.pos); this.pop(p); continue; }
      } else {
        for (const e of g.enemies.list) {
          if (e.dead || e.island !== pl.island || e.pos.distanceToSquared(p.pos) > 64) continue;
          const hit = e.spheres().find(s => s.c.distanceTo(p.pos) < s.r + p.r);
          if (hit) { this.hitEnemy(e, p.damage * (hit.mult ?? 1), p.pos.clone(), v1.copy(p.vel).normalize(), { kind: p.kind, heavy: p.kind === 'reflected', weak: (hit.mult ?? 1) > 1.5 }); S.zap(p.pos, p.kind === 'reflected' ? 1.3 : 1); this.pop(p); break; }
        }
      }
    }
    if (this.projectiles.some(p => p.dead)) this.projectiles = this.projectiles.filter(p => !p.dead);
  }
  pop(p, burst = true) {
    p.dead = true; this.game.scene.remove(p.m); this.game.scene.remove(p.glow);
    if (burst) this.game.fx.burst(p.pos, { n: 14, speed: 3, color: p.kind === 'orb' ? 0xff7ad8 : p.kind === 'bolt' ? 0x8be8ff : 0xffd070, size: .22, life: .4, grav: 0 });
  }
  clear() { for (const p of this.projectiles) this.pop(p, false); this.projectiles = []; }
}
