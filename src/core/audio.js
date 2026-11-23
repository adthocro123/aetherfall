// Every sound in Aetherfall is synthesized live with Web Audio: no samples, no files.
// A: context, buses, reverb, spatial helpers. Voice: instruments. S: sound effects. Music: per-island themes.
import { clamp } from './util.js';

export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export const A = {
  ctx: null, out: null, verb: null, noise: null, sfx: null, music: null, ui: null, amb: null,
  volume: .85, muted: false,
  init() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { this.ctx = new AC(); } catch { return false; }
    const ctx = this.ctx;
    this.out = ctx.createGain(); this.out.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = .004; comp.release.value = .25;
    this.out.connect(comp); comp.connect(ctx.destination);
    this.verb = ctx.createConvolver(); this.verb.buffer = this.ir(3.2, 2.8);
    const vg = ctx.createGain(); vg.gain.value = .8; this.verb.connect(vg); vg.connect(this.out);
    const len = ctx.sampleRate * 3 | 0, nb = ctx.createBuffer(1, len, ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
    this.sfx = this.bus(); this.music = this.bus(); this.ui = this.bus(); this.amb = this.bus();
    this.music.dry.gain.value = .9;
    return true;
  },
  ir(sec, decay) {
    const ctx = this.ctx, rate = ctx.sampleRate, len = rate * sec | 0, b = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  },
  bus() { const dry = this.ctx.createGain(), wet = this.ctx.createGain(); dry.connect(this.out); wet.connect(this.verb); return { dry, wet }; },
  killBus(name, fade = .6) {
    if (!this.ctx) return;
    const b = this[name], t = this.ctx.currentTime;
    for (const g of [b.dry, b.wet]) {
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade);
      setTimeout(() => { try { g.disconnect(); } catch {} }, fade * 1000 + 400);
    }
    this[name] = this.bus();
    if (name === 'music') this.music.dry.gain.value = .9;
  },
  send(node, bus, wet = .25) {
    node.connect(bus.dry);
    if (wet > 0) { const s = this.ctx.createGain(); s.gain.value = wet; node.connect(s); s.connect(bus.wet); }
  },
  pan(node, v) {
    if (!this.ctx.createStereoPanner || !v) return node;
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(v, -1, 1); node.connect(p); return p;
  },
  spatial(pos) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 2.5; p.maxDistance = 150; p.rolloffFactor = 1.1;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    return p;
  },
  route(node, bus, wet = .2, pos = null) {
    let n = node;
    if (pos) { const p = this.spatial(pos); node.connect(p); n = p; }
    this.send(n, bus, wet);
  },
  listen(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener, e = camera.matrixWorld.elements;
    const v = [e[12], e[13], e[14], -e[8], -e[9], -e[10], e[4], e[5], e[6]];
    if (l.positionX) {
      const t = this.ctx.currentTime, k = ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'];
      for (let i = 0; i < 9; i++) l[k[i]].setTargetAtTime(v[i], t, .015);
    } else { l.setPosition(v[0], v[1], v[2]); l.setOrientation(v[3], v[4], v[5], v[6], v[7], v[8]); }
  },
  noiseSrc(loop) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = !!loop; return s; },
  now() { return this.ctx ? this.ctx.currentTime : 0; },
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); },
  setVolume(v) { this.volume = v; if (this.ctx && !this.muted) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, .05); },
  setMuted(m) { this.muted = m; if (this.ctx) this.out.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, .05); },
};

function env(t, a, peak, hold, rel) {
  const g = A.ctx.createGain(), p = Math.max(.0002, peak);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(p, t + a);
  g.gain.setValueAtTime(p, t + a + hold); g.gain.exponentialRampToValueAtTime(.0001, t + a + hold + rel);
  return g;
}
function osc(type, f) { const o = A.ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
function filt(type, f, q = .7) { const b = A.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }

/* ---------------- instruments ---------------- */
export const Voice = {
  pad(t, m, dur, gain, bus, att = 1.2) {
    const ctx = A.ctx, f = mtof(m), rel = 2.4, end = t + Math.max(att, dur);
    const lp = filt('lowpass', 520, .6);
    lp.frequency.setValueAtTime(520, t); lp.frequency.linearRampToValueAtTime(1500, t + Math.min(dur, 2.6)); lp.frequency.linearRampToValueAtTime(760, end + rel);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + att); g.gain.setValueAtTime(gain, end); g.gain.linearRampToValueAtTime(0, end + rel);
    for (const [det, type, mul, amp] of [[-8, 'sawtooth', 1, .5], [8, 'sawtooth', 1, .5], [0, 'triangle', .5, .7]]) {
      const o = osc(type, f * mul); o.detune.value = det; const og = ctx.createGain(); og.gain.value = amp;
      o.connect(og); og.connect(lp); o.start(t); o.stop(end + rel + .1);
    }
    lp.connect(g); A.send(g, bus, .7);
  },
  bass(t, m, dur, gain, bus, att = .5) {
    const ctx = A.ctx, f = mtof(m), end = t + Math.max(att, dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + att); g.gain.setValueAtTime(gain, end); g.gain.linearRampToValueAtTime(0, end + 1.6);
    const lp = filt('lowpass', 420);
    for (const [type, mul, amp] of [['sine', 1, 1], ['triangle', 2, .35]]) { const o = osc(type, f * mul); const og = ctx.createGain(); og.gain.value = amp; o.connect(og); og.connect(lp); o.start(t); o.stop(end + 1.7); }
    lp.connect(g); A.send(g, bus, .15);
  },
  pluck(t, m, gain, bus, pan = 0) {
    const ctx = A.ctx, f = mtof(m);
    const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + 1.8);
    const lp = filt('lowpass', 5200); lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(760, t + .5);
    const o = osc('triangle', f), o2 = osc('sine', f * 2), g2 = ctx.createGain(); g2.gain.value = .3;
    o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); A.send(A.pan(g, pan), bus, .5);
    o.start(t); o2.start(t); o.stop(t + 1.9); o2.stop(t + 1.9);
  },
  lead(t, m, dur, gain, bus) {
    const ctx = A.ctx, f = mtof(m);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .06); g.gain.setTargetAtTime(gain * .72, t + .16, .4);
    g.gain.setValueAtTime(gain * .7, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + .6);
    const o = osc('sine', f), o2 = osc('triangle', f * 2), g2 = ctx.createGain(); g2.gain.value = .1; o2.connect(g2); g2.connect(g);
    const vib = osc('sine', 5.1), vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * .006, t + .5); vib.connect(vg); vg.connect(o.frequency);
    o.connect(g); A.send(g, bus, .6);
    for (const x of [o, o2, vib]) { x.start(t); x.stop(t + dur + .7); }
  },
  saw(t, m, dur, gain, bus, cutoff = 900) {
    const ctx = A.ctx, f = mtof(m);
    const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    const lp = filt('lowpass', cutoff, 3); lp.frequency.setValueAtTime(cutoff * 2.2, t); lp.frequency.exponentialRampToValueAtTime(cutoff * .5, t + dur);
    const o = osc('sawtooth', f), o2 = osc('square', f * .5), g2 = ctx.createGain(); g2.gain.value = .4;
    o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); A.send(g, bus, .08);
    o.start(t); o2.start(t); o.stop(t + dur + .05); o2.stop(t + dur + .05);
  },
  kick(t, bus, gain = .55) {
    const o = osc('sine', 140); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + .16);
    const g = env(t, .002, gain, .02, .26); o.connect(g); A.send(g, bus, .05); o.start(t); o.stop(t + .35);
  },
  tom(t, f, bus, gain = .32) {
    const o = osc('sine', f); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * .55, t + .22);
    const g = env(t, .002, gain, .01, .3); o.connect(g); A.send(g, bus, .25); o.start(t); o.stop(t + .4);
  },
  hat(t, bus, gain = .05) {
    const n = A.noiseSrc(), hp = filt('highpass', 7200); const g = env(t, .001, gain, 0, .04);
    n.connect(hp); hp.connect(g); A.send(g, bus, .05); n.start(t, Math.random() * 2); n.stop(t + .07);
  },
  snare(t, bus, gain = .18) {
    const n = A.noiseSrc(), bp = filt('bandpass', 1900, .9); const g = env(t, .001, gain, 0, .14);
    n.connect(bp); bp.connect(g); A.send(g, bus, .3); n.start(t, Math.random() * 2); n.stop(t + .2);
    const o = osc('triangle', 210); const go = env(t, .001, gain * .6, 0, .08); o.connect(go); A.send(go, bus, .1); o.start(t); o.stop(t + .12);
  },
};

/* ---------------- sound effects ---------------- */
const RAW = {
  bell(t, f, gain = .1, decay = 2.4, bus = A.sfx, wet = .55, pan = 0, pos = null) {
    const ctx = A.ctx, g = ctx.createGain();
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + decay);
    [[1, 1], [2, .32], [3.01, .12], [4.17, .05], [5.43, .025]].forEach(([m, a], i) => {
      const o = osc('sine', f * m), og = ctx.createGain(); og.gain.setValueAtTime(a, t);
      if (i) og.gain.exponentialRampToValueAtTime(.0001, t + decay / (1 + i * 1.2));
      o.connect(og); og.connect(g); o.start(t); o.stop(t + decay + .05);
    });
    A.route(pos ? g : A.pan(g, pan), bus, wet, pos);
  },
  blip(t, f = 1800, gain = .03, dur = .035, type = 'square', bus = A.ui) {
    const o = osc(type, f), lp = filt('lowpass', 3600), g = A.ctx.createGain();
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .003); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(lp); lp.connect(g); A.send(g, bus, .15); o.start(t); o.stop(t + dur + .02);
  },
  swell(t, dur, peak = .2, f0 = 500, f1 = 7000, bus = A.sfx) {
    const n = A.noiseSrc(true), f = filt('bandpass', f0, .9);
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = A.ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + .05);
    n.connect(f); f.connect(g); A.send(g, bus, .3); n.start(t, Math.random()); n.stop(t + dur + .1);
  },
  impact(t, k = 1, pos = null) {
    const o = osc('sine', 90); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.2);
    const g = env(t, .006, .8 * k, .04, 1.4); o.connect(g); A.route(g, A.sfx, .15, pos); o.start(t); o.stop(t + 1.7);
    const n = A.noiseSrc(true), f = filt('lowpass', 4000); f.frequency.setValueAtTime(4000, t); f.frequency.exponentialRampToValueAtTime(180, t + 1.2);
    const gn = env(t, .003, .42 * k, 0, 1.3); n.connect(f); f.connect(gn); A.route(gn, A.sfx, .5, pos); n.start(t, Math.random()); n.stop(t + 1.5);
  },
  swing(speed = 6, pos = null) {
    const ctx = A.ctx, t = ctx.currentTime, k = clamp(speed / 8, .3, 1.2);
    const n = A.noiseSrc(), bp = filt('bandpass', 700, 1.8);
    bp.frequency.setValueAtTime(600 + 400 * k, t); bp.frequency.exponentialRampToValueAtTime(2400 + 2600 * k, t + .09); bp.frequency.exponentialRampToValueAtTime(500, t + .26);
    const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.15 * k, t + .07); g.gain.exponentialRampToValueAtTime(.0001, t + .28);
    n.connect(bp); bp.connect(g); A.route(g, A.sfx, .12, pos); n.start(t, Math.random() * 2); n.stop(t + .3);
  },
  hit(kind = 'flesh', pos = null, power = 1) {
    const ctx = A.ctx, t = ctx.currentTime;
    const f0 = kind === 'stone' ? 120 : kind === 'crystal' ? 260 : kind === 'wood' ? 220 : 170;
    const o = osc('sine', f0); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * .4, t + .12);
    const g = env(t, .003, .36 * power, .01, .16); o.connect(g); A.route(g, A.sfx, .1, pos); o.start(t); o.stop(t + .25);
    const n = A.noiseSrc(), f = filt(kind === 'stone' ? 'lowpass' : 'bandpass', kind === 'stone' ? 1500 : kind === 'wood' ? 1800 : 3200, .8);
    const gn = env(t, .001, .3 * power, 0, kind === 'wood' ? .05 : .09); n.connect(f); f.connect(gn); A.route(gn, A.sfx, .15, pos); n.start(t, Math.random() * 2); n.stop(t + .14);
    if (kind === 'crystal') RAW.bell(t, 1700 + Math.random() * 900, .05 * power, .9, A.sfx, .5, 0, pos);
    if (kind === 'stone') { const q = osc('square', 86), lp = filt('lowpass', 600), gq = env(t, .002, .09 * power, .02, .2); q.connect(lp); lp.connect(gq); A.route(gq, A.sfx, .2, pos); q.start(t); q.stop(t + .3); }
  },
  death(kind = 'crystal', pos = null) {
    const ctx = A.ctx, t = ctx.currentTime;
    const n = A.noiseSrc(), hp = filt(kind === 'stone' ? 'lowpass' : 'highpass', kind === 'stone' ? 900 : 2500);
    const g = env(t, .002, .3, .02, kind === 'stone' ? .9 : .35); n.connect(hp); hp.connect(g); A.route(g, A.sfx, .4, pos); n.start(t, Math.random()); n.stop(t + 1);
    if (kind !== 'stone') for (let i = 0; i < 4; i++) RAW.bell(t + i * .05, 1400 + Math.random() * 1600 - i * 120, .035, 1.2, A.sfx, .6, 0, pos);
    else RAW.impact(t, .5, pos);
  },
  hurt() {
    const t = A.ctx.currentTime;
    const o = osc('sine', 110); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(48, t + .2);
    const g = env(t, .004, .5, .02, .25); o.connect(g); A.send(g, A.sfx, .1); o.start(t); o.stop(t + .35);
    const n = A.noiseSrc(), lp = filt('lowpass', 900), gn = env(t, .002, .22, 0, .18); n.connect(lp); lp.connect(gn); A.send(gn, A.sfx, .1); n.start(t, Math.random()); n.stop(t + .25);
  },
  heartbeat() {
    const t = A.ctx.currentTime;
    for (const [dt, v] of [[0, 1], [.24, .7]]) {
      const o = osc('sine', 90); o.frequency.setValueAtTime(90, t + dt); o.frequency.exponentialRampToValueAtTime(42, t + dt + .15);
      const g = env(t + dt, .006, .35 * v, .02, .2); o.connect(g); A.send(g, A.sfx, 0); o.start(t + dt); o.stop(t + dt + .35);
    }
  },
  bolt(pos = null) {
    const ctx = A.ctx, t = ctx.currentTime;
    const o = osc('sawtooth', 300); o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(1300, t + .14);
    const lp = filt('lowpass', 2400, 4), g = env(t, .004, .1, .03, .2); o.connect(lp); lp.connect(g); A.route(g, A.sfx, .4, pos); o.start(t); o.stop(t + .3);
    RAW.swell(t, .12, .08, 1500, 7000);
  },
  zap(pos = null, k = 1) {
    const t = A.ctx.currentTime, n = A.noiseSrc(), bp = filt('bandpass', 2600, 1.2);
    bp.frequency.setValueAtTime(3200, t); bp.frequency.exponentialRampToValueAtTime(700, t + .25);
    const g = env(t, .002, .22 * k, 0, .25); n.connect(bp); bp.connect(g); A.route(g, A.sfx, .4, pos); n.start(t, Math.random() * 2); n.stop(t + .3);
    RAW.bell(t, 980 + Math.random() * 200, .04 * k, .7, A.sfx, .5, 0, pos);
  },
  orb(pos = null) {
    const t = A.ctx.currentTime, o = osc('triangle', 520); o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(260, t + .3);
    const g = env(t, .01, .12, .05, .3); o.connect(g); A.route(g, A.sfx, .5, pos); o.start(t); o.stop(t + .45);
  },
  deflect(pos = null) {
    const t = A.ctx.currentTime;
    RAW.bell(t, 2350, .09, 1.4, A.sfx, .6, 0, pos); RAW.bell(t + .02, 3520, .05, 1, A.sfx, .6, 0, pos);
    const n = A.noiseSrc(), hp = filt('highpass', 4000), g = env(t, .001, .2, 0, .08); n.connect(hp); hp.connect(g); A.route(g, A.sfx, .2, pos); n.start(t, Math.random()); n.stop(t + .12);
  },
  shieldUp() {
    const t = A.ctx.currentTime, o = osc('sine', 330); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(440, t + .15);
    const g = env(t, .02, .07, .05, .25); o.connect(g); A.send(g, A.sfx, .5); o.start(t); o.stop(t + .4);
  },
  block(pos = null) {
    const t = A.ctx.currentTime;
    RAW.bell(t, 660, .12, 1.2, A.sfx, .5, 0, pos); RAW.bell(t, 990, .06, .8, A.sfx, .5, 0, pos);
    const n = A.noiseSrc(), bp = filt('bandpass', 2200, 1), g = env(t, .001, .25, 0, .1); n.connect(bp); bp.connect(g); A.route(g, A.sfx, .2, pos); n.start(t, Math.random()); n.stop(t + .14);
  },
  shard(pos = null) { const t = A.ctx.currentTime; RAW.bell(t, mtof(93 + (Math.random() * 3 | 0) * 2), .045, .9, A.sfx, .6, 0, pos); },
  levelUp() {
    const t = A.ctx.currentTime;
    [74, 78, 81, 86, 90].forEach((m, i) => RAW.bell(t + i * .08, mtof(m), .08, 2.6, A.ui, .6, (i - 2) * .2));
    [62, 66, 69, 74].forEach(m => Voice.pad(t, m, 1.6, .025, A.ui, .15));
  },
  quest() { const t = A.ctx.currentTime; [[81, 0], [86, .12], [90, .24]].forEach(([m, d]) => RAW.bell(t + d, mtof(m), .08, 2.2, A.ui, .6)); },
  travel() { const t = A.ctx.currentTime; RAW.swell(t, .7, .25, 300, 8000); RAW.bell(t + .6, mtof(86), .05, 2.5, A.sfx, .9); RAW.bell(t + .66, mtof(93), .04, 2.5, A.sfx, .9); },
  roar(pos = null) {
    const ctx = A.ctx, t = ctx.currentTime;
    for (const f of [62, 93, 124]) {
      const o = osc('sawtooth', f); o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * .78, t + 1.4);
      const lp = filt('lowpass', 500, 4); const lfo = osc('sine', 7), lg = ctx.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(lp.frequency);
      const g = env(t, .15, .09, .7, .7); o.connect(lp); lp.connect(g); A.route(g, A.sfx, .5, pos); o.start(t); lfo.start(t); o.stop(t + 1.7); lfo.stop(t + 1.7);
    }
    const n = A.noiseSrc(true), bp = filt('bandpass', 500, .7), gn = env(t, .1, .2, .8, .6); n.connect(bp); bp.connect(gn); A.route(gn, A.sfx, .5, pos); n.start(t); n.stop(t + 1.7);
  },
  slam(pos = null) { RAW.impact(A.ctx.currentTime, 1.1, pos); },
  rumble(pos = null) {
    const t = A.ctx.currentTime, n = A.noiseSrc(true), lp = filt('lowpass', 220), g = env(t, .3, .3, 1.2, 1);
    n.connect(lp); lp.connect(g); A.route(g, A.sfx, .3, pos); n.start(t); n.stop(t + 2.6);
  },
  snort(pos = null) {
    const t = A.ctx.currentTime;
    for (let i = 0; i < 2; i++) { const n = A.noiseSrc(), bp = filt('bandpass', 700, 1.4), g = env(t + i * .22, .01, .2, .03, .12); n.connect(bp); bp.connect(g); A.route(g, A.sfx, .1, pos); n.start(t + i * .22, Math.random()); n.stop(t + i * .22 + .2); }
  },
  chitter(pos = null) {
    const t = A.ctx.currentTime;
    for (let i = 0; i < 5; i++) RAW.blip(t + i * .045, 2400 + Math.random() * 1600, .02, .02, 'square', A.sfx);
  },
  dummy(pos = null) {
    const t = A.ctx.currentTime, n = A.noiseSrc(), bp = filt('bandpass', 900, 1.5), g = env(t, .002, .35, 0, .12);
    n.connect(bp); bp.connect(g); A.route(g, A.sfx, .2, pos); n.start(t, Math.random()); n.stop(t + .18);
    const o = osc('sine', 180); o.frequency.exponentialRampToValueAtTime(90, t + .1); const go = env(t, .002, .25, 0, .12); o.connect(go); A.route(go, A.sfx, .1, pos); o.start(t); o.stop(t + .2);
  },
  step() {
    const t = A.ctx.currentTime, n = A.noiseSrc(), lp = filt('lowpass', 700), g = env(t, .004, .035, 0, .06);
    n.connect(lp); lp.connect(g); A.send(g, A.sfx, 0); n.start(t, Math.random() * 2); n.stop(t + .1);
  },
  hover() { RAW.blip(A.ctx.currentTime, 1500, .018, .03, 'sine'); },
  click() { RAW.bell(A.ctx.currentTime, 1174.66, .06, 1.4, A.ui, .45); },
  deny() {
    const t = A.ctx.currentTime;
    for (const f of [110, 116.5]) { const o = osc('square', f), lp = filt('lowpass', 700), g = env(t, .005, .05, .12, .12); o.connect(lp); lp.connect(g); A.send(g, A.ui, .2); o.start(t); o.stop(t + .3); }
  },
  glitch() {
    const ctx = A.ctx, t = ctx.currentTime;
    for (let i = 0; i < 7; i++) {
      const ti = t + i * .065 + Math.random() * .03, n = A.noiseSrc(), bp = filt('bandpass', 300 + Math.random() * 3200, 3);
      const g = ctx.createGain(); g.gain.setValueAtTime(.0001, ti); g.gain.exponentialRampToValueAtTime(.24, ti + .004); g.gain.setValueAtTime(.24, ti + .035); g.gain.exponentialRampToValueAtTime(.0001, ti + .05);
      n.connect(bp); bp.connect(g); A.send(g, A.ui, .1); n.start(ti, Math.random() * 2); n.stop(ti + .06);
    }
    for (const f of [98, 103.8, 196.5]) { const o = osc('square', f), lp = filt('lowpass', 900), g = env(t + .45, .02, .05, .6, .5); o.connect(lp); lp.connect(g); A.send(g, A.ui, .3); o.start(t + .45); o.stop(t + 1.7); }
    RAW.bell(t + 2.1, mtof(50), .12, 5.5, A.ui, .95);
  },
  chirp() {
    const ctx = A.ctx, t0 = ctx.currentTime + .05, pan = (Math.random() - .5) * 1.4, n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (.11 + Math.random() * .05), f = 2600 + Math.random() * 1400, o = osc('sine', f);
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.35, t + .03); o.frequency.exponentialRampToValueAtTime(f * .8, t + .07);
      const g = env(t, .01, .014, 0, .07); o.connect(g); A.send(A.pan(g, pan), A.amb, .35); o.start(t); o.stop(t + .1);
    }
  },
};
export const S = {};
for (const [k, f] of Object.entries(RAW)) S[k] = (...a) => { if (!A.ctx || A.ctx.state === 'closed') return; try { f(...a); } catch (e) { console.warn('[audio]', k, e); } };

/* ---------------- ambience ---------------- */
export const Wind = {
  n: null,
  start() {
    if (!A.ctx || this.n) return;
    const ctx = A.ctx, t = ctx.currentTime, src = A.noiseSrc(true);
    const lp = filt('lowpass', 520, .4), lfo = osc('sine', .07), lg = ctx.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(lp.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.06, t + 3);
    const bp = filt('bandpass', 1700, 7), lfo2 = osc('sine', .11), lg2 = ctx.createGain(); lg2.gain.value = 500; lfo2.connect(lg2); lg2.connect(bp.frequency);
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(.0001, t); g2.gain.exponentialRampToValueAtTime(.01, t + 5);
    src.connect(lp); lp.connect(g); src.connect(bp); bp.connect(g2);
    A.send(g, A.amb, .1); A.send(g2, A.amb, .3);
    src.start(t, Math.random()); lfo.start(t); lfo2.start(t);
    this.n = { src, lfo, lfo2, g, g2 };
  },
  stop() {
    if (!this.n) return; const t = A.ctx.currentTime, n = this.n;
    for (const g of [n.g, n.g2]) { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(.0001, t, .3); }
    for (const o of [n.src, n.lfo, n.lfo2]) { try { o.stop(t + 2); } catch {} }
    this.n = null;
  },
};

/* ---------------- music ----------------
   Each theme schedules one musical unit at a time, a few seconds ahead of the clock. */
const beatOf = th => 60 / th.bpm;
const THEMES = {
  // Skyreach: the title theme's world, D major, open and calm.
  skyreach: {
    bpm: 72, beats: 8,
    chords: [{ pad: [50, 57, 61, 64, 66], bass: 38 }, { pad: [47, 54, 57, 61, 62], bass: 35 }, { pad: [55, 59, 62, 66, 69], bass: 43 }, { pad: [57, 62, 64, 69], bass: 45 }],
    unit(t, i, bus) {
      const c = this.chords[i % 4], b = beatOf(this), L = b * this.beats;
      c.pad.forEach((m, k) => Voice.pad(t + k * .015, m, L - .3, .02, bus, 1.8));
      Voice.bass(t, c.bass, L - .3, .065, bus, 1.2);
      const n = 3 + (Math.random() * 3 | 0);
      for (let k = 0; k < n; k++) Voice.pluck(t + (Math.random() * 16 | 0) * b / 2, c.pad[Math.random() * c.pad.length | 0] + (Math.random() < .5 ? 12 : 24), .024, bus, (Math.random() - .5) * .8);
      if (i % 2) RAW.bell(t + b * 6, mtof(c.pad[c.pad.length - 1] + 24), .026, 3, bus, .8, .2);
    },
  },
  // Verdant Shelf: G major, a running arpeggio, drums rise when you're fighting.
  verdant: {
    bpm: 88, beats: 8,
    chords: [{ pad: [55, 62, 66, 69, 71], bass: 43 }, { pad: [52, 59, 62, 67], bass: 40 }, { pad: [48, 55, 60, 64, 67], bass: 36 }, { pad: [50, 57, 62, 66], bass: 38 }],
    unit(t, i, bus, heat) {
      const c = this.chords[i % 4], b = beatOf(this), L = b * this.beats;
      c.pad.forEach((m, k) => Voice.pad(t + k * .015, m, L - .3, .016, bus, 1.4));
      Voice.bass(t, c.bass, L * .5 - .1, .07, bus, .3); Voice.bass(t + L * .5, c.bass + (i % 2 ? 7 : 0), L * .5 - .2, .06, bus, .3);
      const tones = c.pad.map(n => n + 12).sort((a, z) => a - z), order = [0, 2, 1, 3, 2, 4, 3, 1];
      for (let k = 0; k < 16; k++) {
        const o = order[k % 8], m = tones[o % tones.length] + (o >= tones.length ? 12 : 0);
        Voice.pluck(t + k * b / 2, m, k % 4 === 0 ? .03 : .019, bus, k % 2 ? .3 : -.3);
      }
      if (heat > .2) for (let k = 0; k < 8; k++) {
        if (k % 2 === 0) Voice.tom(t + k * b, k % 4 === 0 ? 110 : 150, bus, .2 * heat);
        Voice.hat(t + k * b + b / 2, bus, .035 * heat);
      }
    },
  },
  // Warden's Isle before the fight: low, unsettled, mostly air.
  warden: {
    bpm: 56, beats: 8,
    chords: [{ pad: [50, 57, 60], bass: 38 }, { pad: [48, 55, 58], bass: 36 }, { pad: [46, 53, 57], bass: 34 }, { pad: [45, 52, 57, 61], bass: 33 }],
    unit(t, i, bus) {
      const c = this.chords[i % 4], b = beatOf(this), L = b * this.beats;
      c.pad.forEach((m, k) => Voice.pad(t + k * .3, m, L - .3, .018, bus, 3));
      Voice.bass(t, c.bass, L - .3, .08, bus, 2);
      if (i % 2 === 0) RAW.bell(t + b * 3, mtof(c.pad[0] + 24), .03, 4, bus, .95, -.3);
      Voice.tom(t + b * 6, 70, bus, .18);
    },
  },
  // The Stone Warden: D minor, driving.
  boss: {
    bpm: 126, beats: 4,
    chords: [{ pad: [50, 53, 57, 62], root: 38 }, { pad: [46, 50, 53, 58], root: 34 }, { pad: [48, 52, 55, 60], root: 36 }, { pad: [45, 49, 52, 57], root: 33 }],
    motif: [[0, 74, 1], [1, 77, 1], [2, 81, .5], [2.5, 79, .5], [3, 77, 1]],
    unit(t, i, bus) {
      const c = this.chords[(i >> 1) % 4], b = beatOf(this);
      const pat = [0, 0, 12, 0, 3, 0, 10, 0];
      for (let k = 0; k < 8; k++) Voice.saw(t + k * b / 2, c.root + 12 + pat[k], b * .45, .07, bus, 700);
      Voice.kick(t, bus, .55); Voice.kick(t + b * 2, bus, .5); Voice.kick(t + b * 3.5, bus, .35);
      Voice.snare(t + b, bus, .14); Voice.snare(t + b * 3, bus, .16);
      for (let k = 0; k < 8; k++) Voice.hat(t + k * b / 2, bus, k % 2 ? .03 : .05);
      if (i % 2 === 0) c.pad.forEach(m => Voice.pad(t, m + 12, b * 7.5, .014, bus, .05));
      if (i % 4 === 3) for (const [d, m, len] of this.motif) Voice.lead(t + d * b, m, len * b, .05, bus);
      if (i % 8 === 7) { Voice.tom(t + b * 3, 130, bus, .3); Voice.tom(t + b * 3.5, 100, bus, .3); }
    },
  },
  // Victory sting, then quiet.
  victory: {
    bpm: 70, beats: 8,
    unit(t, i, bus) {
      if (i > 0) return;
      [62, 66, 69, 74, 78].forEach((m, k) => RAW.bell(t + k * .09, mtof(m + 12), .07, 3.5, bus, .7));
      [50, 57, 62, 66, 69].forEach(m => Voice.pad(t, m, 6, .024, bus, .4));
    },
  },
};

export const Music = {
  name: null, timer: 0, bus: null, nextT: 0, i: 0, heat: 0,
  play(name) {
    if (!A.ctx || this.name === name || !THEMES[name]) return;
    this.stop(true);
    this.name = name; this.bus = A.music; this.nextT = A.now() + .5; this.i = 0;
    this.timer = setInterval(() => this.pump(), 250);
    this.pump();
  },
  stop(fade = true) {
    clearInterval(this.timer); this.timer = 0; this.name = null;
    if (fade && A.ctx) A.killBus('music', .9);
  },
  pump() {
    if (!A.ctx || this.bus !== A.music || !this.name) return;
    const th = THEMES[this.name], now = A.now(), len = beatOf(th) * th.beats;
    if (this.nextT < now - len) this.nextT = now + .05;
    while (this.nextT < now + 2.5) {
      try { th.unit(this.nextT, this.i, this.bus, this.heat); } catch (e) { console.warn('[music]', e); }
      this.nextT += len; this.i++;
    }
  },
};
