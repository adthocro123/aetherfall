// Pell: a cartographer who dove in long before you and has been mapping the sky ever since.
import * as THREE from 'three';
import { dampAngle } from '../core/util.js';
import { BLADE_TIERS } from '../player/player.js';
import { S } from '../core/audio.js';

const v1 = new THREE.Vector3();
const M = (c, e = 0, k = 1) => new THREE.MeshLambertMaterial({ color: c, emissive: e, emissiveIntensity: k, flatShading: true });

function makePell() {
  const g = new THREE.Group(), coat = M(0x2f7f86), coatDark = M(0x24646a), skin = M(0xe0b494), hat = M(0xc9a15e), band = M(0x8a3a32), scarf = M(0xd2553f), leather = M(0x6a4a34), boots = M(0x3a2a24), brass = M(0xe0b45a, 0x4a2c08);
  const legs = [-1, 1].map(s => { const l = new THREE.Mesh(new THREE.CylinderGeometry(.075, .07, .8, 6), boots); l.position.set(s * .1, .4, 0); g.add(l); return l; });
  const body = new THREE.Group(); body.position.y = .78; g.add(body);
  body.add(new THREE.Mesh(new THREE.CylinderGeometry(.2, .36, .95, 8).translate(0, .3, 0), coat));
  const lapel = new THREE.Mesh(new THREE.BoxGeometry(.2, .45, .05).translate(0, .45, .17), coatDark); body.add(lapel);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(.27, .03, 4, 14).rotateX(Math.PI / 2).translate(0, .18, 0), leather); body.add(belt);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(.05, .75, .03).rotateZ(.75).translate(0, .45, .18), leather); body.add(strap);
  const satchel = new THREE.Mesh(new THREE.BoxGeometry(.24, .2, .1).translate(.26, .02, .1), leather); body.add(satchel);
  for (let i = 0; i < 3; i++) { const roll = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .34, 6).rotateZ(.3 + i * .15).translate(.27 + i * .03, .2, .05 - i * .04), M(0xefe2c4)); body.add(roll); }
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(.025, .035, .3, 6).rotateZ(-1.2).translate(-.27, .08, .12), brass); body.add(glass);
  const head = new THREE.Group(); head.position.y = .98; body.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(.15, 10, 8), skin));
  for (const x of [-.05, .05]) { const e = new THREE.Mesh(new THREE.SphereGeometry(.018, 6, 4), M(0x2a2030)); e.position.set(x, .02, .135); head.add(e); }
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.155, 10, 8, 0, Math.PI * 2, 0, Math.PI * .55).translate(0, .01, -.02), M(0x5a3a2a)); head.add(hair);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .025, 16).translate(0, .1, 0), hat); head.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(.14, .17, .17, 12).translate(0, .19, 0), hat); head.add(crown);
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(.172, .172, .04, 12).translate(0, .13, 0), band); head.add(hb);
  const sc = new THREE.Mesh(new THREE.TorusGeometry(.14, .045, 6, 14).rotateX(Math.PI / 2).translate(0, .82, 0), scarf); body.add(sc);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(.08, .3, .03).translate(.08, .7, .15), scarf); body.add(tail);
  const arms = [-1, 1].map(s => {
    const sh = new THREE.Group(); sh.position.set(s * .27, .72, 0);
    sh.add(new THREE.Mesh(new THREE.CylinderGeometry(.06, .055, .55, 6).translate(0, -.27, 0), coat));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.05, 6, 4), skin); hand.position.y = -.57; sh.add(hand);
    sh.rotation.z = s * .12; body.add(sh); return sh;
  });
  return { group: g, body, head, arms, legs };
}

export class NPCs {
  constructor(game) {
    this.game = game;
    const w = game.world, camp = w.camp, isl = w.islands.skyreach;
    this.pell = makePell();
    const lx = 1.3, lz = 1.6, c = Math.cos(camp.yaw), s = Math.sin(camp.yaw);
    const px = camp.pos.x + lx * c + lz * s, pz = camp.pos.z - lx * s + lz * c;
    this.pellPos = new THREE.Vector3(px, isl.heightAt(px, pz, 0) ?? camp.pos.y, pz);
    this.pell.group.position.copy(this.pellPos); this.pellYaw = .9; this.pell.group.rotation.y = this.pellYaw;
    game.scene.add(this.pell.group);
    isl.colliders.push({ x: px, z: pz, r: .4 });
    w.interactables.push({ id: 'pell', kind: 'npc', island: 'skyreach', pos: this.pellPos, r: 2.6, label: 'Talk to Pell' });
    this.t = 0; this.gesture = 0;
  }
  update(dt) {
    this.t += dt; const p = this.pell, pl = this.game.player;
    const d = pl.pos.distanceTo(this.pellPos), near = pl.island === 'skyreach' && d < 7;
    const want = near ? Math.atan2(pl.pos.x - this.pellPos.x, pl.pos.z - this.pellPos.z) : .9;
    this.pellYaw = dampAngle(this.pellYaw, want, near ? 3 : 1, dt); p.group.rotation.y = this.pellYaw;
    p.body.scale.y = 1 + Math.sin(this.t * 1.8) * .012; p.head.rotation.x = Math.sin(this.t * .7) * .05;
    this.gesture = Math.max(0, this.gesture - dt);
    const wave = this.gesture > 0 ? Math.sin(this.gesture * 12) * .3 - 1.9 : -.05;
    p.arms[1].rotation.x = wave * (this.gesture > 0 ? 1 : 0) + (this.gesture > 0 ? 0 : Math.sin(this.t * 1.3) * .04);
    p.arms[1].rotation.z = this.gesture > 0 ? -.4 : -.12;
  }

  // Builds Pell's conversation from where you are in the story.
  script() {
    const g = this.game, q = g.quests, pl = g.player, name = pl.name;
    const line = (text, choices) => ({ who: 'Pell', text, choices });
    const upgrade = () => {
      const next = BLADE_TIERS[pl.bladeTier + 1];
      if (!next) return null;
      return { label: `Temper my blade (${next.cost} shards)`, act: () => {
        if (pl.shards < next.cost) return [line(`Aether remembers every fight, but I need ${next.cost} shards to work it into steel. You have ${pl.shards}. Go on, the swarm drops plenty.`)];
        pl.shards -= next.cost; pl.bladeTier++; g.hands.setTier(pl.bladeTier); S.levelUp(); g.save();
        g.hud.banner(next.name, 'Your blade hums with new aether.');
        return [line(`There. The ${next.name}. Swing it like you mean it, ${name}.`)];
      } };
    };
    const bye = { label: 'Goodbye', act: () => null };
    const extras = [upgrade(), bye].filter(Boolean);

    if (!q.s.active && !q.done('steady')) return [
      line(`Another diver! Easy, breathe. The landing's the worst part. I'm Pell. I map these islands, or I try to.`),
      line(`You saw it too, didn't you? The logout. Gone. Same for everyone who dove in since the sky opened.`),
      line(`Nobody knows why. But the old charts mention Sky Keys, one guarded by the Warden at the end of every chain of islands. Keys open things. Maybe a way out.`,
        [{ label: 'Then I will find the keys', act: () => this.startSteady() }, { label: 'Why not go yourself?', act: () => [line(`Ha. I'm a cartographer, ${name}. I fight with a pencil. You arrived holding a blade.`), ...this.steadyLines()] }]),
    ];
    if (q.is('steady', 'dummy')) return [line(`Five clean strikes on the dummy by the waystone. It won't hit back. Probably.`, extras)];
    if (q.is('steady', 'report')) return [
      line(`Good hands. Fast, too. You'll need both.`),
      line(`East of here is Verdant Shelf. The swarm there has been getting bolder, and they choke the old current that leads to the Warden. Thin them out.`),
      line(`Step into the blue current at the island's edge and let the wind take you.`, [{ label: 'On my way', act: () => { q.advance(); q.start('swarm'); return null; } }]),
    ];
    if (q.is('swarm', 'travel') || q.is('swarm', 'hunt')) return [line(`Six skitters and both thornbacks should loosen their hold. Watch the thornbacks: when they paw the ground, step aside. They hit trees hard.`, extras)];
    if (q.is('swarm', 'report')) return [
      line(`You came back! And you smell like crystal dust. The swarm's broken, then.`),
      line(`The gold current on the Shelf's far edge is breathing again. It leads to the Warden's Isle.`),
      line(`The Warden is stone, ${name}. Blades skid off it. But when it slams the ground, it opens. Strike what's inside. And its orbs... a quick swing sends them home.`, [{ label: "I'll bring back the key", act: () => { q.advance(); q.start('warden'); return null; } }, ...extras]),
    ];
    if (q.s.active === 'warden' && q.step.id !== 'report') return [line(`The Warden waits at the center of its arena. Make it slam, then hit the core. You've got this.`, extras)];
    if (q.is('warden', 'report')) return [
      line(`Is that... a Sky Key? You actually did it.`),
      line(`Look at my charts. They're redrawing themselves. A second chain of islands, further than I've ever mapped.`),
      line(`It's not a way down. It's a way forward. Maybe that's what the sky wanted all along. Rest, ${name}. Then let's go see.`, [{ label: 'The sky can wait a moment', act: () => { q.advance(); this.game.onChapterComplete(); return null; } }]),
    ];
    return [line(pick([
      `The second chain glitters at night. I count new islands every evening.`,
      `Still no logout. I've stopped checking. Mostly.`,
      `If you find shards, bring them. Your blade could sing even louder.`,
    ]), extras)];
  }
  steadyLines() {
    return [this.game.quests.s.active ? null : { who: 'Pell', text: `First, show me you can hold that blade. Five clean strikes on the training dummy by the waystone.`, choices: [{ label: 'Easy', act: () => this.startSteady(true) }] }].filter(Boolean);
  }
  startSteady(silent) {
    const q = this.game.quests;
    if (!q.s.active && !q.done('steady')) { q.start('steady'); q.advance(); }
    this.gesture = 1.2;
    return silent ? null : [{ who: 'Pell', text: `Good. First, show me you can hold that blade. Five clean strikes on the training dummy by the waystone.` }];
  }
}
const pick = a => a[Math.floor(Math.random() * a.length)];
