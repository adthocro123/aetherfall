// Procedural textures, made once at startup so the game ships no image files.
import * as THREE from 'three';
import { hash2, rng } from './util.js';

function tileNoise(x, y, period, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % period) + period) % period, y0 = ((iy % period) + period) % period;
  const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed), c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function tileFbm(px, py, size, base, oct, seed) {
  let v = 0, amp = .5, n = 0;
  for (let o = 0; o < oct; o++) {
    const p = base << o;
    v += amp * tileNoise(px / size * p, py / size * p, p, seed + o * 31);
    n += amp; amp *= .5;
  }
  return v / n;
}

// Four channels of seamless noise at different scales: R big shapes, G mid, B fine, A very broad.
export function makeNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    data[i] = tileFbm(x, y, size, 4, 5, 11) * 255;
    data[i + 1] = tileFbm(x, y, size, 8, 4, 23) * 255;
    data[i + 2] = tileFbm(x, y, size, 16, 3, 37) * 255;
    data[i + 3] = tileFbm(x, y, size, 2, 4, 53) * 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

export function makeGlowTexture(size = 128) {
  const c = canvas(size), g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(.18, 'rgba(255,255,255,.55)');
  grd.addColorStop(.5, 'rgba(255,255,255,.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return tex(c);
}

// A soft cumulus puff: overlapping soft circles, sunlit on top and shaded underneath.
export function makeCloudTexture(size = 256, seed = 4) {
  const c = canvas(size), g = c.getContext('2d'), r = rng(seed);
  const blobs = [];
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), .7);
    blobs.push([size / 2 + Math.cos(a) * d * size * .3, size * .56 + Math.sin(a) * d * size * .14 - r() * size * .1, size * (.12 + r() * .13)]);
  }
  blobs.sort((a, b) => a[1] - b[1]);
  for (const [x, y, rad] of blobs) {
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,.95)');
    grd.addColorStop(.55, 'rgba(255,255,255,.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = 'source-atop';
  const shade = g.createLinearGradient(0, size * .25, 0, size * .85);
  shade.addColorStop(0, 'rgba(255,246,236,1)');
  shade.addColorStop(.55, 'rgba(236,236,250,1)');
  shade.addColorStop(1, 'rgba(150,164,214,1)');
  g.fillStyle = shade; g.fillRect(0, 0, size, size);
  return tex(c);
}

// Stone floor for the Warden's arena: worn tiles, cracks and a ring of runes.
export function makeArenaTexture(size = 1024) {
  const c = canvas(size), g = c.getContext('2d'), r = rng(77), cx = size / 2;
  g.fillStyle = '#8f8a92'; g.fillRect(0, 0, size, size);
  const rings = 7;
  for (let k = 0; k < rings; k++) {
    const r0 = (k / rings) * cx, r1 = ((k + 1) / rings) * cx, n = 6 + k * 5;
    for (let s = 0; s < n; s++) {
      const a0 = (s / n) * Math.PI * 2 + k * .3, a1 = ((s + 1) / n) * Math.PI * 2 + k * .3;
      const l = 48 + r() * 14, sat = 6 + r() * 6;
      g.fillStyle = `hsl(${250 + r() * 30}, ${sat}%, ${l}%)`;
      g.beginPath(); g.arc(cx, cx, r1 - 3, a0, a1); g.arc(cx, cx, Math.max(0, r0 + 3), a1, a0, true); g.closePath(); g.fill();
    }
  }
  g.strokeStyle = 'rgba(40,32,52,.55)'; g.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    let x = r() * size, y = r() * size; g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 6; j++) { x += (r() - .5) * 60; y += (r() - .5) * 60; g.lineTo(x, y); }
    g.stroke();
  }
  g.strokeStyle = 'rgba(139,232,255,.9)'; g.lineWidth = 6;
  g.beginPath(); g.arc(cx, cx, cx * .62, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(cx, cx, cx * .56, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(139,232,255,.9)';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, x = cx + Math.cos(a) * cx * .59, y = cx + Math.sin(a) * cx * .59;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillRect(-6, -2, 12, 4); if (i % 2) g.fillRect(-2, -8, 4, 16);
    g.restore();
  }
  const t = tex(c); t.anisotropy = 8; return t;
}
