// WebXR: entering VR, finding the controllers, reading sticks and buttons, and rumble.
// Untested on hardware yet: written to the WebXR "xr-standard" gamepad layout used by Quest and PC VR.
import * as THREE from 'three';

const blank = () => ({ stick: { x: 0, y: 0 }, trigger: false, squeeze: false, a: false, b: false, triggerDown: false, squeezeDown: false, aDown: false, bDown: false });

export class XRSupport {
  constructor(game) {
    this.game = game; this.session = null; this.supported = false;
    this.ctrl = { left: null, right: null }; this.state = { left: blank(), right: blank() };
    const r = game.renderer, rig = game.player.rig;
    for (let i = 0; i < 2; i++) {
      const ray = r.xr.getController(i), grip = r.xr.getControllerGrip(i);
      rig.add(ray); rig.add(grip);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x8be8ff, transparent: true, opacity: .7 }));
      line.scale.z = 4; line.visible = false; ray.add(line);
      ray.addEventListener('connected', e => {
        const hand = e.data.handedness === 'left' ? 'left' : 'right';
        this.ctrl[hand] = { ray, grip, src: e.data, line };
        game.hands.attachVR(hand, ray, grip);
        if (hand === 'left') game.hud.wrist.attach(game.hands.left);
      });
      ray.addEventListener('disconnected', () => { for (const h of ['left', 'right']) if (this.ctrl[h]?.ray === ray) this.ctrl[h] = null; });
    }
  }
  async check() {
    if (!navigator.xr || !window.isSecureContext) return false;
    try { this.supported = await navigator.xr.isSessionSupported('immersive-vr'); } catch { this.supported = false; }
    return this.supported;
  }
  async enter() {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    const r = this.game.renderer;
    r.xr.setReferenceSpaceType('local-floor');
    await r.xr.setSession(session);
    this.session = session;
    session.addEventListener('end', () => { this.session = null; this.game.setMode('desktop'); });
    this.game.setMode('vr');
  }
  exit() { this.session?.end().catch(() => {}); }
  poll() {
    for (const hand of ['left', 'right']) {
      const prev = this.state[hand], gp = this.ctrl[hand]?.src?.gamepad, s = blank();
      if (gp) {
        const ax = gp.axes, b = gp.buttons;
        s.stick.x = ax.length >= 4 ? ax[2] : ax[0] || 0; s.stick.y = ax.length >= 4 ? ax[3] : ax[1] || 0;
        if (Math.hypot(s.stick.x, s.stick.y) < .15) s.stick.x = s.stick.y = 0;
        s.trigger = !!b[0]?.pressed; s.squeeze = !!b[1]?.pressed; s.a = !!b[4]?.pressed; s.b = !!b[5]?.pressed;
      }
      s.triggerDown = s.trigger && !prev.trigger; s.squeezeDown = s.squeeze && !prev.squeeze; s.aDown = s.a && !prev.a; s.bDown = s.b && !prev.b;
      this.state[hand] = s;
    }
    const r = this.ctrl.right; if (r) r.line.visible = this.game.state === 'dialog' || this.game.state === 'menu';
  }
  pulse(hand, k, ms) {
    const h = this.ctrl[hand]?.src?.gamepad?.hapticActuators?.[0];
    try { h?.pulse?.(Math.min(1, k), ms)?.catch?.(() => {}); } catch {}
  }
}
