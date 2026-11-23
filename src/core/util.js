// Small math and noise helpers shared by every system.
export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const smooth = t => t * t * (3 - 2 * t);
export const easeOut = t => 1 - Math.pow(1 - t, 3);
export const easeIn = t => t * t * t;
export const easeInOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return d;
}
export const dampAngle = (a, b, lambda, dt) => a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function vnoise(x, y, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, oct = 4, s = 0) {
  let v = 0, amp = .5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { v += amp * vnoise(x * f, y * f, s + i * 17); n += amp; amp *= .5; f *= 2.03; }
  return v / n;
}

export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Shortest distance from point P to segment AB.
export function segPointDist(ax, ay, az, bx, by, bz, px, py, pz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const ab2 = abx * abx + aby * aby + abz * abz;
  let t = ab2 > 1e-9 ? ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / ab2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + abx * t - px, dy = ay + aby * t - py, dz = az + abz * t - pz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];
