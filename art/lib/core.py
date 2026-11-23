"""Scene, colour and material basics shared by every Aetherfall asset script.

Colour convention (matches the web game and the Unity shader described in docs/unity-port.md):
every face carries one RGBA vertex colour in the corner attribute "Col".
  RGB = the face's colour (stored linear in Blender, exported to FBX as sRGB)
  A   = emission factor, 0 for ordinary surfaces, up to 1 for things that glow (crystals, eyes, cores)
"""
import bpy
import colorsys
import math
import random

COLOR_ATTR = 'Col'
MATERIAL = 'AF_VertexColor'


def reset_scene(fps=30):
    """Start from an empty file. Each asset is built and exported in a clean scene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = fps
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    return sc


def collection(name):
    sc = bpy.context.scene
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in sc.collection.children:
        sc.collection.children.link(col)
    return col


# ---------------------------------------------------------------- colour

def hex_rgb(h):
    """0xRRGGBB -> (r, g, b) sRGB floats."""
    if isinstance(h, (tuple, list)):
        return tuple(h[:3])
    return ((h >> 16) & 255) / 255.0, ((h >> 8) & 255) / 255.0, (h & 255) / 255.0


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def jitter(rgb, amount, rnd):
    """Per-face painterly variation, like prep() in src/world/props.js: a small hue shift and a lightness shift."""
    if amount <= 0:
        return rgb
    h, l, s = colorsys.rgb_to_hls(*rgb)
    h = (h + (rnd.random() - 0.5) * amount * 0.08) % 1.0
    l = clamp(l + (rnd.random() - 0.5) * amount)
    return colorsys.hls_to_rgb(h, l, s)


def mix(a, b, t):
    a, b = hex_rgb(a), hex_rgb(b)
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def shade(c, k):
    """Multiply an sRGB colour's lightness (k < 1 darker, > 1 lighter)."""
    h, l, s = colorsys.rgb_to_hls(*hex_rgb(c))
    return colorsys.hls_to_rgb(h, clamp(l * k), s)


def linear_rgba(rgb, emit=0.0):
    r, g, b = hex_rgb(rgb)
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), float(emit))


# ---------------------------------------------------------------- material

def vertex_color_material():
    """One shared material. Base colour and emission both come from the vertex colour; alpha drives emission.
    Unity remaps this name to the project's vertex-colour shader (see docs/unity-port.md)."""
    m = bpy.data.materials.get(MATERIAL)
    if m:
        return m
    m = bpy.data.materials.new(MATERIAL)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = COLOR_ATTR
    attr.location = (-500, 200)
    gain = nt.nodes.new('ShaderNodeMath')
    gain.operation = 'MULTIPLY'
    gain.inputs[1].default_value = 1.4
    gain.location = (-300, -100)
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Emission Color'])
    nt.links.new(attr.outputs['Alpha'], gain.inputs[0])
    nt.links.new(gain.outputs[0], bsdf.inputs['Emission Strength'])
    bsdf.inputs['Roughness'].default_value = 0.85
    for key in ('Specular IOR Level', 'Specular'):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = 0.15
            break
    m.diffuse_color = (0.8, 0.8, 0.8, 1.0)
    return m


def rng(seed):
    return random.Random(seed)


TAU = math.tau
