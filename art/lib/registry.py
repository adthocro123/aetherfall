"""Asset registry: each asset module decorates its build function with @asset(...)."""

REGISTRY = {}
OUT = ['export']  # set by build.py: assets that write data files put them here


class Result:
    """What a build function returns.
    objects: top-level objects to export (children come along); rig: the armature if animated;
    clips: metadata from rig.Clips; sockets / hits: gameplay attachment points in Blender space;
    preview: hints for the renders (yaw, pitch, strip clips)."""

    def __init__(self, objects, rig=None, clips=None, sockets=None, hits=None, notes='', preview=None, extra=None):
        self.objects = objects
        self.rig = rig
        self.clips = clips or []
        self.sockets = sockets or {}
        self.hits = hits or []
        self.notes = notes
        self.preview = preview or {}
        self.extra = extra or {}


def asset(name, kind, group):
    def deco(fn):
        REGISTRY[name] = dict(name=name, kind=kind, group=group, build=fn)
        return fn
    return deco
