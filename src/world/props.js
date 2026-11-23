// Everything that stands on an island. Low-poly shapes with per-face colour so they read as painted.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, TAU, hash2 } from '../core/util.js';

const C = h => new THREE.Color(h);

export const mats = {
  flat: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  soft: new THREE.MeshLambertMaterial({ vertexColors: true }),
  grass: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  crystal: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: C(0x1b7fa3), emissiveIntensity: 1.1 }),
  violet: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: C(0x5a2f9a), emissiveIntensity: 1 }),
  gold: new THREE.MeshLambertMaterial({ color: C(0xe8b85a), emissive: C(0x7a4a10), emissiveIntensity: .8, flatShading: true }),
  stone: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
};

export function prep(geo, color, jitter = 0, rnd = Math.random) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const n = g.attributes.position.count, c = new Float32Array(n * 3), tmp = new THREE.Color();
  for (let i = 0; i < n; i += 3) {
    tmp.copy(color);
    if (jitter) tmp.offsetHSL((rnd() - .5) * jitter * .08, 0, (rnd() - .5) * jitter);
    for (let v = 0; v < 3 && i + v < n; v++) c.set([tmp.r, tmp.g, tmp.b], (i + v) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
export function merged(parts) { const g = mergeGeometries(parts, false); g.computeVertexNormals(); g.computeBoundingSphere(); return g; }

export function instanced(geo, mat, items) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length)), o = new THREE.Object3D(), c = new THREE.Color();
  items.forEach((it, i) => {
    o.position.set(it.x, it.y, it.z); o.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
    o.scale.set(it.s || 1, (it.s || 1) * (it.sy || 1), it.s || 1); o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    if (it.tint) m.setColorAt(i, c.setRGB(it.tint[0], it.tint[1], it.tint[2]));
  });
  m.count = items.length;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.computeBoundingSphere();
  return m;
}

/* ---------- glow sprites (one draw call for many) ---------- */
export function glowPoints(list, tex) {
  const n = list.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  list.forEach((p, i) => { pos.set([p.x, p.y, p.z], i * 3); const c = C(p.color ?? 0x8be8ff); col.set([c.r * (p.k ?? 1), c.g * (p.k ?? 1), c.b * (p.k ?? 1)], i * 3); size[i] = p.size ?? 1; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tex }, uScale: glowScale, uTime: { value: 0 } },
    vertexShader: `attribute float aSize; attribute vec3 aColor; varying vec3 vC; uniform float uScale; uniform float uTime;
      void main(){ vC = aColor * (.85 + .15 * sin(uTime * 2. + position.x * .7 + position.z)); vec4 mv = modelViewMatrix * vec4(position, 1.);
      gl_PointSize = aSize * uScale / max(.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying vec3 vC; void main(){ float a = texture2D(uTex, gl_PointCoord).a; gl_FragColor = vec4(vC * a, 1.); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 2;
  return p;
}
export const glowScale = { value: 600 };   // set from the renderer height in main.js

export function additiveMat(frag, uniforms = {}, side = THREE.DoubleSide) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, ...uniforms },
    vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec3 vP; ${frag}`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side, toneMapped: false,
  });
}

/* ---------- vegetation, rocks, crystals ---------- */
export function treeGeometries() {
  const r = rng(91), ico = (s, x, y, z) => new THREE.IcosahedronGeometry(s, 0).translate(x, y, z);
  const round = merged([
    prep(new THREE.CylinderGeometry(.13, .22, 2.4, 6).translate(0, 1.2, 0), C(0x6b4a3a), .08, r),
    ...[[1.35, 0, 3.0, 0], [.95, .75, 2.6, .3], [1.0, -.65, 2.7, -.35], [.9, .1, 3.75, -.1]].map(([s, x, y, z]) => prep(ico(s, x, y, z), C(0x58a654), .18, r)),
  ]);
  const pine = merged([
    prep(new THREE.CylinderGeometry(.11, .18, 1.6, 6).translate(0, .8, 0), C(0x5e4234), .08, r),
    prep(new THREE.ConeGeometry(1.25, 1.9, 7).translate(0, 2.0, 0), C(0x3a8556), .14, r),
    prep(new THREE.ConeGeometry(1.0, 1.7, 7).translate(0, 2.9, 0), C(0x43925e), .14, r),
    prep(new THREE.ConeGeometry(.72, 1.5, 7).translate(0, 3.75, 0), C(0x4f9e66), .14, r),
  ]);
  const blossom = merged([
    prep(new THREE.CylinderGeometry(.12, .2, 2.2, 6).translate(0, 1.1, 0), C(0x6e4a44), .08, r),
    ...[[1.25, 0, 2.9, 0], [.9, .7, 2.5, .35], [.95, -.6, 2.6, -.3], [.8, .15, 3.6, -.15]].map(([s, x, y, z], i) => prep(ico(s, x, y, z), i % 2 ? C(0xf2b2cd) : C(0xf7cadd), .14, r)),
  ]);
  const aether = merged([
    prep(new THREE.CylinderGeometry(.1, .2, 2.6, 6).translate(0, 1.3, 0), C(0x4f4160), .08, r),
    ...[[1.1, 0, 3.1, 0], [.8, .6, 2.6, .25], [.85, -.55, 2.8, -.3]].map(([s, x, y, z]) => prep(ico(s, x, y, z), C(0x78d8c8), .2, r)),
  ]);
  return { round, pine, blossom, aether };
}

export function rockGeometry(seed = 1, color = 0x9a8f9e) {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = hash2(Math.round(x * 97) + Math.round(z * 31) * 7, Math.round(y * 89), seed), s = .78 + h * .44;
    p.setXYZ(i, x * s, y * s * .72, z * s);
  }
  const out = prep(g, C(color), .14, rng(seed)); out.computeVertexNormals(); out.computeBoundingSphere();
  return out;
}

export function crystalGeometry(seed = 1, color = 0x8fe9ff) {
  const r = rng(seed), parts = [], n = 3 + (r() * 3 | 0);
  for (let i = 0; i < n; i++) {
    const h = .7 + r() * 1.4, g = new THREE.OctahedronGeometry(.28, 0);
    g.scale(.55, h, .55); g.rotateZ((r() - .5) * .9); g.rotateX((r() - .5) * .9); g.translate((r() - .5) * .55, h * .5, (r() - .5) * .55);
    parts.push(prep(g, C(color).offsetHSL((r() - .5) * .05, 0, (r() - .5) * .1), .12, r));
  }
  return merged(parts);
}

export function flowerGeometry() {
  const parts = [], r = rng(57), cols = [C(0xffe68a), C(0xf5a9cc), C(0xffffff), C(0xc8b4ff)];
  for (let i = 0; i < 5; i++) {
    const a = r() * TAU, d = r() * .22, h = .12 + r() * .14;
    parts.push(prep(new THREE.CylinderGeometry(.008, .008, h, 3).translate(Math.cos(a) * d, h / 2, Math.sin(a) * d), C(0x3f7a3a), 0, r));
    parts.push(prep(new THREE.IcosahedronGeometry(.045, 0).translate(Math.cos(a) * d, h, Math.sin(a) * d), cols[i % 4], .05, r));
  }
  return merged(parts);
}

export function grassGeometry() {
  const parts = [], dark = C(0x2f6a36), light = C(0xa8da6c);
  for (let i = 0; i < 3; i++) {
    const g = new THREE.BufferGeometry(), w = .05, h = .5 + i * .08;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, 0, h, .14], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute([dark.r, dark.g, dark.b, dark.r, dark.g, dark.b, light.r, light.g, light.b], 3));
    g.rotateY(i / 3 * TAU + .3);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

/* ---------- Skyreach's spire ---------- */
export function makeSpire(glowTex) {
  const group = new THREE.Group(), r = rng(5);
  const base = prep(new THREE.CylinderGeometry(3.4, 3.9, 1.3, 10).translate(0, .2, 0), C(0xd9d3e2), .08, r);
  const steps = prep(new THREE.CylinderGeometry(2.4, 2.6, .5, 10).translate(0, 1.0, 0), C(0xe6e1ec), .06, r);
  const towerG = new THREE.CylinderGeometry(.42, 1.75, 40, 8, 24, false).translate(0, 21.2, 0);
  const tower = towerG.toNonIndexed(); for (const k of Object.keys(tower.attributes)) if (k !== 'position' && k !== 'normal') tower.deleteAttribute(k);
  const tp = tower.attributes.position, tc = new Float32Array(tp.count * 3), white = C(0xeeeaf4), gold = C(0xe2b25c), tmp = new THREE.Color();
  for (let i = 0; i < tp.count; i += 3) {
    const y = (tp.getY(i) + tp.getY(i + 1) + tp.getY(i + 2)) / 3, band = (y % 5.2) < .55;
    tmp.copy(band ? gold : white).offsetHSL(0, 0, (r() - .5) * .05).multiplyScalar(.82 + .18 * Math.min(1, y / 12));
    for (let v = 0; v < 3; v++) tc.set([tmp.r, tmp.g, tmp.b], (i + v) * 3);
  }
  tower.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  const body = new THREE.Mesh(merged([base, steps, tower]), mats.flat);
  group.add(body);
  const rings = [];
  for (let k = 0; k < 3; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7 - k * .32, .07, 6, 48), mats.gold);
    ring.position.y = 31 + k * 3.4; ring.rotation.x = Math.PI / 2 + (k - 1) * .25; group.add(ring); rings.push(ring);
  }
  const tip = new THREE.Mesh(new THREE.OctahedronGeometry(.95, 0), new THREE.MeshBasicMaterial({ color: C(0xfff1cf), toneMapped: false }));
  tip.position.y = 43.2; group.add(tip);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.16, .55, 150, 12, 1, true).translate(0, 75, 0), additiveMat(`
    void main(){ float a = (1. - vUv.y) * (1. - vUv.y); a *= .65 + .35 * sin(vUv.y * 60. - uTime * 3.);
      gl_FragColor = vec4(vec3(1., .86, .62) * a * .55, 1.); }`));
  beam.position.y = 43.2; group.add(beam);
  const glow = glowPoints([{ x: 0, y: 43.2, z: 0, size: 16, color: 0xffe4b0, k: 1.2 }, { x: 0, y: 43.2, z: 0, size: 5, color: 0xffffff, k: 1 }], glowTex);
  group.add(glow);
  return { group, radius: 3.6, update(t) { rings.forEach((g, i) => { g.rotation.z = t * (.25 + i * .12) * (i % 2 ? -1 : 1); }); tip.rotation.y = t * .6; tip.scale.setScalar(1 + Math.sin(t * 2.2) * .06); beam.material.uniforms.uTime.value = t; glow.material.uniforms.uTime.value = t; } };
}

/* ---------- waystone (respawn point) ---------- */
export function makeWaystone(glowTex) {
  const group = new THREE.Group(), r = rng(8);
  const obelisk = prep(new THREE.CylinderGeometry(.3, .55, 2.6, 4).rotateY(Math.PI / 4).translate(0, 1.3, 0), C(0x4a4562), .1, r);
  const plinth = prep(new THREE.CylinderGeometry(.95, 1.05, .35, 8).translate(0, .17, 0), C(0x8a8496), .1, r);
  group.add(new THREE.Mesh(merged([obelisk, plinth]), mats.flat));
  const runes = new THREE.Mesh(new THREE.TorusGeometry(1.25, .045, 6, 40), new THREE.MeshBasicMaterial({ color: C(0x8be8ff), toneMapped: false }));
  runes.rotation.x = Math.PI / 2; runes.position.y = .05; group.add(runes);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(.32, 0), new THREE.MeshBasicMaterial({ color: C(0xa8f2ff), toneMapped: false }));
  crystal.position.y = 3.15; crystal.scale.y = 1.6; group.add(crystal);
  const glow = glowPoints([{ x: 0, y: 3.15, z: 0, size: 4.5, color: 0x8be8ff, k: 1 }], glowTex); group.add(glow);
  return { group, radius: .7, update(t) { crystal.position.y = 3.15 + Math.sin(t * 1.6) * .12; crystal.rotation.y = t * .9; glow.position.y = crystal.position.y - 3.15; glow.material.uniforms.uTime.value = t; } };
}

/* ---------- training dummy ---------- */
export function makeDummy() {
  const group = new THREE.Group(), r = rng(12), wood = C(0x8a6446), sack = C(0xcdb184), rope = C(0x6a5036);
  const post = prep(new THREE.CylinderGeometry(.07, .09, 2.0, 6).translate(0, 1.0, 0), wood, .06, r);
  group.add(new THREE.Mesh(merged([post]), mats.flat));
  const swing = new THREE.Group(); swing.position.y = 1.95; group.add(swing);
  const parts = [
    prep(new THREE.BoxGeometry(1.1, .08, .08).translate(0, -.45, 0), wood, .06, r),
    prep(new THREE.CylinderGeometry(.3, .34, .85, 8).translate(0, -.92, 0), sack, .1, r),
    prep(new THREE.SphereGeometry(.21, 8, 6).translate(0, -.2, 0), sack, .1, r),
    prep(new THREE.TorusGeometry(.32, .03, 4, 12).rotateX(Math.PI / 2).translate(0, -.7, 0), rope, .05, r),
    prep(new THREE.TorusGeometry(.33, .03, 4, 12).rotateX(Math.PI / 2).translate(0, -1.15, 0), rope, .05, r),
    prep(new THREE.CylinderGeometry(.19, .19, .03, 16).rotateX(Math.PI / 2).translate(0, -.95, .33), C(0xd24a3c), 0, r),
    prep(new THREE.CylinderGeometry(.11, .11, .035, 16).rotateX(Math.PI / 2).translate(0, -.95, .335), C(0xf3ead8), 0, r),
    prep(new THREE.CylinderGeometry(.045, .045, .04, 12).rotateX(Math.PI / 2).translate(0, -.95, .34), C(0xd24a3c), 0, r),
  ];
  swing.add(new THREE.Mesh(merged(parts), mats.flat));
  let ax = 0, az = 0, vx = 0, vz = 0;
  return {
    group, radius: .45, hitCenter: new THREE.Vector3(0, 1.0, 0), hitRadius: .45,
    hit(dir) { vx += dir.z * 3.2; vz -= dir.x * 3.2; },
    update(dt) { vx += (-ax * 38 - vx * 4) * dt; vz += (-az * 38 - vz * 4) * dt; ax += vx * dt; az += vz * dt; swing.rotation.set(ax, 0, az); },
  };
}

/* ---------- Pell's camp ---------- */
function mapTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 320; const g = c.getContext('2d'), r = rng(31);
  g.fillStyle = '#efe2c4'; g.fillRect(0, 0, 512, 320);
  g.strokeStyle = 'rgba(120,90,60,.35)'; g.lineWidth = 1;
  for (let x = 0; x < 512; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 320); g.stroke(); }
  for (let y = 0; y < 320; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  const isle = (x, y, s, label) => {
    g.beginPath();
    for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU, rr = s * (.8 + r() * .35); i ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * .7) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * .7); }
    g.closePath(); g.fillStyle = 'rgba(122,160,110,.55)'; g.fill(); g.strokeStyle = '#5a4030'; g.lineWidth = 2; g.stroke();
    if (label) { g.fillStyle = '#4a3424'; g.font = 'italic 600 15px Georgia, serif'; g.fillText(label, x - s, y + s + 6); }
  };
  isle(150, 190, 46, 'Skyreach'); isle(330, 230, 54, 'Verdant Shelf'); isle(250, 70, 36, '? Warden');
  for (let i = 0; i < 14; i++) isle(30 + r() * 460, 20 + r() * 280, 6 + r() * 10);
  g.setLineDash([6, 6]); g.strokeStyle = '#8a3a2a'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(190, 190); g.quadraticCurveTo(260, 240, 290, 225); g.stroke();
  g.beginPath(); g.moveTo(350, 190); g.quadraticCurveTo(320, 110, 270, 90); g.stroke();
  g.setLineDash([]); g.fillStyle = '#8a3a2a'; g.font = 'bold 20px Georgia, serif'; g.fillText('X', 244, 78);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function makeCamp(glowTex) {
  const group = new THREE.Group(), r = rng(21), wood = C(0x8a6446), dark = C(0x5e4432);
  const parts = [];
  const tent = new THREE.ConeGeometry(1.9, 2.7, 4).rotateY(Math.PI / 4).translate(-2.4, 1.35, -1.6);
  parts.push(prep(tent, C(0xc7643e), .12, r));
  parts.push(prep(new THREE.BoxGeometry(.06, 2.9, .06).translate(-2.4, 1.45, -1.6), dark, 0, r));
  parts.push(prep(new THREE.ConeGeometry(.62, 1.5, 3).rotateY(Math.PI / 3).translate(-2.4, .75, -.55), C(0x3a2a24), 0, r));
  for (const [x, y, z, s] of [[1.6, .35, -1.8, .7], [2.3, .3, -1.5, .6], [1.9, .97, -1.7, .55]]) parts.push(prep(new THREE.BoxGeometry(s, s, s).rotateY(r() * .6).translate(x, y, z), wood, .1, r));
  for (const [x, z] of [[-.6, -.3], [.6, -.3], [-.6, .3], [.6, .3]]) parts.push(prep(new THREE.BoxGeometry(.07, .85, .07).translate(x, .42, z), dark, 0, r));
  parts.push(prep(new THREE.BoxGeometry(1.45, .07, .9).translate(0, .87, 0), wood, .06, r));
  parts.push(prep(new THREE.CylinderGeometry(.05, .06, 2.3, 6).translate(2.6, 1.15, .6), dark, 0, r));
  parts.push(prep(new THREE.BoxGeometry(.5, .05, .05).translate(2.4, 2.25, .6), dark, 0, r));
  for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; parts.push(prep(new THREE.DodecahedronGeometry(.16, 0).translate(.2 + Math.cos(a) * .45, .1, 2.1 + Math.sin(a) * .45), C(0x7d7488), .1, r)); }
  parts.push(prep(new THREE.CylinderGeometry(.35, .35, .12, 10).translate(-1.6, .06, .9).scale(1.5, 1, 1), C(0x5d7aa8), .05, r));
  group.add(new THREE.Mesh(merged(parts), mats.flat));
  const map = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .8), new THREE.MeshLambertMaterial({ map: mapTexture() }));
  map.rotation.x = -Math.PI / 2; map.rotation.z = .08; map.position.set(0, .915, 0); group.add(map);
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(.16, .22, .16), new THREE.MeshBasicMaterial({ color: C(0xffc46a), toneMapped: false }));
  lantern.position.set(2.2, 2.0, .6); group.add(lantern);
  const flames = new THREE.Group(); flames.position.set(.2, .1, 2.1); group.add(flames);
  const flameMat = additiveMat(`void main(){ float a = smoothstep(1., 0., vUv.y) * smoothstep(0., .25, vUv.y) * (1. - abs(vUv.x - .5) * 2.);
      gl_FragColor = vec4(mix(vec3(1., .35, .08), vec3(1., .85, .4), vUv.y * .6 + .2) * a * 1.4, 1.); }`);
  for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(.22 - i * .04, .7 - i * .12, 6, 1, true), flameMat); f.position.y = .3; f.rotation.y = i; flames.add(f); }
  const glow = glowPoints([{ x: 2.2, y: 2.0, z: .6, size: 2.4, color: 0xffc070, k: 1 }, { x: .2, y: .45, z: 2.1, size: 3.2, color: 0xff9a40, k: 1.2 }], glowTex);
  group.add(glow);
  return {
    group,
    colliders: [{ x: -2.4, z: -1.6, r: 1.6 }, { x: 2.0, z: -1.7, r: .7 }, { x: 0, z: 0, r: .85 }, { x: 2.6, z: .6, r: .2 }, { x: .2, z: 2.1, r: .55 }],
    update(t) { flames.children.forEach((f, i) => { f.scale.set(1 + Math.sin(t * 11 + i) * .12, 1 + Math.sin(t * 13 + i * 2) * .2, 1); }); flameMat.uniforms.uTime.value = t; glow.material.uniforms.uTime.value = t; },
  };
}

/* ---------- aether current: step in to ride the wind to another island ---------- */
export function makeCurrent(color = 0x8be8ff) {
  const group = new THREE.Group(), c = C(color);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.62, 48), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .9, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .06; group.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.35, 40), additiveMat(`uniform vec3 uC; void main(){ vec2 p = vUv - .5; float r = length(p) * 2., a = atan(p.y, p.x);
      float s = .5 + .5 * sin(a * 3. + r * 9. - uTime * 3.); gl_FragColor = vec4(uC * (s * .35 + .15) * (1. - r * .7), 1.); }`, { uC: { value: c } }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = .05; group.add(disc);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 8, 32, 1, true).translate(0, 4, 0), additiveMat(`uniform vec3 uC; void main(){
      float streak = pow(.5 + .5 * sin(vUv.x * 62.83 * 2. + vUv.y * 3.), 6.) * (.5 + .5 * sin(vUv.y * 20. - uTime * 6. + vUv.x * 40.));
      float a = (1. - vUv.y) * (.15 + streak * .6); gl_FragColor = vec4(uC * a, 1.); }`, { uC: { value: c } }));
  group.add(col);
  const n = 40, pg = new THREE.BufferGeometry(), pp = new Float32Array(n * 3), seeds = [];
  for (let i = 0; i < n; i++) seeds.push([Math.random() * TAU, .3 + Math.random() * 1.1, Math.random() * 8, .8 + Math.random() * 1.6]);
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: c, size: .12, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  pts.frustumCulled = false; group.add(pts);
  return {
    group, radius: 1.5,
    update(t, active = true) {
      group.visible = true;
      const k = active ? 1 : .25;
      disc.material.uniforms.uTime.value = t; col.material.uniforms.uTime.value = t; ring.material.opacity = .9 * k;
      col.visible = active;
      for (let i = 0; i < n; i++) { const [a, r, h, v] = seeds[i], y = (h + t * v) % 8; pp[i * 3] = Math.cos(a + t * .5) * r; pp[i * 3 + 1] = y; pp[i * 3 + 2] = Math.sin(a + t * .5) * r; }
      pg.attributes.position.needsUpdate = true; pts.visible = active;
    },
  };
}

/* ---------- Warden's Isle ruins ---------- */
export function makePillar(seed, h) {
  const r = rng(seed), parts = [];
  parts.push(prep(new THREE.CylinderGeometry(.95, 1.1, .5, 8).translate(0, .25, 0), C(0x8f8a96), .1, r));
  parts.push(prep(new THREE.CylinderGeometry(.62, .7, h, 8, 3).translate(0, .5 + h / 2, 0), C(0xa7a1ad), .1, r));
  const cap = new THREE.CylinderGeometry(.5, .66, .6, 8).translate(0, .5 + h + .3, 0);
  cap.rotateZ((r() - .5) * .3);
  parts.push(prep(cap, C(0x958f9c), .1, r));
  return merged(parts);
}
export function makeBrazier(glowTex) {
  const group = new THREE.Group(), r = rng(44);
  group.add(new THREE.Mesh(merged([
    prep(new THREE.CylinderGeometry(.35, .45, 1.0, 6).translate(0, .5, 0), C(0x55506a), .1, r),
    prep(new THREE.CylinderGeometry(.55, .3, .35, 8).translate(0, 1.15, 0), C(0x6a6480), .1, r),
  ]), mats.flat));
  const fireMat = additiveMat(`void main(){ float a = smoothstep(1., 0., vUv.y) * smoothstep(0., .2, vUv.y) * (1. - abs(vUv.x - .5) * 2.);
      gl_FragColor = vec4(mix(vec3(.2, .55, 1.), vec3(.7, .95, 1.), vUv.y) * a * 1.5, 1.); }`);
  const flames = [];
  for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(.3 - i * .06, 1 - i * .2, 6, 1, true), fireMat); f.position.y = 1.75; f.rotation.y = i * 1.3; group.add(f); flames.push(f); }
  const glow = glowPoints([{ x: 0, y: 1.8, z: 0, size: 4, color: 0x6fb8ff, k: 1.1 }], glowTex); group.add(glow);
  return { group, radius: .5, update(t) { flames.forEach((f, i) => f.scale.set(1 + Math.sin(t * 10 + i) * .15, 1 + Math.sin(t * 12 + i * 2) * .22, 1)); glow.material.uniforms.uTime.value = t; } };
}
export function makeArenaFloor(tex, radius) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), new THREE.MeshLambertMaterial({ map: tex }));
  m.rotation.x = -Math.PI / 2; m.position.y = .03; return m;
}

/* ---------- the Sky Key ---------- */
export function makeSkyKey(glowTex) {
  const group = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: C(0xffd98a), toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.22, .05, 8, 24), mat); ring.position.y = .42; group.add(ring);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .6, 8), mat); shaft.position.y = -.08; group.add(shaft);
  for (const [y, w] of [[-.28, .16], [-.16, .11]]) { const tooth = new THREE.Mesh(new THREE.BoxGeometry(w, .06, .05), mat); tooth.position.set(w / 2, y, 0); group.add(tooth); }
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.09, 0), new THREE.MeshBasicMaterial({ color: C(0x8be8ff), toneMapped: false })); gem.position.y = .42; group.add(gem);
  const glow = glowPoints([{ x: 0, y: .2, z: 0, size: 3.2, color: 0xffd98a, k: 1.2 }], glowTex); group.add(glow);
  return { group, update(t) { group.rotation.y = t * 1.4; group.position.y = 1.4 + Math.sin(t * 2) * .12; glow.material.uniforms.uTime.value = t; } };
}
