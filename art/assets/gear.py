"""The player's gear: four blade tiers (BLADE_TIERS in src/player/player.js), the two gauntlets and the hex shield.

Blades point along -Y in Blender (forward, +Z in Unity) with the grip centred on the origin. The flat of the blade
faces +-X and the edges run along +-Z, which is the natural cutting plane for a hammer grip on a VR controller.
Each blade carries Base and Tip empties (the segment the sword sweep test uses) and a separate Glow shell mesh
that uses the AF_Glow material (an additive shader in Unity).
"""
import math

import bpy

from lib import core, forms
from lib.registry import Result, asset

GOLD, GOLD_DARK, LEATHER, LEATHER_WRAP = 0xd9a84e, 0xb58a3a, 0x3a2a2a, 0x4e3a34
BASE_Y = -0.14


def blade_geo(B, prof, thick, y0, **paint):
    """Diamond-section blade: prof [(distance from y0 toward -Y, half width)], width along Z, thickness along X."""
    pts, rows = [], []
    for d, w in prof:
        y = y0 - d
        t = thick(d) if callable(thick) else thick
        if w <= 0:
            rows.append([len(pts)])
            pts.append((0, y, 0))
        else:
            rows.append(list(range(len(pts), len(pts) + 4)))
            pts += [(0, y, w), (t / 2, y, 0), (0, y, -w), (-t / 2, y, 0)]
    faces = []
    for a, b in zip(rows, rows[1:]):
        if len(a) == 4 and len(b) == 4:
            faces += [(a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]) for k in range(4)]
        elif len(a) == 4:
            faces += [(a[k], a[(k + 1) % 4], b[0]) for k in range(4)]
        elif len(b) == 4:
            faces += [(b[(k + 1) % 4], b[k], a[0]) for k in range(4)]
    if len(rows[0]) == 4:
        faces.append(tuple(reversed(rows[0])))
    if len(rows[-1]) == 4:
        faces.append(tuple(rows[-1]))
    return B.poly(pts, faces, closed=True, **paint)


def grip(B, y_top=0.09, y_bot=-0.085, r=0.022, color=LEATHER, wrap=LEATHER_WRAP):
    B.tube([(0, y_top, 0), (0, y_bot, 0)], [r, r * 1.08], n=7, color=color, jitter=0.06)
    for k in range(4):
        y = y_top - 0.03 - k * 0.042
        B.tube([(0, y + 0.006, 0), (0, y - 0.006, 0)], [r * 1.12, r * 1.12], n=7, color=wrap)


def finish_blade(name, B, glow_B, tip_y, col):
    ob = B.to_object(name, col)
    glow = glow_B.to_object(f'{name}_Glow', col, material=core.glow_material())
    glow.parent = ob
    for sname, y in (('Base', BASE_Y), ('Tip', tip_y)):
        e = bpy.data.objects.new(sname, None)
        e.location = (0, y, 0)
        e.empty_display_size = 0.05
        col.objects.link(e)
        e.parent = ob
    return ob


def glow_shell(prof, thick, y0, color, grow=1.45, thick_grow=3.0, extra=0.03):
    G = forms.Builder(seed=3)
    gp = [(d * (1 + extra), w * grow + (0.004 if w > 0 else 0)) for d, w in prof]
    blade_geo(G, gp, (lambda d: thick(d) * thick_grow) if callable(thick) else thick * thick_grow, y0 + 0.01, color=color, emit=0.85)
    return G


TIERS = []


def tier(name, title, mult, cost):
    def deco(fn):
        TIERS.append(dict(asset=name, title=title, mult=mult, cost=cost))

        @asset(name, 'gear', 'gear')
        def build():
            col = core.collection(name)
            ob, tip_y, notes = fn(col)
            return Result([ob], sockets={'Base': dict(at=(0, BASE_Y, 0)), 'Tip': dict(at=(0, tip_y, 0))},
                          notes=f'{title} (damage x{mult}{", costs " + str(cost) + " shards" if cost else ""}). ' + notes +
                                ' Grip centred on the origin; Base/Tip empties give the blade segment for the sweep test. '
                                'The _Glow child uses AF_Glow: give it an additive shader.',
                          preview=dict(yaw=-62, pitch=24, margin=1.02))
        return build
    return deco


@tier('Blade_Aether', 'Aether Blade', 1.0, 0)
def aether(col):
    B = forms.Builder(seed=41)
    prof = [(0, 0.028), (0.04, 0.034), (0.55, 0.031), (0.80, 0.026), (0.93, 0.014), (1.005, 0)]
    blade_geo(B, prof, 0.013, -0.115, color=0x9fe8ff, emit=0.5, jitter=0.04)
    B.box((0.045, 0.03, 0.20), at=(0, -0.10, 0), color=GOLD, jitter=0.05)
    grip(B)
    B.octa(0.035, 0.04, at=(0, 0.115, 0), rot=(90, 0, 0), color=GOLD, jitter=0.05)
    G = glow_shell(prof, 0.013, -0.115, 0x2a9fd0)
    return finish_blade('Blade_Aether', B, G, -0.115 - 1.005, col), -1.12, 'The starting blade: straight, slim, cyan.'


@tier('Blade_Tempered', 'Tempered Aether Blade', 1.35, 18)
def tempered(col):
    B = forms.Builder(seed=42)
    prof = [(0, 0.026), (0.05, 0.031), (0.70, 0.028), (0.95, 0.018), (1.06, 0.006), (1.10, 0)]
    blade_geo(B, prof, 0.012, -0.115, color=0x8fffd8, emit=0.45, jitter=0.04)
    B.box((0.0135, 0.70, 0.011), at=(0, -0.115 - 0.40, 0), color=0x1fb08a, emit=0.9)
    for sz in (1, -1):
        B.tube([(0, -0.10, sz * 0.02), (0, -0.104, sz * 0.09), (0, -0.125, sz * 0.13), (0, -0.155, sz * 0.14)],
               [0.015, 0.013, 0.009, 0], n=6, color=GOLD, jitter=0.05)
    B.box((0.036, 0.045, 0.062), at=(0, -0.10, 0), color=GOLD, jitter=0.05)
    for sx in (1, -1):
        B.octa(0.017, 0.022, at=(sx * 0.02, -0.10, 0), rot=(0, 90, 0), color=0x8fffd8, emit=0.9)
    grip(B, r=0.021)
    B.lathe([(0.012, 0.09), (0.03, 0.11), (0.022, 0.135), (0, 0.15)], n=8, rot=(-90, 0, 0), at=(0, 0.0, 0), color=GOLD, jitter=0.05)
    G = glow_shell(prof, 0.012, -0.115, 0x1fb08a)
    return finish_blade('Blade_Tempered', B, G, -0.115 - 1.10, col), -1.215, 'Longer and slimmer, with a glowing fuller.'


@tier('Blade_Sunforged', 'Sunforged Blade', 1.8, 40)
def sunforged(col):
    B = forms.Builder(seed=43)
    prof = [(0, 0.040), (0.05, 0.052), (0.35, 0.050), (0.65, 0.046), (0.85, 0.034), (0.97, 0.014), (1.02, 0)]
    blade_geo(B, prof, lambda d: 0.017 - 0.006 * d, -0.12, color=0xffd98a, emit=0.4, jitter=0.05)
    B.cyl(0.078, 0.078, 0.022, n=12, at=(0, -0.093, 0), rot=(90, 0, 0), color=GOLD, jitter=0.05)
    B.torus(0.06, 0.008, n=16, m=4, at=(0, -0.106, 0), rot=(90, 0, 0), color=0xffb347, emit=0.9)
    for k in range(8):
        a = k / 8 * math.tau
        B.cone(0.014, 0.05, n=4, at=(math.cos(a) * 0.075, -0.093, math.sin(a) * 0.075), rot=(0, 90 - math.degrees(a), 0),
               color=GOLD_DARK if k % 2 else GOLD, jitter=0.04)
    grip(B, r=0.023, wrap=GOLD_DARK)
    B.cyl(0.04, 0.04, 0.016, n=10, at=(0, 0.11, 0), rot=(90, 0, 0), color=GOLD, jitter=0.05)
    for sx in (1, -1):
        B.ball(0.016, n=6, rings=4, at=(sx * 0.008, 0.11, 0), color=0xffb347, emit=0.9)
    G = glow_shell(prof, lambda d: 0.017 - 0.006 * d, -0.12, 0xd08a20)
    return finish_blade('Blade_Sunforged', B, G, -0.12 - 1.02, col), -1.14, 'Broad golden blade with a sun-disc guard.'


@tier('Blade_Skybreaker', 'Skybreaker', 2.4, 80)
def skybreaker(col):
    B = forms.Builder(seed=44)
    B.tube([(0, -0.11, 0), (0, -1.10, 0)], [0.006, 0.004], n=5, color=0xf4ecff, emit=1.0)
    segs = [(0.02, 0.20, 0.050), (0.24, 0.40, 0.046), (0.44, 0.60, 0.041), (0.64, 0.80, 0.034), (0.84, 1.12, 0.027)]
    for i, (d0, d1, w) in enumerate(segs):
        last = i == len(segs) - 1
        prof = [(d0, 0.004), (d0 + 0.03, w), (d1 - (0.12 if last else 0.035), w * 0.9), (d1, 0)]
        blade_geo(B, prof, 0.016, -0.11, color=0xdcb8ff if i % 2 == 0 else 0xcaa6f5, emit=0.55, jitter=0.06)
    for sz in (1, -1):
        B.tube([(0, -0.10, sz * 0.025), (0, -0.09, sz * 0.10), (0, -0.04, sz * 0.15), (0, 0.02, sz * 0.165)],
               [0.016, 0.013, 0.008, 0], n=6, color=0xb9a8e8, jitter=0.05)
    B.box((0.04, 0.05, 0.07), at=(0, -0.10, 0), color=0x8d7cc0, jitter=0.05)
    B.octa(0.03, 0.04, at=(0, -0.10, 0), rot=(0, 90, 0), scale=(1.3, 1, 1), color=0xdcb8ff, emit=1.0)
    grip(B, color=0x2a2236, wrap=0x8d7cc0)
    B.shard(0.022, 0.07, n=5, at=(0, 0.09, 0), rot=(-90, 0, 0), color=0xdcb8ff, emit=0.8)
    G = forms.Builder(seed=9)
    blade_geo(G, [(0, 0.05), (0.06, 0.075), (0.80, 0.055), (1.10, 0.02), (1.16, 0)], 0.045, -0.10, color=0x8a4fe0, emit=0.85)
    return finish_blade('Blade_Skybreaker', B, G, -0.11 - 1.12, col), -1.23, 'Crystal shards strung on a glowing core.'


# ---------------------------------------------------------------- gauntlets and shield
G_PLATE, G_TRIM, G_DARK = 0x4a3f5c, GOLD, 0x352c44


@asset('Gauntlet_R', 'gear', 'gear')
def gauntlet_r():
    """Right hand: a closed fist; the sword grip (along Y through the origin) passes through it."""
    col = core.collection('Gauntlet_R')
    B = forms.Builder(seed=51)
    B.box((0.088, 0.105, 0.08), at=(0, 0.005, 0), color=G_PLATE, jitter=0.06)
    for k in range(4):
        B.box((0.024, 0.024, 0.03), at=(0.034, -0.04 + k * 0.026, 0.042), color=G_TRIM, jitter=0.05)
        B.box((0.03, 0.022, 0.05), at=(0.046, -0.04 + k * 0.026, -0.005), color=G_DARK, jitter=0.05)
    B.box((0.03, 0.06, 0.03), at=(-0.03, -0.035, 0.045), rot=(0, 0, 20), color=G_PLATE, jitter=0.05)
    B.box((0.02, 0.09, 0.07), at=(-0.05, 0.005, 0.0), color=G_TRIM, jitter=0.05)
    B.tube([(0, 0.06, -0.012), (0, 0.20, -0.06)], [(0.05, 0.046), (0.046, 0.042)], n=8, color=G_PLATE, jitter=0.06)
    B.torus(0.052, 0.009, n=14, m=4, at=(0, 0.075, -0.016), rot=(-72, 0, 0), color=G_TRIM)
    ob = B.to_object('Gauntlet_R', col)
    return Result([ob], notes='Right hand, closed around the sword grip axis (Y). Knuckles face +X in Blender.', preview=dict(yaw=-50, pitch=25))


@asset('Gauntlet_L', 'gear', 'gear')
def gauntlet_l():
    """Left hand: open, palm down, with the glowing rune that casts bolts and raises the hex shield."""
    col = core.collection('Gauntlet_L')
    B = forms.Builder(seed=52)
    B.box((0.09, 0.10, 0.032), at=(0, 0.0, 0), color=G_PLATE, jitter=0.06)
    B.box((0.08, 0.07, 0.008), at=(0, 0.005, 0.02), color=G_TRIM, jitter=0.05)
    for k in range(4):
        x = 0.033 - k * 0.022
        L = 0.07 - abs(k - 1.2) * 0.008
        B.tube([(x, -0.05, 0.002), (x * 1.08, -0.05 - L * 0.55, -0.004), (x * 1.12, -0.05 - L, -0.016)], [0.011, 0.01, 0.008], n=5, color=G_DARK, jitter=0.05)
    B.tube([(-0.045, -0.005, -0.004), (-0.075, -0.035, -0.01), (-0.09, -0.06, -0.016)], [0.013, 0.011, 0.009], n=5, color=G_DARK, jitter=0.05)
    B.cyl(0.026, 0.026, 0.004, n=6, at=(0, 0.0, -0.018), color=0x8be8ff, emit=1.0)
    B.torus(0.033, 0.004, n=6, m=3, at=(0, 0.0, -0.018), color=0x8be8ff, emit=1.0)
    B.tube([(0, 0.05, 0.0), (0, 0.19, -0.02)], [(0.05, 0.03, 0.034), (0.046, 0.03, 0.032)], n=8, color=G_PLATE, jitter=0.06)
    B.torus(0.05, 0.009, n=14, m=4, at=(0, 0.066, -0.002), rot=(-85, 0, 0), scale=(1, 1, 0.75), color=G_TRIM)
    ob = B.to_object('Gauntlet_L', col)
    return Result([ob], sockets={'Rune': dict(at=(0, 0.0, -0.03))},
                  notes='Left hand, open, palm down (-Z in Blender); bolts and the shield come from the Rune socket.',
                  preview=dict(yaw=-40, pitch=-35, ground_z=-100))


@asset('HexShield', 'gear', 'gear')
def hex_shield():
    """The hex shield as geometry: a hexagonal rim and a honeycomb of thin cells, all on AF_Glow."""
    col = core.collection('HexShield')
    B = forms.Builder(seed=53)
    R_ = 0.46

    def hex_ring(cx, cz, r_out, r_in, color, emit):
        pts = []
        for k in range(6):
            a = math.radians(30 + 60 * k)
            pts += [(cx + math.cos(a) * r_out, 0, cz + math.sin(a) * r_out), (cx + math.cos(a) * r_in, 0, cz + math.sin(a) * r_in)]
        faces = [(2 * k, 2 * ((k + 1) % 6), 2 * ((k + 1) % 6) + 1, 2 * k + 1) for k in range(6)]
        B.poly(pts, faces, color=color, emit=emit)

    hex_ring(0, 0, R_, R_ - 0.022, 0x8be8ff, 1.0)
    rc = 0.04                                    # cell circumradius; pointy-top hexes tile at these spacings
    lim = R_ * math.cos(math.radians(30)) - rc * 1.1
    for j in range(-10, 11):
        for i in range(-10, 11):
            x, z = math.sqrt(3) * rc * (i + j / 2), 1.5 * rc * j
            if all(abs(x * math.cos(a) + z * math.sin(a)) <= lim for a in (0, math.pi / 3, 2 * math.pi / 3)):
                hex_ring(x, z, rc * 0.92, rc * 0.92 - 0.006, 0x73d6ff, 0.7)
    ob = B.to_object('HexShield', col, material=core.glow_material())
    return Result([ob], notes='Single flat sheet facing -Y (forward): render both sides (Cull Off). Scale in from 0.6 as it raises; '
                              'flash brighter on a block (web: hands.js shield).',
                  preview=dict(yaw=-20, pitch=10, margin=1.05, dark=True))
