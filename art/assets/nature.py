"""Vegetation, rocks and crystals (src/world/props.js: treeGeometries, rockGeometry, crystalGeometry, grass, flowers).
Pivots sit at the base. Colours match the web palette; per-island tints (the web tinted instances) belong
on the instance in Unity, not baked here."""
import math

from mathutils import Vector

from lib import core, forms
from lib.registry import Result, asset

TRUNK = {'round': 0x6b4a3a, 'pine': 0x5e4234, 'blossom': 0x6e4a44, 'aether': 0x4f4160}


def foliage(base, under=0.78):
    """Leaf blobs: lighter on top, darker underneath, so canopies read as lit from above."""
    def fn(f):
        z = f.normal.z
        return core.shade(base, under) if z < -0.35 else core.shade(base, 1.08) if z > 0.6 else base
    return fn


def blob(B, r, at, color, seed, rough=0.2, squash=1.0):
    rnd = core.rng(seed)
    B.ico(r, sub=1, at=at, scale=(1, 1, squash), displace=lambda co: 1 - rough / 2 + rnd.random() * rough,
          color=color, jitter=0.16)


def trunk(B, kind, h, lean=(0.05, 0.03), r0=0.2, seed=1, twist=0.0):
    rnd = core.rng(seed)
    pts, radii = [], []
    for i in range(5):
        k = i / 4
        tw = math.sin(k * math.pi * 1.5) * twist
        pts.append((lean[0] * k * k + tw, lean[1] * k * k - tw * 0.5, -0.1 + (h + 0.1) * k))
        radii.append(r0 * (1 - 0.48 * k))
    B.tube(pts, radii, n=6, color=TRUNK[kind], jitter=0.08)
    for k in range(4):
        a = k / 4 * math.tau + rnd.random() * 0.6
        B.cone(r0 * 0.42, r0 * 2.2, n=4, at=(math.cos(a) * r0 * 0.6, math.sin(a) * r0 * 0.6, 0.05),
               rot=(90 - 25, 0, math.degrees(a) - 90), color=core.shade(TRUNK[kind], 0.9), jitter=0.08)
    return pts[-1]


def tree_result(ob, kind, notes=''):
    return Result([ob], notes=f'{kind} tree. Collider: a capsule of radius 0.4 x scale at the trunk. ' + notes,
                  extra=dict(collider=dict(radius=0.4, height=2.4)), preview=dict(yaw=-30, pitch=12, margin=1.02))


def round_tree(name, seed, blobs, leaf=0x58a654, kind='round', h=2.4, extra=None):
    col = core.collection(name)
    B = forms.Builder(seed=seed)
    top = trunk(B, kind, h, seed=seed)
    for i, (r, x, y, z) in enumerate(blobs):
        c = leaf[i % len(leaf)] if isinstance(leaf, (list, tuple)) else leaf
        blob(B, r, (top[0] + x, top[1] + y, z), foliage(c), seed * 10 + i)
    if extra:
        extra(B, top)
    return B.to_object(name, col)


@asset('Tree_Round_A', 'prop', 'nature')
def tree_round_a():
    return tree_result(round_tree('Tree_Round_A', 41, [(1.35, 0, 0, 3.0), (0.95, 0.75, -0.3, 2.6), (1.0, -0.65, 0.35, 2.7), (0.9, 0.1, 0.1, 3.75)]), 'Round')


@asset('Tree_Round_B', 'prop', 'nature')
def tree_round_b():
    return tree_result(round_tree('Tree_Round_B', 42, [(1.2, 0.1, 0, 3.2), (1.05, -0.8, -0.2, 2.8), (0.85, 0.8, 0.4, 2.7), (0.8, 0.2, -0.6, 3.9), (0.7, -0.3, 0.5, 3.8)],
                                  leaf=[0x58a654, 0x4f9a4c], h=2.6), 'Round')


def pine(name, seed, tiers, h=1.6):
    col = core.collection(name)
    B = forms.Builder(seed=seed)
    top = trunk(B, 'pine', h, r0=0.17, seed=seed, lean=(0.02, 0.01))
    cols = [0x3a8556, 0x43925e, 0x4f9e66, 0x58a870, 0x62b07a]
    for i, (r, z0, hh) in enumerate(tiers):
        c = cols[min(i, len(cols) - 1)]
        B.lathe([(r * 0.35, z0 + 0.22), (r, z0), (r * 0.62, z0 + hh * 0.42), (0, z0 + hh)], n=7, phase=i * 0.5,
                at=(top[0], top[1], 0), color=foliage(c, 0.72), jitter=0.12)
    return B.to_object(name, col)


@asset('Tree_Pine_A', 'prop', 'nature')
def tree_pine_a():
    return tree_result(pine('Tree_Pine_A', 43, [(1.25, 1.05, 1.9), (1.0, 1.95, 1.7), (0.72, 2.85, 1.5)]), 'Pine')


@asset('Tree_Pine_B', 'prop', 'nature')
def tree_pine_b():
    return tree_result(pine('Tree_Pine_B', 44, [(1.1, 1.0, 1.6), (0.92, 1.75, 1.5), (0.74, 2.5, 1.4), (0.52, 3.2, 1.3)], h=1.5), 'Pine')


@asset('Tree_Blossom_A', 'prop', 'nature')
def tree_blossom_a():
    return tree_result(round_tree('Tree_Blossom_A', 45, [(1.25, 0, 0, 2.9), (0.9, 0.7, -0.35, 2.5), (0.95, -0.6, 0.3, 2.6), (0.8, 0.15, 0.15, 3.6)],
                                  leaf=[0xf7cadd, 0xf2b2cd], kind='blossom', h=2.2), 'Blossom')


@asset('Tree_Blossom_B', 'prop', 'nature')
def tree_blossom_b():
    return tree_result(round_tree('Tree_Blossom_B', 46, [(1.1, 0.2, 0, 3.0), (0.95, -0.75, 0.1, 2.7), (0.8, 0.85, -0.2, 2.6), (0.75, -0.1, -0.5, 3.6)],
                                  leaf=[0xf2b2cd, 0xf9d6e4], kind='blossom', h=2.3), 'Blossom')


def aether_extra(seed):
    def fn(B, top):
        rnd = core.rng(seed)
        for k in range(6):
            a = k / 6 * math.tau + rnd.random() * 0.5
            d = Vector((math.cos(a), math.sin(a), 0.6 + rnd.random() * 0.6)).normalized()
            base = Vector((top[0], top[1], 3.0)) + d * 0.9
            rot = Vector((0, 0, 1)).rotation_difference(d).to_euler()
            B.shard(0.08, 0.45 + rnd.random() * 0.3, n=5, at=tuple(base), rot=tuple(math.degrees(x) for x in rot),
                    color=0x8fe9ff, emit=0.55, jitter=0.06)
    return fn


@asset('Tree_Aether_A', 'prop', 'nature')
def tree_aether_a():
    col = core.collection('Tree_Aether_A')
    B = forms.Builder(seed=47)
    top = trunk(B, 'aether', 2.6, r0=0.2, seed=47, twist=0.12)
    for i, (r, x, y, z) in enumerate([(1.1, 0, 0, 3.1), (0.8, 0.6, -0.25, 2.6), (0.85, -0.55, 0.3, 2.8)]):
        blob(B, r, (top[0] + x, top[1] + y, z), foliage(0x78d8c8), 470 + i)
    aether_extra(47)(B, top)
    return tree_result(B.to_object('Tree_Aether_A', col), 'Aether', 'Glow: add a soft light or sprite near the crystals.')


@asset('Tree_Aether_B', 'prop', 'nature')
def tree_aether_b():
    col = core.collection('Tree_Aether_B')
    B = forms.Builder(seed=48)
    top = trunk(B, 'aether', 2.8, r0=0.19, seed=48, twist=-0.14)
    for i, (r, x, y, z) in enumerate([(1.0, 0.1, 0, 3.3), (0.85, -0.6, 0.2, 2.9), (0.75, 0.6, 0.35, 2.8), (0.6, 0.0, -0.55, 3.0)]):
        blob(B, r, (top[0] + x, top[1] + y, z), foliage(0x6fd0c4), 480 + i)
    aether_extra(48)(B, top)
    return tree_result(B.to_object('Tree_Aether_B', col), 'Aether', 'Glow: add a soft light or sprite near the crystals.')


# ---------------------------------------------------------------- rocks and crystals
ROCK = 0x9a8f9e
MOSS = 0x6f9e5a


def rock_mesh(B, r, at, seed, squash=0.72, color=ROCK, moss=0.0, sub=1):
    rnd = core.rng(seed)

    def disp(co):
        return 0.78 + rnd.random() * 0.44
    part = B.ico(r, sub=sub, at=(0, 0, 0), displace=disp, color=color, jitter=0.12)
    for v in part.verts:
        v.co.z *= squash
        if v.co.z < -r * 0.35:
            v.co.z = -r * 0.35
        v.co += Vector(at) + Vector((0, 0, r * 0.3))
    if moss:
        for f in part.faces:
            f.normal_update()
            if f.normal.z > 0.55 and rnd.random() < moss:
                B.paint([f], core.mix(MOSS, color, 0.15), 0.1)
    return part


def rock_asset(name, parts, moss=0.0):
    col = core.collection(name)
    B = forms.Builder(seed=sum(map(ord, name)))
    for i, (r, at, squash) in enumerate(parts):
        rock_mesh(B, r, at, seed=len(name) * 7 + i * 13, squash=squash, moss=moss)
    ob = B.to_object(name, col)
    return Result([ob], notes='Pivot at the base, slightly buried. Collider: a sphere or mesh collider; the web only blocked rocks scaled above 0.7.',
                  preview=dict(yaw=-30, pitch=20))


@asset('Rock_A', 'prop', 'nature')
def rock_a():
    return rock_asset('Rock_A', [(1.0, (0, 0, 0), 0.72)])


@asset('Rock_B', 'prop', 'nature')
def rock_b():
    return rock_asset('Rock_B', [(1.1, (0, 0, 0), 0.45)])


@asset('Rock_C', 'prop', 'nature')
def rock_c():
    return rock_asset('Rock_C', [(0.8, (0, 0, 0), 1.25)])


@asset('Rock_D', 'prop', 'nature')
def rock_d():
    return rock_asset('Rock_D', [(0.7, (0, 0, 0), 0.8), (0.45, (0.75, 0.3, 0), 0.7), (0.35, (-0.5, 0.55, 0), 0.9)])


@asset('Rock_Mossy_A', 'prop', 'nature')
def rock_mossy_a():
    return rock_asset('Rock_Mossy_A', [(1.0, (0, 0, 0), 0.7)], moss=0.85)


@asset('Rock_Mossy_B', 'prop', 'nature')
def rock_mossy_b():
    return rock_asset('Rock_Mossy_B', [(0.85, (0, 0, 0), 0.6), (0.5, (0.8, -0.2, 0), 0.75)], moss=0.85)


def crystal_cluster(name, seed, color, emit, n, violet=False):
    col = core.collection(name)
    B = forms.Builder(seed=seed)
    rnd = core.rng(seed)
    for k in range(n):
        h = 0.7 + rnd.random() * 1.4
        r = 0.13 + h * 0.04
        a = rnd.random() * math.tau
        d = 0.1 + rnd.random() * 0.25
        B.shard(r, h, n=6, at=(math.cos(a) * d, math.sin(a) * d, -0.05),
                rot=((rnd.random() - 0.5) * 50, (rnd.random() - 0.5) * 50, rnd.random() * 60),
                color=core.mix(color, 0xffffff, rnd.random() * 0.15), emit=emit, jitter=0.08)
    for k in range(3):
        a = k / 3 * math.tau + 0.4
        rock_mesh(B, 0.22, (math.cos(a) * 0.3, math.sin(a) * 0.3, -0.12), seed * 3 + k, squash=0.6, color=0x5e5470, sub=0)
    ob = B.to_object(name, col)
    return Result([ob], notes=f'{"Violet" if violet else "Cyan"} crystal cluster; add a soft glow sprite or light 1 m up.',
                  extra=dict(collider=dict(radius=0.7)), preview=dict(yaw=-30, pitch=15))


@asset('Crystal_Cyan_A', 'prop', 'nature')
def crystal_cyan_a():
    return crystal_cluster('Crystal_Cyan_A', 61, 0x8fe9ff, 0.5, 4)


@asset('Crystal_Cyan_B', 'prop', 'nature')
def crystal_cyan_b():
    return crystal_cluster('Crystal_Cyan_B', 62, 0x8fe9ff, 0.5, 6)


@asset('Crystal_Violet_A', 'prop', 'nature')
def crystal_violet_a():
    return crystal_cluster('Crystal_Violet_A', 63, 0xc4a0ff, 0.45, 4, violet=True)


@asset('Crystal_Violet_B', 'prop', 'nature')
def crystal_violet_b():
    return crystal_cluster('Crystal_Violet_B', 64, 0xc4a0ff, 0.45, 5, violet=True)


# ---------------------------------------------------------------- grass and flowers
GRASS_DARK, GRASS_LIGHT, STEM = 0x2f6a36, 0xa8da6c, 0x3f7a3a


@asset('Grass_A', 'prop', 'nature')
def grass_a():
    col = core.collection('Grass_A')
    B = forms.Builder(seed=71)
    rnd = core.rng(71)
    for k in range(6):
        a = k / 6 * math.tau + rnd.random() * 0.5
        h = 0.42 + rnd.random() * 0.2
        B.lathe([(0.028, 0), (0.02, h * 0.45), (0, h)], n=3, at=(math.cos(a) * 0.05, math.sin(a) * 0.05, 0),
                rot=(math.cos(a + 1.57) * 22, math.sin(a + 1.57) * 22, rnd.random() * 120),
                color=lambda f: GRASS_LIGHT if f.calc_center_median().z > 0.22 else GRASS_DARK, jitter=0.1)
    ob = B.to_object('Grass_A', col)
    return Result([ob], notes='GPU-instance these (the web scatters 500-1500 per island).', preview=dict(yaw=-30, pitch=20))


@asset('Flowers_A', 'prop', 'nature')
def flowers_a():
    col = core.collection('Flowers_A')
    B = forms.Builder(seed=57)
    rnd = core.rng(57)
    cols = [0xffe68a, 0xf5a9cc, 0xffffff, 0xc8b4ff]
    for i in range(5):
        a, d, h = rnd.random() * math.tau, rnd.random() * 0.22, 0.14 + rnd.random() * 0.16
        x, y = math.cos(a) * d, math.sin(a) * d
        B.lathe([(0.009, 0), (0.007, h)], n=3, at=(x, y, 0), color=STEM)
        for p in range(5):
            pa = p / 5 * math.tau
            B.octa(0.022, 0.012, at=(x + math.cos(pa) * 0.025, y + math.sin(pa) * 0.025, h + 0.01), rot=(0, 0, math.degrees(pa)),
                   scale=(1.2, 0.8, 1), color=cols[i % 4], jitter=0.05)
        B.ball(0.014, n=5, rings=3, at=(x, y, h + 0.018), color=0xffc94a, emit=0.1)
    ob = B.to_object('Flowers_A', col)
    return Result([ob], notes='Scatter with the grass (about one per nine tufts on meadow islands).', preview=dict(yaw=-30, pitch=30, margin=1.1))
