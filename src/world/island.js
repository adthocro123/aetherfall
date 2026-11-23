// A floating island: a walkable heightfield on top, hanging rock underneath.
// The same height function builds the mesh and answers "where is the ground?", so feet never float.
import * as THREE from 'three';
import { fbm, vnoise, clamp, smooth, TAU } from '../core/util.js';

const C = hex => new THREE.Color(hex);
export const PALETTES = {
  meadow: { grass: [C(0x5aa653), C(0x8fcf66), C(0x3f8848)], flower: [C(0xf6e8a6), C(0xf4a9c8), C(0xc9b8ff)], dirt: C(0x8a6a50), rock: [C(0xb08a7f), C(0x92707b), C(0x6c5774), C(0x463a5c)], tip: C(0x2c2640) },
  shelf: { grass: [C(0x4a9f58), C(0x7fca6a), C(0x367f50)], flower: [C(0xfff0a8), C(0x9fe7ff), C(0xffc2a0)], dirt: C(0x7a5d48), rock: [C(0xa58377), C(0x896c79), C(0x645470), C(0x403a58)], tip: C(0x282340) },
  ruin: { grass: [C(0x6c8d6b), C(0x93a884), C(0x55725e)], flower: [C(0xd8d0ff), C(0xb0f0ff), C(0xe8e0c8)], dirt: C(0x6e6062), rock: [C(0x8e8a95), C(0x74707f), C(0x585369), C(0x383349)], tip: C(0x201c30) },
  far: { grass: [C(0x6fae6a), C(0x93c97a), C(0x5a9a66)], flower: [C(0x93c97a), C(0x93c97a), C(0x93c97a)], dirt: C(0x8a7066), rock: [C(0xa48a8e), C(0x8a7386), C(0x6a5a7c), C(0x4a4262)], tip: C(0x3a3452) },
};

export class Island {
  constructor(o) {
    this.name = o.name; this.title = o.title || o.name; this.subtitle = o.subtitle || '';
    this.center = new THREE.Vector3(...o.center);
    this.radius = o.radius; this.seed = o.seed || 1;
    this.depth = o.depth ?? o.radius * 1.15;
    this.hills = o.hills ?? .8;
    this.flats = o.flats || [];
    this.pal = PALETTES[o.palette || 'meadow'];
    this.colliders = [];
    this.group = new THREE.Group(); this.group.position.copy(this.center);
    this.edge = new Float32Array(360);
    for (let i = 0; i < 360; i++) this.edge[i] = this._edge(i / 360 * TAU);
  }
  _edge(th) {
    const c = Math.cos(th), s = Math.sin(th), k = this.seed;
    const n = fbm(c * 1.1 + k * 1.7, s * 1.1 - k * .9, 3, k), n2 = vnoise(c * 3.5 + 7, s * 3.5 + k, k + 5);
    return this.radius * (.8 + .32 * n + .08 * n2);
  }
  edgeR(th) {
    let a = th / TAU * 360; a = ((a % 360) + 360) % 360;
    const i = a | 0, f = a - i;
    return this.edge[i] * (1 - f) + this.edge[(i + 1) % 360] * f;
  }
  topLocal(x, z) {
    const k = this.seed;
    let h = (fbm(x * .04 + k * 3.1, z * .04 - k * 1.3, 4, k) - .5) * 2.4 * this.hills;
    h += (vnoise(x * .22 + k, z * .22 - k, k + 3) - .5) * .22 * this.hills;
    const r = Math.hypot(x, z) / this.radius;
    h += (1 - Math.min(1, r * r)) * this.hills * .5;
    for (const f of this.flats) {
      const d = Math.hypot(x - f.x, z - f.z), w = 1 - smooth(clamp((d - f.r) / (f.blend ?? 5)));
      if (w > 0) h += (f.h - h) * w;
    }
    return h;
  }
  contains(wx, wz, margin = .45) {
    const x = wx - this.center.x, z = wz - this.center.z;
    return Math.hypot(x, z) < this.edgeR(Math.atan2(z, x)) - margin;
  }
  heightAt(wx, wz, margin = .45) {
    if (!this.contains(wx, wz, margin)) return null;
    return this.center.y + this.topLocal(wx - this.center.x, wz - this.center.z);
  }
  // Clamp a world point to stay inside the walkable edge. Returns true if it moved.
  clampInside(p, margin = .6) {
    const x = p.x - this.center.x, z = p.z - this.center.z, r = Math.hypot(x, z), th = Math.atan2(z, x);
    const lim = this.edgeR(th) - margin;
    if (r <= lim) return false;
    p.x = this.center.x + Math.cos(th) * lim; p.z = this.center.z + Math.sin(th) * lim;
    return true;
  }
  worldOf(lx, lz) { return new THREE.Vector3(this.center.x + lx, this.center.y + this.topLocal(lx, lz), this.center.z + lz); }

  build(material, detail = 1) {
    const S = Math.max(24, Math.round(84 * detail)), RT = Math.max(5, Math.round(18 * detail)), RB = Math.max(4, Math.round(13 * detail));
    const pal = this.pal, k = this.seed, tmp = new THREE.Color();
    const pos = [], col = [], idx = [], rows = [];
    let vi = 0;
    const V = (x, y, z, c) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); return vi++; };

    for (let i = 0; i <= RT; i++) {
      const f = Math.pow(i / RT, .82), row = [];
      for (let j = 0; j < S; j++) {
        const th = j / S * TAU, r = f * this.edgeR(th) * .995, x = Math.cos(th) * r, z = Math.sin(th) * r;
        let y = this.topLocal(x, z);
        const g = fbm(x * .07 + k, z * .07, 3, k + 11), g2 = vnoise(x * .55, z * .55, k + 13);
        tmp.copy(pal.grass[0]).lerp(pal.grass[1], clamp(g * 1.7 - .35)).lerp(pal.grass[2], clamp((.42 - g) * 2.6) * .8);
        if (g2 > .93) tmp.lerp(pal.flower[(g2 * 1000 | 0) % 3], .18);
        if (i === RT) { tmp.lerp(pal.dirt, .5); y -= .12; }
        row.push(V(x, y, z, tmp));
      }
      rows.push(row);
    }
    { // overhanging lip where the grass meets the cliff
      const row = [];
      for (let j = 0; j < S; j++) {
        const th = j / S * TAU, R = this.edgeR(th), x = Math.cos(th) * R * 1.02, z = Math.sin(th) * R * 1.02;
        const y = this.topLocal(x * .97, z * .97) - .9 - vnoise(th * 5, 1, k + 17) * .7;
        tmp.copy(pal.dirt).lerp(pal.rock[0], .45);
        row.push(V(x, y, z, tmp));
      }
      rows.push(row);
    }
    for (let q = 1; q <= RB; q++) {
      const t = q / RB, row = [];
      for (let j = 0; j < S; j++) {
        const th = j / S * TAU, R = this.edgeR(th);
        const spike = Math.pow(Math.max(0, Math.sin(th * 5 + k * 2.3)), 4) * .4 + Math.pow(Math.max(0, Math.sin(th * 11 + k)), 6) * .25;
        const shrink = Math.pow(t, 1.2) * (1 - spike * t * .55);
        const r = R * Math.max(.02, 1 - shrink) * (.93 + .14 * vnoise(th * 4, t * 3, k + 21));
        const x = Math.cos(th) * r, z = Math.sin(th) * r;
        const y = -1.4 - this.depth * Math.pow(t, 1.05) * (1 + spike * .9) + (vnoise(th * 6, t * 5, k + 29) - .5) * 1.4;
        const bi = clamp(-y / (this.depth * 1.5)) * 3, i0 = Math.min(2, bi | 0);
        tmp.copy(pal.rock[i0]).lerp(pal.rock[i0 + 1], bi - i0);
        const strata = Math.sin(y * 1.7 + vnoise(th * 3, y * .3, k + 31) * 3);
        tmp.multiplyScalar(.86 + .14 * strata);
        row.push(V(x, y, z, tmp));
      }
      rows.push(row);
    }
    const tip = V(0, -1.4 - this.depth * 1.22, 0, pal.tip);
    for (let r = 0; r < rows.length - 1; r++) {
      const a = rows[r], b = rows[r + 1];
      for (let j = 0; j < S; j++) { const j2 = (j + 1) % S; idx.push(a[j], a[j2], b[j], a[j2], b[j2], b[j]); }
    }
    const last = rows[rows.length - 1];
    for (let j = 0; j < S; j++) idx.push(last[j], last[(j + 1) % S], tip);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.geometry = geo;
    if (material) { this.mesh = new THREE.Mesh(geo, material); this.mesh.receiveShadow = false; this.group.add(this.mesh); }
    return geo;
  }
}
