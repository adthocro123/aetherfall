"""Pell, the cartographer (src/game/npc.js), rebuilt with a Unity-Humanoid skeleton.

The rest pose is a T-pose and the bones use Unity's HumanBodyBones names, so Unity's avatar
auto-mapping picks them up and any humanoid animation (Mixamo, Asset Store) can be retargeted onto her.
"""
import math

from lib import core, forms
from lib import rig as R
from lib.registry import Result, asset
from lib.rig import wave

P_COAT, P_COAT_DARK, P_SKIN, P_HAT, P_BAND, P_SCARF = 0x2f7f86, 0x24646a, 0xe0b494, 0xc9a15e, 0x8a3a32, 0xd2553f
P_LEATHER, P_LEATHER_DARK, P_BOOT, P_BRASS, P_EYE = 0x6a4a34, 0x543a2a, 0x3a2a24, 0xe0b45a, 0x2a2030
P_HAIR, P_PAPER, P_TROUSER, P_LIPS, P_FEATHER = 0x5a3a2a, 0xefe2c4, 0x4a3c38, 0x9a5a4a, 0xf2e6cc


@asset('Pell', 'humanoid', 'characters')
def pell():
    col = core.collection('Pell')
    B = forms.Builder(seed=5)

    # ---- skeleton (T-pose, facing -Y, her left is +X)
    J = dict(hips=(0, 0, 0.96), spine=(0, 0, 1.08), chest=(0, 0, 1.24), neck=(0, 0, 1.47), head=(0, 0, 1.55), top=(0, 0, 1.86))
    bones = [
        dict(name='Hips', head=J['hips'], tail=J['spine']),
        dict(name='Spine', head=J['spine'], tail=J['chest'], parent='Hips'),
        dict(name='Chest', head=J['chest'], tail=J['neck'], parent='Spine'),
        dict(name='Neck', head=J['neck'], tail=J['head'], parent='Chest'),
        dict(name='Head', head=J['head'], tail=J['top'], parent='Neck'),
    ]
    segs = {b['name']: (b['head'], b['tail']) for b in bones}
    for s, P in ((1, 'Left'), (-1, 'Right')):
        pts = dict(sh=(s * 0.05, 0, 1.41), ua=(s * 0.17, 0, 1.42), el=(s * 0.44, 0, 1.42), wr=(s * 0.68, 0, 1.42), he=(s * 0.79, 0, 1.42),
                   hip=(s * 0.10, 0, 0.92), kn=(s * 0.10, 0, 0.51), an=(s * 0.10, 0.01, 0.09), to=(s * 0.10, -0.11, 0.025), te=(s * 0.10, -0.17, 0.025))
        side = [
            dict(name=f'{P}Shoulder', head=pts['sh'], tail=pts['ua'], parent='Chest'),
            dict(name=f'{P}UpperArm', head=pts['ua'], tail=pts['el'], parent=f'{P}Shoulder'),
            dict(name=f'{P}LowerArm', head=pts['el'], tail=pts['wr'], parent=f'{P}UpperArm'),
            dict(name=f'{P}Hand', head=pts['wr'], tail=pts['he'], parent=f'{P}LowerArm'),
            dict(name=f'{P}UpperLeg', head=pts['hip'], tail=pts['kn'], parent='Hips'),
            dict(name=f'{P}LowerLeg', head=pts['kn'], tail=pts['an'], parent=f'{P}UpperLeg'),
            dict(name=f'{P}Foot', head=pts['an'], tail=pts['to'], parent=f'{P}LowerLeg'),
            dict(name=f'{P}Toes', head=pts['to'], tail=pts['te'], parent=f'{P}Foot'),
        ]
        bones += side
        segs.update({b['name']: (b['head'], b['tail']) for b in side})

    def W(*names, power=4.0):
        return R.seg_weights({n: segs[n] for n in names}, power=power)

    FRONT = (0, -1, 0)

    # ---- torso and coat
    B.tube([(0, 0.005, 0.93), (0, 0, 1.05), (0, 0, 1.20), (0, 0, 1.33), (0, 0, 1.42), (0, 0, 1.48)],
           [(0.17, 0.12, 0.12), (0.16, 0.115, 0.11), (0.175, 0.125, 0.11), (0.19, 0.13, 0.11), (0.17, 0.11, 0.10), (0.08, 0.06, 0.06)],
           n=10, up=FRONT, color=P_COAT, jitter=0.06, weights=W('Hips', 'Spine', 'Chest', 'Neck', 'LeftShoulder', 'RightShoulder'))
    for sx in (1, -1):
        B.box((0.07, 0.02, 0.24), at=(sx * 0.05, -0.126, 1.31), rot=(0, sx * 20, 0), color=P_COAT_DARK, jitter=0.04, weights=W('Spine', 'Chest'))
    for k in range(3):
        B.cyl(0.013, 0.013, 0.012, n=6, at=(0, -0.13, 1.08 + k * 0.08), rot=(90, 0, 0), color=P_BRASS, emit=0.1, weights=W('Hips', 'Spine', 'Chest'))
    B.lathe([((0.178, 0.127), 0.975), ((0.178, 0.127), 1.025)], n=12, caps=False, color=P_LEATHER, jitter=0.05, weights=W('Hips', 'Spine'))
    B.box((0.05, 0.015, 0.045), at=(0, -0.131, 1.0), color=P_BRASS, emit=0.1, bone='Hips')

    def skirt(co):
        drop = max(0.0, min(1.0, (1.0 - co.z) / 0.5)) * 0.75
        left = max(0.0, min(1.0, (co.x + 0.08) / 0.16))
        return {'Hips': 1 - drop + 1e-4, 'LeftUpperLeg': drop * left + 1e-4, 'RightUpperLeg': drop * (1 - left) + 1e-4}
    prof = [((0.18, 0.128), 1.0), ((0.21, 0.16), 0.80), ((0.245, 0.19), 0.57), ((0.255, 0.20), 0.50)]
    B.lathe(prof, n=12, caps=False, color=P_COAT, jitter=0.06, weights=skirt, closed=False, flip=True)
    B.lathe([((a[0] * 0.97, a[1] * 0.97), z) for a, z in prof], n=12, caps=False, color=P_COAT_DARK, weights=skirt, closed=False)
    B.lathe([((0.258, 0.203), 0.50), ((0.252, 0.198), 0.545)], n=12, caps=False, color=P_COAT_DARK, weights=skirt, closed=False, flip=True)

    # ---- arms
    for s, P in ((1, 'Left'), (-1, 'Right')):
        arm = W(f'{P}Shoulder', f'{P}UpperArm', f'{P}LowerArm', 'Chest')
        B.ball(0.085, n=8, rings=5, at=(s * 0.17, 0, 1.42), color=P_COAT, jitter=0.05, weights=W(f'{P}Shoulder', f'{P}UpperArm', 'Chest'))
        B.tube([(s * 0.17, 0, 1.42), (s * 0.30, 0, 1.42), (s * 0.44, 0, 1.42)], [0.066, 0.06, 0.053], n=7, color=P_COAT, jitter=0.05, weights=arm)
        B.tube([(s * 0.44, 0, 1.42), (s * 0.60, 0, 1.42)], [0.053, 0.047], n=7, color=P_COAT, jitter=0.05, weights=W(f'{P}UpperArm', f'{P}LowerArm'))
        B.tube([(s * 0.585, 0, 1.42), (s * 0.65, 0, 1.42)], [0.057, 0.057], n=7, color=P_COAT_DARK, bone=f'{P}LowerArm')
        B.ball(0.046, n=6, rings=4, at=(s * 0.712, 0, 1.418), scale=(1.35, 0.85, 0.6), color=P_SKIN, jitter=0.04, bone=f'{P}Hand')
        B.tube([(s * 0.675, -0.03, 1.42), (s * 0.705, -0.06, 1.425)], [0.016, 0.011], n=5, color=P_SKIN, bone=f'{P}Hand')

    # ---- legs and boots
    for s, P in ((1, 'Left'), (-1, 'Right')):
        B.tube([(s * 0.10, 0, 0.95), (s * 0.10, 0, 0.72), (s * 0.10, 0, 0.52)], [0.09, 0.08, 0.064], n=7, color=P_TROUSER, jitter=0.05,
               weights=W(f'{P}UpperLeg', f'{P}LowerLeg', 'Hips'))
        B.tube([(s * 0.10, 0, 0.52), (s * 0.10, 0.005, 0.36)], [0.062, 0.056], n=7, color=P_TROUSER, jitter=0.05, weights=W(f'{P}UpperLeg', f'{P}LowerLeg'))
        B.tube([(s * 0.10, 0.008, 0.40), (s * 0.10, 0.01, 0.10)], [0.074, 0.064], n=7, color=P_BOOT, jitter=0.05, bone=f'{P}LowerLeg')
        B.box((0.112, 0.20, 0.09), at=(s * 0.10, -0.035, 0.055), taper=(0.92, 0.75), color=P_BOOT, jitter=0.05, bone=f'{P}Foot')
        B.box((0.104, 0.075, 0.07), at=(s * 0.10, -0.15, 0.037), taper=(0.9, 0.7), color=P_BOOT, jitter=0.05, bone=f'{P}Toes')
        B.box((0.118, 0.29, 0.024), at=(s * 0.10, -0.06, 0.012), color=0x221816, bone=f'{P}Foot')

    # ---- neck, scarf, head
    B.cyl(0.055, 0.05, 0.12, n=8, at=(0, 0, 1.43), color=P_SKIN, weights=W('Neck', 'Head', 'Chest'))
    B.torus(0.088, 0.043, n=12, m=5, at=(0, -0.004, 1.49), color=P_SCARF, jitter=0.08, weights=W('Neck', 'Chest'))
    B.tube([(-0.05, -0.10, 1.47), (-0.075, -0.135, 1.36), (-0.06, -0.14, 1.24)], [(0.045, 0.016), (0.046, 0.014), (0.04, 0.012)],
           n=6, up=FRONT, color=P_SCARF, jitter=0.08, bone='Chest')

    head = dict(bone='Head')
    B.ball(0.135, n=10, rings=7, at=(0, 0, 1.665), scale=(1.0, 1.04, 1.12), color=P_SKIN, jitter=0.03, **head)
    B.ball(0.09, n=8, rings=5, at=(0, -0.045, 1.585), scale=(1.1, 1.0, 0.8), color=P_SKIN, jitter=0.03, **head)
    B.cone(0.026, 0.055, n=5, at=(0, -0.128, 1.655), rot=(95, 0, 0), color=core.shade(P_SKIN, 0.93), **head)
    for sx in (1, -1):
        B.ball(0.021, n=6, rings=4, at=(sx * 0.05, -0.126, 1.692), color=P_EYE, **head)
        B.box((0.055, 0.016, 0.013), at=(sx * 0.052, -0.133, 1.728), rot=(0, sx * -12, 0), color=P_HAIR, **head)
        B.ball(0.03, n=6, rings=4, at=(sx * 0.138, 0.0, 1.66), scale=(0.5, 1.0, 1.3), color=P_SKIN, **head)
    B.box((0.048, 0.012, 0.01), at=(0, -0.137, 1.608), color=P_LIPS, **head)
    B.ball(0.149, n=10, rings=7, at=(0, 0.03, 1.69), scale=(1.04, 0.95, 0.92), color=P_HAIR, jitter=0.06, **head)
    B.box((0.22, 0.05, 0.05), at=(0, -0.105, 1.765), taper=(0.9, 0.6), color=P_HAIR, jitter=0.06, **head)
    B.tube([(0, 0.12, 1.63), (0, 0.17, 1.52), (0, 0.165, 1.40)], [0.042, 0.036, 0.024], n=6, color=P_HAIR, jitter=0.08,
           weights=W('Head', 'Neck', 'Chest'))

    # ---- hat (tipped back a little)
    hat = dict(rot=(-7, 0, 0), bone='Head')
    B.cyl(0.31, 0.30, 0.022, n=14, at=(0, 0.012, 1.786), color=P_HAT, jitter=0.05, **hat)
    B.lathe([(0.145, 1.795), (0.137, 1.90), (0.122, 1.958), (0, 1.972)], n=12, color=P_HAT, jitter=0.05, **hat)
    B.lathe([(0.149, 1.80), (0.144, 1.848)], n=12, caps=False, color=P_BAND, jitter=0.04, **hat)
    B.tube([(0.125, -0.01, 1.83), (0.175, 0.03, 1.95), (0.19, 0.09, 2.04)], [(0.012, 0.03), (0.01, 0.042), 0], n=5,
           up=FRONT, color=P_FEATHER, jitter=0.05, bone='Head')

    # ---- satchel with map rolls (her left hip), strap, spyglass (right hip)
    B.box((0.09, 0.24, 0.19), at=(0.235, 0.0, 0.98), color=P_LEATHER, jitter=0.06, bone='Hips')
    B.box((0.095, 0.245, 0.085), at=(0.24, 0.0, 1.06), rot=(0, 8, 0), color=P_LEATHER_DARK, jitter=0.05, bone='Hips')
    for k in range(3):
        B.cyl(0.027, 0.027, 0.33, n=6, at=(0.25 - k * 0.01, -0.06 + k * 0.055, 0.98), rot=(12 - k * 9, 14 + k * 6, 0), color=P_PAPER, jitter=0.05, bone='Hips')
    strap = W('Chest', 'Spine', 'Hips')
    B.tube([(-0.15, -0.123, 1.43), (0.04, -0.137, 1.22), (0.205, -0.10, 1.04)], [(0.022, 0.007)] * 3, n=4, up=(0, 0, 1), color=P_LEATHER, weights=strap)
    B.tube([(-0.15, 0.113, 1.43), (0.04, 0.122, 1.22), (0.215, 0.09, 1.04)], [(0.022, 0.007)] * 3, n=4, up=(0, 0, 1), color=P_LEATHER, weights=strap)
    B.tube([(-0.205, -0.045, 1.07), (-0.235, -0.035, 0.86)], [0.03, 0.024], n=7, color=P_BRASS, jitter=0.05, emit=0.08, bone='Hips')
    B.tube([(-0.237, -0.034, 0.865), (-0.24, -0.033, 0.845)], [0.029, 0.029], n=7, color=0x3a3020, bone='Hips')

    rig = R.make_rig('Pell', bones, col)
    mesh = B.to_object('Pell_Mesh', col)
    R.bind(mesh, rig)

    # ---- animation (every clip lowers the arms from the T-pose)
    C = R.Clips(rig)

    def arms_down(p, left=True, right=True):
        if left:
            p.rot('LeftShoulder', y=4).rot('LeftUpperArm', y=74).rot('LeftLowerArm', z=-10)
        if right:
            p.rot('RightShoulder', y=-4).rot('RightUpperArm', y=-74).rot('RightLowerArm', z=10)

    def breathe(p, t, cycles=1):
        p.rot('Chest', x=-1.3 * wave(t, cycles * 2, 0.2))
        p.move('Hips', z=0.003 * wave(t, cycles * 2))

    def idle(p, t, f):
        arms_down(p)
        breathe(p, t)
        p.move('Hips', x=0.012 * wave(t, 1))
        p.rot('Hips', y=1.2 * wave(t, 1))
        p.rot('Spine', y=-1.0 * wave(t, 1))
        p.rot('Head', z=9 * wave(t, 1, 0.3), x=3 * wave(t, 2))
        p.rot('LeftUpperArm', z=-3 * wave(t, 1, 0.1))
        p.rot('RightUpperArm', z=3 * wave(t, 1, 0.6))
    C.add('Idle', 90, idle, loop=True, note='At the camp, turning to face the player (rotate the object).')

    def talk(p, t, f):
        arms_down(p, right=False)
        p.rot('LeftUpperArm', z=-22, y=-8).rot('LeftLowerArm', z=-62)
        g = 0.5 + 0.5 * wave(t, 2)
        p.rot('RightShoulder', y=-4).rot('RightUpperArm', y=-60 + 10 * g, z=28 + 6 * wave(t, 1))
        p.rot('RightLowerArm', z=58 + 24 * g)
        p.rot('RightHand', x=-25 * g)
        breathe(p, t)
        p.rot('Chest', z=4 * wave(t, 1))
        p.rot('Head', x=4 * wave(t, 3), z=6 * wave(t, 1, 0.2))
    C.add('Talk', 72, talk, loop=True, note='Loop while her dialogue panel is open.')

    def wave_hi(p, t, f):
        arms_down(p, right=False)
        p.rot('RightShoulder', y=8).rot('RightUpperArm', y=28, z=22)
        p.rot('RightLowerArm', y=58 + 24 * wave(t, 2))
        p.rot('RightHand', z=10 * wave(t, 2, 0.2))
        p.rot('Chest', y=-3, z=-4)
        p.rot('Head', x=-4, z=-6)
        breathe(p, t)
    C.add('Wave', 40, wave_hi, loop=True, note='The gesture when a quest starts (npc.js gesture).')

    return Result(
        [rig], rig=rig, clips=C.meta,
        sockets={'Head': dict(bone='Head', at=(0, -0.05, 2.15))},
        notes='Unity: import with Rig > Animation Type = Humanoid; the T-pose and bone names auto-map. '
              'Her clips convert to muscle space, and stock humanoid clips retarget onto her.',
        preview=dict(yaw=-24, pitch=6))
