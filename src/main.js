// Aetherfall: boot, game states, and the frame loop that ties every system together.
import * as THREE from 'three';
import { A, S, Music, Wind } from './core/audio.js';
import { Input } from './core/input.js';
import { makeNoiseTexture, makeGlowTexture, makeCloudTexture } from './core/textures.js';
import { World } from './world/world.js';
import * as P from './world/props.js';
import { PAL } from './world/sky.js';
import { Player } from './player/player.js';
import { Hands } from './player/hands.js';
import { FX } from './combat/fx.js';
import { Combat } from './combat/combat.js';
import { EnemyManager } from './enemies/enemy.js';
import { TYPES } from './enemies/types.js';
import { NPCs } from './game/npc.js';
import { Quests } from './game/quests.js';
import { Save } from './game/save.js';
import { HUD } from './ui/hud.js';
import { Dialog, VRMenu } from './ui/panel.js';
import { XRSupport } from './vr/xr.js';
import { damp } from './core/util.js';

const $ = id => document.getElementById(id);
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
const cleanName = v => { let s = (v || '').normalize('NFC'); try { s = s.replace(/[^\p{L}\p{N} _-]/gu, ''); } catch { s = s.replace(/[^A-Za-z0-9 _-]/g, ''); } return s.replace(/\s+/g, ' ').trim().slice(0, 14); };

class Game {
  constructor() {
    this.canvas = $('view'); this.mode = 'desktop'; this.state = 'landing'; this.time = 0; this.slowmo = 0; this.shakeAmt = 0; this.inCurrent = 0;
    this.settings = { snap: 45, vignette: true, swordAngle: 0, volume: 85, sens: 100, invert: false, ...Save.settings() };
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.75)); r.setSize(innerWidth, innerHeight, false);
    r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.05;
    r.xr.enabled = true; r.xr.setFoveation?.(1);
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog(PAL.cool.clone(), 170, 1200);
    this.camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, .05, 4000);
    this.tex = { noise: makeNoiseTexture(), glow: makeGlowTexture(), cloud: makeCloudTexture() };

    this.hud = new HUD(this);
    this.quests = new Quests(this);
    this.world = new World(this); this.world.build();
    this.scene.add(new THREE.HemisphereLight(0xd2e2ff, 0x7a6688, 1.35));
    const sun = new THREE.DirectionalLight(0xffe0be, 2.5); sun.position.copy(this.world.sky.sunDir).multiplyScalar(100); this.scene.add(sun);

    this.player = new Player(this); this.hands = new Hands(this);
    this.fx = new FX(this); this.combat = new Combat(this);
    this.enemies = new EnemyManager(this, TYPES); this.npcs = new NPCs(this);
    this.dialog = new Dialog(this); this.menu = new VRMenu(this);
    this.input = new Input(this); this.xr = new XRSupport(this);
    this.applySettings();
    this.makeOverlays();
    this.onResize(); addEventListener('resize', () => this.onResize());
    this.bindUI();
    window.__game = this;
    r.setAnimationLoop((t, f) => this.frame(t, f));
    requestAnimationFrame(() => $('loading').classList.remove('on'));
  }

  /* ---------------- setup ---------------- */
  makeOverlays() {
    this.fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(.4, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, toneMapped: false }));
    this.fadeMesh.renderOrder = 1000; this.fadeMesh.visible = false; this.camera.add(this.fadeMesh);
    this.fade = { k: 0, to: 0, speed: 1, done: null };
    this.vignette = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.ShaderMaterial({
      uniforms: { uK: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform float uK; varying vec2 vUv; void main(){ float r = length(vUv - .5) * 2.; gl_FragColor = vec4(0., 0., 0., smoothstep(.42 - uK * .2, .95 - uK * .25, r) * uK); }`,
    }));
    this.vignette.position.z = -.22; this.vignette.renderOrder = 999; this.vignette.visible = false; this.camera.add(this.vignette);
  }
  onResize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.setGlowScale();
  }
  setGlowScale() {
    const h = this.mode === 'vr' ? 1800 : innerHeight * this.renderer.getPixelRatio();
    P.glowScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(this.mode === 'vr' ? 50 : this.camera.fov / 2)));
  }
  applySettings() {
    const s = this.settings;
    this.input.sens = s.sens / 100; this.input.invert = !!s.invert; A.setVolume(s.volume / 100);
    $('setVol').value = s.volume; $('setSens').value = s.sens; $('setInvert').checked = !!s.invert;
  }
  saveSettings() { Save.setSettings(this.settings); this.applySettings(); }

  bindUI() {
    const name = $('nameInput'), save = Save.read();
    name.value = save?.name || Save.name() || '';
    if (save) { $('playBtn').textContent = 'Continue journey'; $('newBtn').hidden = false; $('saveNote').textContent = `${save.name || 'Wanderer'} · Level ${save.level} · ${this.world.islands[save.island]?.title || 'Skyreach'}`; }
    $('playBtn').addEventListener('click', () => this.start(false));
    $('newBtn').addEventListener('click', () => { if ($('newBtn').dataset.armed) this.start(true); else { $('newBtn').dataset.armed = '1'; $('newBtn').textContent = 'Click again to erase your save and start over'; } });
    name.addEventListener('keydown', e => { if (e.key === 'Enter') this.start(false); });
    $('vrBtn').addEventListener('click', () => this.enterVR());
    this.xr.check().then(ok => { $('vrBtn').hidden = !ok; $('vrNote').hidden = ok; });
    document.querySelectorAll('#menu [data-m]').forEach(b => b.addEventListener('click', () => this.menuAction(b.dataset.m)));
    $('setVol').addEventListener('input', e => { this.settings.volume = +e.target.value; this.saveSettings(); });
    $('setSens').addEventListener('input', e => { this.settings.sens = +e.target.value; this.saveSettings(); });
    $('setInvert').addEventListener('change', e => { this.settings.invert = e.target.checked; this.saveSettings(); });
    $('sysOk').addEventListener('click', () => { $('sys').classList.remove('on', 'l2on'); S.click(); if (this.state === 'paused') this.resume(); });
    $('endBtn').addEventListener('click', () => { $('ending').classList.remove('on'); this.setState('playing'); this.input.lock(); });
    $('resumeCover').addEventListener('click', () => this.resume());
  }

  /* ---------------- flow ---------------- */
  async enterVR() {
    try { A.init(); A.resume(); await this.xr.enter(); if (this.state === 'landing') this.start(false); }
    catch (e) { console.warn(e); this.hud.toast('Could not start VR on this device', 'warn'); }
  }
  setMode(m) {
    this.mode = m;
    if (m === 'vr') { this.hud.show(false); $('landing').classList.remove('on'); this.camera.rotation.set(0, 0, 0); this.camera.position.set(0, 0, 0); }
    else { this.hands.attachDesktop(); this.hud.show(this.state !== 'landing'); this.vignette.visible = false; this.player.teleport(this.player.pos, this.player.yaw); }
    this.setGlowScale();
  }
  start(fresh) {
    if (this.state !== 'landing') return;
    A.init(); A.resume(); Wind.start();
    const pl = this.player, name = cleanName($('nameInput').value) || Save.read()?.name || 'Wanderer';
    pl.name = name; Save.setName(name);
    const save = fresh ? null : Save.read();
    if (fresh) Save.clear();
    $('landing').classList.remove('on');
    this.fade.k = 1; this.fade.to = 1; this.fadeMesh.material.color.set(0x000000);
    if (save) this.applySave(save); else this.freshStart();
    this.hud.show(true); this.hud.quest(this.quests.objective());
    this.setState('playing');
    if (this.mode === 'desktop') this.input.lock();
    this.fadeIn(1.4);
    this.arrive(pl.island);
    if (!save) this.after(4.2, () => this.hud.toast('Pell is waiting at the camp. Walk over and press E.', 'gold'));
  }
  freshStart() {
    const pl = this.player; Object.assign(pl, { level: 1, xp: 0, shards: 0, bladeTier: 0 }); pl.hp = pl.maxHp; pl.ae = pl.maxAe;
    this.quests.load(null); this.respawnIsland = 'skyreach';
    const w = this.world.waystones.skyreach; pl.teleport(w.pos, w.yaw); pl.island = 'skyreach';
    this.hands.setTier(0); this.save();
  }
  applySave(s) {
    const pl = this.player; Object.assign(pl, { level: s.level || 1, xp: s.xp || 0, shards: s.shards || 0, bladeTier: s.bladeTier || 0 });
    pl.hp = pl.maxHp; pl.ae = pl.maxAe; this.quests.load(s.quests);
    const isl = this.world.islands[s.island] ? s.island : 'skyreach';
    this.respawnIsland = isl;
    const w = this.world.waystones[isl] || this.world.landing[isl]; pl.teleport(w.pos, w.yaw); pl.island = isl;
    this.hands.setTier(pl.bladeTier);
  }
  save() {
    if (this.state === 'landing') return;
    const pl = this.player;
    Save.write({ v: 1, name: pl.name, level: pl.level, xp: pl.xp, shards: pl.shards, bladeTier: pl.bladeTier, island: this.respawnIsland || pl.island, quests: this.quests.data(), at: Date.now() });
  }
  setState(s) {
    this.state = s;
    document.body.dataset.state = s;
    if (s !== 'playing') this.hud.prompt(null);
  }
  wantsLock() { return this.mode === 'desktop' && (this.state === 'playing' || this.state === 'dialog'); }
  canLook() { return this.mode === 'desktop' && (this.state === 'playing' || this.state === 'dialog') && (this.input.locked || this.input.lockFailed); }
  onLockChange(locked) {
    $('resumeCover').classList.toggle('on', !locked && this.wantsLock() && !this.input.lockFailed);
    if (!locked && this.wantsLock() && !this.input.lockFailed) this.pause();
  }
  pause() {
    if (this.state !== 'playing' && this.state !== 'dialog') return;
    this.prevState = this.state; this.setState('paused'); $('menu').classList.add('on'); $('resumeCover').classList.remove('on');
  }
  resume() {
    $('menu').classList.remove('on'); $('resumeCover').classList.remove('on');
    if (this.state === 'paused') this.setState(this.prevState || 'playing');
    if (this.mode === 'desktop') this.input.lock();
  }
  menuAction(m) {
    S.click();
    if (m === 'resume') this.resume();
    else if (m === 'logout') this.logoutGag();
    else if (m === 'title') { this.save(); location.reload(); }
  }
  logoutGag() {
    S.glitch(); this.alarm = 1;
    if (this.mode === 'vr') { this.hud.float.show('Logout not found', 'Please enjoy your stay in Aetherfall', 4); return; }
    document.body.classList.add('glitching'); setTimeout(() => document.body.classList.remove('glitching'), 650);
    setTimeout(() => { $('sys').classList.add('on'); setTimeout(() => $('sys').classList.add('l2on'), 1650); }, 450);
  }

  travel(to) {
    if (this.state !== 'playing') return;
    this.setState('travel'); S.travel(); this.inCurrent = 0;
    this.fadeOut(0xffffff, .55, () => {
      const L = this.world.landing[to], pl = this.player;
      pl.island = to; pl.teleport(L.pos, L.yaw); pl.island = to;
      this.combat.clear(); this.enemies.populate(to);
      if (to === 'warden' && this.quests.flag('wardenDown') && !this.quests.flag('hasKey')) this.spawnKey();
      this.respawnIsland = to;
      this.setState('playing'); this.fadeIn(.9); this.arrive(to);
    });
  }
  arrive(name) {
    const isl = this.world.islands[name];
    if (name !== 'skyreach' || this.time > 2) this.hud.area(isl.title, isl.subtitle);
    else this.hud.area(isl.title, isl.subtitle);
    this.enemies.populate(name);
    if (name === 'warden' && this.quests.flag('wardenDown') && !this.quests.flag('hasKey') && !this.key) this.spawnKey();
    this.quests.event('arrive', name);
    this.save();
  }
  talk() { this.dialog.start(this.npcs.script(), this.npcs.pellPos); }
  interact(it) {
    const pl = this.player;
    if (it.kind === 'current') { if (it.enabled()) this.travel(it.to); else { S.deny(); this.hud.toast(it.lockedLabel, 'dim'); } }
    else if (it.kind === 'npc') this.talk();
    else if (it.kind === 'waystone') {
      pl.heal(9999); pl.ae = pl.maxAe; this.respawnIsland = it.island; S.shard(it.pos); S.quest();
      this.fx.motes(v1.copy(it.pos).setY(it.pos.y + 1.2), 30, 0x8be8ff);
      this.hud.toast('Waystone attuned. If you fall, you return here.', 'gold'); this.save();
    } else if (it.kind === 'key') this.takeKey();
  }

  onEnemyKilled(e) {
    const d = e.def, pl = this.player;
    pl.addXp(d.xp); pl.addShards(d.shards);
    this.fx.numbers.spawn(e.center().add(v1.set(0, .7, 0)), 0, { text: `+${d.xp} xp`, color: '#ffd98a' });
    S.shard(e.center());
    this.quests.event('kill', e.type);
    if (e.type === 'warden') this.onBossDefeated(e);
  }
  onBossAwake() { Music.play('boss'); this.hud.area('The Stone Warden', 'Guardian of the First Chain'); }
  onBossDefeated(b) {
    this.quests.setFlag('wardenDown'); this.quests.event('boss');
    for (const e of this.enemies.list) if (!e.dead && e !== b) e.die();
    Music.play('victory'); this.after(9, () => { if (Music.name === 'victory') Music.play('skyreach'); });
    this.hud.banner('Warden defeated', 'The Sky Key is yours to take');
    this.after(2.6, () => this.spawnKey());
    this.save();
  }
  spawnKey() {
    if (this.key || this.quests.flag('hasKey')) return;
    const k = P.makeSkyKey(this.tex.glow), c = this.world.arena.center;
    k.group.position.set(c.x, c.y + 1.4, c.z); this.scene.add(k.group);
    this.fx.shatter(v1.copy(c).setY(c.y + 1.5), 0xffd98a, 1.2);
    const it = { id: 'skykey', kind: 'key', island: 'warden', pos: c.clone(), r: 2.4, label: 'Take the Sky Key' };
    this.world.interactables.push(it);
    this.key = { k, it, upd: t => { k.update(t); k.group.position.x = c.x; k.group.position.z = c.z; k.group.position.y += c.y; } };
  }
  takeKey() {
    if (!this.key) return;
    this.scene.remove(this.key.k.group); this.world.interactables = this.world.interactables.filter(i => i !== this.key.it); this.key = null;
    this.quests.setFlag('hasKey'); this.quests.event('key');
    S.levelUp(); this.fx.burst(v1.copy(this.player.pos).setY(this.player.pos.y + 1.2), { n: 60, speed: 3, color: 0xffd98a, size: .3, life: 1.2, grav: 1, up: 1 });
    this.hud.banner('Sky Key', 'Bring it to Pell on Skyreach'); this.save();
  }
  onChapterComplete() {
    this.save();
    if (this.mode === 'vr') { this.hud.float.show('The First Chain is open', 'To be continued', 6); return; }
    this.after(.6, () => { this.setState('ending'); this.input.unlock(); $('ending').classList.add('on'); });
  }

  onFall() {
    if (this.state !== 'playing') return;
    this.player.alive = false; this.setState('dead'); this.hud.banner('No way down', 'The sky throws you back');
    this.fadeOut(0xffffff, .7, () => this.respawn());
  }
  onDeath() {
    if (this.state === 'dead') return;
    this.player.alive = false; this.setState('dead'); this.dialog.close(); this.setState('dead');
    this.hud.banner('You fell', 'The sky throws you back');
    this.fadeOut(0xffffff, 1.6, () => this.respawn());
  }
  respawn() {
    const pl = this.player, name = this.respawnIsland || pl.island, w = this.world.waystones[name] || this.world.landing[name];
    pl.island = name; pl.teleport(w.pos, w.yaw); pl.island = name;
    pl.alive = true; pl.hp = pl.maxHp; pl.ae = pl.maxAe; pl.invuln = 2; pl.vel.set(0, 0, 0);
    this.combat.clear(); this.enemies.current = null; this.enemies.populate(name);
    if (Music.name === 'boss') Music.play(name === 'warden' ? 'warden' : 'skyreach');
    this.setState('playing'); this.fadeIn(1.3);
  }

  /* ---------------- per frame ---------------- */
  fadeOut(color, dur, done) { this.fadeMesh.material.color.set(color); this.fade.to = 1; this.fade.speed = 1 / dur; this.fade.done = done; }
  fadeIn(dur) { this.fade.to = 0; this.fade.speed = 1 / dur; this.fade.done = null; }
  updateFade(dt) {
    const f = this.fade;
    if (f.k !== f.to) { f.k = f.to > f.k ? Math.min(f.to, f.k + f.speed * dt) : Math.max(f.to, f.k - f.speed * dt); if (f.k === f.to && f.done) { const d = f.done; f.done = null; d(); } }
    this.fadeMesh.material.opacity = f.k; this.fadeMesh.visible = f.k > .001;
  }
  // Gameplay delays run on game time, so pausing the game pauses them too.
  after(sec, fn) { (this.timers ||= []).push({ t: this.time + sec, fn }); }
  runTimers() {
    if (!this.timers?.length || this.state === 'paused') return;
    const due = this.timers.filter(x => x.t <= this.time); if (!due.length) return;
    this.timers = this.timers.filter(x => x.t > this.time); for (const x of due) x.fn();
  }
  shake(k) { if (this.mode === 'desktop') this.shakeAmt = Math.max(this.shakeAmt, k); }
  haptic(hand, k, ms) { if (this.mode === 'vr') this.xr.pulse(hand, k, ms); }

  updateInteract(dt) {
    const pl = this.player;
    if (this.state !== 'playing') { this.hud.prompt(null); this.inCurrent = 0; return; }
    let best = null, bd = 1e9;
    for (const it of this.world.interactables) {
      if (it.island !== pl.island) continue;
      const d = Math.hypot(it.pos.x - pl.pos.x, it.pos.z - pl.pos.z);
      if (d < it.r && d < bd) { bd = d; best = it; }
    }
    this.hud.prompt(best ? (best.kind === 'current' && !best.enabled() ? best.lockedLabel : best.label) : null);
    if (best?.kind === 'current' && best.enabled() && bd < 1.25) { this.inCurrent += dt; if (this.inCurrent > .8) this.travel(best.to); } else this.inCurrent = 0;
    const press = this.mode === 'vr' ? this.xr.state.right.aDown : this.input.hit('KeyE');
    if (press && best) this.interact(best);
  }
  updateMusic(dt) {
    if (!A.ctx || this.state === 'landing') return;
    const b = this.enemies.boss;
    Music.heat = damp(Music.heat, Math.min(1, this.enemies.heat() / 3), 1.5, dt);
    if (b && !b.dead && b.state !== 'dormant') { if (Music.name !== 'boss') Music.play('boss'); return; }
    if (Music.name === 'victory') return;
    const isl = this.player.island, want = isl === 'verdant' ? 'verdant' : isl === 'warden' && !this.quests.flag('wardenDown') ? 'warden' : 'skyreach';
    if (Music.name !== want) Music.play(want);
  }
  landingCam() {
    const c = this.world.spire.pos, t = this.time * .04 + 2.2, pos = v1.set(c.x + Math.sin(t) * 44, 15 + Math.sin(t * .7) * 3, c.z + Math.cos(t) * 44);
    this.player.rig.position.copy(pos);
    const dx = c.x - pos.x, dy = c.y + 12 - pos.y, dz = c.z - pos.z;
    this.player.rig.rotation.set(0, Math.atan2(-dx, -dz), 0);
    this.camera.position.set(0, 0, 0); this.camera.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)), 0, 0);
  }
  frame(tMs) {
    const now = tMs / 1000; let dt = now - (this.last ?? now);
    if (!Number.isFinite(dt) || dt < 0) dt = 0; dt = Math.min(.05, dt);
    if (Number.isFinite(now)) this.last = now;
    if (!this.booted) { this.booted = true; $('loading').classList.remove('on'); }
    this.time += dt;
    const gdt = this.slowmo > 0 ? dt * .12 : dt; this.slowmo = Math.max(0, this.slowmo - dt);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 3); this.alarm = Math.max(0, (this.alarm || 0) - dt * .6);
    if (this.mode === 'vr') this.xr.poll();
    const landing = this.state === 'landing';
    this.hands.right.visible = this.hands.left.visible = !landing;
    if (landing) this.landingCam(); else this.player.update(dt);
    if (!landing && this.mode === 'desktop' && this.input.lockFailed && this.input.hit('Escape')) { if (this.state === 'paused') this.resume(); else this.pause(); }
    if (this.mode === 'vr' && this.xr.state.left.bDown && (this.state === 'playing' || this.state === 'menu')) this.menu.toggle();
    if (this.state === 'playing' && this.mode === 'vr' && this.xr.state.left.triggerDown) this.hands.castBolt();
    this.hands.update(dt);
    if (!landing) { this.enemies.update(gdt); this.combat.update(gdt); }
    this.npcs.update(dt); this.fx.update(gdt); this.dialog.update(dt); this.menu.update(dt);
    if (this.key) this.key.upd(this.time);
    this.runTimers();
    this.camera.getWorldPosition(v1); this.world.update(dt, this.time, v1);
    this.updateInteract(dt); this.updateMusic(dt); this.hud.update(dt); this.updateFade(dt);
    const vk = this.mode === 'vr' && this.settings.vignette ? Math.max(this.player.moveAmount * .85, this.player.turnFlash) : 0;
    this.vignette.visible = vk > .02; this.vignette.material.uniforms.uK.value = vk;
    if (this.mode === 'desktop') {
      const fov = 74 + this.player.fovKick;
      if (Math.abs(this.camera.fov - fov) > .01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    }
    document.body.style.setProperty('--alarm-k', (this.alarm || 0).toFixed(3));
    A.listen(this.camera);
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }
}

try { new Game(); }
catch (e) { console.error(e); const l = $('loading'); l.classList.add('on'); l.querySelector('p').textContent = 'Aetherfall could not start: ' + e.message; }
