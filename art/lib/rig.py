"""Armatures and animation clips.

Bones are posed with rotations about *armature-aligned* axes (degrees), so animation code reads naturally
for a character facing -Y:
  x  pitch: positive tips the bone's far end down at the front (nose down)
  y  roll:  positive tilts the top toward +X (the character's left)
  z  yaw:   positive turns toward +X (the character's left)
Each clip is keyed on every frame, which the FBX/glTF exporters bake anyway.
"""
import math

import bpy
from mathutils import Euler, Quaternion, Vector


def make_rig(name, bones, coll):
    """bones: list of dicts {name, head, tail, parent=None, roll=0, deform=True}. Returns the armature object."""
    arm = bpy.data.armatures.new(name + '_Armature')
    rig = bpy.data.objects.new(name, arm)
    coll.objects.link(rig)
    vl = bpy.context.view_layer
    vl.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    made = {}
    for b in bones:
        e = arm.edit_bones.new(b['name'])
        e.head = b['head']
        e.tail = b['tail']
        e.roll = math.radians(b.get('roll', 0.0))
        if b.get('parent'):
            e.parent = made[b['parent']]
            e.use_connect = False
        e.use_deform = b.get('deform', True)
        made[b['name']] = e
    bpy.ops.object.mode_set(mode='OBJECT')
    arm.display_type = 'OCTAHEDRAL'
    rig.show_in_front = True
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return rig


def bind(mesh_obj, rig):
    mesh_obj.parent = rig
    mod = mesh_obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    return mod


def chain(names, points, parent=None, **kw):
    """A run of bones through points: names[i] spans points[i] -> points[i+1]."""
    out = []
    for i, n in enumerate(names):
        out.append(dict(name=n, head=points[i], tail=points[i + 1], parent=parent if i == 0 else names[i - 1], **kw))
    return out


def seg_weights(segs, power=4.0, top=2):
    """Smooth skin weights: inverse distance from a vertex to each bone segment, keeping the nearest `top`.
    segs: {bone: (head, tail)}. Returns a function co -> {bone: weight} for Builder(weights=...)."""
    S = {b: (Vector(h), Vector(t)) for b, (h, t) in segs.items()}

    def dist(p, a, b):
        ab = b - a
        L = ab.length_squared
        k = 0.0 if L < 1e-12 else max(0.0, min(1.0, (p - a).dot(ab) / L))
        return (a + ab * k - p).length

    def fn(co):
        ds = sorted((dist(co, h, t), b) for b, (h, t) in S.items())[:top]
        return {b: 1.0 / (d ** power + 1e-7) for d, b in ds}
    return fn


class Pose:
    """One frame's pose, built up with rot/move/size calls and then applied to the rig."""

    def __init__(self, rig):
        self.rig = rig
        self.rest = {b.name: b.matrix_local.to_quaternion() for b in rig.data.bones}
        self.q, self.loc, self.scl = {}, {}, {}

    def rot(self, bone, x=0.0, y=0.0, z=0.0):
        q = Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_quaternion()
        self.q[bone] = q @ self.q.get(bone, Quaternion())
        return self

    def move(self, bone, x=0.0, y=0.0, z=0.0):
        self.loc[bone] = self.loc.get(bone, Vector()) + Vector((x, y, z))
        return self

    def size(self, bone, s):
        self.scl[bone] = (s, s, s) if isinstance(s, (int, float)) else tuple(s)
        return self

    def apply(self):
        for pb in self.rig.pose.bones:
            rq = self.rest[pb.name]
            inv = rq.inverted()
            pb.rotation_quaternion = inv @ self.q.get(pb.name, Quaternion()) @ rq
            pb.location = inv @ self.loc.get(pb.name, Vector())
            pb.scale = self.scl.get(pb.name, (1.0, 1.0, 1.0))


class Clips:
    """Collects clips for one rig and remembers their metadata for the Unity import notes."""

    def __init__(self, rig, fps=30):
        self.rig = rig
        self.fps = fps
        self.meta = []
        rig.animation_data_create()

    def add(self, name, frames, fn, loop=False, note=''):
        """fn(pose, t, frame) poses one frame; t runs 0..1 across the clip (so loops close when fn is periodic in t)."""
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        self.rig.animation_data.action = act
        for f in range(frames + 1):
            p = Pose(self.rig)
            fn(p, f / frames, f)
            p.apply()
            for pb in self.rig.pose.bones:
                pb.keyframe_insert('rotation_quaternion', frame=f)
                pb.keyframe_insert('location', frame=f)
                pb.keyframe_insert('scale', frame=f)
        try:
            act.use_frame_range = True
            act.frame_start, act.frame_end = 0, frames
        except Exception:
            pass
        self.meta.append(dict(name=name, take=f'{self.rig.name}|{name}', frames=frames, fps=self.fps,
                              seconds=round(frames / self.fps, 3), loop=loop, note=note))
        return act

    def rest_on(self, name):
        act = bpy.data.actions.get(name)
        if act:
            self.rig.animation_data.action = act
            bpy.context.scene.frame_set(0)


# ---------------------------------------------------------------- motion helpers

def wave(t, cycles=1.0, phase=0.0):
    """sin over a loop: t in 0..1, completes `cycles` full periods (integer for seamless loops)."""
    return math.sin((t * cycles + phase) * math.tau)


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def ease_out(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def ease_in(t):
    t = max(0.0, min(1.0, t))
    return t ** 3


def keys(t, pts):
    """Piecewise-smooth curve through (time, value) points; times in 0..1, ascending. Smoothstep between keys."""
    if t <= pts[0][0]:
        return pts[0][1]
    for (t0, v0), (t1, v1) in zip(pts, pts[1:]):
        if t <= t1:
            k = ease((t - t0) / (t1 - t0) if t1 > t0 else 1.0)
            if isinstance(v0, (tuple, list)):
                return tuple(a + (b - a) * k for a, b in zip(v0, v1))
            return v0 + (v1 - v0) * k
    return pts[-1][1]
