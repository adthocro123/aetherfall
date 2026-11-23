// The desktop HUD lives in the DOM, matching the intro's title screen. In VR the same information
// moves onto your left wrist and into floating text, because a headset can't show page elements.
import { WristPanel, FloatText } from './panel.js';

const $ = id => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game; this.cache = new Map();
    this.el = {
      root: $('hud'), lv: $('hLv'), name: $('hName'), shards: $('hShards'), hp: $('hHp'), hpLag: $('hHpLag'), hpTxt: $('hHpTxt'), ae: $('hAe'), aeTxt: $('hAeTxt'), xp: $('hXp'),
      quest: $('hQuest'), qTitle: $('hQuestTitle'), qObj: $('hQuestObj'), cross: $('hCross'), prompt: $('hPrompt'),
      boss: $('hBoss'), bossName: $('hBossName'), bossHp: $('hBossHp'), bossLag: $('hBossLag'),
      area: $('hArea'), areaName: $('hAreaName'), areaSub: $('hAreaSub'), banner: $('hBanner'), toasts: $('hToasts'), hurt: $('hurt'), keys: $('hKeys'),
    };
    this.hpLag = 1; this.bossLag = 1; this.bossT = 0; this.hurtK = 0; this.areaT = 0; this.bannerT = 0; this.hot = false;
    this.wrist = new WristPanel(game); this.float = new FloatText(game); this.promptVR = new FloatText(game, 1.1, .2);
    this.lastPrompt = null;
  }
  set(el, prop, v) { const k = el.id + prop; if (this.cache.get(k) === v) return; this.cache.set(k, v); if (prop === 'text') el.textContent = v; else el.style[prop] = v; }
  show(on) { this.el.root.classList.toggle('on', on && this.game.mode !== 'vr'); }
  update(dt) {
    const g = this.game, pl = g.player, e = this.el;
    const hpK = Math.max(0, pl.hp / pl.maxHp); this.hpLag = Math.max(hpK, this.hpLag - dt * .5);
    this.set(e.lv, 'text', String(pl.level)); this.set(e.name, 'text', pl.name); this.set(e.shards, 'text', `◆ ${pl.shards}`);
    this.set(e.hp, 'width', (hpK * 100).toFixed(1) + '%'); this.set(e.hpLag, 'width', (this.hpLag * 100).toFixed(1) + '%');
    this.set(e.hpTxt, 'text', `${Math.ceil(pl.hp)} / ${pl.maxHp}`);
    this.set(e.ae, 'width', (pl.ae / pl.maxAe * 100).toFixed(1) + '%'); this.set(e.aeTxt, 'text', `${Math.floor(pl.ae)} / ${pl.maxAe}`);
    this.set(e.xp, 'width', (pl.xp / pl.xpToNext() * 100).toFixed(1) + '%');
    this.hurtK = Math.max(0, this.hurtK - dt * 1.6);
    const low = hpK < .3 ? .35 + Math.sin(g.time * 6) * .15 : 0;
    this.set(e.hurt, 'opacity', Math.max(this.hurtK, low).toFixed(3));
    this.bossT -= dt;
    this.set(e.boss, 'opacity', this.bossT > 0 ? '1' : '0');
    this.areaT -= dt; this.set(e.area, 'opacity', String(Math.max(0, Math.min(1, this.areaT, (4.2 - this.areaT) * 2))));
    this.bannerT -= dt; this.set(e.banner, 'opacity', String(Math.max(0, Math.min(1, this.bannerT, (3.4 - this.bannerT) * 3))));
    this.set(e.cross, 'opacity', g.state === 'playing' || g.state === 'dialog' ? '1' : '0');
    if (g.mode === 'vr') { this.wrist.update(dt); this.float.update(dt); this.promptVR.update(dt); }
  }
  quest(obj) {
    const e = this.el; e.quest.style.opacity = obj ? '1' : '0';
    if (obj) { e.qTitle.textContent = obj.title; e.qObj.textContent = obj.text; }
    this.wrist.key = '';
  }
  toast(text, kind = '') {
    const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = text; this.el.toasts.prepend(t);
    while (this.el.toasts.children.length > 5) this.el.toasts.lastChild.remove();
    setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3200);
  }
  area(title, sub) {
    this.el.areaName.textContent = title; this.el.areaSub.textContent = sub; this.areaT = 4.2;
    if (this.game.mode === 'vr') this.float.show(title, sub, 4);
  }
  banner(title, sub = '') {
    this.el.banner.innerHTML = ''; const b = document.createElement('b'); b.textContent = title; const s = document.createElement('span'); s.textContent = sub;
    this.el.banner.append(b, s); this.bannerT = 3.4;
    if (this.game.mode === 'vr') this.float.show(title, sub, 3);
  }
  prompt(text) {
    if (text === this.lastPrompt) return; this.lastPrompt = text;
    const e = this.el.prompt; e.classList.toggle('on', !!text);
    if (text) { e.innerHTML = ''; const k = document.createElement('kbd'); k.textContent = this.game.mode === 'vr' ? 'A' : 'E'; e.append(k, document.createTextNode(' ' + text)); }
    if (this.game.mode === 'vr' && text) this.promptVR.show(text, 'press A', 99);
    else this.promptVR.t = Math.min(this.promptVR.t, .3);
  }
  crossHot(on) { if (on !== this.hot) { this.hot = on; this.el.cross.classList.toggle('hot', on); } }
  hurt(k) { this.hurtK = Math.max(this.hurtK, k); }
  boss(name, frac) {
    this.bossT = .6; this.set(this.el.bossName, 'text', name);
    this.bossLag = Math.max(frac, this.bossLag - .004);
    this.set(this.el.bossHp, 'width', (Math.max(0, frac) * 100).toFixed(1) + '%'); this.set(this.el.bossLag, 'width', (this.bossLag * 100).toFixed(1) + '%');
  }
  bossHit() { this.el.boss.classList.remove('hit'); void this.el.boss.offsetWidth; this.el.boss.classList.add('hit'); }
}
