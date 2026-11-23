"""Preview renders with Cycles on the CPU (works headless): a hero still per asset, and for rigged
assets a strip with a few frames of every clip. Lighting roughly matches the game's golden-hour sky."""
import math
import os

import bpy
from mathutils import Vector

from . import core

SKY = (0.70, 0.78, 0.95)


def setup(size=512, samples=24):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    try:
        sc.cycles.use_denoising = True
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        pass
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0.0

    world = bpy.data.worlds.new('PreviewSky')
    sc.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (*[core.srgb_to_linear(c) for c in SKY], 1.0)
    bg.inputs['Strength'].default_value = 0.85

    col = core.collection('Preview')
    key = bpy.data.objects.new('Key', bpy.data.lights.new('Key', 'SUN'))
    key.data.energy = 3.2
    key.data.color = (1.0, 0.91, 0.80)
    key.data.angle = math.radians(4)
    key.rotation_euler = (math.radians(48), 0, math.radians(-38))
    col.objects.link(key)
    fill = bpy.data.objects.new('Fill', bpy.data.lights.new('Fill', 'SUN'))
    fill.data.energy = 0.7
    fill.data.color = (0.75, 0.82, 1.0)
    fill.rotation_euler = (math.radians(60), 0, math.radians(150))
    col.objects.link(fill)

    me = bpy.data.meshes.new('Ground')
    s = 60
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    ground = bpy.data.objects.new('Ground', me)
    ground.is_shadow_catcher = True
    col.objects.link(ground)

    cam = bpy.data.objects.new('PreviewCam', bpy.data.cameras.new('PreviewCam'))
    cam.data.lens = 50
    cam.data.clip_end = 2000
    col.objects.link(cam)
    sc.camera = cam
    return sc


def world_points(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        if o.type != 'MESH':
            continue
        oe = o.evaluated_get(dg)
        me = oe.to_mesh()
        mw = o.matrix_world
        pts.extend(mw @ v.co for v in me.vertices)
        oe.to_mesh_clear()
    return pts


def frame(objs, yaw=-32.0, pitch=16.0, margin=1.08, ground=True, ground_z=None):
    """Aim the preview camera at the objects. yaw 0 looks at the front (from -Y); negative swings to the asset's right."""
    sc = bpy.context.scene
    cam = sc.camera
    pts = world_points(objs)
    if not pts:
        return
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) / 2
    r = max((p - c).length for p in pts)
    fov = 2 * math.atan(18 / cam.data.lens)
    dist = r / math.sin(fov / 2) * margin
    yr, pr = math.radians(yaw), math.radians(pitch)
    d = Vector((math.sin(yr) * math.cos(pr), -math.cos(yr) * math.cos(pr), math.sin(pr)))
    cam.location = c + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    gr = bpy.data.objects.get('Ground')
    if gr:
        gr.location.z = ground_z if ground_z is not None else (lo.z if ground else lo.z - 100)


def render(path, size=None):
    """Render a PNG with transparency. If `path` ends in .jpg, flatten it onto the sky colour and save a JPEG."""
    sc = bpy.context.scene
    if size:
        sc.render.resolution_x = sc.render.resolution_y = size
    os.makedirs(os.path.dirname(path), exist_ok=True)
    jpg = path.lower().endswith('.jpg')
    png = path[:-4] + '.png' if jpg else path
    sc.render.filepath = png
    bpy.ops.render.render(write_still=True)
    if jpg:
        from PIL import Image
        im = Image.open(png).convert('RGBA')
        bg = Image.new('RGBA', im.size, tuple(int(v * 255) for v in SKY) + (255,))
        bg.alpha_composite(im)
        bg.convert('RGB').save(path, quality=88)
        os.remove(png)
    return path


def clip_strip(rig, objs, clips, path, per_clip=5, size=220, yaw=-32.0, pitch=16.0, ground_z=None):
    """Render `per_clip` evenly spaced frames of each clip, framed once on the rest pose, then tile them
    into one labelled sheet (rows = clips)."""
    from PIL import Image, ImageDraw
    sc = bpy.context.scene
    rig.animation_data.action = bpy.data.actions[clips[0]['name']]
    sc.frame_set(0)
    frame(objs, yaw, pitch, margin=1.25, ground_z=ground_z)
    tmp = os.path.join(os.path.dirname(path), '_frames')
    os.makedirs(tmp, exist_ok=True)
    rows = []
    for c in clips:
        rig.animation_data.action = bpy.data.actions[c['name']]
        tiles = []
        for i in range(per_clip):
            f = round(i / (per_clip - 1) * c['frames']) if per_clip > 1 else 0
            if c['loop'] and per_clip > 1:
                f = round(i / per_clip * c['frames'])
            sc.frame_set(f)
            p = render(os.path.join(tmp, f"{c['name']}_{i}.png"), size)
            tiles.append(Image.open(p).convert('RGBA'))
        rows.append((c, tiles))
    label_w, pad = 120, 4
    W = label_w + per_clip * (size + pad)
    H = len(rows) * (size + pad)
    sheet = Image.new('RGBA', (W, H), (34, 40, 58, 255))
    d = ImageDraw.Draw(sheet)
    for r, (c, tiles) in enumerate(rows):
        y = r * (size + pad)
        bg = Image.new('RGBA', (size, size), tuple(int(v * 255) for v in SKY) + (255,))
        for i, t in enumerate(tiles):
            x = label_w + i * (size + pad)
            cell = bg.copy()
            cell.alpha_composite(t)
            sheet.paste(cell, (x, y))
        d.text((8, y + 8), c['name'], fill=(235, 240, 255, 255))
        d.text((8, y + 26), f"{c['seconds']}s{' loop' if c['loop'] else ''}", fill=(160, 175, 210, 255))
    sheet.convert('RGB').save(path, quality=85)
    for fn in os.listdir(tmp):
        os.remove(os.path.join(tmp, fn))
    os.rmdir(tmp)
    return path
