"""The three islands of the First Chain and the distant ones, ported from src/world/island.js, world.js and sky.js.

The random numbers, noise and placement are exact ports (32-bit maths included), so the meshes and
export/layout.json reproduce the web world: same island shapes and colours, and every tree, rock, structure,
spawn point and current in the same place.

Coordinates: the web uses three.js (Y up, right-handed). Unity gets (x, y, z) -> (-x, y, z), which is what the
FBX export of a Blender model built at (x, -z, y) produces, so meshes and layout agree.
"""
import json
import math
import os
import struct

import bpy

from lib import core, export, forms, registry
from lib.registry import Result, asset

TAU = math.tau
M32 = 0xffffffff


# ---------------------------------------------------------------- exact ports of src/core/util.js
def rng(seed):
    s = seed & M32

    def f():
        nonlocal s
        s = (s + 0x6D2B79F5) & M32
        t = ((s ^ (s >> 15)) * (1 | s)) & M32
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & M32)) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296
    return f


def hash2(x, y, s=0):
    h = ((int(x) & M32) * 374761393 + (int(y) & M32) * 668265263 + (int(s) & M32) * 1442695041) & M32
    h = ((h ^ (h >> 13)) * 1274126177) & M32
    h ^= h >> 16
    return h / 4294967296


def vnoise(x, y, s=0):
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    u, v = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b, c, d = hash2(ix, iy, s), hash2(ix + 1, iy, s), hash2(ix, iy + 1, s), hash2(ix + 1, iy + 1, s)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v


def fbm(x, y, oct=4, s=0):
    v, amp, f, n = 0.0, 0.5, 1.0, 0.0
    for i in range(oct):
        v += amp * vnoise(x * f, y * f, s + i * 17)
        n += amp
        amp *= 0.5
        f *= 2.03
    return v / n


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def smooth(t):
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- island.js
def lin(h):
    return core.linear_rgba(h)[:3]


def lerp3(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


PALETTES = {
    'meadow': dict(grass=[0x5aa653, 0x8fcf66, 0x3f8848], flower=[0xf6e8a6, 0xf4a9c8, 0xc9b8ff], dirt=0x8a6a50, rock=[0xb08a7f, 0x92707b, 0x6c5774, 0x463a5c], tip=0x2c2640),
    'shelf': dict(grass=[0x4a9f58, 0x7fca6a, 0x367f50], flower=[0xfff0a8, 0x9fe7ff, 0xffc2a0], dirt=0x7a5d48, rock=[0xa58377, 0x896c79, 0x645470, 0x403a58], tip=0x282340),
    'ruin': dict(grass=[0x6c8d6b, 0x93a884, 0x55725e], flower=[0xd8d0ff, 0xb0f0ff, 0xe8e0c8], dirt=0x6e6062, rock=[0x8e8a95, 0x74707f, 0x585369, 0x383349], tip=0x201c30),
    'far': dict(grass=[0x6fae6a, 0x93c97a, 0x5a9a66], flower=[0x93c97a, 0x93c97a, 0x93c97a], dirt=0x8a7066, rock=[0xa48a8e, 0x8a7386, 0x6a5a7c, 0x4a4262], tip=0x3a3452),
}


class Island:
    def __init__(self, name, center, radius, seed=1, hills=0.8, flats=(), palette='meadow', depth=None, title='', subtitle=''):
        self.name, self.title, self.subtitle = name, title or name, subtitle
        self.center = tuple(center)
        self.radius, self.seed, self.hills = radius, seed or 1, hills
        self.depth = depth if depth is not None else radius * 1.15
        self.flats = list(flats)
        self.pal = {k: ([lin(c) for c in v] if isinstance(v, list) else lin(v)) for k, v in PALETTES[palette].items()}
        # the web keeps this table in a Float32Array; round the same way so edge tests agree exactly
        self.edge = [struct.unpack('f', struct.pack('f', self._edge(i / 360 * TAU)))[0] for i in range(360)]

    def _edge(self, th):
        c, s, k = math.cos(th), math.sin(th), self.seed
        n = fbm(c * 1.1 + k * 1.7, s * 1.1 - k * 0.9, 3, k)
        n2 = vnoise(c * 3.5 + 7, s * 3.5 + k, k + 5)
        return self.radius * (0.8 + 0.32 * n + 0.08 * n2)

    def edgeR(self, th):
        a = th / TAU * 360
        a = ((a % 360) + 360) % 360
        i = int(a)
        f = a - i
        return self.edge[i] * (1 - f) + self.edge[(i + 1) % 360] * f

    def top(self, x, z):
        k = self.seed
        h = (fbm(x * 0.04 + k * 3.1, z * 0.04 - k * 1.3, 4, k) - 0.5) * 2.4 * self.hills
        h += (vnoise(x * 0.22 + k, z * 0.22 - k, k + 3) - 0.5) * 0.22 * self.hills
        r = math.hypot(x, z) / self.radius
        h += (1 - min(1.0, r * r)) * self.hills * 0.5
        for f in self.flats:
            d = math.hypot(x - f['x'], z - f['z'])
            w = 1 - smooth(clamp((d - f['r']) / f.get('blend', 5)))
            if w > 0:
                h += (f['h'] - h) * w
        return h

    def contains_local(self, x, z, margin=0.45):
        return math.hypot(x, z) < self.edgeR(math.atan2(z, x)) - margin

    def build(self, detail=1.0):
        """Vertices in island-local three.js space, linear vertex colours, triangles (same rows as island.js)."""
        S = max(24, round(84 * detail))
        RT = max(5, round(18 * detail))
        RB = max(4, round(13 * detail))
        pal, k = self.pal, self.seed
        pos, col, tris, rows = [], [], [], []

        def V(x, y, z, c):
            pos.append((x, y, z))
            col.append(c)
            return len(pos) - 1
        g0, g20 = fbm(k, 0, 3, k + 11), vnoise(0, 0, k + 13)
        centre_c = lerp3(lerp3(pal['grass'][0], pal['grass'][1], clamp(g0 * 1.7 - 0.35)), pal['grass'][2], clamp((0.42 - g0) * 2.6) * 0.8)
        if g20 > 0.93:
            centre_c = lerp3(centre_c, pal['flower'][int(g20 * 1000) % 3], 0.18)
        centre = V(0, self.top(0, 0), 0, centre_c)
        for i in range(1, RT + 1):
            f = (i / RT) ** 0.82
            row = []
            for j in range(S):
                th = j / S * TAU
                r = f * self.edgeR(th) * 0.995
                x, z = math.cos(th) * r, math.sin(th) * r
                y = self.top(x, z)
                g = fbm(x * 0.07 + k, z * 0.07, 3, k + 11)
                g2 = vnoise(x * 0.55, z * 0.55, k + 13)
                c = lerp3(pal['grass'][0], pal['grass'][1], clamp(g * 1.7 - 0.35))
                c = lerp3(c, pal['grass'][2], clamp((0.42 - g) * 2.6) * 0.8)
                if g2 > 0.93:
                    c = lerp3(c, pal['flower'][int(g2 * 1000) % 3], 0.18)
                if i == RT:
                    c = lerp3(c, pal['dirt'], 0.5)
                    y -= 0.12
                row.append(V(x, y, z, c))
            rows.append(row)
        lip = []
        for j in range(S):
            th = j / S * TAU
            R = self.edgeR(th)
            x, z = math.cos(th) * R * 1.02, math.sin(th) * R * 1.02
            y = self.top(x * 0.97, z * 0.97) - 0.9 - vnoise(th * 5, 1, k + 17) * 0.7
            lip.append(V(x, y, z, lerp3(pal['dirt'], pal['rock'][0], 0.45)))
        rows.append(lip)
        for q in range(1, RB + 1):
            t, row = q / RB, []
            for j in range(S):
                th = j / S * TAU
                R = self.edgeR(th)
                spike = max(0.0, math.sin(th * 5 + k * 2.3)) ** 4 * 0.4 + max(0.0, math.sin(th * 11 + k)) ** 6 * 0.25
                shrink = t ** 1.2 * (1 - spike * t * 0.55)
                r = R * max(0.02, 1 - shrink) * (0.93 + 0.14 * vnoise(th * 4, t * 3, k + 21))
                x, z = math.cos(th) * r, math.sin(th) * r
                y = -1.4 - self.depth * t ** 1.05 * (1 + spike * 0.9) + (vnoise(th * 6, t * 5, k + 29) - 0.5) * 1.4
                bi = clamp(-y / (self.depth * 1.5)) * 3
                i0 = min(2, int(bi))
                c = lerp3(pal['rock'][i0], pal['rock'][i0 + 1], bi - i0)
                strata = math.sin(y * 1.7 + vnoise(th * 3, y * 0.3, k + 31) * 3)
                c = tuple(v * (0.86 + 0.14 * strata) for v in c)
                row.append(V(x, y, z, c))
            rows.append(row)
        tip = V(0, -1.4 - self.depth * 1.22, 0, pal['tip'])
        first = rows[0]
        for j in range(S):
            tris.append((centre, first[(j + 1) % S], first[j]))
        for a, b in zip(rows, rows[1:]):
            for j in range(S):
                j2 = (j + 1) % S
                tris.append((a[j], a[j2], b[j]))
                tris.append((a[j2], b[j2], b[j]))
        last = rows[-1]
        for j in range(S):
            tris.append((last[j], last[(j + 1) % S], tip))
        return pos, col, tris


def mesh_from(name, pos, col, tris, coll, emit=0.0):
    """three.js-space vertices -> a Blender mesh at (x, -z, y), one colour per vertex, flat-shaded triangles."""
    import bmesh
    bm = bmesh.new()
    cl = bm.loops.layers.float_color.new(core.COLOR_ATTR)
    vs = [bm.verts.new((x, -z, y)) for x, y, z in pos]
    bm.verts.index_update()
    for t in tris:
        try:
            f = bm.faces.new((vs[t[0]], vs[t[1]], vs[t[2]]))
        except ValueError:
            continue
        f.smooth = False
        for loop in f.loops:
            c = col[loop.vert.index]
            loop[cl] = (c[0], c[1], c[2], emit)
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    me.materials.append(core.vertex_color_material())
    ca = me.color_attributes.get(core.COLOR_ATTR)
    me.color_attributes.active_color = ca
    try:
        me.color_attributes.default_color_name = ca.name
    except Exception:
        pass
    return ob


# ---------------------------------------------------------------- world.js
ISLES = {
    'skyreach': dict(title='Skyreach', subtitle='The spire island', center=(0, 0, 0), radius=28, seed=3, hills=0.75, palette='meadow',
                     flats=[dict(x=7, z=-9, r=4.5, h=0.5), dict(x=-7, z=2, r=5.5, h=0.2), dict(x=0, z=9, r=3, h=0.3), dict(x=6.5, z=4.5, r=2.4, h=0.25), dict(x=17, z=-2, r=2.8, h=0.45)]),
    'verdant': dict(title='Verdant Shelf', subtitle='Where the swarm nests', center=(108, -7, -42), radius=37, seed=7, hills=1.2, palette='shelf',
                    flats=[dict(x=-25, z=0, r=4, h=0.3), dict(x=-24, z=7, r=2.4, h=0.3), dict(x=22, z=-19, r=3.2, h=0.6)]),
    'warden': dict(title="Warden's Isle", subtitle='The first chain ends here', center=(-40, 20, -132), radius=26, seed=13, hills=0.55, palette='ruin',
                   flats=[dict(x=0, z=0, r=15, h=0, blend=3), dict(x=0, z=18, r=4, h=0.2)]),
}
_ISLANDS = {}


def island(name):
    if name not in _ISLANDS:
        d = ISLES[name]
        _ISLANDS[name] = Island(name, d['center'], d['radius'], d['seed'], d['hills'], d['flats'], d['palette'], title=d['title'], subtitle=d['subtitle'])
    return _ISLANDS[name]


def scatter(isl, n, seed, minGap=2.2, avoid=(), margin=3.0, near=None):
    r, out, tries = rng(seed), [], 0
    while len(out) < n and tries < n * 40:
        tries += 1
        if near:
            a, d = r() * TAU, math.sqrt(r()) * near['r']
            lx, lz = near['x'] + math.cos(a) * d, near['z'] + math.sin(a) * d
        else:
            a, d = r() * TAU, math.sqrt(r()) * isl.radius * 1.15
            lx, lz = math.cos(a) * d, math.sin(a) * d
        if not isl.contains_local(lx, lz, margin):
            continue
        if any(math.hypot(lx - q['x'], lz - q['z']) < q['r'] for q in avoid):
            continue
        if any(math.hypot(lx - o[0], lz - o[1]) < minGap for o in out):
            continue
        out.append((lx, lz, isl.top(lx, lz) - 0.05))
    return out


def safe(isl, lx, lz):
    x, z = lx, lz
    for _ in range(40):
        if isl.contains_local(x, z, 2.5):
            break
        x *= 0.94
        z *= 0.94
    return x, z


def U(x, y, z):
    """three.js -> Unity position (rounded)."""
    return [round(-x, 3), round(y, 3), round(z, 3)]


def uyaw_model(ry):
    """three.js rotation.y of a model -> Unity yaw (degrees)."""
    return round(-math.degrees(ry), 2)


def uyaw_view(yaw):
    """the web player's yaw (forward = (-sin, -cos)) -> Unity yaw (degrees)."""
    return round((180 - math.degrees(yaw)) % 360, 2)


TREE_VARIANTS = {'round': ('Tree_Round_A', 'Tree_Round_B'), 'pine': ('Tree_Pine_A', 'Tree_Pine_B'),
                 'blossom': ('Tree_Blossom_A', 'Tree_Blossom_B'), 'aether': ('Tree_Aether_A', 'Tree_Aether_B')}
ROCKS = ('Rock_A', 'Rock_B', 'Rock_C', 'Rock_D')


class Layout:
    def __init__(self, isl):
        self.isl = isl
        self.props, self.scatter, self.points = [], {}, {}

    def h(self, lx, lz):
        return self.isl.top(lx, lz)

    def prop(self, asset_name, lx, lz, ry=0.0, dy=0.0, scale=1.0, **extra):
        self.props.append(dict(asset=asset_name, position=U(lx, self.h(lx, lz) + dy, lz), yaw=uyaw_model(ry), scale=scale, **extra))

    def inst(self, asset_name, x, y, z, ry, s, tint=None):
        row = [round(-x, 3), round(y, 3), round(z, 3), uyaw_model(ry), round(s, 3)]
        if tint:
            row += [round(t, 3) for t in tint]
        self.scatter.setdefault(asset_name, []).append(row)

    def forest(self, seed, counts, avoid):
        r = rng(seed)
        for kind, n in counts.items():
            pts = scatter(self.isl, n, seed + len(kind) * 13, minGap=3.4, avoid=avoid, margin=2.6)
            for i, (x, z, y) in enumerate(pts):
                s, ry = 0.85 + r() * 0.55, r() * TAU
                tint = (0.88 + r() * 0.2, 0.9 + r() * 0.16, 0.88 + r() * 0.18)
                self.inst(TREE_VARIANTS[kind][i % 2], x, y, z, ry, s, tint)

    def rocks(self, seed, n, avoid, color=0x9a8f9e):
        r, pts = rng(seed), scatter(self.isl, n, seed, minGap=2.6, avoid=avoid, margin=1.5)
        base = core.hex_rgb(0x9a8f9e)
        tint = tuple(c / b for c, b in zip(core.hex_rgb(color), base))
        for i, (x, z, y) in enumerate(pts):
            s = 0.35 + r() ** 2 * 1.5
            ry = r() * TAU
            self.inst(ROCKS[i % 4], x, y + s * 0.15 - s * 0.3, z, ry, s, tint)

    def grass(self, seed, n, avoid):
        r, pts = rng(seed), scatter(self.isl, n, seed, minGap=0.55, avoid=avoid, margin=1.2)
        for (x, z, y) in pts:
            s, ry = 0.6 + r() * 0.7, r() * TAU
            tint = (0.85 + r() * 0.3, 0.9 + r() * 0.2, 0.85 + r() * 0.2)
            self.inst('Grass_A', x, y + 0.05, z, ry, s, tint)
        for (x, z, y) in scatter(self.isl, round(n / 9), seed + 3, minGap=1.4, avoid=avoid, margin=1.5):
            s, ry = 0.8 + r() * 0.7, r() * TAU
            self.inst('Flowers_A', x, y + 0.02, z, ry, s)

    def crystals(self, seed, n, violet=False, **opts):
        o = dict(minGap=4, margin=2.5)
        o.update(opts)
        r, pts = rng(seed), scatter(self.isl, n, seed, **o)
        for i, (x, z, y) in enumerate(pts):
            s, ry = 0.8 + r() * 0.8, r() * TAU
            name = ('Crystal_Violet_A', 'Crystal_Violet_B') if violet else ('Crystal_Cyan_A', 'Crystal_Cyan_B')
            self.inst(name[i % 2], x, y, z, ry, s)

    def point(self, key, lx, lz, yaw=None, dy=0.0, **extra):
        d = dict(position=U(lx, self.h(lx, lz) + dy, lz), **extra)
        if yaw is not None:
            d['yaw'] = uyaw_view(yaw)
        self.points[key] = d
        return d


def layout_all():
    """Everything world.js's build() places, in Unity island-local space."""
    out = {}
    # ---- Skyreach
    S = Layout(island('skyreach'))
    S.prop('Spire', 7, -9)
    S.prop('Camp', -7, 2, 0.5)
    camp_x, camp_z, cyaw = -7, 2, 0.5
    S.prop('Waystone', 0, 9.5)
    S.point('waystoneSpawn', 0, 6.8, yaw=0)
    S.point('landing', 14.5, -2, yaw=math.pi / 2)
    S.prop('TrainingDummy', 6.5, 4.5, -0.3)
    S.prop('Current_Blue', 17.5, -2, to='verdant', label='Ride the aether current to Verdant Shelf')
    lx, lz = 1.3, 1.6
    c, s = math.cos(cyaw), math.sin(cyaw)
    px, pz = camp_x + lx * c + lz * s, camp_z - lx * s + lz * c
    S.point('pell', px, pz, interactRadius=2.6, note='Pell stands here and turns to face the player within 7 m.')
    avoid = [dict(x=7, z=-9, r=6), dict(x=-7, z=2, r=6.5), dict(x=0, z=9.5, r=4), dict(x=6.5, z=4.5, r=3), dict(x=17, z=-2, r=4), dict(x=0, z=4, r=4)]
    S.forest(41, {'round': 12, 'pine': 8, 'blossom': 7}, avoid)
    S.rocks(43, 14, avoid)
    S.grass(47, 900, [dict(x=7, z=-9, r=4.2), dict(x=0, z=9.5, r=1.6)])
    S.crystals(49, 5, near=dict(x=7, z=-9, r=9), avoid=[dict(x=7, z=-9, r=4.6)])
    out['skyreach'] = S
    # ---- Verdant Shelf
    V = Layout(island('verdant'))
    lx, lz = safe(V.isl, -24.5, 0)
    V.point('landing', lx, lz, yaw=-math.pi / 2)
    V.prop('Current_Blue', -24, 7, to='skyreach', label='Ride the aether current home to Skyreach')
    V.prop('Current_Gold', 22, -19, to='warden', label="Ride the aether current to the Warden's Isle",
           lockedLabel='The current is too weak to carry you. Pell might know more.', unlock='quest swarm done, or warden active')
    V.prop('Waystone', -21, -5)
    V.point('waystoneSpawn', lx + 1, lz, yaw=-math.pi / 2)
    avoid = [dict(x=-24, z=2, r=8), dict(x=22, z=-19, r=4.5), dict(x=-21, z=-5, r=2.5)]
    V.forest(51, {'round': 14, 'pine': 6, 'blossom': 12, 'aether': 10}, avoid)
    V.rocks(53, 22, avoid, 0x9c8aa0)
    V.grass(57, 1500, avoid[1:])
    V.crystals(59, 10, avoid=avoid)
    V.crystals(61, 6, violet=True, avoid=avoid)
    V.spawns = [dict(type=t, position=U(x, V.h(x, z), z), count=n) for t, x, z, n in
                [('skitter', -6, 9, 3), ('skitter', 10, -9, 3), ('skitter', 13, 13, 3), ('thornback', 1, -17, 1),
                 ('thornback', 20, 3, 1), ('shardling', -11, -12, 1), ('shardling', 5, 21, 1)]]
    out['verdant'] = V
    # ---- Warden's Isle
    W = Layout(island('warden'))
    W.prop('ArenaFloor', 0, 0, dy=0.03)
    lx, lz = safe(W.isl, 0, 18.5)
    W.point('landing', lx, lz, yaw=0)
    W.prop('Current_Blue', -6, 19, to='skyreach', label='Ride the aether current home to Skyreach')
    W.prop('Waystone', 6, 19)
    W.point('waystoneSpawn', lx, lz - 0.5, yaw=0)
    r = rng(71)
    for i in range(10):
        a, d = i / 10 * TAU + 0.2, 16.5
        h = 2.2 + r() * 1.5 if i % 3 == 1 else 5 + r() * 3
        px, pz = math.cos(a) * d, math.sin(a) * d
        if abs(px) < 4 and pz > 10:
            continue
        ry = r() * TAU
        variant, base_h = ('Pillar_B', 3.2) if h < 4 else (('Pillar_A', 5.5) if h < 6.4 else ('Pillar_C', 7.4))
        W.prop(variant, px, pz, ry, scale=[1, round(h / base_h, 3), 1], webHeight=round(h, 3))
    for a in (0.785, 2.356, 3.927, 5.498):
        W.prop('Brazier', math.cos(a) * 13.2, math.sin(a) * 13.2)
    W.forest(73, {'pine': 9}, [dict(x=0, z=0, r=18.5), dict(x=0, z=18.5, r=8)])
    W.rocks(75, 16, [dict(x=0, z=0, r=15), dict(x=0, z=18.5, r=6)], 0x8a8696)
    W.grass(77, 500, [dict(x=0, z=0, r=15)])
    W.point('arenaCentre', 0, 0, radius=14, wakeRadius=12.5)
    W.point('bossSpawn', 0, 0, note='The Stone Warden starts Dormant here until wardenDown is set.')
    W.point('skyKey', 0, 0, dy=1.4, note='Spawned 2.6 s after the Warden falls.')
    out['warden'] = W
    return out


def edge_unity(isl):
    """Walkable edge radius per degree of Unity's atan2(z, x) in island-local space (the web angle is mirrored)."""
    return [round(isl.edgeR(math.radians((180 - i) % 360)), 3) for i in range(360)]


def write_layout(path):
    L = layout_all()
    data = dict(
        about='Aetherfall world layout, generated by art/assets/islands.py from the web game\'s world.js. '
              'Unity space: metres, Y up; island content is relative to its island\'s position. Yaw is degrees about +Y.',
        conventions=dict(
            fromWeb='three.js (x, y, z) -> Unity (-x, y, z); a model\'s rotation.y becomes Unity yaw -deg; the player\'s web yaw becomes 180 - deg.',
            scatterRow='[x, y, z, yawDegrees, uniformScale] plus [r, g, b] tint multipliers where the web tinted instances',
            edgeRadii='360 walkable radii from the island centre, index = Unity atan2(z, x) in degrees; the web keeps a grounded player inside radius - 0.6.',
            fall='Below island centre y - 16 the player falls: return them to the last waystone (web: player.js vertical()).'),
        islands={}, farIslands=dict(model='FarIslands', note='One mesh in world space; place at the origin.'))
    for name, Lo in L.items():
        isl = Lo.isl
        cx, cy, cz = isl.center
        entry = dict(title=isl.title, subtitle=isl.subtitle, model=f'Island_{name.capitalize()}', position=U(cx, cy, cz),
                     radius=isl.radius, edgeRadii=edge_unity(isl), points=Lo.points, props=Lo.props,
                     scatter={k: v for k, v in sorted(Lo.scatter.items())})
        if hasattr(Lo, 'spawns'):
            entry['spawns'] = Lo.spawns
        data['islands'][name] = entry
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    return data


# ---------------------------------------------------------------- assets
def island_asset(name):
    col = core.collection(f'Island_{name.capitalize()}')
    isl = island(name)
    pos, colr, tris = isl.build(1.0)
    ob = mesh_from(f'Island_{name.capitalize()}', pos, colr, tris, col)
    # invisible wall just inside the walkable edge, for character controllers that prefer colliders
    wp, wt = [], []
    n = 180
    for j in range(n):
        th = j / n * TAU
        r_ = isl.edgeR(th) - 0.6
        x, z = math.cos(th) * r_, math.sin(th) * r_
        y = isl.top(x, z)
        wp += [(x, y - 1.0, z), (x, y + 2.6, z)]
    for j in range(n):
        a, b = 2 * j, 2 * ((j + 1) % n)
        wt += [(a, b, a + 1), (b, b + 1, a + 1)]
    wall = mesh_from('EdgeWall', wp, [(0.5, 0.5, 0.5)] * len(wp), wt, col)
    wall.parent = ob
    wall.display_type = 'WIRE'
    return Result([ob], notes=f'{isl.title}: place at layout.json islands.{name}.position. MeshCollider on the island; '
                              'EdgeWall is collider-only (disable its renderer) if you would rather wall the edge than clamp to edgeRadii.',
                  preview=dict(yaw=-30, pitch=28, margin=1.0, ground_z=-200))


@asset('Island_Skyreach', 'world', 'islands')
def island_skyreach():
    return island_asset('skyreach')


@asset('Island_Verdant', 'world', 'islands')
def island_verdant():
    return island_asset('verdant')


@asset('Island_Warden', 'world', 'islands')
def island_warden():
    return island_asset('warden')


@asset('FarIslands', 'world', 'islands')
def far_islands():
    """sky.js makeFarIslands: 46 small islands 150-850 m out, merged into one mesh in world space."""
    col = core.collection('FarIslands')
    r = rng(29)
    avoid = [(i.center[0], i.center[2], i.radius + 60) for i in (island(n) for n in ('skyreach', 'verdant', 'warden'))]
    P, C, T = [], [], []
    made = tries = 0
    while made < 46 and tries < 600:
        tries += 1
        a, d = r() * TAU, 150 + r() ** 0.8 * 700
        x, z = math.cos(a) * d, math.sin(a) * d - 50
        if any(math.hypot(x - ax, z - az) < ar for ax, az, ar in avoid):
            continue
        rad = 5 + r() * 22 * (d / 600 + 0.4)
        y = -45 + r() * 95
        isl = Island('far', (0, 0, 0), rad, 100 + made, 0.6, (), 'far', depth=rad * (1 + r() * 0.8))
        pos, colr, tris = isl.build(0.3)
        base = len(P)
        P += [(px + x, py + y, pz + z) for px, py, pz in pos]
        C += colr
        T += [(a_ + base, b_ + base, c_ + base) for a_, b_, c_ in tris]
        made += 1
    ob = mesh_from('FarIslands', P, C, T, col)
    return Result([ob], notes='Distant scenery in world space: place at the origin. No collider needed.',
                  preview=dict(yaw=-30, pitch=30, margin=0.9, ground_z=-2000))


@asset('WorldLayout', 'data', 'islands')
def world_layout():
    path = os.path.join(registry.OUT[0], 'layout.json')
    data = write_layout(path)
    counts = {n: dict(props=len(i['props']), scatter={k: len(v) for k, v in i['scatter'].items()}) for n, i in data['islands'].items()}
    return Result([], notes=f'Wrote {os.path.relpath(path)}', extra=dict(counts=counts))
