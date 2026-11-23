"""FBX for Unity, GLB for the web and previews, .blend for editing, and a JSON sidecar with import notes."""
import json
import os
import struct

import bpy

from . import core


def to_unity(v):
    """Blender (x, y, z) -> Unity model space after the FBX export below and Unity's import (X is mirrored)."""
    return [round(-v[0], 4), round(v[2], 4), round(-v[1], 4)]


def to_gltf(v):
    """Blender (x, y, z) -> glTF / three.js model space."""
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def gather(objs):
    out = []

    def walk(o):
        if o not in out:
            out.append(o)
            for c in o.children:
                walk(c)
    for o in objs:
        walk(o)
    return out


def select_only(objs):
    keep = set(objs)
    for o in bpy.context.view_layer.objects:
        o.select_set(o in keep)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]


def export_fbx(path, objs, animated):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    select_only(gather(objs))
    bpy.ops.export_scene.fbx(
        filepath=path, use_selection=True, object_types={'ARMATURE', 'MESH', 'EMPTY'},
        use_mesh_modifiers=False, mesh_smooth_type='OFF', colors_type='SRGB', use_tspace=False,
        apply_scale_options='FBX_SCALE_ALL', apply_unit_scale=True, axis_forward='-Z', axis_up='Y',
        add_leaf_bones=False, armature_nodetype='NULL', use_armature_deform_only=False,
        bake_anim=animated, bake_anim_use_all_actions=animated, bake_anim_use_nla_strips=False,
        bake_anim_force_startend_keying=True, bake_anim_step=1.0, bake_anim_simplify_factor=0.0,
        path_mode='AUTO', embed_textures=False)


def export_glb(path, objs, animated):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    select_only(gather(objs))
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
              export_animations=animated, export_cameras=False, export_lights=False)
    if animated:
        kw.update(export_animation_mode='ACTIONS', export_force_sampling=True)
    for key, val in (('export_vertex_color', 'ACTIVE'), ('export_all_vertex_colors', False)):
        kw[key] = val
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        kw.pop('export_vertex_color', None)
        kw.pop('export_all_vertex_colors', None)
        bpy.ops.export_scene.gltf(**kw)


def save_blend(path):
    """Save for editing; set any 3D viewports to show the vertex colours in Solid mode."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for scr in bpy.data.screens:
        for area in scr.areas:
            for sp in area.spaces:
                if sp.type == 'VIEW_3D':
                    try:
                        sp.shading.color_type = 'VERTEX'
                    except TypeError:
                        sp.shading.color_type = 'ATTRIBUTE'
    bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backups
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True, check_existing=False)


def glb_info(path):
    """Read the JSON chunk of a GLB: animation names, mesh count, and whether vertex colours carry alpha."""
    with open(path, 'rb') as f:
        data = f.read()
    length = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + length])
    colors = set()
    for m in doc.get('meshes', []):
        for p in m.get('primitives', []):
            a = p.get('attributes', {}).get('COLOR_0')
            if a is not None:
                colors.add(doc['accessors'][a]['type'])
    return dict(animations=[a.get('name') for a in doc.get('animations', [])],
                meshes=len(doc.get('meshes', [])), nodes=len(doc.get('nodes', [])),
                skins=len(doc.get('skins', [])), color0=sorted(colors))


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
        f.write('\n')
