#!/usr/bin/env python3
"""Build Aetherfall's 3D assets from the scripts in art/assets.

With Blender installed:        blender -b -P art/build.py -- [names or groups] [options]
With the bpy module (pip):     python art/build.py [names or groups] [options]

  names/groups   e.g. Skitter, creatures, props (default: everything)
  --out DIR      where exports go (default: art/export); point it into a Unity project's Assets/ to re-import
  --no-preview   skip the Cycles preview renders
  --list         list the assets and exit

Writes, per asset: export/fbx/<Name>.fbx (Unity), export/glb/<Name>.glb (web/preview),
export/meta/<Name>.json (clips, sockets, hit spheres), blend/<Name>.blend, previews/<Name>.jpg (+ _clips.jpg).
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]

import bpy  # noqa: E402

from lib import core, export, forms, preview  # noqa: E402
from lib.registry import REGISTRY  # noqa: E402
import assets  # noqa: E402,F401  (registers everything)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('names', nargs='*')
    ap.add_argument('--out', default=os.path.join(HERE, 'export'))
    ap.add_argument('--blend', default=os.path.join(HERE, 'blend'))
    ap.add_argument('--previews', default=os.path.join(HERE, 'previews'))
    ap.add_argument('--no-preview', action='store_true')
    ap.add_argument('--list', action='store_true')
    a = ap.parse_args(argv)

    if a.list:
        for n, e in REGISTRY.items():
            print(f"{e['group']:<12} {e['kind']:<10} {n}")
        return
    wanted = [n for n, e in REGISTRY.items() if not a.names or n in a.names or e['group'] in a.names]
    unknown = [n for n in a.names if n not in REGISTRY and n not in {e['group'] for e in REGISTRY.values()}]
    if unknown:
        sys.exit(f'Unknown asset or group: {", ".join(unknown)}. Try --list.')

    summary = []
    for name in wanted:
        e = REGISTRY[name]
        t0 = time.time()
        core.reset_scene()
        res = e['build']()
        animated = bool(res.rig and res.clips)
        objs = export.gather(res.objects)
        tris = sum(forms.tri_count(o) for o in objs if o.type == 'MESH')
        if animated:
            idle = next((c['name'] for c in res.clips if c['name'] == 'Idle'), res.clips[0]['name'])
            res.rig.animation_data.action = bpy.data.actions[idle]
            bpy.context.scene.frame_set(0)

        fbx = os.path.join(a.out, 'fbx', f'{name}.fbx')
        glb = os.path.join(a.out, 'glb', f'{name}.glb')
        export.export_fbx(fbx, res.objects, animated)
        export.export_glb(glb, res.objects, animated)
        info = export.glb_info(glb)
        export.save_blend(os.path.join(a.blend, f'{name}.blend'))

        meta = dict(
            name=name, kind=e['kind'], group=e['group'], triangles=tris,
            fbx=f'fbx/{name}.fbx', glb=f'glb/{name}.glb',
            bones=len(res.rig.data.bones) if res.rig else 0,
            unity=dict(note='FBX: Blender -Y forward becomes Unity +Z. Positions below are in the model root\'s space, Unity axes.',
                       rig='Generic' if animated and e['kind'] != 'humanoid' else ('Humanoid' if e['kind'] == 'humanoid' else 'None')),
            clips=res.clips,
            sockets={k: dict(bone=v.get('bone'), position=export.to_unity(v['at'])) for k, v in res.sockets.items()},
            hitSpheres=[dict(bone=h['bone'], center=export.to_unity(h['at']), radius=h['r'], damageMult=h.get('mult', 1.0), when=h.get('when', 'always'))
                        for h in res.hits],
            notes=res.notes, **res.extra)
        export.write_json(os.path.join(a.out, 'meta', f'{name}.json'), meta)

        if not a.no_preview:
            preview.setup()
            pv = res.preview
            vis = [o for o in objs if o.type == 'MESH']
            preview.frame(vis, pv.get('yaw', -32), pv.get('pitch', 16), pv.get('margin', 1.08), ground_z=pv.get('ground_z'))
            preview.render(os.path.join(a.previews, f'{name}.jpg'), pv.get('size', 512))
            if animated and pv.get('strip', True):
                preview.clip_strip(res.rig, vis, res.clips, os.path.join(a.previews, f'{name}_clips.jpg'),
                                   per_clip=pv.get('per_clip', 5), size=pv.get('strip_size', 200),
                                   yaw=pv.get('yaw', -32), pitch=pv.get('pitch', 16), ground_z=pv.get('ground_z'))
        dt = time.time() - t0
        summary.append((name, tris, len(res.clips), info['animations'], dt))
        print(f'[art] {name}: {tris} tris, {meta["bones"]} bones, clips={[c["name"] for c in res.clips]}, '
              f'glb anims={len(info["animations"])}, COLOR_0={info["color0"]} ({dt:.1f}s)', flush=True)

    print('\n[art] built', len(summary), 'assets:', ', '.join(s[0] for s in summary))


if __name__ == '__main__':
    main()
