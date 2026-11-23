// The sky of Aetherfall: a golden-hour dome, a sea of clouds below, drifting cumulus, and far-off islands.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Island } from './island.js';
import { rng, TAU } from '../core/util.js';
import { mats } from './props.js';

export const SEA_Y = -72;
const lin = hex => new THREE.Color(hex);
export const PAL = {
  zen: lin(0x1a3d93), mid: lin(0x5a92ec), cool: lin(0xb8cff7), warm: lin(0xffcf9e), glow: lin(0xffa860), core: lin(0xfff6e8),
  lit: lin(0xfff3e8), shade: lin(0x8996c9), deep: lin(0x4f68ad), aetherA: lin(0x7fffe0), aetherB: lin(0xc9a2ff),
};

export class Sky {
  constructor(scene, noise, cloudTex) {
    this.scene = scene;
    this.sunDir = new THREE.Vector3(-.52, .27, -.81).normalize();
    const u = {
      uSun: { value: this.sunDir }, uTime: { value: 0 }, uNoise: { value: noise }, uAether: { value: 1 },
      cZen: { value: PAL.zen }, cMid: { value: PAL.mid }, cCool: { value: PAL.cool }, cWarm: { value: PAL.warm }, cGlow: { value: PAL.glow },
      cCore: { value: PAL.core }, cLit: { value: PAL.lit }, cShade: { value: PAL.shade }, cDeep: { value: PAL.deep }, cA: { value: PAL.aetherA }, cB: { value: PAL.aetherB },
    };
    this.uniforms = u;
    const common = `uniform vec3 uSun; uniform float uTime; uniform sampler2D uNoise; uniform float uAether;
      uniform vec3 cZen, cMid, cCool, cWarm, cGlow, cCore, cLit, cShade, cDeep, cA, cB;
      vec3 haze(vec3 d){ float sd = max(dot(d, uSun), 0.); return mix(cCool, cWarm, pow(sd, 2.6)); }`;

    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.ShaderMaterial({
      uniforms: u, side: THREE.BackSide, depthWrite: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position * 3000., 1.); gl_Position = p.xyww; }`,
      fragmentShader: `${common}
        varying vec3 vDir;
        float bankN(vec2 q){ return textureLod(uNoise, q, 0.).r * .7 + textureLod(uNoise, q * vec2(2., 2.4) + .37, 0.).g * .3; }
        void main(){
          vec3 d = normalize(vDir);
          float sd = max(dot(d, uSun), 0.);
          vec3 c = mix(haze(d), cMid, smoothstep(-.02, .22, d.y));
          c = mix(c, cZen, smoothstep(.16, .72, d.y));
          c = mix(c, haze(d) * .9, smoothstep(0., -.25, d.y));
          c += cGlow * pow(sd, 6.) * .45 + cWarm * pow(sd, 48.) * .8;
          c += cCore * smoothstep(.99955, .9998, sd) * 6.;
          float az = atan(d.x, d.z) / 6.2831853;
          vec2 q = vec2(az * 3., d.y * 2.6 + .1);
          float n = bankN(q);
          float dens = smoothstep(.47, .55, n + (.07 - d.y) * 4.2 - .07) * smoothstep(-.16, -.03, d.y);
          vec2 sq = vec2(atan(uSun.x, uSun.z) / 6.2831853 * 3., uSun.y * 2.6 + .1);
          vec2 o = normalize(sq - q + 1e-4) * .012;
          float lit = clamp(.5 + (n - bankN(q + o)) * 9., 0., 1.);
          vec3 cloud = mix(cShade, mix(cLit, cWarm * 1.08, pow(sd, 4.) * .6), lit);
          cloud = mix(cloud, haze(d), smoothstep(.09, -.05, d.y) * .5);
          c = mix(c, cloud, dens);
          // aether ribbons: the same light that carried you here, drifting high above
          if (d.y > .05) {
            vec3 a = vec3(0.);
            for (int i = 0; i < 3; i++) {
              float fi = float(i);
              float ctr = .36 + fi * .08 + .05 * sin(az * 13.8 + uTime * .05 + fi * 2.1) + .025 * sin(az * 33. - uTime * .07 + fi);
              float dd = d.y - ctr;
              float edge = exp(-dd * dd * 2400.);
              float cur = step(0., dd) * exp(-dd * 15.) * (.2 + .8 * textureLod(uNoise, vec2(az * 24. + fi * .3, uTime * .01 + fi), 0.).b);
              a += mix(cA, cB, fi * .5) * (edge * .3 + cur * .12);
            }
            c += a * uAether * smoothstep(-.42, -.1, az) * smoothstep(.42, .05, az) * smoothstep(.05, .3, d.y);
          }
          gl_FragColor = vec4(c, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.dome.renderOrder = -10; this.dome.frustumCulled = false;
    scene.add(this.dome);

    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { ...u, uCam: { value: new THREE.Vector3() } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `${common}
        uniform vec3 uCam; varying vec3 vW;
        float sn(vec2 q){ return texture2D(uNoise, q).r * .62 + texture2D(uNoise, q * 3.1 + .2).g * .38; }
        void main(){
          vec2 q = vW.xz * .0032 + vec2(uTime * .0018, uTime * .0006);
          float n = sn(q);
          vec2 o = normalize(uSun.xz) * .006;
          float lit = clamp(.5 + (n - sn(q + o)) * 10., 0., 1.); lit = lit * lit * (3. - 2. * lit);
          float dens = smoothstep(.36, .6, n);
          vec3 d = normalize(vW - uCam); float sd = max(dot(d, uSun), 0.);
          vec3 c = mix(cShade, mix(cLit, cWarm, pow(sd, 3.) * .7), lit);
          c = mix(cDeep, c, dens);
          c += cGlow * pow(sd, 10.) * .25;
          c = mix(c, haze(d), smoothstep(250., 2600., length(vW.xz - uCam.xz)));
          gl_FragColor = vec4(c, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.sea.position.y = SEA_Y; this.sea.frustumCulled = false;
    scene.add(this.sea);

    this.puffs = this.makePuffs(cloudTex);
    scene.add(this.puffs);
  }

  makePuffs(tex) {
    const r = rng(17), list = [];
    const around = (cx, cz, n, rad, y0, y1, s0, s1) => {
      for (let i = 0; i < n; i++) { const a = r() * TAU, d = rad * (.55 + r() * .75); list.push([cx + Math.cos(a) * d, y0 + r() * (y1 - y0), cz + Math.sin(a) * d, s0 + r() * (s1 - s0)]); }
    };
    around(0, 0, 14, 70, -55, -8, 22, 46);
    around(105, -40, 14, 80, -60, -10, 24, 50);
    around(-38, -128, 12, 70, -40, 6, 22, 44);
    around(30, -70, 24, 420, -64, -20, 40, 90);
    around(0, 0, 18, 900, -66, -30, 70, 150);
    for (let i = 0; i < 8; i++) { const a = r() * TAU; list.push([Math.cos(a) * 140, 30 + r() * 25, Math.sin(a) * 140, 30 + r() * 30]); }
    const n = list.length, off = new Float32Array(n * 3), sc = new Float32Array(n * 2), sh = new Float32Array(n);
    list.forEach(([x, y, z, s], i) => { off.set([x, y, z], i * 3); sc.set([s, s * (.5 + r() * .2)], i * 2); sh[i] = r(); });
    const base = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    g.setAttribute('offset', new THREE.InstancedBufferAttribute(off, 3)); g.setAttribute('scale', new THREE.InstancedBufferAttribute(sc, 2)); g.setAttribute('shade', new THREE.InstancedBufferAttribute(sh, 1));
    g.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uSun: this.uniforms.uSun, cCool: this.uniforms.cCool, cWarm: this.uniforms.cWarm },
      vertexShader: `attribute vec3 offset; attribute vec2 scale; attribute float shade; varying vec2 vUv; varying float vD; varying float vS; varying vec3 vDir;
        void main(){ vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
          vec3 wp = offset + right * position.x * scale.x + vec3(0., 1., 0.) * position.y * scale.y;
          vec4 mv = viewMatrix * vec4(wp, 1.); vD = -mv.z; vUv = uv; vS = shade; vDir = normalize(wp - cameraPosition);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uTex; uniform vec3 uSun, cCool, cWarm; varying vec2 vUv; varying float vD; varying float vS; varying vec3 vDir;
        void main(){ vec4 t = texture2D(uTex, vUv); float sd = max(dot(vDir, uSun), 0.);
          vec3 c = t.rgb * mix(vec3(1.), cWarm * 1.15, pow(sd, 3.) * .6) * (.92 + vS * .1);
          c = mix(c, mix(cCool, cWarm, pow(sd, 2.6)), smoothstep(300., 1600., vD) * .8);
          float a = t.a * smoothstep(6., 40., vD) * .92;
          if (a < .01) discard;
          gl_FragColor = vec4(c, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1;
    return mesh;
  }

  // A scatter of distant islands, merged into one mesh. "Ten thousand islands" starts here.
  makeFarIslands(avoid) {
    const r = rng(29), geos = [];
    let made = 0, tries = 0;
    while (made < 46 && tries++ < 600) {
      const a = r() * TAU, d = 150 + Math.pow(r(), .8) * 700, x = Math.cos(a) * d, z = Math.sin(a) * d - 50;
      if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
      const rad = 5 + r() * 22 * (d / 600 + .4), y = -45 + r() * 95;
      const isl = new Island({ name: 'far', center: [0, 0, 0], radius: rad, seed: 100 + made, hills: .6, palette: 'far', depth: rad * (1 + r() * .8) });
      const g = isl.build(null, .3).toNonIndexed(); g.translate(x, y, z); geos.push(g); made++;
    }
    const geo = mergeGeometries(geos, false); geo.computeVertexNormals(); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mats.flat); this.scene.add(mesh);
    return mesh;
  }

  update(t, camPos) {
    this.uniforms.uTime.value = t;
    this.dome.position.copy(camPos);
    this.sea.position.x = camPos.x; this.sea.position.z = camPos.z;
    this.sea.material.uniforms.uCam.value.copy(camPos);
  }
}
