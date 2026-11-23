"""The creatures of the First Chain, rebuilt as rigged, animated models.
Each one keeps the colours and proportions of its web version (src/enemies/types.js, warden.js),
and its clips map onto the states of that creature's AI there."""
import math

from mathutils import Euler, Vector

from lib import core, forms
from lib import rig as R
from lib.registry import Result, asset
from lib.rig import ease, ease_in, ease_out, wave


def lerp3(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def along(base, rot_deg, length):
    """Tip of a part that starts at `base` and points along its rotated local +Z."""
    d = Euler(tuple(math.radians(a) for a in rot_deg), 'XYZ').to_matrix() @ Vector((0, 0, 1))
    return tuple(Vector(base) + d * length)


def face_y(f):
    return f.calc_center_median().y


# =====================================================================================================
# Skitter: a crystal-backed swarm hunter. Swarms, rears up, lunges. (types.js: Skitter)
# =====================================================================================================
SK_SHELL, SK_BAND, SK_BELLY, SK_JAW = 0x3c2e58, 0x4d3c70, 0x2a2240, 0x231c36
SK_CRYSTAL, SK_EYE = 0x8fe9ff, 0xff9a5a


@asset('Skitter', 'creature', 'creatures')
def skitter():
    col = core.collection('Skitter')
    B = forms.Builder(seed=12)

    def chitin(f):
        return SK_BELLY if f.normal.z < -0.35 else SK_SHELL

    def banded(f):
        if f.normal.z < -0.35:
            return SK_BELLY
        return SK_BAND if int((face_y(f) + 0.02) / 0.115) % 2 else SK_SHELL

    # ---- skeleton
    legs = []
    for i in range(3):
        for side, tag in ((1, 'L'), (-1, 'R')):
            ay = -0.17 + i * 0.19
            attach = (side * 0.16, ay, 0.35)
            knee = (side * 0.39, ay + (-0.11, 0.0, 0.11)[i], 0.50)
            foot = (side * 0.58, ay + (-0.26, 0.0, 0.26)[i], 0.0)
            legs.append((i, side, tag, attach, knee, foot))
    spikes = [  # name, base, lean (deg), height, radius, parent
        ('Spike.1', (0.0, -0.12, 0.50), (-30, 0, 0), 0.26, 0.055, 'Body'),
        ('Spike.2', (0.08, 0.09, 0.56), (-36, 0, -16), 0.22, 0.050, 'Abdomen'),
        ('Spike.3', (-0.08, 0.09, 0.56), (-36, 0, 16), 0.22, 0.050, 'Abdomen'),
        ('Spike.4', (0.0, 0.25, 0.60), (-42, 0, 0), 0.31, 0.060, 'Abdomen'),
        ('Spike.5', (0.07, 0.43, 0.54), (-52, 0, -12), 0.17, 0.040, 'Abdomen'),
        ('Spike.6', (-0.07, 0.43, 0.54), (-52, 0, 12), 0.17, 0.040, 'Abdomen'),
    ]
    bones = [
        dict(name='Root', head=(0, 0, 0), tail=(0, 0, 0.2)),
        dict(name='Body', head=(0, 0.02, 0.37), tail=(0, -0.22, 0.38), parent='Root'),
        dict(name='Abdomen', head=(0, 0.06, 0.39), tail=(0, 0.48, 0.42), parent='Body'),
        dict(name='Head', head=(0, -0.25, 0.38), tail=(0, -0.48, 0.38), parent='Body'),
        dict(name='Jaw.L', head=(0.07, -0.50, 0.31), tail=(0.05, -0.74, 0.28), parent='Head'),
        dict(name='Jaw.R', head=(-0.07, -0.50, 0.31), tail=(-0.05, -0.74, 0.28), parent='Head'),
    ]
    for (i, side, tag, a, k, f) in legs:
        bones.append(dict(name=f'Leg.{tag}{i + 1}.Upper', head=a, tail=k, parent='Body'))
        bones.append(dict(name=f'Leg.{tag}{i + 1}.Lower', head=k, tail=f, parent=f'Leg.{tag}{i + 1}.Upper'))
    for name, base, rot, h, r, parent in spikes:
        bones.append(dict(name=name, head=base, tail=along(base, rot, h), parent=parent))

    # ---- mesh
    B.tube([(0, 0.10, 0.38), (0, 0.02, 0.385), (0, -0.10, 0.39), (0, -0.21, 0.385), (0, -0.29, 0.375)],
           [(0.15, 0.10, 0.07), (0.21, 0.14, 0.09), (0.23, 0.15, 0.10), (0.19, 0.13, 0.09), (0.12, 0.09, 0.06)],
           n=8, color=chitin, jitter=0.12, bone='Body')
    B.tube([(0, 0.00, 0.385), (0, 0.10, 0.40), (0, 0.24, 0.42), (0, 0.40, 0.42), (0, 0.54, 0.40), (0, 0.66, 0.37), (0, 0.73, 0.355)],
           [(0.16, 0.11, 0.08), (0.27, 0.18, 0.12), (0.31, 0.21, 0.13), (0.29, 0.19, 0.12), (0.21, 0.14, 0.09), (0.10, 0.07, 0.05), 0],
           n=8, color=banded, jitter=0.1, bone='Abdomen')
    B.tube([(0, -0.23, 0.38), (0, -0.32, 0.395), (0, -0.42, 0.39), (0, -0.50, 0.37), (0, -0.56, 0.35)],
           [(0.11, 0.08, 0.06), (0.15, 0.11, 0.08), (0.14, 0.10, 0.08), (0.10, 0.07, 0.06), (0.05, 0.04, 0.03)],
           n=8, color=chitin, jitter=0.12, bone='Head')
    for sx in (1, -1):
        B.ball(0.046, n=6, rings=4, at=(sx * 0.07, -0.465, 0.455), color=SK_EYE, emit=0.9, bone='Head')
        B.ball(0.028, n=6, rings=3, at=(sx * 0.118, -0.395, 0.468), color=SK_EYE, emit=0.8, bone='Head')
    for sx, tag in ((1, 'L'), (-1, 'R')):
        B.tube([(sx * 0.07, -0.50, 0.31), (sx * 0.115, -0.60, 0.295), (sx * 0.095, -0.70, 0.28), (sx * 0.035, -0.765, 0.285)],
               [0.032, 0.027, 0.018, 0], n=5, color=SK_JAW, jitter=0.1, bone=f'Jaw.{tag}')
    for (i, side, tag, a, k, f) in legs:
        up, lo = f'Leg.{tag}{i + 1}.Upper', f'Leg.{tag}{i + 1}.Lower'
        mid = lerp3(a, k, 0.5)
        B.tube([a, (mid[0], mid[1], mid[2] + 0.03), k], [0.062, 0.056, 0.048], n=5, color=SK_SHELL, jitter=0.1, bone=up)
        B.ball(0.058, n=6, rings=4, at=k, color=SK_BAND, jitter=0.08, bone=up)
        bend = (k[0] + side * 0.06, (k[1] + f[1]) / 2, k[2] * 0.52)
        B.tube([k, bend, (f[0], f[1], f[2] + 0.025), f], [0.048, 0.036, 0.016, 0], n=5, color=SK_BELLY, jitter=0.1, bone=lo)
    for name, base, rot, h, r, parent in spikes:
        B.shard(r, h, n=6, at=base, rot=rot, color=SK_CRYSTAL, emit=0.6, jitter=0.08, bone=name)

    rig = R.make_rig('Skitter', bones, col)
    mesh = B.to_object('Skitter_Mesh', col)
    R.bind(mesh, rig)

    # ---- animation
    LEGS = [(i, side, tag) for (i, side, tag, *_r) in legs]
    SPIKES = [s[0] for s in spikes]

    def tripod(i, side):  # L1 R2 L3 move together, then R1 L2 R3
        return 0.0 if (i % 2 == 0) == (side > 0) else 0.5

    def gait(p, t, yaw_amp, lift_amp, knee=0.6):
        for (i, side, tag) in LEGS:
            ph = (t + tripod(i, side)) % 1.0
            u = -math.cos(ph * math.tau)                  # -1 foot forward .. +1 foot back
            lift = max(0.0, -math.sin(ph * math.tau))     # raised only while swinging forward
            p.rot(f'Leg.{tag}{i + 1}.Upper', y=-side * lift_amp * lift, z=side * yaw_amp * u)
            p.rot(f'Leg.{tag}{i + 1}.Lower', y=-side * lift_amp * knee * lift)

    def jaws(p, deg):
        p.rot('Jaw.L', z=deg)
        p.rot('Jaw.R', z=-deg)

    def reared(p, k):
        """Rear-up pose at intensity k (Windup)."""
        p.move('Body', y=0.05 * k, z=0.10 * k)
        p.rot('Body', x=-26 * k)
        p.rot('Abdomen', x=18 * k)
        p.rot('Head', x=8 * k)
        jaws(p, 30 * k)
        for (i, side, tag) in LEGS:
            up, lo = f'Leg.{tag}{i + 1}.Upper', f'Leg.{tag}{i + 1}.Lower'
            if i == 0:
                p.rot(up, y=-side * 42 * k, z=-side * 14 * k)
                p.rot(lo, y=side * 24 * k)
            elif i == 1:
                p.rot(up, x=12 * k, y=side * 8 * k)
            else:
                p.rot(up, x=22 * k, y=side * 10 * k)
        for s in SPIKES:
            p.size(s, 1 + 0.3 * k)
            p.rot(s, x=-8 * k)

    def struck(p, k):
        """Lunge strike pose at intensity k."""
        p.move('Body', y=-0.16 * k, z=0.02 * k)
        p.rot('Body', x=12 * k)
        p.rot('Abdomen', x=-6 * k)
        p.rot('Head', x=10 * k)
        jaws(p, -8 * k)
        for (i, side, tag) in LEGS:
            up = f'Leg.{tag}{i + 1}.Upper'
            if i == 0:
                p.rot(up, y=side * 6 * k, z=-side * 22 * k)
            else:
                p.rot(up, z=side * 10 * k)

    C = R.Clips(rig)

    def idle(p, t, f):
        p.move('Body', z=0.006 * wave(t, 2))
        p.rot('Body', x=1.2 * wave(t, 1, 0.25))
        p.rot('Abdomen', x=-2.5 * wave(t, 1), y=1.2 * wave(t, 2))
        p.rot('Head', x=2 * wave(t, 2), z=7 * wave(t, 1, 0.1))
        jaws(p, 6 + 5 * wave(t, 3))
        for (i, side, tag) in LEGS:
            p.rot(f'Leg.{tag}{i + 1}.Upper', z=side * 2.5 * wave(t, 1, i * 0.3 + (0.5 if side > 0 else 0)))
        for n, s in enumerate(SPIKES):
            p.rot(s, x=-2 * wave(t, 1, n * 0.15))
    C.add('Idle', 60, idle, loop=True, note='Idle and recover.')

    def walk(p, t, f):
        gait(p, t, 13, 22)
        p.move('Body', z=0.012 * wave(t, 2, 0.25))
        p.rot('Body', y=2.0 * wave(t, 1))
        p.rot('Abdomen', x=-1.5 * wave(t, 2), z=3 * wave(t, 1, 0.2))
        p.rot('Head', z=-2.5 * wave(t, 1))
        jaws(p, 6 + 3 * wave(t, 2))
    C.add('Walk', 24, walk, loop=True, note='Wander (about 1.2 m/s at 1x speed).')

    def run(p, t, f):
        gait(p, t, 20, 30, knee=0.7)
        p.move('Body', z=-0.03 + 0.02 * wave(t, 2, 0.25))
        p.rot('Body', x=5, y=3 * wave(t, 1))
        p.rot('Abdomen', x=-4 + 3 * wave(t, 2), z=5 * wave(t, 1, 0.2))
        p.rot('Head', x=-4, z=-3 * wave(t, 1))
        jaws(p, 12 + 4 * wave(t, 2))
    C.add('Run', 14, run, loop=True, note='Chase (about 3.7 m/s at 1x speed).')

    def windup(p, t, f):
        k = ease_out(t)
        reared(p, k)
        p.rot('Body', y=1.8 * math.sin(f * 2.3) * k * k)
    C.add('Windup', 12, windup, note='Rears up before Lunge; the game holds this state for about 0.38 s.')

    def lunge(p, t, f):
        k = ease_out(min(1.0, t * 1.7))
        settle = ease(max(0.0, (t - 0.55) / 0.45))
        reared(p, 1 - k)
        struck(p, k * (1 - 0.5 * settle))
    C.add('Lunge', 8, lunge, note='The bite: damage lands during this clip (0.2 s in the game).')

    def hit(p, t, f):
        k = math.sin(min(1.0, t * 1.3) * math.pi) * (1 - 0.3 * t)
        p.move('Body', y=0.07 * k, z=0.03 * k)
        p.rot('Body', x=-12 * k, y=7 * k)
        p.rot('Head', x=-10 * k)
        jaws(p, 6 + 16 * k)
        for (i, side, tag) in LEGS:
            p.rot(f'Leg.{tag}{i + 1}.Upper', y=-side * 9 * k)
    C.add('Hit', 8, hit, note='Flinch; play over whatever it was doing.')

    def death(p, t, f):
        k = ease(min(1.0, t * 1.25))
        p.move('Body', z=-0.22 * k)
        p.rot('Body', x=6 * k, y=30 * k)
        p.rot('Abdomen', x=-12 * k)
        p.rot('Head', x=24 * k)
        jaws(p, 18 * k - 10 * ease(max(0.0, t - 0.5) * 2))
        for (i, side, tag) in LEGS:
            p.rot(f'Leg.{tag}{i + 1}.Upper', y=-side * 26 * k, z=side * (i - 1) * 8 * k)
            p.rot(f'Leg.{tag}{i + 1}.Lower', y=side * 70 * k)
        for s in SPIKES:
            p.size(s, 1 - 0.15 * k)
    C.add('Death', 24, death, note='Ends curled on its side; the game then shatters it.')

    return Result(
        [rig], rig=rig, clips=C.meta,
        sockets={'Mouth': dict(bone='Head', at=(0, -0.74, 0.30))},
        hits=[dict(bone='Body', at=(0, 0.06, 0.38), r=0.46)],
        notes='States in types.js -> clips: idle=Idle/Walk, chase=Run, windup=Windup, attack=Lunge, recover=Idle, '
              'hit flinch=Hit, death=Death. No root motion: the game moves the object.',
        preview=dict(yaw=-38, pitch=22))


# =====================================================================================================
# Thornback: a charging boar-beast. Paws the ground, charges, gets dazed when it hits something. (types.js)
# =====================================================================================================
TB_FUR, TB_DARK, TB_MANE, TB_TUSK, TB_HOOF = 0x6a4b5a, 0x41303e, 0x4e3646, 0xf2e6cc, 0x241b22
TB_THORN, TB_EYE = 0xffc46a, 0xffe28a


def _interp(y, table):
    """Linear interpolation in [(y, value), ...] sorted by y (value may be a tuple)."""
    if y <= table[0][0]:
        return table[0][1]
    for (y0, v0), (y1, v1) in zip(table, table[1:]):
        if y <= y1:
            k = (y - y0) / (y1 - y0)
            return tuple(a + (b - a) * k for a, b in zip(v0, v1)) if isinstance(v0, tuple) else v0 + (v1 - v0) * k
    return table[-1][1]


@asset('Thornback', 'creature', 'creatures')
def thornback():
    col = core.collection('Thornback')
    B = forms.Builder(seed=21)

    def fur(f):
        n, c = f.normal, f.calc_center_median()
        if n.z < -0.45:
            return TB_DARK
        if n.z > 0.75 and abs(c.x) < 0.22:
            return TB_MANE
        return TB_FUR

    # body sections from rump (+Y) to chest (-Y): (y, centre z, (rx, ry_up, ry_down))
    body = [(0.98, 1.06, (0.18, 0.14, 0.16)), (0.84, 1.10, (0.42, 0.30, 0.36)), (0.55, 1.13, (0.56, 0.37, 0.46)),
            (0.18, 1.18, (0.63, 0.43, 0.50)), (-0.18, 1.22, (0.66, 0.52, 0.50)), (-0.44, 1.18, (0.58, 0.45, 0.46)),
            (-0.62, 1.08, (0.42, 0.32, 0.36))]
    asc = sorted(body, key=lambda s: s[0])
    cz = [(y, z) for y, z, _ in asc]
    rad = [(y, r) for y, _, r in asc]

    def top(x, y):
        rx, ru, _ = _interp(y, rad)
        return _interp(y, cz) + ru * math.sqrt(max(0.0, 1 - (x / rx) ** 2))

    legs = {  # side, hip, knee, ankle
        'FL': (1, (0.40, -0.42, 1.00), (0.44, -0.36, 0.52), (0.44, -0.42, 0.13)),
        'FR': (-1, (-0.40, -0.42, 1.00), (-0.44, -0.36, 0.52), (-0.44, -0.42, 0.13)),
        'BL': (1, (0.40, 0.58, 1.00), (0.44, 0.71, 0.55), (0.44, 0.60, 0.13)),
        'BR': (-1, (-0.40, 0.58, 1.00), (-0.44, 0.71, 0.55), (-0.44, 0.60, 0.13)),
    }
    bones = [
        dict(name='Root', head=(0, 0, 0), tail=(0, 0, 0.3)),
        dict(name='Hips', head=(0, 0.50, 1.08), tail=(0, 0.10, 1.12), parent='Root'),
        dict(name='Chest', head=(0, 0.10, 1.12), tail=(0, -0.42, 1.22), parent='Hips'),
        dict(name='Neck', head=(0, -0.42, 1.18), tail=(0, -0.78, 1.02), parent='Chest'),
        dict(name='Head', head=(0, -0.78, 1.02), tail=(0, -1.30, 0.80), parent='Neck'),
        dict(name='Jaw', head=(0, -0.92, 0.84), tail=(0, -1.22, 0.72), parent='Head'),
        dict(name='Ear.L', head=(0.24, -0.80, 1.18), tail=(0.30, -0.72, 1.34), parent='Head'),
        dict(name='Ear.R', head=(-0.24, -0.80, 1.18), tail=(-0.30, -0.72, 1.34), parent='Head'),
        dict(name='Tail', head=(0, 0.92, 1.12), tail=(0, 1.16, 0.86), parent='Hips'),
        dict(name='Thorns.Front', head=(0, -0.28, 1.62), tail=(0, -0.12, 1.95), parent='Chest'),
        dict(name='Thorns.Mid', head=(0, 0.14, 1.56), tail=(0, 0.30, 1.88), parent='Chest'),
        dict(name='Thorns.Back', head=(0, 0.52, 1.44), tail=(0, 0.64, 1.70), parent='Hips'),
    ]
    for tag, (side, hip, knee, ankle) in legs.items():
        par = 'Chest' if tag[0] == 'F' else 'Hips'
        bones.append(dict(name=f'Leg.{tag}.Upper', head=hip, tail=knee, parent=par))
        bones.append(dict(name=f'Leg.{tag}.Lower', head=knee, tail=ankle, parent=f'Leg.{tag}.Upper'))

    # ---- mesh: body, neck, head
    def body_w(co):
        k = max(0.0, min(1.0, (co.y + 0.05) / 0.40))
        return {'Hips': k, 'Chest': 1 - k}
    B.tube([(0, y, z) for y, z, _ in body], [r for _, _, r in body], n=10, color=fur, jitter=0.1, weights=body_w)
    B.tube([(0, -0.50, 1.16), (0, -0.66, 1.10), (0, -0.80, 1.02)], [(0.40, 0.36, 0.32), (0.36, 0.32, 0.28), (0.31, 0.27, 0.24)],
           n=8, color=fur, jitter=0.1, bone='Neck')
    for i in range(4):
        y = -0.50 - i * 0.08
        B.cone(0.07, 0.20 - i * 0.02, n=5, at=(0, y, 1.47 - i * 0.07), rot=(-55, 0, 0), color=TB_MANE, jitter=0.12, bone='Neck')

    def skull(f):
        return TB_DARK if f.calc_center_median().y < -1.13 or f.normal.z < -0.5 else TB_FUR
    B.tube([(0, -0.74, 1.05), (0, -0.90, 1.02), (0, -1.04, 0.96), (0, -1.16, 0.88), (0, -1.28, 0.80), (0, -1.355, 0.77)],
           [(0.30, 0.26, 0.22), (0.31, 0.25, 0.22), (0.27, 0.21, 0.19), (0.22, 0.17, 0.15), (0.19, 0.14, 0.13), (0.16, 0.12, 0.11)],
           n=8, color=skull, jitter=0.08, bone='Head')
    B.cyl(0.11, 0.11, 0.03, n=8, at=(0, -1.345, 0.77), rot=(90, 0, 0), color=TB_HOOF, bone='Head')
    B.box((0.58, 0.14, 0.10), at=(0, -0.99, 1.11), rot=(-18, 0, 0), taper=(0.85, 0.7), color=TB_DARK, jitter=0.06, bone='Head')
    for sx, tag in ((1, 'L'), (-1, 'R')):
        B.ball(0.05, n=6, rings=4, at=(sx * 0.215, -1.03, 1.035), color=TB_EYE, emit=0.9, bone='Head')
        B.cone(0.075, 0.20, n=4, at=(sx * 0.24, -0.80, 1.18), rot=(-40, sx * 22, 0), scale=(1, 0.45, 1), color=TB_FUR, jitter=0.1, bone=f'Ear.{tag}')
        B.tube([(sx * 0.17, -1.20, 0.74), (sx * 0.25, -1.36, 0.80), (sx * 0.29, -1.47, 0.92), (sx * 0.26, -1.50, 1.06)],
               [0.058, 0.05, 0.033, 0], n=6, color=TB_TUSK, jitter=0.05, bone='Head')
    B.tube([(0, -0.90, 0.86), (0, -1.06, 0.80), (0, -1.22, 0.73)], [(0.20, 0.06, 0.08), (0.18, 0.05, 0.07), (0.12, 0.04, 0.05)],
           n=6, color=TB_DARK, jitter=0.08, bone='Jaw')
    B.tube([(0, 0.90, 1.12), (0, 1.05, 1.00), (0, 1.15, 0.86)], [0.07, 0.05, 0.035], n=5, color=TB_FUR, bone='Tail')
    B.cone(0.06, 0.18, n=5, at=(0, 1.16, 0.88), rot=(155, 0, 0), color=TB_DARK, jitter=0.1, bone='Tail')

    # ---- thorns: a tall dorsal row and two smaller side rows, grouped onto three bones
    def thorn_bone(y):
        return 'Thorns.Front' if y < -0.10 else 'Thorns.Mid' if y < 0.32 else 'Thorns.Back'
    for y, h, r in [(-0.42, 0.40, 0.075), (-0.24, 0.56, 0.09), (-0.05, 0.64, 0.095), (0.15, 0.56, 0.09),
                    (0.35, 0.46, 0.08), (0.55, 0.36, 0.07), (0.72, 0.26, 0.06)]:
        B.shard(r, h, n=5, at=(0, y, top(0, y) - 0.06), rot=(-35, 0, 0), color=TB_THORN, emit=0.5, jitter=0.08, bone=thorn_bone(y))
    for sx in (1, -1):
        for y, h in [(-0.30, 0.30), (-0.02, 0.34), (0.28, 0.28), (0.54, 0.20)]:
            x = sx * 0.30
            B.shard(0.06, h, n=5, at=(x, y, top(x, y) - 0.06), rot=(-30, sx * 30, 0), color=TB_THORN, emit=0.45, jitter=0.08, bone=thorn_bone(y))

    # ---- legs
    for tag, (side, hip, knee, ankle) in legs.items():
        up, lo = f'Leg.{tag}.Upper', f'Leg.{tag}.Lower'
        B.ball(0.25 if tag[0] == 'B' else 0.22, n=8, rings=5, at=hip, scale=(0.9, 1.1, 1.0), color=TB_FUR, jitter=0.1, bone=up)
        B.tube([hip, lerp3(hip, knee, 0.5), knee], [0.19, 0.16, 0.12], n=7, color=TB_FUR, jitter=0.1, bone=up)
        B.tube([knee, ankle], [0.115, 0.085], n=6, color=TB_DARK, jitter=0.08, bone=lo)
        B.lathe([(0.10, 0.0), (0.13, 0.05), (0.11, 0.15)], n=6, at=(ankle[0], ankle[1] - 0.02, 0), color=TB_HOOF, jitter=0.06, bone=lo)

    rig = R.make_rig('Thornback', bones, col)
    mesh = B.to_object('Thornback_Mesh', col)
    R.bind(mesh, rig)

    # ---- animation
    C = R.Clips(rig)
    THORNS = ('Thorns.Front', 'Thorns.Mid', 'Thorns.Back')

    def stride(p, t, phases, amp, lift, tuck=1.0):
        for tag, ph0 in phases.items():
            ph = (t + ph0) % 1.0
            u = -math.cos(ph * math.tau)
            up = max(0.0, -math.sin(ph * math.tau))
            p.rot(f'Leg.{tag}.Upper', x=amp * u - lift * 0.25 * up)
            p.rot(f'Leg.{tag}.Lower', x=lift * tuck * up)

    def bristle(p, k):
        for i, b in enumerate(THORNS):
            p.size(b, 1 + 0.18 * k)
            p.rot(b, x=14 * k)

    def head_down(p, k):
        p.rot('Neck', x=12 * k)
        p.rot('Head', x=18 * k)

    WALK = {'BL': 0.0, 'FL': 0.25, 'BR': 0.5, 'FR': 0.75}
    GALLOP = {'BL': 0.0, 'BR': 0.08, 'FL': 0.5, 'FR': 0.58}

    def idle(p, t, f):
        p.move('Hips', z=0.008 * wave(t, 2))
        p.rot('Chest', x=1.2 * wave(t, 2, 0.2))
        p.rot('Neck', x=2 * wave(t, 1), z=4 * wave(t, 1, 0.3))
        p.rot('Head', x=3 * wave(t, 2), z=5 * wave(t, 1, 0.45))
        flick = max(0.0, math.sin(t * math.tau * 3)) ** 8
        p.rot('Ear.L', x=-25 * flick)
        p.rot('Ear.R', x=-20 * max(0.0, math.sin((t + 0.4) * math.tau * 2)) ** 8)
        p.rot('Tail', z=12 * wave(t, 2))
        p.rot('Jaw', x=3 + 2 * wave(t, 2))
    C.add('Idle', 72, idle, loop=True)

    def walk(p, t, f):
        stride(p, t, WALK, 16, 30)
        p.move('Hips', z=0.025 * wave(t, 2, 0.25))
        p.rot('Chest', y=2.5 * wave(t, 1))
        p.rot('Neck', x=-2 * wave(t, 2))
        p.rot('Head', x=2 * wave(t, 2, 0.3), z=2 * wave(t, 1))
        p.rot('Tail', z=10 * wave(t, 1, 0.3))
    C.add('Walk', 32, walk, loop=True, note='Wander (about 1 m/s).')

    def run(p, t, f):
        stride(p, t, GALLOP, 28, 55, tuck=1.2)
        p.move('Hips', z=0.06 * wave(t, 1, 0.25))
        p.rot('Hips', x=5 * wave(t, 1))
        p.rot('Chest', x=-4 * wave(t, 1, 0.25))
        p.rot('Neck', x=6 - 4 * wave(t, 1))
        p.rot('Head', x=4)
        p.rot('Tail', x=-25)
    C.add('Run', 18, run, loop=True, note='Chase (about 2.8 m/s).')

    def paw(p, t, f):
        head_down(p, 1)
        bristle(p, 0.85 + 0.15 * wave(t, 2))
        p.move('Hips', z=-0.04)
        p.rot('Chest', x=-3)
        s = wave(t, 2)
        p.rot('Leg.FR.Upper', x=-5 + 22 * s)
        p.rot('Leg.FR.Lower', x=38 * max(0.0, wave(t, 2, 0.25)))
        p.rot('Leg.FL.Upper', x=-6)
        p.rot('Leg.BL.Upper', x=-8)
        p.rot('Leg.BR.Upper', x=-8)
        snort = max(0.0, math.sin(t * math.tau * 2)) ** 6
        p.rot('Jaw', x=8 * snort)
        p.rot('Head', z=4 * wave(t, 1))
        p.rot('Tail', x=-35)
    C.add('Paw', 30, paw, loop=True, note='Pawing before a charge (0.95 s in the game). Pulse the thorn glow here.')

    def charge(p, t, f):
        stride(p, t, GALLOP, 34, 60, tuck=1.3)
        head_down(p, 1.4)
        bristle(p, 1)
        p.move('Hips', z=-0.03 + 0.07 * wave(t, 1, 0.25))
        p.rot('Hips', x=6 * wave(t, 1))
        p.rot('Chest', x=4 - 5 * wave(t, 1, 0.25))
        p.rot('Tail', x=-45)
    C.add('Charge', 12, charge, loop=True, note='Charging (11.5 m/s).')

    def skid(p, t, f):
        k = ease_out(min(1.0, t * 1.6))
        r = ease(max(0.0, (t - 0.6) / 0.4))
        a = k * (1 - 0.5 * r)
        p.move('Hips', z=-0.08 * a)
        p.rot('Chest', x=-8 * a)
        p.rot('Head', x=-10 * a)
        bristle(p, 1 - k)
        for tag in ('FL', 'FR'):
            p.rot(f'Leg.{tag}.Upper', x=-28 * a)
            p.rot(f'Leg.{tag}.Lower', x=10 * a)
        for tag in ('BL', 'BR'):
            p.rot(f'Leg.{tag}.Upper', x=-18 * a)
    C.add('Skid', 15, skid, note='Braking after a charge that hit (0.5 s).')

    def dazed(p, t, f):
        p.rot('Chest', y=6 * wave(t, 1))
        p.rot('Hips', y=-3 * wave(t, 1, 0.1))
        p.move('Hips', z=-0.05)
        p.rot('Neck', x=10)
        p.rot('Head', x=8 + 5 * wave(t, 2), z=14 * wave(t, 1, 0.2))
        p.rot('Jaw', x=10)
        p.rot('Leg.FL.Upper', y=8)
        p.rot('Leg.FR.Upper', y=-8)
        p.rot('Ear.L', x=30)
        p.rot('Ear.R', x=30)
        p.rot('Tail', x=20)
    C.add('Dazed', 40, dazed, loop=True, note='After hitting a tree or rock: takes 1.6x damage. Spawn the circling stars at the Head socket.')

    def gore(p, t, f):
        hx = R.keys(t, [(0, 0), (0.6, 22), (0.72, -38), (1.0, 0)])
        nx = R.keys(t, [(0, 0), (0.6, 16), (0.72, -18), (1.0, 0)])
        cy = R.keys(t, [(0, 0), (0.6, 0.08), (0.72, -0.18), (1.0, 0)])
        fl = R.keys(t, [(0, 0), (0.6, 4), (0.72, -14), (1.0, 0)])
        p.rot('Head', x=hx)
        p.rot('Neck', x=nx)
        p.move('Chest', y=cy)
        p.move('Hips', z=R.keys(t, [(0, 0), (0.6, -0.06), (0.72, 0.03), (1.0, 0)]))
        for tag in ('FL', 'FR'):
            p.rot(f'Leg.{tag}.Upper', x=fl)
        bristle(p, R.keys(t, [(0, 0), (0.6, 1), (1.0, 0)]))
        p.rot('Jaw', x=R.keys(t, [(0, 0), (0.62, 14), (0.8, 4), (1.0, 0)]))
    C.add('Gore', 27, gore, note='Close-range attack: tusk toss lands at about 0.55 s.')

    def hit(p, t, f):
        k = math.sin(min(1.0, t * 1.3) * math.pi) * (1 - 0.3 * t)
        p.move('Chest', y=0.07 * k)
        p.rot('Chest', x=-6 * k, y=4 * k)
        p.rot('Head', x=-12 * k, z=6 * k)
        p.rot('Jaw', x=12 * k)
    C.add('Hit', 8, hit)

    def death(p, t, f):
        k = ease(min(1.0, t * 1.15))
        buckle = ease(min(1.0, t * 2.2))
        p.move('Hips', x=-0.25 * k, z=-0.62 * k)
        p.rot('Hips', y=-78 * k)
        p.rot('Neck', x=18 * k, z=-10 * k)
        p.rot('Head', x=10 * k, y=-12 * k)
        p.rot('Jaw', x=16 * k)
        for tag in ('FL', 'FR', 'BL', 'BR'):
            p.rot(f'Leg.{tag}.Upper', x=(-20 if tag[0] == 'F' else 20) * buckle * (1 - k * 0.6))
            p.rot(f'Leg.{tag}.Lower', x=25 * k)
        bristle(p, -0.3 * k)
        p.rot('Tail', x=30 * k)
    C.add('Death', 36, death, note='Topples onto its side.')

    return Result(
        [rig], rig=rig, clips=C.meta,
        sockets={'Head': dict(bone='Head', at=(0, -0.95, 1.45)), 'Tusks': dict(bone='Head', at=(0, -1.46, 0.95))},
        hits=[dict(bone='Chest', at=(0, 0.10, 1.10), r=0.78), dict(bone='Head', at=(0, -1.05, 0.92), r=0.48)],
        notes='States in types.js -> clips: idle=Idle/Walk, chase=Run, paw=Paw, charge=Charge, skid=Skid, dazed=Dazed, gore=Gore. '
              'While dazed it takes 1.6x damage. Pulse the thorns\' emission during Paw/Charge from code.',
        preview=dict(yaw=-40, pitch=16))


# =====================================================================================================
# Shardling: a floating crystal that keeps its distance and fires homing orbs. (types.js)
# Pivot is the crystal's centre; the game hovers it 2.4 m above the ground.
# =====================================================================================================
SH_CRYS, SH_CRYS2, SH_RING, SH_EYE, SH_SOCKET = 0xc9a2ff, 0xb08ef0, 0xe8d8ff, 0xff7ad8, 0x3a2a5e


@asset('Shardling', 'creature', 'creatures')
def shardling():
    col = core.collection('Shardling')
    B = forms.Builder(seed=33)
    bones = [
        dict(name='Root', head=(0, 0, 0), tail=(0, 0, 0.3)),
        dict(name='Core', head=(0, 0, -0.25), tail=(0, 0, 0.35), parent='Root'),
        dict(name='Eye', head=(0, -0.28, 0.02), tail=(0, -0.48, 0.02), parent='Root'),
        dict(name='Ring.1', head=(0, 0, 0), tail=(0, 0, 0.45), parent='Root'),
        dict(name='Ring.2', head=(0, 0, 0), tail=(0, 0, 0.40), parent='Root'),
        dict(name='Bits', head=(0, 0, 0), tail=(0, 0, 0.25), parent='Root'),
    ]
    B.lathe([(0, -0.66), (0.29, -0.16), (0.33, 0.04), (0.25, 0.30), (0, 0.68)], n=7, color=SH_CRYS, emit=0.5, jitter=0.08, bone='Core')
    for d, h, r in [((0.85, 0.35, 0.5), 0.36, 0.085), ((-0.85, 0.35, 0.45), 0.32, 0.08), ((0.4, 0.75, -0.55), 0.30, 0.075),
                    ((-0.45, 0.7, -0.5), 0.28, 0.07), ((0.0, 0.9, 0.2), 0.34, 0.08)]:
        v = Vector(d).normalized()
        q = Vector((0, 0, 1)).rotation_difference(v).to_euler()
        base = tuple(v * 0.18)
        B.shard(r, h, n=5, at=base, rot=tuple(math.degrees(a) for a in q), color=SH_CRYS2, emit=0.45, jitter=0.08, bone='Core')
    B.torus(0.135, 0.04, n=10, m=4, at=(0, -0.285, 0.02), rot=(90, 0, 0), color=SH_SOCKET, jitter=0.05, bone='Eye')
    B.ball(0.11, n=8, rings=5, at=(0, -0.31, 0.02), color=SH_EYE, emit=1.0, bone='Eye')
    B.box((0.032, 0.02, 0.13), at=(0, -0.418, 0.02), color=0x2a1030, bone='Eye')
    for idx, (R_, r_, studs) in enumerate([(0.72, 0.03, 6), (0.88, 0.026, 4)]):
        name = f'Ring.{idx + 1}'
        B.torus(R_, r_, n=30, m=4, color=SH_RING, emit=0.35, jitter=0.04, bone=name)
        for k in range(studs):
            a = k / studs * math.tau + idx * 0.4
            B.octa(0.05, 0.09, at=(math.cos(a) * R_, math.sin(a) * R_, 0), rot=(0, 0, math.degrees(a)), color=SH_CRYS, emit=0.6, bone=name)
    for k in range(4):
        a = k / 4 * math.tau + 0.3
        B.octa(0.06, 0.11, at=(math.cos(a) * 1.04, math.sin(a) * 1.04, 0.14 * (1 if k % 2 else -1)), color=SH_CRYS, emit=0.6, jitter=0.05, bone='Bits')

    rig = R.make_rig('Shardling', bones, col)
    mesh = B.to_object('Shardling_Mesh', col)
    R.bind(mesh, rig)

    C = R.Clips(rig)

    def rings(p, t, s1, s2, tilt=1.0):
        p.rot('Ring.1', z=s1).rot('Ring.1', x=68 * tilt + 10 * wave(t, 1), y=18 * wave(t, 1, 0.25))
        p.rot('Ring.2', z=s2).rot('Ring.2', x=-58 * tilt + 8 * wave(t, 1, 0.5), y=28 * tilt)

    def idle(p, t, f):
        p.move('Root', z=0.12 * wave(t, 1))
        p.rot('Core', z=360 * t)
        rings(p, t, 720 * t, -360 * t)
        p.rot('Bits', z=720 * t)
        p.move('Bits', z=0.05 * wave(t, 2))
        p.rot('Eye', z=10 * wave(t, 2), x=5 * wave(t, 1))
    C.add('Idle', 90, idle, loop=True, note='Hover and kite. Face the player by turning the whole object.')

    def charge(p, t, f):
        k = ease_in(t)
        p.move('Root', z=0.04 * wave(t, 3))
        p.rot('Core', z=20 * t, y=2.5 * math.sin(f * 3.1) * k)
        rings(p, t, 900 * t * (0.5 + k), -540 * t * (0.5 + k), tilt=1 - 0.3 * k)
        p.size('Eye', 1 + 1.4 * k)
        p.rot('Bits', z=900 * t)
        p.size('Bits', 1 - 0.3 * k)
    C.add('Charge', 24, charge, note='Charging an orb (0.75 s). Fire the orb from the Eye socket at the end.')

    def fire(p, t, f):
        k = math.sin(min(1.0, t * 1.4) * math.pi)
        p.move('Root', y=0.25 * k, z=0.06 * k)
        p.rot('Core', x=-12 * k)
        p.size('Eye', 2.4 - 1.4 * ease_out(t) - 0.25 * k)
        rings(p, t, 120 * t, -80 * t, tilt=1 + 0.25 * k)
        p.size('Bits', 0.7 + 0.3 * ease_out(t) + 0.2 * k)
    C.add('Fire', 10, fire, note='Recoil after firing.')

    def hit(p, t, f):
        k = math.sin(min(1.0, t * 1.3) * math.pi) * (1 - 0.3 * t)
        p.move('Root', x=0.12 * k, z=0.05 * k)
        p.rot('Core', y=18 * k, x=-8 * k)
        p.size('Eye', (1 + 0.2 * k, 1, 1 - 0.5 * k))
        rings(p, t, 60 * t, -40 * t, tilt=1 + 0.3 * k)
    C.add('Hit', 8, hit)

    def death(p, t, f):
        k = ease(min(1.0, t * 1.2))
        fall = ease_in(t)
        p.rot('Core', z=720 * k, x=60 * k)
        p.size('Core', 1 - 0.7 * k)
        p.size('Eye', 1 - 0.8 * k)
        p.rot('Ring.1', x=68 + 40 * k, y=80 * k).move('Ring.1', z=-1.6 * fall, x=0.3 * k)
        p.rot('Ring.2', x=-58 - 50 * k, y=28 - 70 * k).move('Ring.2', z=-1.9 * fall, x=-0.4 * k)
        p.size('Bits', 1 + 1.2 * k)
        p.move('Bits', z=-1.2 * fall)
    C.add('Death', 36, death, note='Rings drop and the core winks out; the game shatters it.')

    return Result(
        [rig], rig=rig, clips=C.meta,
        sockets={'Eye': dict(bone='Eye', at=(0, -0.45, 0.02))},
        hits=[dict(bone='Core', at=(0, 0, 0), r=0.55)],
        notes='Pivot is the crystal centre: place it at ground + 2.4 m. States in types.js -> clips: idle=Idle, kite=Idle, '
              'charge=Charge (then spawn the orb at the Eye socket), Fire after shooting.',
        preview=dict(yaw=-28, pitch=10, ground_z=-2.4, margin=1.15))


# =====================================================================================================
# The Stone Warden: the boss of the First Chain. Its chest is a stone vault; when it slams, its fists
# stick in the ground and the vault doors open on the crystal core. (warden.js)
# =====================================================================================================
WD_ROCK, WD_DARK, WD_FIST, WD_MOSS, WD_VOID = 0xb3afc4, 0x7d7894, 0x9c98b0, 0x7fa876, 0x2a2840
WD_CRYSTAL, WD_GLOW = 0x8fe9ff, 0x8be8ff


@asset('StoneWarden', 'creature', 'creatures')
def stone_warden():
    col = core.collection('StoneWarden')
    B = forms.Builder(seed=7)

    def rock(base, moss=0.0):
        def fn(f):
            if moss and f.normal.z > 0.8 and B.rnd.random() < moss:
                return WD_MOSS
            return core.shade(base, 0.86) if B.rnd.random() < 0.12 else base
        return fn

    bones = [
        dict(name='Root', head=(0, 0, 0), tail=(0, 0, 0.6)),
        dict(name='Hips', head=(0, 0, 2.25), tail=(0, 0, 2.75), parent='Root'),
        dict(name='Torso', head=(0, 0, 2.5), tail=(0, 0, 4.6), parent='Hips'),
        dict(name='Head', head=(0, -0.10, 4.65), tail=(0, -0.10, 5.40), parent='Torso'),
        dict(name='Core', head=(0, -0.62, 3.35), tail=(0, -0.62, 3.80), parent='Torso'),
        dict(name='Plate.L', head=(0.94, -0.98, 2.90), tail=(0.94, -0.98, 4.30), parent='Torso'),
        dict(name='Plate.R', head=(-0.94, -0.98, 2.90), tail=(-0.94, -0.98, 4.30), parent='Torso'),
    ]
    for s, t in ((1, 'L'), (-1, 'R')):
        bones += [
            dict(name=f'Arm.{t}.Upper', head=(s * 1.6, 0, 4.45), tail=(s * 1.6, 0, 3.1), parent='Torso'),
            dict(name=f'Arm.{t}.Lower', head=(s * 1.6, 0, 3.1), tail=(s * 1.6, 0, 2.1), parent=f'Arm.{t}.Upper'),
            dict(name=f'Fist.{t}', head=(s * 1.6, 0, 2.1), tail=(s * 1.6, -0.05, 1.15), parent=f'Arm.{t}.Lower'),
            dict(name=f'Leg.{t}.Upper', head=(s * 0.78, 0, 2.2), tail=(s * 0.78, -0.05, 1.12), parent='Hips'),
            dict(name=f'Leg.{t}.Lower', head=(s * 0.78, -0.05, 1.12), tail=(s * 0.78, -0.03, 0.32), parent=f'Leg.{t}.Upper'),
            dict(name=f'Foot.{t}', head=(s * 0.78, -0.03, 0.32), tail=(s * 0.80, -0.75, 0.15), parent=f'Leg.{t}.Lower'),
        ]

    # ---- torso: a vault with two doors over the core
    B.stone((2.4, 1.1, 2.3), at=(0, 0, 3.6), rough=0.06, color=rock(WD_ROCK), jitter=0.06, bone='Torso')
    B.stone((2.0, 1.3, 0.5), at=(0, 0, 2.38), color=rock(WD_DARK), jitter=0.06, bone='Hips')
    for s in (1, -1):
        B.stone((0.30, 0.50, 1.6), at=(s * 1.08, -0.78, 3.6), color=rock(WD_DARK), jitter=0.06, bone='Torso')
    B.stone((2.5, 0.58, 0.45), at=(0, -0.80, 4.53), color=rock(WD_ROCK), jitter=0.06, bone='Torso')
    B.stone((2.0, 0.46, 0.30), at=(0, -0.76, 2.76), color=rock(WD_DARK), jitter=0.06, bone='Torso')
    B.box((1.75, 0.05, 1.5), at=(0, -0.575, 3.58), color=WD_VOID, bone='Torso')
    B.torus(0.56, 0.03, n=20, m=4, at=(0, -0.60, 3.58), rot=(90, 0, 0), color=WD_GLOW, emit=0.8, bone='Torso')
    for k in range(8):
        a = k / 8 * math.tau
        B.box((0.06, 0.04, 0.14), at=(math.cos(a) * 0.66, -0.60, 3.58 + math.sin(a) * 0.66), rot=(0, -math.degrees(a), 0), color=WD_GLOW, emit=0.8, bone='Torso')
    B.octa(0.36, 0.48, at=(0, -0.62, 3.58), color=WD_GLOW, emit=1.0, bone='Core')
    for s, t in ((1, 'L'), (-1, 'R')):
        B.stone((0.92, 0.16, 1.45), at=(s * 0.48, -0.98, 3.58), rough=0.05, color=rock(WD_ROCK), jitter=0.06, bone=f'Plate.{t}')
        B.box((0.05, 0.03, 0.9), at=(s * 0.30, -1.07, 3.58), color=WD_GLOW, emit=0.7, bone=f'Plate.{t}')
    # back: moss and crystals
    B.stone((1.8, 0.12, 1.2), at=(0, 0.58, 3.9), color=WD_MOSS, jitter=0.08, bone='Torso')
    for x, z, h, r_ in ((0.45, 4.35, 0.55, 0.09), (-0.35, 4.2, 0.45, 0.08), (0.05, 3.7, 0.38, 0.07)):
        B.shard(r_, h, n=6, at=(x, 0.6, z), rot=(-70, x * 30, 0), color=WD_CRYSTAL, emit=0.6, jitter=0.06, bone='Torso')

    # ---- shoulders, head
    for s in (1, -1):
        B.stone((1.05, 1.25, 0.65), at=(s * 1.48, 0, 4.78), color=rock(WD_ROCK), jitter=0.06, bone='Torso')
        B.stone((0.78, 0.9, 0.12), at=(s * 1.42, 0.05, 5.14), rough=0.05, color=WD_MOSS, jitter=0.1, bone='Torso')
        for k in range(3):
            B.shard(0.10 - k * 0.012, 0.62 - k * 0.12, n=6, at=(s * (1.32 + k * 0.17), -0.22 + k * 0.22, 5.05),
                    rot=(-10 + k * 8, s * (24 + k * 10), 0), color=WD_CRYSTAL, emit=0.6, jitter=0.06, bone='Torso')
    B.stone((1.05, 0.95, 0.85), at=(0, -0.12, 4.98), color=rock(WD_ROCK), jitter=0.06, bone='Head')
    B.stone((1.18, 0.30, 0.22), at=(0, -0.58, 5.20), rot=(14, 0, 0), color=rock(WD_DARK), jitter=0.06, bone='Head')
    B.box((0.74, 0.06, 0.09), at=(0, -0.605, 4.99), color=WD_GLOW, emit=1.0, bone='Head')
    B.stone((0.82, 0.62, 0.30), at=(0, -0.34, 4.58), color=rock(WD_DARK), jitter=0.06, bone='Head')
    B.stone((0.84, 0.74, 0.10), at=(0, -0.10, 5.44), rough=0.05, color=WD_MOSS, jitter=0.1, bone='Head')

    # ---- arms and legs
    for s, t in ((1, 'L'), (-1, 'R')):
        B.stone((0.80, 0.80, 1.45), at=(s * 1.6, 0, 3.78), color=rock(WD_ROCK), jitter=0.06, bone=f'Arm.{t}.Upper')
        B.stone((0.62, 0.62, 0.48), at=(s * 1.6, 0, 3.08), color=rock(WD_DARK), jitter=0.06, bone=f'Arm.{t}.Lower')
        B.stone((0.90, 0.92, 1.25), at=(s * 1.6, 0, 2.48), color=rock(WD_DARK), jitter=0.06, bone=f'Arm.{t}.Lower')
        B.box((0.04, 0.42, 0.85), at=(s * 2.06, 0, 2.48), color=WD_GLOW, emit=0.8, bone=f'Arm.{t}.Lower')
        B.stone((1.12, 1.18, 0.95), at=(s * 1.6, -0.05, 1.62), color=rock(WD_FIST), jitter=0.06, bone=f'Fist.{t}')
        for k in range(3):
            B.stone((0.26, 0.24, 0.30), at=(s * 1.6 + (k - 1) * 0.34, -0.62, 1.32), color=rock(WD_DARK), jitter=0.05, bone=f'Fist.{t}')
        B.stone((0.92, 0.96, 1.18), at=(s * 0.78, 0, 1.66), color=rock(WD_DARK), jitter=0.06, bone=f'Leg.{t}.Upper')
        B.stone((0.70, 0.72, 0.45), at=(s * 0.78, -0.08, 1.12), color=rock(WD_ROCK), jitter=0.06, bone=f'Leg.{t}.Lower')
        B.stone((1.0, 1.1, 0.95), at=(s * 0.78, -0.03, 0.66), color=rock(WD_ROCK, moss=0.15), jitter=0.06, bone=f'Leg.{t}.Lower')
        B.stone((1.16, 1.48, 0.38), at=(s * 0.80, -0.18, 0.19), color=rock(WD_DARK), jitter=0.06, bone=f'Foot.{t}')

    rig = R.make_rig('StoneWarden', bones, col)
    mesh = B.to_object('StoneWarden_Mesh', col)
    R.bind(mesh, rig)

    # ---- animation
    C = R.Clips(rig)

    def arms(p, x=0.0, y=0.0, z=0.0, el=0.0, fist=0.0, side=None):
        for s, t in ((1, 'L'), (-1, 'R')):
            if side and t != side:
                continue
            p.rot(f'Arm.{t}.Upper', x=x, y=-s * y, z=s * z)
            p.rot(f'Arm.{t}.Lower', x=el)
            p.rot(f'Fist.{t}', x=fist)

    def legs(p, up=0.0, lo=0.0, foot=0.0):
        for t in ('L', 'R'):
            p.rot(f'Leg.{t}.Upper', x=up)
            p.rot(f'Leg.{t}.Lower', x=lo)
            p.rot(f'Foot.{t}', x=foot)

    def doors(p, k):
        p.rot('Plate.L', z=105 * k)
        p.rot('Plate.R', z=-105 * k)

    def crouch(p, k):
        """Dormant: kneeling, hunched, knuckles on the ground."""
        p.move('Hips', z=-0.95 * k)
        legs(p, -70 * k, 120 * k, -50 * k)
        p.rot('Torso', x=30 * k)
        p.rot('Head', x=28 * k)
        arms(p, x=-38 * k, el=-18 * k, fist=12 * k)

    def slammed(p, k):
        """Fists driven into the ground about 3 m ahead."""
        p.move('Hips', z=-0.5 * k)
        legs(p, -25 * k, 45 * k, -20 * k)
        p.rot('Torso', x=50 * k)
        p.rot('Head', x=-22 * k)
        arms(p, x=-83 * k, y=6 * k, el=4 * k, fist=22 * k)

    def overhead(p, k):
        p.rot('Torso', x=-12 * k)
        p.rot('Head', x=-10 * k)
        arms(p, x=-165 * k, y=14 * k, el=-38 * k, fist=-10 * k)

    def breathe(p, t):
        p.move('Hips', z=0.02 * wave(t, 1))
        p.rot('Torso', x=1.5 * wave(t, 1, 0.1))
        p.rot('Head', z=8 * wave(t, 1, 0.3), x=2 * wave(t, 2))
        arms(p, x=2 * wave(t, 1, 0.2), y=2 + 1.5 * wave(t, 1))
        p.size('Core', 1 + 0.05 * wave(t, 4))

    def dormant(p, t, f):
        crouch(p, 1)
        p.move('Hips', z=0.01 * wave(t, 1))
    C.add('Dormant', 60, dormant, loop=True, note='Asleep in the arena. Keep the eye and core emission dim.')

    def wake(p, t, f):
        k = ease(min(1.0, t / 0.75))
        crouch(p, 1 - k)
        roar = math.sin(max(0.0, min(1.0, (t - 0.35) / 0.45)) * math.pi)
        p.rot('Head', x=-26 * roar)
        p.rot('Torso', x=-10 * roar)
        arms(p, x=-25 * roar, y=40 * roar, el=-30 * roar)
        doors(p, 0.2 * roar)
    C.add('Wake', 84, wake, note='2.8 s: rises; roar peaks around 1.2 s (play the roar sound then). Ramp the eye glow up.')

    def idle(p, t, f):
        breathe(p, t)
    C.add('Idle', 90, idle, loop=True)

    def walk(p, t, f):
        w = wave(t, 1)
        for s, tg in ((1, 'L'), (-1, 'R')):
            ph = (t + (0 if s > 0 else 0.5)) % 1.0
            p.rot(f'Leg.{tg}.Upper', x=-22 * math.cos(ph * math.tau))
            p.rot(f'Leg.{tg}.Lower', x=30 * max(0.0, math.sin(ph * math.tau)))
            p.rot(f'Foot.{tg}', x=-10 * max(0.0, math.sin(ph * math.tau)))
            p.rot(f'Arm.{tg}.Upper', x=16 * math.cos(ph * math.tau), y=-s * 4)
            p.rot(f'Arm.{tg}.Lower', x=-10)
        p.move('Hips', z=-0.12 * abs(math.cos(t * math.tau)))
        p.rot('Torso', z=5 * w, x=3)
        p.rot('Head', z=-3 * w)
        p.size('Core', 1 + 0.04 * wave(t, 2))
    C.add('Walk', 48, walk, loop=True, note='Stomp; shake the camera a little on each footfall (t = 0 and 0.5).')

    def slam_wind(p, t, f):
        overhead(p, ease(t))
    C.add('SlamWindup', 35, slam_wind, note='1.15 s (0.9 s in phase 2: play faster). Ramp the fist glow up.')

    def slam(p, t, f):
        k = ease_in(min(1.0, t / 0.46))
        overhead(p, 1 - k)
        slammed(p, k)
        if t > 0.46:
            jolt = math.sin((t - 0.46) / 0.54 * math.pi) * 0.4
            p.move('Hips', z=-0.06 * jolt)
    C.add('Slam', 11, slam, note='0.35 s; the fists hit at about 0.16 s: spawn the shockwave there.')

    def stuck(p, t, f):
        slammed(p, 1)
        doors(p, 1)
        p.size('Core', 1.3 + 0.08 * wave(t, 4))
        p.rot('Torso', y=1.5 * wave(t, 2))
        arms(p, x=2 * wave(t, 2, 0.25), el=-2 * wave(t, 2))
    C.add('Stuck', 60, stuck, loop=True, note='Fists stuck, doors open: the core is exposed (3.2x damage). The game holds this 2.7 s.')

    def recover(p, t, f):
        k = ease(t)
        slammed(p, 1 - k)
        doors(p, 1 - ease(min(1.0, t * 1.4)))
        p.size('Core', 1.3 - 0.3 * k)
    C.add('Recover', 24, recover, note='0.8 s: pulls free, doors close.')

    def sweep_wind(p, t, f):
        k = ease(t)
        p.rot('Torso', z=-35 * k, x=-5 * k)
        p.rot('Head', z=20 * k)
        arms(p, x=20 * k, y=85 * k, el=-30 * k, side='R')
        arms(p, x=-30 * k, el=-40 * k, side='L')
    C.add('SweepWindup', 26, sweep_wind, note='0.85 s (0.66 s in phase 2).')

    def sweep(p, t, f):
        k = ease_out(min(1.0, t / 0.7))
        tw = -35 + 80 * k
        p.rot('Torso', z=tw, x=-5 + 9 * k)
        p.rot('Head', z=20 - 30 * k)
        p.rot('Arm.R.Upper', x=20 - 20 * k, y=85 - 10 * k)
        p.rot('Arm.R.Upper', z=100 * k)
        p.rot('Arm.R.Lower', x=-30 + 25 * k)
        arms(p, x=-30, el=-40, side='L')
    C.add('Sweep', 15, sweep, note='0.5 s; hits between 0.14 and 0.4 s if the player is in front within 5.6 m.')

    def volley_wind(p, t, f):
        k = ease(t)
        p.rot('Torso', x=-14 * k)
        p.rot('Head', x=-8 * k)
        arms(p, x=-30 * k, y=25 * k, el=-45 * k, fist=-20 * k)
        doors(p, 0.38 * k)
        p.size('Core', 1 + 0.25 * k)
    C.add('VolleyWindup', 29, volley_wind, note='0.95 s; then 5 orbs (7 in phase 2) from the Core socket. Doors part slightly.')

    def summon(p, t, f):
        up = ease(min(1.0, t / 0.4))
        down = ease(max(0.0, (t - 0.75) / 0.25))
        a = up * (1 - down)
        overhead(p, a)
        roar = math.sin(max(0.0, min(1.0, (t - 0.45) / 0.35)) * math.pi)
        p.rot('Head', x=-22 * roar)
        p.rot('Torso', x=-6 * roar, y=2 * math.sin(f * 2.1) * roar)
        doors(p, 0.25 * roar)
    C.add('Summon', 60, summon, note='2 s; roar and spawn the adds at about 1.1 s.')

    def hit(p, t, f):
        k = math.sin(min(1.0, t * 1.3) * math.pi) * (1 - 0.3 * t)
        p.rot('Torso', x=-4 * k, y=3 * k)
        p.rot('Head', x=-8 * k, z=5 * k)
        p.size('Core', 1 + 0.15 * k)
    C.add('Hit', 10, hit, note='Small flinch: the Warden cannot be staggered.')

    def death(p, t, f):
        k = ease(min(1.0, t / 0.7))
        sink = ease_in(max(0.0, (t - 0.55) / 0.45))
        p.move('Hips', z=-1.15 * k - 2.2 * sink)
        legs(p, -60 * k, 105 * k, -45 * k)
        p.rot('Torso', x=58 * k, y=4 * math.sin(f * 1.7) * (1 - k))
        p.rot('Head', x=32 * k, z=-14 * k)
        arms(p, x=-30 * k, y=-6 * k, el=10 * k, fist=30 * k)
        doors(p, 0.4 * k)
        p.size('Core', 1 - 0.5 * k)
    C.add('Death', 84, death, note='2.8 s: collapses forward and sinks; fade the eye and core out, burst rock particles.')

    return Result(
        [rig], rig=rig, clips=C.meta,
        sockets={'Core': dict(bone='Core', at=(0, -1.05, 3.58)), 'Eye': dict(bone='Head', at=(0, -0.62, 4.99)),
                 'Fist.L': dict(bone='Fist.L', at=(1.6, -0.05, 1.15)), 'Fist.R': dict(bone='Fist.R', at=(-1.6, -0.05, 1.15))},
        hits=[dict(bone='Core', at=(0, -0.62, 3.58), r=0.62, mult=3.2, when='doors open (Stuck, and briefly VolleyWindup)'),
              dict(bone='Torso', at=(0, 0, 3.55), r=1.45, mult=0.7),
              dict(bone='Head', at=(0, -0.12, 4.98), r=0.62, mult=1.0),
              dict(bone='Fist.L', at=(1.6, -0.05, 1.62), r=0.62, mult=0.45),
              dict(bone='Fist.R', at=(-1.6, -0.05, 1.62), r=0.62, mult=0.45),
              dict(bone='Hips', at=(0, 0, 1.2), r=0.95, mult=0.55)],
        notes='States in warden.js -> clips: dormant=Dormant, waking=Wake, chase=Walk/Idle, slamWind=SlamWindup, slam=Slam, '
              'stuck=Stuck, recover=Recover, sweepWind=SweepWindup, sweep=Sweep, volleyWind=VolleyWindup, summon=Summon. '
              'Phase 2 (below half health) plays the windups 1.28x faster. Orbiting rocks are the separate WardenRocks model.',
        preview=dict(yaw=-34, pitch=12))


@asset('WardenRocks', 'prop', 'creatures')
def warden_rocks():
    """The seven boulders that orbit the Warden; each is its own child object so code can orbit them."""
    import bpy
    col = core.collection('WardenRocks')
    root = bpy.data.objects.new('WardenRocks', None)
    col.objects.link(root)
    r = core.rng(71)
    for i in range(7):
        a = i / 7 * math.tau
        d = 2.8 + r.random()
        h = 1 + r.random() * 4
        B = forms.Builder(seed=100 + i)
        size = 0.2 + r.random() * 0.22
        B.ico(size, sub=0, displace=lambda co: 0.78 + B.rnd.random() * 0.4, color=WD_DARK, jitter=0.1)
        ob = B.to_object(f'Rock.{i + 1}', col)
        ob.location = (math.cos(a) * d, math.sin(a) * d, h)
        ob.parent = root
    return Result([root], notes='Orbit each child around the Warden (radius 2.8-3.8 m, heights 1-5 m) from code; '
                                'they rise with the Wake clip (web: rocks drift up as it wakes).', preview=dict(yaw=-30, pitch=25))
