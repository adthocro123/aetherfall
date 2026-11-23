"""Low-poly mesh building: every helper adds one closed, flat-shaded part to a shared bmesh,
paints its faces (one colour per face, with optional painterly jitter) and weights it to a bone.

Coordinates are Blender's: Z up, metres. Characters face -Y (that becomes +Z, forward, in Unity),
so a character's left is +X.
"""
import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

from . import core


def mat4(at=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    """Translation @ rotation (XYZ Euler, degrees) @ scale."""
    if isinstance(scale, (int, float)):
        scale = (scale, scale, scale)
    r = Euler(tuple(math.radians(a) for a in rot), 'XYZ').to_matrix().to_4x4()
    return Matrix.Translation(Vector(at)) @ r @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))


class Part:
    """What a helper returns: the verts and faces it made, for further tweaks."""

    def __init__(self, verts, faces):
        self.verts = verts
        self.faces = faces


class Builder:
    """Accumulates parts into one mesh object."""

    def __init__(self, seed=1):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new(core.COLOR_ATTR)
        self.dl = self.bm.verts.layers.deform.verify()
        self.groups = []
        self.rnd = core.rng(seed)

    # ------------------------------------------------------------ bookkeeping
    def group(self, name):
        if name not in self.groups:
            self.groups.append(name)
        return self.groups.index(name)

    def paint(self, faces, color, jitter=0.0, emit=0.0):
        """color: hex, rgb tuple, or a function face -> colour (for gradients and bands)."""
        for f in faces:
            c = color(f) if callable(color) else color
            rgb = core.jitter(core.hex_rgb(c), jitter, self.rnd)
            val = core.linear_rgba(rgb, emit)
            for loop in f.loops:
                loop[self.col] = val

    def weigh(self, verts, bone=None, weights=None):
        """bone: rigid 100% weight. weights: function(co) -> {bone: w} for soft blends at joints."""
        for v in verts:
            if weights:
                ws = weights(v.co)
                tot = sum(ws.values()) or 1.0
                for b, w in ws.items():
                    if w > 1e-4:
                        v[self.dl][self.group(b)] = w / tot
            elif bone:
                v[self.dl][self.group(bone)] = 1.0

    def _finish(self, verts, faces=None, color=0xff00ff, jitter=0.0, emit=0.0, bone=None, weights=None, closed=True, flip=False):
        if faces is None:
            vs = set(verts)
            faces = list({f for v in verts for f in v.link_faces if all(x in vs for x in f.verts)})
        if closed and faces:
            bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        if flip and faces:
            bmesh.ops.reverse_faces(self.bm, faces=faces)
        for f in faces:
            f.smooth = False
            f.normal_update()
        self.paint(faces, color, jitter, emit)
        self.weigh(verts, bone, weights)
        return Part(list(verts), list(faces))

    # ------------------------------------------------------------ primitives
    def box(self, size=(1, 1, 1), at=(0, 0, 0), rot=(0, 0, 0), taper=None, **kw):
        """Axis box centred on `at`. taper=(sx, sy) shrinks the top face (a wedge / frustum)."""
        sx, sy, sz = (size, size, size) if isinstance(size, (int, float)) else size
        pts = []
        for z in (-0.5, 0.5):
            kx, ky = (taper if (taper and z > 0) else (1.0, 1.0))
            for x, y in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):
                pts.append(Vector((x * sx * kx, y * sy * ky, z * sz)))
        m = mat4(at, rot)
        vs = [self.bm.verts.new(m @ p) for p in pts]
        idx = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        faces = [self.bm.faces.new([vs[i] for i in q]) for q in idx]
        return self._finish(vs, faces, **kw)

    def stone(self, size, at=(0, 0, 0), rot=(0, 0, 0), rough=0.07, cuts=1, chip=0.07, **kw):
        """A rough-hewn block: a subdivided box with jittered vertices and pinched corners (the Warden, ruins)."""
        sx, sy, sz = (size, size, size) if isinstance(size, (int, float)) else size
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        bmesh.ops.subdivide_edges(tmp, edges=tmp.edges[:], cuts=cuts, use_grid_fill=True)
        m = mat4(at, rot)
        made = {}
        for v in tmp.verts:
            p = v.co.copy()
            if (abs(p.x) > 0.49) + (abs(p.y) > 0.49) + (abs(p.z) > 0.49) == 3:
                p *= 1.0 - chip
            p += Vector((self.rnd.random() - 0.5, self.rnd.random() - 0.5, self.rnd.random() - 0.5)) * rough
            made[v] = self.bm.verts.new(m @ Vector((p.x * sx, p.y * sy, p.z * sz)))
        faces = [self.bm.faces.new([made[v] for v in f.verts]) for f in tmp.faces]
        tmp.free()
        return self._finish(list(made.values()), faces, **kw)

    def lathe(self, prof, n=6, at=(0, 0, 0), rot=(0, 0, 0), scale=1.0, phase=0.0, caps=True, **kw):
        """Revolve a profile [(radius, z), ...] (bottom to top) around local Z.
        radius may be r, or (rx, ry) for an elliptical ring; radius 0 makes a single pole vertex.
        Covers cylinders, cones, spindles, octahedra (n=4) and faceted spheres."""
        m = mat4(at, rot, scale)
        rings = []
        for r, z in prof:
            rx, ry = (r, r) if isinstance(r, (int, float)) else r
            if rx == 0 and ry == 0:
                rings.append([self.bm.verts.new(m @ Vector((0, 0, z)))])
            else:
                ring = []
                for k in range(n):
                    a = phase + k / n * math.tau
                    ring.append(self.bm.verts.new(m @ Vector((rx * math.cos(a), ry * math.sin(a), z))))
                rings.append(ring)
        faces = []
        for a, b in zip(rings, rings[1:]):
            if len(a) > 1 and len(b) > 1:
                for k in range(n):
                    k2 = (k + 1) % n
                    faces.append(self.bm.faces.new((a[k], a[k2], b[k2], b[k])))
            elif len(a) > 1:
                for k in range(n):
                    faces.append(self.bm.faces.new((a[k], a[(k + 1) % n], b[0])))
            elif len(b) > 1:
                for k in range(n):
                    faces.append(self.bm.faces.new((b[(k + 1) % n], b[k], a[0])))
        if caps:
            if len(rings[0]) > 1:
                faces.append(self.bm.faces.new(list(reversed(rings[0]))))
            if len(rings[-1]) > 1:
                faces.append(self.bm.faces.new(rings[-1]))
        verts = [v for r in rings for v in r]
        return self._finish(verts, faces, **kw)

    def cyl(self, r1, r2, h, n=6, base=True, **kw):
        """Cylinder or frustum along local Z; base=True puts the bottom at z=0."""
        z0 = 0.0 if base else -h / 2
        return self.lathe([(r1, z0), (r2, z0 + h)], n=n, **kw)

    def cone(self, r, h, n=6, base=True, **kw):
        z0 = 0.0 if base else -h / 2
        return self.lathe([(r, z0), (0, z0 + h)], n=n, **kw)

    def ball(self, r, n=8, rings=5, **kw):
        """Faceted sphere (UV sphere with few segments). Use scale=(sx, sy, sz) for ellipsoids."""
        prof = [(0, -r)]
        for i in range(1, rings):
            phi = math.pi * i / rings
            prof.append((r * math.sin(phi), -r * math.cos(phi)))
        prof.append((0, r))
        return self.lathe(prof, n=n, **kw)

    def octa(self, r, h=None, **kw):
        """Octahedron (diamond): four sides, poles on local Z."""
        h = h if h is not None else r
        return self.lathe([(0, -h), (r, 0), (0, h)], n=4, phase=math.pi / 4, **kw)

    def shard(self, r, h, n=6, waist=0.15, top=0.72, **kw):
        """Crystal: short taper at the foot, straight prism, pointed tip. Base at z=0."""
        return self.lathe([(r * 0.7, 0), (r, h * waist), (r * 0.92, h * top), (0, h)], n=n, **kw)

    def ico(self, r, sub=0, at=(0, 0, 0), rot=(0, 0, 0), scale=1.0, displace=None, **kw):
        """Icosphere; displace(co) -> factor lets rocks get lumpy."""
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r, matrix=Matrix())
        verts = res['verts']
        if displace:
            for v in verts:
                v.co = v.co * displace(v.co)
        m = mat4(at, rot, scale)
        for v in verts:
            v.co = m @ v.co
        return self._finish(verts, **kw)

    def torus(self, R, r, n=24, m=6, at=(0, 0, 0), rot=(0, 0, 0), scale=1.0, arc=1.0, **kw):
        """Ring in the local XY plane (around local Z). arc < 1 leaves a gap (open ends are capped)."""
        mm = mat4(at, rot, scale)
        full = arc >= 0.999
        cols = n if full else n + 1
        grid = []
        for i in range(cols):
            a = i / n * math.tau * (1.0 if full else arc)
            c, s = math.cos(a), math.sin(a)
            ring = []
            for j in range(m):
                b = j / m * math.tau
                rr = R + r * math.cos(b)
                ring.append(self.bm.verts.new(mm @ Vector((rr * c, rr * s, r * math.sin(b)))))
            grid.append(ring)
        faces = []
        for i in range(cols if full else cols - 1):
            a, b = grid[i], grid[(i + 1) % cols]
            for j in range(m):
                j2 = (j + 1) % m
                faces.append(self.bm.faces.new((a[j], b[j], b[j2], a[j2])))
        if not full:
            faces.append(self.bm.faces.new(list(reversed(grid[0]))))
            faces.append(self.bm.faces.new(grid[-1]))
        verts = [v for r_ in grid for v in r_]
        return self._finish(verts, faces, **kw)

    def tube(self, pts, radii, n=5, up=(0, 0, 1), phase=0.0, caps=True, **kw):
        """Sweep rings along a polyline (legs, tusks, tails, bodies).
        radii[i]: r, (rx, ry) or (rx, ry_up, ry_down); 0 makes a pointed end.
        Ring frames use parallel transport, starting from the `up` hint."""
        P = [Vector(p) for p in pts]
        cnt = len(P)
        tangents = []
        for i in range(cnt):
            a, b = P[max(0, i - 1)], P[min(cnt - 1, i + 1)]
            t = (b - a)
            tangents.append(t.normalized() if t.length > 1e-9 else Vector((0, 1, 0)))
        u = Vector(up) - Vector(up).dot(tangents[0]) * tangents[0]
        if u.length < 1e-6:
            u = Vector((1, 0, 0)) - Vector((1, 0, 0)).dot(tangents[0]) * tangents[0]
        u.normalize()
        rings = []
        for i in range(cnt):
            t = tangents[i]
            u = (u - u.dot(t) * t)
            u = u.normalized() if u.length > 1e-9 else u
            v = t.cross(u)
            r = radii[i]
            if isinstance(r, (int, float)):
                rx, ru, rd = r, r, r
            elif len(r) == 2:
                rx, ru, rd = r[0], r[1], r[1]
            else:
                rx, ru, rd = r
            if rx == 0 and ru == 0 and rd == 0:
                rings.append([self.bm.verts.new(P[i])])
                continue
            ring = []
            for k in range(n):
                a = phase + k / n * math.tau
                s = math.sin(a)
                ry = ru if s >= 0 else rd
                ring.append(self.bm.verts.new(P[i] + v * (rx * math.cos(a)) + u * (ry * s)))
            rings.append(ring)
        faces = []
        for a, b in zip(rings, rings[1:]):
            if len(a) > 1 and len(b) > 1:
                for k in range(n):
                    k2 = (k + 1) % n
                    faces.append(self.bm.faces.new((a[k], a[k2], b[k2], b[k])))
            elif len(a) > 1:
                for k in range(n):
                    faces.append(self.bm.faces.new((a[k], a[(k + 1) % n], b[0])))
            elif len(b) > 1:
                for k in range(n):
                    faces.append(self.bm.faces.new((b[(k + 1) % n], b[k], a[0])))
        if caps:
            if len(rings[0]) > 1:
                faces.append(self.bm.faces.new(list(reversed(rings[0]))))
            if len(rings[-1]) > 1:
                faces.append(self.bm.faces.new(rings[-1]))
        verts = [v for r_ in rings for v in r_]
        return self._finish(verts, faces, **kw)

    def poly(self, pts, faces_idx, at=(0, 0, 0), rot=(0, 0, 0), scale=1.0, closed=False, **kw):
        """Raw geometry: points and face index lists (for blades, petals, decals)."""
        m = mat4(at, rot, scale)
        vs = [self.bm.verts.new(m @ Vector(p)) for p in pts]
        faces = [self.bm.faces.new([vs[i] for i in f]) for f in faces_idx]
        return self._finish(vs, faces, closed=closed, **kw)

    def extrude_outline(self, outline, depth, at=(0, 0, 0), rot=(0, 0, 0), scale=1.0, **kw):
        """A flat 2D outline [(x, y), ...] (counter-clockwise, convex or simple) extruded along local Z, centred."""
        m = mat4(at, rot, scale)
        n = len(outline)
        lo, hi = [], []
        for x, y in outline:
            lo.append(self.bm.verts.new(m @ Vector((x, y, -depth / 2))))
            hi.append(self.bm.verts.new(m @ Vector((x, y, depth / 2))))
        faces = [self.bm.faces.new(list(reversed(lo))), self.bm.faces.new(hi)]
        for k in range(n):
            k2 = (k + 1) % n
            faces.append(self.bm.faces.new((lo[k], lo[k2], hi[k2], hi[k])))
        return self._finish(lo + hi, faces, **kw)

    def blade(self, profile, thick, at=(0, 0, 0), rot=(0, 0, 0), scale=1.0, **kw):
        """A sword blade with a diamond cross-section. profile: [(y, half_width), ...] from guard to tip along local +Y;
        the edges are sharp (zero thickness) and the spine (x=0) has thickness `thick` (a scalar or per-row list)."""
        m = mat4(at, rot, scale)
        rows = []
        for i, (y, w) in enumerate(profile):
            t = thick[i] if isinstance(thick, (list, tuple)) else thick
            if w <= 0:
                rows.append([self.bm.verts.new(m @ Vector((0, y, 0)))])
            else:
                rows.append([self.bm.verts.new(m @ Vector(p)) for p in ((w, y, 0), (0, y, t / 2), (-w, y, 0), (0, y, -t / 2))])
        faces = []
        for a, b in zip(rows, rows[1:]):
            if len(b) == 1:
                for k in range(4):
                    faces.append(self.bm.faces.new((a[k], a[(k + 1) % 4], b[0])))
            else:
                for k in range(4):
                    k2 = (k + 1) % 4
                    faces.append(self.bm.faces.new((a[k], a[k2], b[k2], b[k])))
        if len(rows[0]) > 1:
            faces.append(self.bm.faces.new(list(reversed(rows[0]))))
        verts = [v for r in rows for v in r]
        return self._finish(verts, faces, **kw)

    # ------------------------------------------------------------ output
    def to_object(self, name, coll, material=None):
        me = bpy.data.meshes.new(name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
        for g in self.groups:
            ob.vertex_groups.new(name=g)
        me.materials.append(material or core.vertex_color_material())
        ca = me.color_attributes.get(core.COLOR_ATTR)
        if ca is not None:
            me.color_attributes.active_color = ca
            try:
                me.color_attributes.default_color_name = ca.name
            except Exception:
                pass
        for p in me.polygons:
            p.use_smooth = False
        return ob


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)
