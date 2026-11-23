// The First Chain's three quests. Progress is event-driven: kills, arrivals, the dummy, the key.
import { S } from '../core/audio.js';

export const QUESTS = {
  steady: {
    title: 'Steady Hands',
    steps: [
      { id: 'talk', text: 'Talk to Pell at the camp' },
      { id: 'dummy', text: 'Strike the training dummy', need: 5 },
      { id: 'report', text: 'Tell Pell you are ready' },
    ],
    reward: { xp: 40 },
  },
  swarm: {
    title: 'Thin the Swarm',
    steps: [
      { id: 'travel', text: 'Ride the aether current to Verdant Shelf' },
      { id: 'hunt', text: 'Defeat the swarm on Verdant Shelf', goals: { skitter: 6, thornback: 2 } },
      { id: 'report', text: 'Ride home and tell Pell' },
    ],
    reward: { xp: 120, shards: 15 },
  },
  warden: {
    title: 'Warden of the First Chain',
    steps: [
      { id: 'travel', text: "Take the gold current on Verdant Shelf to the Warden's Isle" },
      { id: 'boss', text: 'Defeat the Stone Warden' },
      { id: 'key', text: 'Take the Sky Key' },
      { id: 'report', text: 'Bring the Sky Key to Pell' },
    ],
    reward: { xp: 250, shards: 40 },
  },
};
const NAMES = { skitter: 'Skitters', thornback: 'Thornbacks' };

export class Quests {
  constructor(game) { this.game = game; this.s = { active: null, step: 0, counts: {}, done: [], flags: {} }; }
  load(d) { if (d) this.s = { active: null, step: 0, counts: {}, done: [], flags: {}, ...d }; }
  data() { return JSON.parse(JSON.stringify(this.s)); }
  get quest() { return QUESTS[this.s.active] || null; }
  get step() { return this.quest ? this.quest.steps[this.s.step] : null; }
  is(id, stepId) { return this.s.active === id && (!stepId || this.step?.id === stepId); }
  done(id) { return this.s.done.includes(id); }
  flag(f) { return !!this.s.flags[f]; }
  setFlag(f, v = true) { this.s.flags[f] = v; }
  allows(what) { return what === 'warden' ? (this.done('swarm') || this.s.active === 'warden') : true; }

  start(id) {
    this.s.active = id; this.s.step = 0; this.s.counts = {};
    S.quest(); this.game.hud.toast(`New quest: ${QUESTS[id].title}`, 'gold');
    this.changed(); this.autoSkip();
  }
  advance() {
    const q = this.quest; if (!q) return;
    this.s.step++; this.s.counts = {};
    if (this.s.step >= q.steps.length) return this.complete();
    S.quest(); this.game.hud.toast('Quest updated', 'dim');
    this.changed(); this.autoSkip();
  }
  // Skip a step that is already satisfied (e.g. you were standing on the island when it began).
  autoSkip() {
    const st = this.step, pl = this.game.player;
    if (st?.id === 'travel' && ((this.s.active === 'swarm' && pl.island === 'verdant') || (this.s.active === 'warden' && pl.island === 'warden'))) this.advance();
  }
  complete() {
    const id = this.s.active, q = QUESTS[id], g = this.game;
    this.s.done.push(id); this.s.active = null; this.s.step = 0; this.s.counts = {};
    g.hud.banner('Quest complete', q.title);
    if (q.reward.xp) g.player.addXp(q.reward.xp);
    if (q.reward.shards) g.player.addShards(q.reward.shards);
    g.hud.toast(`+${q.reward.xp} XP${q.reward.shards ? `  ·  +${q.reward.shards} shards` : ''}`, 'gold');
    S.levelUp(); this.changed();
  }
  event(type, arg) {
    const st = this.step; if (!st) return;
    const c = this.s.counts;
    if (type === 'dummy' && st.id === 'dummy') { c.dummy = (c.dummy || 0) + 1; if (c.dummy >= st.need) this.advance(); else this.changed(); }
    else if (type === 'arrive' && st.id === 'travel') { if ((this.s.active === 'swarm' && arg === 'verdant') || (this.s.active === 'warden' && arg === 'warden')) this.advance(); }
    else if (type === 'kill' && st.goals && st.goals[arg]) {
      c[arg] = Math.min(st.goals[arg], (c[arg] || 0) + 1);
      if (Object.entries(st.goals).every(([k, n]) => (c[k] || 0) >= n)) this.advance(); else this.changed();
    } else if (type === 'boss' && st.id === 'boss') this.advance();
    else if (type === 'key' && st.id === 'key') this.advance();
  }
  objective() {
    const q = this.quest, st = this.step;
    if (!q) return this.done('warden') ? { title: 'The Second Chain', text: 'Explore. Pell is charting what comes next.' } : null;
    let text = st.text;
    if (st.need) text += `  ${this.s.counts.dummy || 0}/${st.need}`;
    if (st.goals) text += '\n' + Object.entries(st.goals).map(([k, n]) => `${NAMES[k] || k} ${this.s.counts[k] || 0}/${n}`).join('  ·  ');
    return { title: q.title, text };
  }
  changed() { this.game.hud.quest(this.objective()); this.game.save(); }
}
