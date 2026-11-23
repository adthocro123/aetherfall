"""Structures on the islands (src/world/props.js): the spire, waystone, Pell's camp, training dummy,
aether-current pads, ruin pillars, brazier, arena floor and the Sky Key.
Parts the game animates (spire rings, waystone crystal, dummy sack) are separate child objects with their own pivots.
Flames, beams and particle columns are effects: they get sockets here and VFX in Unity."""
import colorsys
import math

import bpy

from lib import core, export, forms
from lib.registry import Result, asset

STONE_LIGHT, STONE_MID, STONE_DARK = 0xa7a1ad, 0x8f8a96, 0x958f9c
MOSS = 0x7fa876
GLOW = 0x8be8ff


def empty(name, at, parent, col, size=0.2):
    e = bpy.data.objects.new(name, None)
    e.location = at
    e.empty_display_size = size
    col.objects.link(e)
    e.parent = parent
    return e


def child(B, name, parent, col, at=(0, 0, 0), rot=(0, 0, 0), material=None):
    ob = B.to_object(name, col, material)
    ob.location = at
    ob.rotation_euler = tuple(math.radians(a) for a in rot)
    ob.parent = parent
    return ob


def ring_poly(B, r_in, r_out, z, n, color, emit=0.0, a0=0.0, a1=math.tau):
    """A flat annulus (or arc of one) facing up."""
    full = a1 - a0 >= math.tau - 1e-6
    cnt = n if full else n + 1
    pts = []
    for k in range(cnt):
        a = a0 + (a1 - a0) * k / n
        pts += [(math.cos(a) * r_out, math.sin(a) * r_out, z), (math.cos(a) * r_in, math.sin(a) * r_in, z)]
    faces = [(2 * k, 2 * k + 1, 2 * ((k + 1) % cnt) + 1, 2 * ((k + 1) % cnt)) for k in range(n)]
    return B.poly(pts, faces, color=color, emit=emit)


def colliders_unity(items):
    return [dict(center=export.to_unity((x, y, 0)), radius=r) for x, y, r in items]


# ---------------------------------------------------------------- Skyreach's spire
@asset('Spire', 'prop', 'structures')
def spire():
    col = core.collection('Spire')
    B = forms.Builder(seed=5)
    B.lathe([(3.9, 0.0), (3.78, 0.9), (3.4, 1.3)], n=10, color=0xd9d3e2, jitter=0.05)
    B.lathe([(2.65, 1.3), (2.45, 1.85)], n=10, color=0xe6e1ec, jitter=0.05)
    z0, z1, r0, r1 = 1.85, 41.2, 1.75, 0.42

    def rad(z):
        return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    bands = [z0 + 0.4 + k * 5.2 for k in range(8) if z0 + 0.4 + k * 5.2 + 0.55 < z1 - 0.5]
    prof = [(rad(z0), z0)]
    for zb in bands:
        prof += [(rad(zb), zb), (rad(zb) + 0.08, zb), (rad(zb + 0.55) + 0.08, zb + 0.55), (rad(zb + 0.55), zb + 0.55)]
    prof += [(rad(z1), z1), (0, z1 + 0.7)]

    def paint(f):
        z = f.calc_center_median().z
        gold = any(zb - 0.01 <= z <= zb + 0.56 for zb in bands)
        return core.shade(0xe2b25c if gold else 0xeeeaf4, 0.84 + 0.16 * min(1.0, z / 12))
    B.lathe(prof, n=8, phase=math.pi / 8, color=paint, jitter=0.03)
    for zb in bands:
        z = zb + 2.6 + 0.275
        if z > z1 - 1:
            continue
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            r = rad(z) * math.cos(math.pi / 8) - 0.02
            B.box((0.09, 0.18, 0.75), at=(math.cos(a) * r, math.sin(a) * r, z), rot=(0, 0, math.degrees(a)), color=0xffe2a8, emit=0.35)
    for k in range(4):
        a = k * math.pi / 2
        B.box((1.5, 0.36, 2.6), at=(math.cos(a) * 2.0, math.sin(a) * 2.0, 3.1), rot=(0, 0, math.degrees(a)), taper=(0.25, 0.8),
              color=0xd9d3e2, jitter=0.05)
    body = B.to_object('Spire', col)
    for k in range(3):
        R = forms.Builder(seed=90 + k)
        R.torus(1.7 - k * 0.32, 0.07, n=48, m=6, color=0xe8b85a, emit=0.25, jitter=0.03)
        child(R, f'Ring.{k + 1}', body, col, at=(0, 0, 31 + k * 3.4), rot=((k - 1) * 14.3, 0, 0))
    T = forms.Builder(seed=95)
    T.octa(0.95, color=0xfff1cf, emit=1.0)
    child(T, 'Tip', body, col, at=(0, 0, 43.2))
    empty('Beam', (0, 0, 43.2), body, col)
    return Result([body], sockets={'Beam': dict(at=(0, 0, 43.2))},
                  notes='Skyreach landmark (44 m). Spin Ring.1-3 about their local up at 0.25/0.37/0.49 rad/s, alternating '
                        'direction; spin and pulse the Tip; add the light beam and glow at the Beam socket. Collider radius 3.6.',
                  extra=dict(collider=dict(radius=3.6)), preview=dict(yaw=-30, pitch=8, margin=1.02))


# ---------------------------------------------------------------- waystone
@asset('Waystone', 'prop', 'structures')
def waystone():
    col = core.collection('Waystone')
    B = forms.Builder(seed=8)
    B.lathe([(1.05, 0), (1.0, 0.2), (0.95, 0.35)], n=8, phase=math.pi / 8, color=0x8a8496, jitter=0.08)
    B.lathe([(0.55, 0.35), (0.30, 2.95), (0, 3.25)], n=4, phase=math.pi / 4, color=0x4a4562, jitter=0.08)
    slope = math.degrees(math.atan((0.55 - 0.30) * math.cos(math.pi / 4) / 2.6))
    for k in range(4):
        a = k * math.pi / 2

        def at(z, off=0.0, lat=0.0):
            ap = (0.55 - 0.25 * (z - 0.35) / 2.6) * math.cos(math.pi / 4) + off
            return (math.cos(a) * ap - math.sin(a) * lat, math.sin(a) * ap + math.cos(a) * lat, z)
        B.box((0.016, 0.035, 1.6), at=at(1.5, 0.006), rot=(0, -slope, math.degrees(a)), color=GLOW, emit=0.9)
        for j, z in enumerate((0.95, 1.45, 1.95)):
            B.box((0.016, 0.12, 0.03), at=at(z, 0.006, 0.05 if j % 2 else -0.05), rot=(0, -slope, math.degrees(a)), color=GLOW, emit=0.9)
    ring_poly(B, 1.18, 1.30, 0.02, 40, GLOW, 0.9)
    body = B.to_object('Waystone', col)
    C = forms.Builder(seed=81)
    C.octa(0.32, 0.51, color=0xa8f2ff, emit=1.0)
    child(C, 'Crystal', body, col, at=(0, 0, 3.15))
    return Result([body], sockets={'Glow': dict(at=(0, 0, 3.15))},
                  notes='Respawn point. Bob the Crystal child (+-0.12 m at 1.6 rad/s) and spin it; glow sprite at the Glow socket. '
                        'Interact radius 2.2, collider radius 0.75.',
                  extra=dict(collider=dict(radius=0.75)), preview=dict(yaw=-30, pitch=10))


# ---------------------------------------------------------------- Pell's camp
WOOD, WOOD_DARK, CANVAS = 0x8a6446, 0x5e4432, 0xc7643e


@asset('Camp', 'prop', 'structures')
def camp():
    col = core.collection('Camp')
    B = forms.Builder(seed=21)
    rnd = core.rng(21)
    # tent with a door on its -Y face
    B.lathe([(1.9, 0), (0, 2.7)], n=4, phase=math.pi / 4, at=(-2.4, 1.6, 0), color=lambda f: core.shade(CANVAS, 0.88) if f.normal.y > 0.3 else CANVAS, jitter=0.1)
    B.box((0.07, 0.07, 3.0), at=(-2.4, 1.6, 1.5), color=WOOD_DARK)
    ap = 1.9 * math.cos(math.pi / 4)
    yf = 1.6 - ap

    def face_y(z):
        return yf + z * ap / 2.7 - 0.012
    B.poly([(-2.95, face_y(0), 0.01), (-1.85, face_y(0), 0.01), (-2.4, face_y(1.45), 1.45)], [(0, 1, 2)], color=0x3a2a24)
    for sx in (-1, 1):
        B.box((0.04, 0.03, 1.2), at=(-2.4 + sx * 0.28, face_y(0.6) - 0.01, 0.6), rot=(0, sx * 21, 0), color=core.shade(CANVAS, 0.7))
    # crates
    for (x, y, z, s) in ((1.6, 1.8, 0.35, 0.7), (2.3, 1.5, 0.3, 0.6), (1.9, 1.7, 0.97, 0.55)):
        r = rnd.random() * 30
        B.box((s, s, s), at=(x, y, z), rot=(0, 0, r), color=WOOD, jitter=0.1)
        for sx in (-1, 1):
            B.box((0.06, s * 1.02, 0.06), at=(x, y, z + sx * s * 0.38), rot=(0, 0, r), color=WOOD_DARK)
    # map table with the chart on it
    for (x, y) in ((-0.6, -0.3), (0.6, -0.3), (-0.6, 0.3), (0.6, 0.3)):
        B.box((0.07, 0.07, 0.85), at=(x, y, 0.425), color=WOOD_DARK)
    B.box((1.45, 0.9, 0.07), at=(0, 0, 0.87), color=WOOD, jitter=0.06)
    MAP_ROT = 5.0
    B.box((1.3, 0.8, 0.006), at=(0, 0, 0.908), rot=(0, 0, MAP_ROT), color=0xefe2c4, jitter=0.02)

    def mp(px, py, z=0.913):
        x, y = (px / 512 - 0.5) * 1.3, (0.5 - py / 320) * 0.8
        c, s = math.cos(math.radians(MAP_ROT)), math.sin(math.radians(MAP_ROT))
        return (x * c - y * s, x * s + y * c, z)
    mr = core.rng(31)

    def isle(cx, cy, size, color):
        pts = [mp(cx, cy)]
        for i in range(12):
            a = i / 12 * math.tau
            rr = size * (0.8 + mr.random() * 0.35)
            pts.append(mp(cx + math.cos(a) * rr, cy + math.sin(a) * rr * 0.7))
        B.poly(pts, [(0, i + 1, (i + 1) % 12 + 1) for i in range(12)], color=color)
    for cx, cy, s in ((150, 190, 46), (330, 230, 54), (250, 70, 36)):
        isle(cx, cy, s, 0x7aa06e)
    for _ in range(14):
        isle(30 + mr.random() * 460, 20 + mr.random() * 280, 6 + mr.random() * 10, 0x9ab88a)

    def route(p0, p1, p2):
        for i in range(0, 18, 2):
            t0, t1 = i / 18, (i + 1) / 18

            def q(t):
                return tuple((1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c for a, b, c in zip(p0, p1, p2))
            a, b = mp(*q(t0), z=0.9145), mp(*q(t1), z=0.9145)
            mid = tuple((u + v) / 2 for u, v in zip(a, b))
            L = math.dist(a, b)
            B.box((L, 0.006, 0.002), at=mid, rot=(0, 0, math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))), color=0x8a3a2a)
    route((190, 190), (260, 240), (290, 225))
    route((350, 190), (320, 110), (270, 90))
    for r in (40, -40):
        B.box((0.05, 0.008, 0.002), at=mp(244, 78, 0.915), rot=(0, 0, r + MAP_ROT), color=0x8a3a2a)
    # lantern post, fire ring, bedroll
    B.lathe([(0.06, 0), (0.05, 2.3)], n=6, at=(2.6, -0.6, 0), color=WOOD_DARK)
    B.box((0.5, 0.05, 0.05), at=(2.4, -0.6, 2.25), color=WOOD_DARK)
    B.box((0.02, 0.02, 0.12), at=(2.2, -0.6, 2.17), color=0x2a2020)
    B.box((0.17, 0.17, 0.23), at=(2.2, -0.6, 2.0), color=0xffc46a, emit=1.0)
    B.box((0.2, 0.2, 0.04), at=(2.2, -0.6, 2.13), color=0x2a2020)
    for i in range(7):
        a = i / 7 * math.tau
        B.ico(0.16, sub=0, at=(0.2 + math.cos(a) * 0.45, -2.1 + math.sin(a) * 0.45, 0.08), scale=(1, 1, 0.7), color=0x7d7488, jitter=0.1)
    for i in range(3):
        a = i / 3 * math.pi
        B.lathe([(0.055, -0.3), (0.05, 0.3)], n=6, at=(0.2, -2.1, 0.08), rot=(90, 0, math.degrees(a)), color=WOOD_DARK, jitter=0.08)
    for i in range(5):
        a = rnd.random() * math.tau
        B.octa(0.05, 0.03, at=(0.2 + math.cos(a) * 0.15, -2.1 + math.sin(a) * 0.15, 0.06), color=0xff8a3a, emit=0.9)
    B.box((0.95, 0.62, 0.08), at=(-1.6, -0.9, 0.04), rot=(0, 0, 8), color=0x5d7aa8, jitter=0.05)
    B.lathe([(0.1, -0.33), (0.1, 0.33)], n=7, at=(-1.6, -0.62, 0.11), rot=(0, 90, 8), color=0x7d94bd, jitter=0.05)
    body = B.to_object('Camp', col)
    return Result([body], sockets={'Lantern': dict(at=(2.2, -0.6, 2.0)), 'Fire': dict(at=(0.2, -2.1, 0.3)), 'Pell': dict(at=(1.3, -1.6, 0))},
                  notes='Pell\'s camp. Put a warm point light at Lantern and the campfire VFX at Fire. Pell stands near the table '
                        '(the web placed her 1.3 m right and 1.6 m forward of the camp origin before its 0.5 rad yaw).',
                  extra=dict(colliders=colliders_unity([(-2.4, 1.6, 1.6), (2.0, 1.7, 0.7), (0, 0, 0.85), (2.6, -0.6, 0.2), (0.2, -2.1, 0.55)])),
                  preview=dict(yaw=-25, pitch=28, margin=1.0))


# ---------------------------------------------------------------- training dummy
@asset('TrainingDummy', 'prop', 'structures')
def training_dummy():
    col = core.collection('TrainingDummy')
    B = forms.Builder(seed=12)
    B.lathe([(0.09, 0), (0.075, 2.0)], n=6, color=WOOD, jitter=0.06)
    for r in (0, 90):
        B.box((0.9, 0.13, 0.1), at=(0, 0, 0.05), rot=(0, 0, r), color=WOOD_DARK, jitter=0.05)
    B.box((0.16, 0.16, 0.08), at=(0, 0, 2.02), color=WOOD_DARK)
    body = B.to_object('TrainingDummy', col)
    S = forms.Builder(seed=13)
    S.box((1.1, 0.08, 0.08), at=(0, 0, -0.45), color=WOOD, jitter=0.06)
    S.lathe([(0.30, -1.36), (0.34, -1.10), (0.33, -0.70), (0.27, -0.50)], n=8, color=0xcdb184, jitter=0.1)
    S.ball(0.21, n=8, rings=5, at=(0, 0, -0.24), color=0xcdb184, jitter=0.1)
    for z in (-0.72, -1.17):
        S.torus(0.33, 0.03, n=12, m=4, at=(0, 0, z), color=0x6a5036)
    for r_, c, y in ((0.19, 0xd24a3c, -0.335), (0.11, 0xf3ead8, -0.35), (0.045, 0xd24a3c, -0.36)):
        S.cyl(r_, r_, 0.02, n=16, at=(0, y, -0.95), rot=(90, 0, 0), base=False, color=c)
    child(S, 'Swing', body, col, at=(0, 0, 1.95))
    return Result([body], sockets={'Hit': dict(at=(0, 0, 1.0))},
                  notes='Hit sphere radius 0.45 at the Hit socket. On a hit, kick the Swing child (pivot at the top) and let a '
                        'spring settle it (web: makeDummy: stiffness 38, damping 4). Collider radius 0.35.',
                  extra=dict(collider=dict(radius=0.35)), preview=dict(yaw=-30, pitch=8))


# ---------------------------------------------------------------- aether-current pads
def current_pad(name, glow):
    col = core.collection(name)
    B = forms.Builder(seed=len(name))
    for k in range(10):
        a = k / 10 * math.tau
        B.stone((0.32, 0.5, 0.16), at=(math.cos(a) * 1.74, math.sin(a) * 1.74, 0.06), rot=(0, 0, math.degrees(a)),
                rough=0.04, color=STONE_MID, jitter=0.08)
    ring_poly(B, 1.36, 1.47, 0.03, 40, glow, 0.9)
    for k in range(6):
        a = k / 6 * math.tau
        B.box((0.05, 0.16, 0.012), at=(math.cos(a) * 1.25, math.sin(a) * 1.25, 0.03), rot=(0, 0, math.degrees(a)), color=glow, emit=0.9)
    ob = B.to_object(name, col)
    return Result([ob], sockets={'Column': dict(at=(0, 0, 0.1))},
                  notes='Travel pad. The swirling disc, 8 m light column and rising motes are VFX at the Column socket; dim them '
                        'to 25% while the current is locked. Travel triggers within 1.25 m (auto after 0.8 s) or on E within 1.7 m.',
                  preview=dict(yaw=-20, pitch=35))


@asset('Current_Blue', 'prop', 'structures')
def current_blue():
    return current_pad('Current_Blue', 0x8be8ff)


@asset('Current_Gold', 'prop', 'structures')
def current_gold():
    return current_pad('Current_Gold', 0xffc07a)


# ---------------------------------------------------------------- Warden's Isle ruins
def pillar(name, seed, h, broken=False):
    col = core.collection(name)
    B = forms.Builder(seed=seed)
    rnd = core.rng(seed)

    def mossy(base):
        def fn(f):
            return MOSS if f.normal.z > 0.8 and rnd.random() < 0.55 else base
        return fn
    B.lathe([(1.1, 0), (1.04, 0.3), (0.95, 0.5)], n=8, phase=math.pi / 8, color=mossy(STONE_MID), jitter=0.1)
    drums = 3 if h > 4 else 2
    zh = h - (0.6 if broken else 0.0)
    for d in range(drums):
        za, zb = 0.5 + zh * d / drums, 0.5 + zh * (d + 1) / drums
        r = 0.70 - d * 0.03
        B.lathe([(r, za + 0.03), (r - 0.04, zb - 0.03)], n=8, phase=math.pi / 8 + d * 0.2, color=STONE_LIGHT, jitter=0.1)
    if broken:
        B.stone((1.1, 1.1, 0.7), at=(0, 0, 0.5 + zh + 0.2), rot=(8, -6, 20), rough=0.25, chip=0.25, color=mossy(STONE_LIGHT), jitter=0.1)
        B.lathe([(0.66, 0), (0.5, 0.6)], n=8, at=(1.6, 0.4, 0.33), rot=(84, 0, 30), color=mossy(STONE_DARK), jitter=0.1)
    else:
        B.lathe([(0.66, 0.5 + h), (0.50, 0.5 + h + 0.6)], n=8, at=(0, 0, 0), rot=((rnd.random() - 0.5) * 9, (rnd.random() - 0.5) * 9, 0),
                color=mossy(STONE_DARK), jitter=0.1)
    ob = B.to_object(name, col)
    return Result([ob], notes='Arena ring pillar. Collider radius 1.0.', extra=dict(collider=dict(radius=1.0)), preview=dict(yaw=-30, pitch=10))


@asset('Pillar_A', 'prop', 'structures')
def pillar_a():
    return pillar('Pillar_A', 80, 5.5)


@asset('Pillar_B', 'prop', 'structures')
def pillar_b():
    return pillar('Pillar_B', 81, 3.2, broken=True)


@asset('Pillar_C', 'prop', 'structures')
def pillar_c():
    return pillar('Pillar_C', 82, 7.4)


@asset('Brazier', 'prop', 'structures')
def brazier():
    col = core.collection('Brazier')
    B = forms.Builder(seed=44)
    B.lathe([(0.45, 0), (0.36, 0.18), (0.30, 0.95), (0.40, 1.02)], n=6, color=0x55506a, jitter=0.08)
    B.lathe([(0.40, 1.02), (0.56, 1.25), (0.54, 1.33), (0.42, 1.22)], n=8, caps=False, color=0x6a6480, jitter=0.08, closed=False)
    B.lathe([(0.40, 1.02), (0.56, 1.25), (0.54, 1.33), (0.42, 1.22)], n=8, caps=False, color=0x3e3a50, closed=False, flip=True)
    B.cyl(0.42, 0.42, 0.02, n=8, at=(0, 0, 1.12), color=0x2a2640)
    rnd = core.rng(45)
    for k in range(6):
        a = rnd.random() * math.tau
        B.octa(0.07, 0.05, at=(math.cos(a) * 0.2, math.sin(a) * 0.2, 1.16), rot=(0, 0, rnd.random() * 90), color=0xa8d8ff, emit=0.9)
    ob = B.to_object('Brazier', col)
    return Result([ob], sockets={'Flame': dict(at=(0, 0, 1.75))},
                  notes='Blue aether fire VFX and a cool point light at the Flame socket. Collider radius 0.55.',
                  extra=dict(collider=dict(radius=0.55)), preview=dict(yaw=-30, pitch=20))


@asset('ArenaFloor', 'prop', 'structures')
def arena_floor():
    col = core.collection('ArenaFloor')
    B = forms.Builder(seed=77)
    rnd = core.rng(77)
    R, rings, gap = 14.6, 7, 0.06
    B.cyl(R + 0.15, R + 0.15, 0.04, n=48, at=(0, 0, -0.03), color=0x5e5a68)
    for k in range(rings):
        r0, r1, n = k / rings * R, (k + 1) / rings * R, 6 + k * 5
        for s in range(n):
            a0 = s / n * math.tau + k * 0.3
            a1 = (s + 1) / n * math.tau + k * 0.3
            ri, ro = r0 + (gap if k else 0.12), r1 - gap
            da_o, da_i = gap / ro, (gap / ri if ri > 0 else 0)
            m = max(2, math.ceil((a1 - a0) * ro / 1.6))
            outer = [(math.cos(a0 + da_o + (a1 - a0 - 2 * da_o) * i / m) * ro, math.sin(a0 + da_o + (a1 - a0 - 2 * da_o) * i / m) * ro, 0.03) for i in range(m + 1)]
            inner = [(math.cos(a1 - da_i - (a1 - a0 - 2 * da_i) * i / m) * ri, math.sin(a1 - da_i - (a1 - a0 - 2 * da_i) * i / m) * ri, 0.03) for i in range(m + 1)]
            h, sat, lum = (250 + rnd.random() * 30) / 360, (6 + rnd.random() * 6) / 100, (48 + rnd.random() * 14) / 100
            B.poly(outer + inner, [tuple(range(len(outer) + len(inner)))], color=colorsys.hls_to_rgb(h, lum, sat))
    ring_poly(B, R * 0.62 - 0.05, R * 0.62 + 0.05, 0.036, 96, GLOW, 0.9)
    ring_poly(B, R * 0.56 - 0.015, R * 0.56 + 0.015, 0.036, 96, GLOW, 0.8)
    for i in range(24):
        a = i / 24 * math.tau
        x, y = math.cos(a) * R * 0.59, math.sin(a) * R * 0.59
        B.box((0.08, 0.36, 0.008), at=(x, y, 0.036), rot=(0, 0, math.degrees(a)), color=GLOW, emit=0.9)
        if i % 2:
            B.box((0.24, 0.08, 0.008), at=(x, y, 0.037), rot=(0, 0, math.degrees(a)), color=GLOW, emit=0.9)
    ob = B.to_object('ArenaFloor', col)
    return Result([ob], notes='The Warden\'s arena (radius 14.6). Lay it on the island centre, 3 cm proud of the ground. '
                              'The rune ring marks where the Warden wakes (12.5 m from the centre in the web).',
                  preview=dict(yaw=-20, pitch=55, margin=0.95))


@asset('SkyKey', 'prop', 'structures')
def sky_key():
    col = core.collection('SkyKey')
    B = forms.Builder(seed=99)
    gold = 0xffd98a
    B.torus(0.22, 0.05, n=24, m=8, at=(0, 0, 0.42), rot=(90, 0, 0), color=gold, emit=0.7)
    B.lathe([(0.035, -0.38), (0.035, 0.22)], n=8, color=gold, emit=0.7)
    for z, w in ((-0.28, 0.16), (-0.16, 0.11)):
        B.box((w, 0.05, 0.06), at=(w / 2, 0, z), color=gold, emit=0.7)
    B.octa(0.09, at=(0, 0, 0.42), color=GLOW, emit=1.0)
    ob = B.to_object('SkyKey', col)
    return Result([ob], notes='Spawned over the arena centre after the Warden falls: spin 1.4 rad/s about up, bob 0.12 m; '
                              'golden glow sprite. Interact radius 2.4.', preview=dict(yaw=-15, pitch=5, ground_z=-1.6, margin=1.1))
