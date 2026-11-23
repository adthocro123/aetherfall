// The creatures of the First Chain. All aether-touched wildlife: each one teaches a different answer.
// Skitter: swarm and lunge (hit them first). Thornback: charges (step aside, then punish).
// Shardling: shoots orbs from range (swing through an orb to send it back).
import * as THREE from 'three';
import { Enemy, mat } from './enemy.js';
import { Warden } from './warden.js';
import { S } from '../core/audio.js';
import { TAU } from '../core/util.js';

const v1 = new THREE.Vector3();

export class Skitter extends Enemy {
  static def = { name: 'Skitter', hp: 34, radius: .5, height: .35, xp: 12, shards: 2, material: 'crystal', spark: 0x8be8ff, speed: 3.7, aggro: 10, burst: .7 };
  build() {
    const shell = mat(0x3c2e58), belly = mat(0x2a2240), crys = mat(0x8fe9ff, 0x1d8fb8, 1.2), eye = mat(0xff9a5a, 0xff5a20, 1.5);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(.36, 9, 7).scale(1, .55, 1.25), shell); torso.position.y = .36; this.body.add(torso);
    const under = new THREE.Mesh(new THREE.SphereGeometry(.3, 8, 6).scale(1, .4, 1.1), belly); under.position.y = .3; this.body.add(under);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6).scale(1.1, .8, 1), shell); head.position.set(0, .36, .45); this.body.add(head);
    for (const x of [-.08, .08]) { const e = new THREE.Mesh(new THREE.SphereGeometry(.04, 6, 4), eye); e.position.set(x, .42, .6); this.body.add(e); }
    for (const x of [-.09, .09]) { const m = new THREE.Mesh(new THREE.ConeGeometry(.025, .16, 4).rotateX(Math.PI / 2), belly); m.position.set(x, .3, .64); this.body.add(m); }
    this.spikes = [];
    for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(.09, 0).scale(.7, 2.1, .7), crys); s.position.set((i % 2 - .5) * .14, .56 + (i < 2 ? .02 : 0), .15 - i * .12); s.rotation.x = -.5; s.rotation.z = (i % 2 - .5) * .6; this.body.add(s); this.spikes.push(s); }
    this.legs = [];
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1, row = i % 3, pivot = new THREE.Group(); pivot.position.set(side * .22, .32, .22 - row * .22);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(.32, .035, .035).translate(side * .16, -.06, 0), belly); leg.rotation.z = side * -.5; pivot.add(leg);
      this.body.add(pivot); this.legs.push({ pivot, side, row });
    }
  }
  spheres() { return [{ c: v1.copy(this.pos).setY(this.pos.y + .36).clone(), r: .46 }]; }
  think(dt) {
    const d = this.dist(), sp = this.def.speed;
    switch (this.state) {
      case 'idle': this.wanderAbout(dt); if (d < this.def.aggro || this.aggro) { this.aggro = true; S.chitter(this.pos); this.set('chase'); } break;
      case 'chase': this.chase(dt, sp); if (d < 1.7 && this.cool <= 0) this.set('windup'); if (d > 26) { this.aggro = false; this.set('idle'); } break;
      case 'windup': this.face(dt, 12); if (this.st > .38) { this.lunge = this.dirTo().clone(); this.set('attack'); } break;
      case 'attack':
        this.step(this.lunge.x, this.lunge.z, 7.5, dt);
        this.strike(1.25, 8, .2);
        if (this.st > .2) { this.cool = .9 + Math.random() * .5; this.set('recover'); } break;
      case 'recover': if (this.st > .55) this.set('chase'); break;
    }
  }
  animate(dt) {
    const moving = this.state === 'chase' || this.state === 'attack' || this.state === 'idle', f = this.anim * (this.state === 'attack' ? 30 : 18);
    for (const l of this.legs) l.pivot.rotation.y = moving ? Math.sin(f + l.row * 2.1 + (l.side > 0 ? Math.PI : 0)) * .45 : 0;
    const rear = this.state === 'windup' ? Math.min(1, this.st / .3) : 0;
    this.body.rotation.x = -rear * .45; this.body.position.y = Math.abs(Math.sin(f * .5)) * .03 + rear * .12;
    for (const s of this.spikes) s.scale.setScalar(1 + rear * .3);
  }
}

export class Thornback extends Enemy {
  static def = { name: 'Thornback', hp: 110, radius: .95, height: .8, xp: 35, shards: 6, material: 'flesh', spark: 0xffc070, speed: 2.8, aggro: 15, knock: .35, burst: 1.3 };
  build() {
    const fur = mat(0x6a4b5a), dark = mat(0x41303e), tusk = mat(0xf2e6cc), amber = mat(0xffc46a, 0xd07a18, 1.1), eye = mat(0xffe28a, 0xffa020, 1.6);
    const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(.8, 1).scale(.85, .7, 1.2), fur); torso.position.y = .9; this.body.add(torso);
    this.head = new THREE.Group(); this.head.position.set(0, .85, 1.0); this.body.add(this.head);
    this.head.add(new THREE.Mesh(new THREE.BoxGeometry(.62, .52, .62), fur));
    const snout = new THREE.Mesh(new THREE.BoxGeometry(.42, .3, .3), dark); snout.position.set(0, -.08, .38); this.head.add(snout);
    for (const x of [-.22, .22]) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(.06, .42, 5).rotateX(-Math.PI / 2.6), tusk); t.position.set(x, -.12, .5); this.head.add(t);
      const e = new THREE.Mesh(new THREE.SphereGeometry(.05, 6, 4), eye); e.position.set(x * .9, .1, .31); this.head.add(e);
    }
    this.spines = [];
    for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(.12, .55 + Math.sin(i) * .15, 5), amber); s.position.set((i % 2 - .5) * .22, 1.42 - Math.abs(i - 2.5) * .05, .55 - i * .22); s.rotation.x = -.45; this.body.add(s); this.spines.push(s); }
    this.legs = [];
    for (const [x, z] of [[-.4, .55], [.4, .55], [-.4, -.55], [.4, -.55]]) { const p = new THREE.Group(); p.position.set(x, .6, z); const l = new THREE.Mesh(new THREE.CylinderGeometry(.1, .08, .62, 6).translate(0, -.3, 0), dark); p.add(l); this.body.add(p); this.legs.push(p); }
    this.stars = new THREE.Group(); this.stars.position.set(0, 1.55, .9); this.stars.visible = false; this.body.add(this.stars);
    for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(.07, 0), new THREE.MeshBasicMaterial({ color: 0xffe9a0, toneMapped: false })); s.position.set(Math.cos(i / 4 * TAU) * .32, 0, Math.sin(i / 4 * TAU) * .32); this.stars.add(s); }
  }
  spheres() {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    return [{ c: new THREE.Vector3(this.pos.x, this.pos.y + .9, this.pos.z), r: .78 }, { c: new THREE.Vector3(this.pos.x + s * 1.05, this.pos.y + .82, this.pos.z + c * 1.05), r: .48 }];
  }
  damageMult() { return this.state === 'dazed' ? 1.6 : 1; }
  think(dt) {
    const d = this.dist();
    switch (this.state) {
      case 'idle': this.wanderAbout(dt, 1); if (d < this.def.aggro || this.aggro) { this.aggro = true; this.set('chase'); } break;
      case 'chase':
        if (d < 2.7 && this.cool <= 0) this.set('gore');
        else if (d > 5 && d < 16 && this.cool <= 0) { this.set('paw'); S.snort(this.pos); }
        else this.chase(dt, this.def.speed);
        if (d > 30) { this.aggro = false; this.set('idle'); }
        break;
      case 'paw': this.face(dt, 6); if (this.st > .95) { this.dir = this.dirTo().clone(); this.set('charge'); S.swing(5, this.pos); } break;
      case 'charge': {
        const free = this.step(this.dir.x, this.dir.z, 11.5, dt);
        if (this.strike(1.7, 18, -.2, 9)) { this.cool = 2; this.set('skid'); break; }
        if (!free || this.st > 1.3) { this.set('dazed'); this.game.fx.burst(this.center(), { n: 18, speed: 3, color: 0xd8c8a8, size: .25, life: .6 }); S.hit('stone', this.pos, .8); this.game.shake(.3); }
        break;
      }
      case 'skid': this.step(this.dir.x, this.dir.z, Math.max(0, 6 - this.st * 14), dt); if (this.st > .5) this.set('chase'); break;
      case 'dazed': if (this.st > 1.9) { this.cool = 1.2; this.set('chase'); } break;
      case 'gore': this.face(dt, 10); if (this.st > .55) this.strike(2.6, 12, .35, 5); if (this.st > .9) { this.cool = 1 + Math.random(); this.set('chase'); } break;
    }
  }
  animate() {
    const run = this.state === 'charge' ? 26 : this.state === 'chase' ? 13 : this.state === 'idle' ? 7 : 0, f = this.anim * run;
    this.legs.forEach((l, i) => { l.rotation.x = run ? Math.sin(f + (i % 2 ? 0 : Math.PI) + (i > 1 ? Math.PI / 2 : 0)) * .6 : 0; });
    const paw = this.state === 'paw' ? Math.sin(this.st * 22) * .25 : 0, gore = this.state === 'gore' ? (this.st < .55 ? -.4 * this.st / .55 : .5) : 0;
    this.head.rotation.x = -gore + (this.state === 'charge' ? .35 : 0); this.legs[0].rotation.x += paw;
    this.body.rotation.z = this.state === 'dazed' ? Math.sin(this.st * 9) * .12 : 0;
    const glow = this.state === 'paw' ? 1 + this.st * 1.5 : this.state === 'charge' ? 2.4 : 1;
    for (const s of this.spines) s.scale.setScalar(.9 + glow * .1);
    this.stars.visible = this.state === 'dazed'; this.stars.rotation.y = this.anim * 5;
  }
}

export class Shardling extends Enemy {
  static def = { name: 'Shardling', hp: 55, radius: .6, height: 0, hover: 2.4, xp: 24, shards: 4, material: 'crystal', spark: 0xc9a2ff, speed: 3, aggro: 17, knock: .6, burst: 1 };
  build() {
    const crys = mat(0xc9a2ff, 0x5a2fa8, 1.3), ring = mat(0xe8d8ff, 0x6a4ac0, 1), eye = new THREE.MeshBasicMaterial({ color: 0xff7ad8, toneMapped: false });
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(.42, 0).scale(.8, 1.35, .8), crys); this.body.add(this.core);
    this.eye = new THREE.Mesh(new THREE.SphereGeometry(.11, 10, 8), eye); this.eye.position.z = .3; this.body.add(this.eye);
    this.rings = [0, 1].map(i => { const r = new THREE.Mesh(new THREE.TorusGeometry(.62 + i * .14, .025, 4, 32), ring); this.body.add(r); return r; });
    this.bits = [];
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.OctahedronGeometry(.07, 0), crys); this.body.add(b); this.bits.push(b); }
    this.charge = 0;
  }
  spheres() { return [{ c: new THREE.Vector3(this.pos.x, this.pos.y, this.pos.z), r: .55 }]; }
  think(dt) {
    const d = this.dist();
    switch (this.state) {
      case 'idle': this.wanderAbout(dt, 1); if (d < this.def.aggro || this.aggro) { this.aggro = true; this.set('kite'); this.cool = 1.2; } break;
      case 'kite': {
        this.face(dt, 6);
        const to = this.dirTo(), side = Math.sin(this.anim * .7) > 0 ? 1 : -1;
        let mx = -to.z * side * .6, mz = to.x * side * .6;
        if (d < 6.5) { mx -= to.x; mz -= to.z; } else if (d > 11) { mx += to.x; mz += to.z; }
        const l = Math.hypot(mx, mz) || 1; this.step(mx / l, mz / l, this.def.speed, dt);
        if (this.cool <= 0 && d < 22) this.set('charge');
        if (d > 32) { this.aggro = false; this.set('idle'); }
        break;
      }
      case 'charge': this.face(dt, 8); this.charge = this.st / .75;
        if (this.st > .75) {
          const from = this.eye.getWorldPosition(new THREE.Vector3()), target = this.player.head(new THREE.Vector3());
          this.game.combat.enemyOrb(from, target, this, 12);
          this.charge = 0; this.cool = 2.3 + Math.random() * .9; this.set('kite');
        }
        break;
    }
  }
  animate() {
    const t = this.anim;
    this.core.rotation.y = t * 1.2; this.body.position.y = Math.sin(t * 1.8) * .15;
    this.rings[0].rotation.set(t * 1.3, t * .7, 0); this.rings[1].rotation.set(-t * .9, 0, t * 1.1);
    this.bits.forEach((b, i) => { const a = t * 2 + i / 4 * TAU; b.position.set(Math.cos(a) * .95, Math.sin(a * 1.3) * .3, Math.sin(a) * .95); });
    this.eye.scale.setScalar(1 + this.charge * 1.4);
  }
}

export const TYPES = { skitter: Skitter, thornback: Thornback, shardling: Shardling, warden: Warden };
