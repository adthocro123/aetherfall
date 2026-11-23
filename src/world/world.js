// The three islands of the First Chain, what stands on them, and how you travel between them.
import * as THREE from 'three';
import { Island } from './island.js';
import { Sky } from './sky.js';
import * as P from './props.js';
import { rng, TAU } from '../core/util.js';
import { makeArenaTexture } from '../core/textures.js';

export const ISLES = {
  skyreach: {
    name: 'skyreach', title: 'Skyreach', subtitle: 'The spire island', center: [0, 0, 0], radius: 28, seed: 3, hills: .75, palette: 'meadow',
    flats: [{ x: 7, z: -9, r: 4.5, h: .5 }, { x: -7, z: 2, r: 5.5, h: .2 }, { x: 0, z: 9, r: 3, h: .3 }, { x: 6.5, z: 4.5, r: 2.4, h: .25 }, { x: 17, z: -2, r: 2.8, h: .45 }],
  },
  verdant: {
    name: 'verdant', title: 'Verdant Shelf', subtitle: 'Where the swarm nests', center: [108, -7, -42], radius: 37, seed: 7, hills: 1.2, palette: 'shelf',
    flats: [{ x: -25, z: 0, r: 4, h: .3 }, { x: -24, z: 7, r: 2.4, h: .3 }, { x: 22, z: -19, r: 3.2, h: .6 }],
  },
  warden: {
    name: 'warden', title: "Warden's Isle", subtitle: 'The first chain ends here', center: [-40, 20, -132], radius: 26, seed: 13, hills: .55, palette: 'ruin',
    flats: [{ x: 0, z: 0, r: 15, h: 0, blend: 3 }, { x: 0, z: 18, r: 4, h: .2 }],
  },
};

export class World {
  constructor(game) {
    this.game = game; this.scene = game.scene;
    this.islands = {}; this.interactables = []; this.updaters = []; this.landing = {}; this.waystones = {}; this.spawns = {};
  }

  build() {
    const { scene, tex } = this.game;
    this.sky = new Sky(scene, tex.noise, tex.cloud);
    for (const def of Object.values(ISLES)) {
      const isl = new Island(def); isl.build(P.mats.flat, 1);
      scene.add(isl.group); this.islands[def.name] = isl;
    }
    this.trees = P.treeGeometries();
    this.grassGeo = P.grassGeometry();
    this.buildSkyreach(); this.buildVerdant(); this.buildWarden();
    this.sky.makeFarIslands(Object.values(this.islands).map(i => [i.center.x, i.center.z, i.radius + 60]));
  }

  /* ---------- helpers ---------- */
  at(isl, lx, lz) { return isl.worldOf(lx, lz); }
  safe(isl, lx, lz) {
    let x = lx, z = lz;
    for (let i = 0; i < 40 && !isl.contains(isl.center.x + x, isl.center.z + z, 2.5); i++) { x *= .94; z *= .94; }
    return [x, z];
  }
  place(isl, obj, lx, lz, ry = 0) {
    const p = this.at(isl, lx, lz);
    obj.position.set(lx, p.y - isl.center.y, lz); obj.rotation.y = ry; isl.group.add(obj);
    return p;
  }
  collide(isl, wx, wz, r) { isl.colliders.push({ x: wx, z: wz, r }); }
  scatter(isl, n, seed, { minGap = 2.2, avoid = [], margin = 3, near = null } = {}) {
    const r = rng(seed), out = [];
    let tries = 0;
    while (out.length < n && tries++ < n * 40) {
      let lx, lz;
      if (near) { const a = r() * TAU, d = Math.sqrt(r()) * near.r; lx = near.x + Math.cos(a) * d; lz = near.z + Math.sin(a) * d; }
      else { const a = r() * TAU, d = Math.sqrt(r()) * isl.radius * 1.15; lx = Math.cos(a) * d; lz = Math.sin(a) * d; }
      const wx = isl.center.x + lx, wz = isl.center.z + lz;
      if (!isl.contains(wx, wz, margin)) continue;
      if (avoid.some(a => Math.hypot(lx - a.x, lz - a.z) < a.r)) continue;
      if (out.some(o => Math.hypot(lx - o.lx, lz - o.lz) < minGap)) continue;
      out.push({ lx, lz, x: lx, y: isl.topLocal(lx, lz) - .05, z: lz, r });
    }
    return out;
  }
  forest(isl, seed, counts, avoid) {
    const r = rng(seed);
    for (const [kind, n] of Object.entries(counts)) {
      const pts = this.scatter(isl, n, seed + kind.length * 13, { minGap: 3.4, avoid, margin: 2.6 });
      const items = pts.map(p => ({ x: p.x, y: p.y, z: p.z, s: .85 + r() * .55, ry: r() * TAU, tint: [.88 + r() * .2, .9 + r() * .16, .88 + r() * .18] }));
      isl.group.add(P.instanced(this.trees[kind], P.mats.flat, items));
      for (const it of items) this.collide(isl, isl.center.x + it.x, isl.center.z + it.z, .4 * it.s);
    }
  }
  rocks(isl, seed, n, avoid, color) {
    const r = rng(seed), pts = this.scatter(isl, n, seed, { minGap: 2.6, avoid, margin: 1.5 });
    const items = pts.map(p => { const s = .35 + Math.pow(r(), 2) * 1.5; return { x: p.x, y: p.y + s * .15, z: p.z, s, ry: r() * TAU, tint: [1, 1, 1] }; });
    isl.group.add(P.instanced(P.rockGeometry(seed, color), P.mats.flat, items));
    for (const it of items) if (it.s > .7) this.collide(isl, isl.center.x + it.x, isl.center.z + it.z, it.s * .85);
  }
  grass(isl, seed, n, avoid) {
    const r = rng(seed), pts = this.scatter(isl, n, seed, { minGap: .55, avoid, margin: 1.2 });
    isl.group.add(P.instanced(this.grassGeo, P.mats.grass, pts.map(p => ({ x: p.x, y: p.y + .05, z: p.z, s: .6 + r() * .7, ry: r() * TAU, tint: [.85 + r() * .3, .9 + r() * .2, .85 + r() * .2] }))));
    if (isl.pal.flower) {
      this.flowerGeo = this.flowerGeo || P.flowerGeometry();
      const fl = this.scatter(isl, Math.round(n / 9), seed + 3, { minGap: 1.4, avoid, margin: 1.5 });
      isl.group.add(P.instanced(this.flowerGeo, P.mats.flat, fl.map(p => ({ x: p.x, y: p.y + .02, z: p.z, s: .8 + r() * .7, ry: r() * TAU }))));
    }
  }
  crystals(isl, seed, n, opts, color = 0x8fe9ff, violet = false) {
    const r = rng(seed), pts = this.scatter(isl, n, seed, { minGap: 4, margin: 2.5, ...opts });
    const geo = P.crystalGeometry(seed, color);
    isl.group.add(P.instanced(geo, violet ? P.mats.violet : P.mats.crystal, pts.map(p => ({ x: p.x, y: p.y, z: p.z, s: .8 + r() * .8, ry: r() * TAU }))));
    const g = P.glowPoints(pts.map(p => ({ x: p.x, y: p.y + 1, z: p.z, size: 3.2, color: violet ? 0xb48cff : 0x8be8ff, k: .55 })), this.game.tex.glow);
    isl.group.add(g); this.updaters.push(t => { g.material.uniforms.uTime.value = t; });
    for (const p of pts) this.collide(isl, isl.center.x + p.x, isl.center.z + p.z, .7);
  }
  current(isl, lx, lz, to, label, enabled, lockedLabel) {
    const c = P.makeCurrent(to === 'warden' ? 0xffc07a : 0x8be8ff); const p = this.place(isl, c.group, lx, lz);
    const it = { id: `current-${isl.name}-${to}`, kind: 'current', island: isl.name, pos: p, r: 1.7, to, label, lockedLabel, enabled: enabled || (() => true), obj: c };
    this.interactables.push(it);
    this.updaters.push(t => c.update(t, it.enabled()));
    return it;
  }
  waystone(isl, lx, lz, spawn) {
    const w = P.makeWaystone(this.game.tex.glow); const p = this.place(isl, w.group, lx, lz);
    this.collide(isl, p.x, p.z, .75);
    this.waystones[isl.name] = { pos: this.at(isl, spawn[0], spawn[1]), yaw: spawn[2] };
    this.interactables.push({ id: `way-${isl.name}`, kind: 'waystone', island: isl.name, pos: p, r: 2.2, label: 'Rest at the waystone' });
    this.updaters.push(t => w.update(t));
  }

  /* ---------- Skyreach: home ---------- */
  buildSkyreach() {
    const isl = this.islands.skyreach, glow = this.game.tex.glow;
    const spire = P.makeSpire(glow); const sp = this.place(isl, spire.group, 7, -9);
    this.collide(isl, sp.x, sp.z, spire.radius); this.updaters.push(t => spire.update(t));
    this.spire = { pos: sp };

    const camp = P.makeCamp(glow); const cp = this.place(isl, camp.group, -7, 2, .5);
    const cos = Math.cos(.5), sin = Math.sin(.5);
    for (const c of camp.colliders) this.collide(isl, cp.x + c.x * cos + c.z * sin, cp.z - c.x * sin + c.z * cos, c.r);
    this.updaters.push(t => camp.update(t));
    this.camp = { pos: cp, yaw: .5 };

    this.waystone(isl, 0, 9.5, [0, 6.8, 0]);
    this.landing.skyreach = { pos: this.at(isl, 14.5, -2), yaw: Math.PI / 2 };

    const dummy = P.makeDummy(); const dp = this.place(isl, dummy.group, 6.5, 4.5, -.3);
    this.collide(isl, dp.x, dp.z, .35); this.updaters.push((t, dt) => dummy.update(dt));
    this.dummy = { ...dummy, pos: dp, center: new THREE.Vector3(dp.x, dp.y + 1.0, dp.z) };

    this.current(isl, 17.5, -2, 'verdant', 'Ride the aether current to Verdant Shelf');

    const avoid = [{ x: 7, z: -9, r: 6 }, { x: -7, z: 2, r: 6.5 }, { x: 0, z: 9.5, r: 4 }, { x: 6.5, z: 4.5, r: 3 }, { x: 17, z: -2, r: 4 }, { x: 0, z: 4, r: 4 }];
    this.forest(isl, 41, { round: 12, pine: 8, blossom: 7 }, avoid);
    this.rocks(isl, 43, 14, avoid);
    this.grass(isl, 47, 900, [{ x: 7, z: -9, r: 4.2 }, { x: 0, z: 9.5, r: 1.6 }]);
    this.crystals(isl, 49, 5, { near: { x: 7, z: -9, r: 9 }, avoid: [{ x: 7, z: -9, r: 4.6 }] });
  }

  /* ---------- Verdant Shelf: the swarm ---------- */
  buildVerdant() {
    const isl = this.islands.verdant, q = this.game.quests;
    const [lx, lz] = this.safe(isl, -24.5, 0);
    this.landing.verdant = { pos: this.at(isl, lx, lz), yaw: -Math.PI / 2 };
    this.current(isl, -24, 7, 'skyreach', 'Ride the aether current home to Skyreach');
    this.current(isl, 22, -19, 'warden', "Ride the aether current to the Warden's Isle", () => q.allows('warden'), 'The current is too weak to carry you. Pell might know more.');
    this.waystone(isl, -21, -5, [lx + 1, lz, -Math.PI / 2]);
    const avoid = [{ x: -24, z: 2, r: 8 }, { x: 22, z: -19, r: 4.5 }, { x: -21, z: -5, r: 2.5 }];
    this.forest(isl, 51, { round: 14, pine: 6, blossom: 12, aether: 10 }, avoid);
    this.rocks(isl, 53, 22, avoid, 0x9c8aa0);
    this.grass(isl, 57, 1500, avoid.slice(1));
    this.crystals(isl, 59, 10, { avoid }, 0x8fe9ff);
    this.crystals(isl, 61, 6, { avoid }, 0xc4a0ff, true);
    this.spawns.verdant = [
      { type: 'skitter', x: -6, z: 9, n: 3 }, { type: 'skitter', x: 10, z: -9, n: 3 }, { type: 'skitter', x: 13, z: 13, n: 3 },
      { type: 'thornback', x: 1, z: -17, n: 1 }, { type: 'thornback', x: 20, z: 3, n: 1 },
      { type: 'shardling', x: -11, z: -12, n: 1 }, { type: 'shardling', x: 5, z: 21, n: 1 },
    ];
  }

  /* ---------- Warden's Isle: the arena ---------- */
  buildWarden() {
    const isl = this.islands.warden, glow = this.game.tex.glow, r = rng(71);
    isl.group.add(P.makeArenaFloor(makeArenaTexture(), 14.6));
    const [lx, lz] = this.safe(isl, 0, 18.5);
    this.landing.warden = { pos: this.at(isl, lx, lz), yaw: 0 };
    this.current(isl, -6, 19, 'skyreach', 'Ride the aether current home to Skyreach');
    this.waystone(isl, 6, 19, [lx, lz - .5, 0]);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU + .2, d = 16.5, h = i % 3 === 1 ? 2.2 + r() * 1.5 : 5 + r() * 3;
      const px = Math.cos(a) * d, pz = Math.sin(a) * d;
      if (Math.abs(px) < 4 && pz > 10) continue;
      const m = new THREE.Mesh(P.makePillar(80 + i, h), P.mats.flat); const p = this.place(isl, m, px, pz, r() * TAU);
      this.collide(isl, p.x, p.z, 1.0);
    }
    for (const a of [.785, 2.356, 3.927, 5.498]) {
      const b = P.makeBrazier(glow); const p = this.place(isl, b.group, Math.cos(a) * 13.2, Math.sin(a) * 13.2);
      this.collide(isl, p.x, p.z, .55); this.updaters.push(t => b.update(t));
    }
    const avoid = [{ x: 0, z: 0, r: 18.5 }, { x: 0, z: 18.5, r: 8 }];
    this.forest(isl, 73, { pine: 9 }, avoid);
    this.rocks(isl, 75, 16, [{ x: 0, z: 0, r: 15 }, { x: 0, z: 18.5, r: 6 }], 0x8a8696);
    this.grass(isl, 77, 500, [{ x: 0, z: 0, r: 15 }]);
    this.arena = { center: isl.worldOf(0, 0), radius: 14 };
  }

  /* ---------- queries ---------- */
  islandAt(x, z, margin = .45) { for (const k in this.islands) if (this.islands[k].contains(x, z, margin)) return this.islands[k]; return null; }
  groundAt(x, z) {
    for (const k in this.islands) { const y = this.islands[k].heightAt(x, z); if (y !== null) return { y, island: this.islands[k] }; }
    return null;
  }
  resolve(p, r, isl) {
    if (!isl) return false;
    let moved = false;
    for (const c of isl.colliders) {
      const dx = p.x - c.x, dz = p.z - c.z, m = c.r + r;
      if (Math.abs(dx) > m || Math.abs(dz) > m) continue;
      const d = Math.hypot(dx, dz);
      if (d < m && d > 1e-5) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; moved = true; }
    }
    return moved;
  }
  update(dt, t, camPos) {
    this.sky.update(t, camPos);
    for (const u of this.updaters) u(t, dt);
  }
}
