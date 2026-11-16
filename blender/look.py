"""Material and lighting pass of the mini-factory-cell Blender film (idempotent).

build_scene.py applies it after the import. To iterate on a saved scene without rebuilding:
  blender -b _cad/plan/mini_factory_cell.blend --python blender/look.py -- --save

Materials are matched by the export's names: mfc_material_<id>_<M key> for the shared library (21-materials.js) and
mfc_material_<id>_<module>-<object> for module-local materials. Lights follow the hall: 15 LED high-bays at 6.5 m,
two clear skylight strips (the roof deck is cut open above them, so the sun reaches the floor), cell LED bars.
All objects and nodes created here carry the custom property mfc_look, so a second run replaces them.
"""
import math
import re
import sys

import bpy
from mathutils import Vector

FLOOR = -0.82                       # cell frame = Blender world: z up, origin on the machine-base top
TOP = FLOOR + 7.0                   # hall roof underside (31-hall.js: 7 m clear height)
TAG = 'mfc_look'


def lin(hexv):
    """sRGB hex -> linear RGBA."""
    out = []
    for k in (16, 8, 0):
        c = ((hexv >> k) & 255) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


# ---------------------------------------------------------------- material presets
# key -> Principled inputs (colour as sRGB hex) plus optional 'bump' (noise scale, strength) or 'rough_noise'.
P = {
    # metals
    'ss304Blasted': dict(color=0xb8bbbe, metal=1, rough=0.55, bump=(900, 0.08)),       # bead-blasted 304 bowls: satin, no mirror
    'stainlessBrushed': dict(color=0xc8c6c2, metal=1, rough=0.26, aniso=0.55),
    'hoodSteel': dict(color=0xc8c6c2, metal=1, rough=0.26, aniso=0.55),
    'cabinet': dict(color=0xc8c6c2, metal=1, rough=0.30, aniso=0.45),
    'deck': dict(color=0xc8c6c2, metal=1, rough=0.30, aniso=0.45),
    'ground': dict(color=0x8f9396, metal=1, rough=0.30, aniso=0.35),                  # ground steel base plate
    'aluClear': dict(color=0xc9ccd0, metal=1, rough=0.32),                            # natural anodised profiles
    'aluBlasted': dict(color=0xbfc3c7, metal=1, rough=0.48),
    'alAnodGrey': dict(color=0x8e9297, metal=1, rough=0.40),
    'alAnodBlack': dict(color=0x24262a, metal=0.6, rough=0.45),
    'aluDark': dict(color=0x1c1d1f, metal=0.5, rough=0.42),
    'steel': dict(color=0xd2d6db, metal=1, rough=0.18),
    'chrome': dict(color=0xeceef0, metal=1, rough=0.06),
    'gearboxSilver': dict(color=0xb8bcc0, metal=1, rough=0.32),
    'zinc9006': dict(color=0xa5a8a6, metal=0.85, rough=0.45),
    'galv': dict(color=0xb4b8bb, metal=0.9, rough=0.42, bump=(400, 0.03)),
    'musicWire': dict(color=0xa2a7ac, metal=1, rough=0.22),
    # paints (RAL), powder coat has a soft clear layer
    'ral7035': dict(color=0xc9cdc8, metal=0, rough=0.46, coat=0.15, coat_rough=0.35, bump=(300, 0.015)),
    'ral7016': dict(color=0x383e42, metal=0, rough=0.44, coat=0.12, coat_rough=0.35, bump=(300, 0.015)),
    'ral6011': dict(color=0x5e7b56, metal=0, rough=0.58, bump=(160, 0.06)),          # cast pedestals
    'ral9005': dict(color=0x0f1011, metal=0, rough=0.52, coat=0.1, coat_rough=0.4),
    'ral5015': dict(color=0x2271b3, metal=0, rough=0.45, coat=0.12),
    'ral2004': dict(color=0xe5541a, metal=0, rough=0.45, coat=0.12),
    'ral1023': dict(color=0xf2b705, metal=0, rough=0.48, coat=0.1),
    'ral3020': dict(color=0xc1121c, metal=0, rough=0.45, coat=0.12),
    'estopRed': dict(color=0xc0201a, metal=0, rough=0.35, coat=0.3),
    'estopYellow': dict(color=0xf2c400, metal=0, rough=0.45),
    # plastics and rubber
    'pa66Black': dict(color=0x161616, metal=0, rough=0.50, spec=0.45, coat=0.05, coat_rough=0.5),   # housing
    'paRed': dict(color=0xc4171d, metal=0, rough=0.32, coat=0.25, coat_rough=0.22),                 # plunger cap
    'blackPlastic': dict(color=0x151515, metal=0, rough=0.62),
    'blackRubber': dict(color=0x141414, metal=0, rough=0.86),
    'sealBlack': dict(color=0x111111, metal=0, rough=0.8),
    'puBlack': dict(color=0x1b1c1d, metal=0, rough=0.78),
    'whitePOM': dict(color=0xf2f1ec, metal=0, rough=0.42, spec=0.4),
    'nestPOM': dict(color=0xf2f1ec, metal=0, rough=0.40, spec=0.4),
    'siliconeBlue': dict(color=0x2f7fd0, metal=0, rough=0.55),
    'puBlue': dict(color=0x2a6fd6, metal=0, rough=0.40, coat=0.15),
    'kltBlue': dict(color=0x1f5ea6, metal=0, rough=0.55),
    'motorBlack': dict(color=0x18191b, metal=0.2, rough=0.48),
    't3White': dict(color=0xeef0ef, metal=0, rough=0.38, coat=0.3, coat_rough=0.3),
    't3Grey': dict(color=0xc4c8cc, metal=0, rough=0.42),
    't3Dark': dict(color=0x2e3236, metal=0.1, rough=0.52),
    'duct': dict(color=0x3a3d42, metal=0.05, rough=0.6),
    'carbonGloss': dict(metal=0.15, rough=0.32, coat=0.8, coat_rough=0.15, keep_color=True),
    'carbonMatte': dict(metal=0.1, rough=0.52, keep_color=True),
    'cardboard': dict(metal=0, rough=0.88, keep_color=True),
}
# module-local materials: regex on the name after mfc_material_<id>_ -> preset
LOCAL = [
    (r'^hall-.*floor', dict(color=0x8a8f93, metal=0, rough=0.30, coat=0.35, coat_rough=0.12, rough_noise=(6.0, 0.22, 0.40), keep_map=True)),  # epoxy
    (r'^hall-.*(wall|panel)', dict(metal=0, rough=0.62, keep_color=True, keep_map=True)),
    (r'^hall-.*roof', dict(color=0x3c4044, metal=0.1, rough=0.85)),
    (r'^hall-.*(structure|steel)', dict(color=0x5b6166, metal=0.4, rough=0.55)),
]
# module-local materials classified on their imported Principled values: (prefix, test, preset)
BY_VALUE = [
    ('bowls-', lambda b: b.inputs['Metallic'].default_value >= 0.9, P['ss304Blasted']),          # bowls, tracks, tooling
    ('outfeed-', lambda b: True, P['kltBlue']),                                                  # blue trays
]
GLOW = {r'hall-hall_lamp_leds': 7.0, r'hall-hall_officeGlow': 1.5}                               # emission strength
CLEAR_SHEET = re.compile(r'(pcClear|glass|lid|window|-pc\b)', re.I)


def principled(mat):
    return next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if mat and mat.use_nodes else None


def tagged_node(nodes, kind, name):
    node = nodes.get(name)
    if node is None:
        node = nodes.new(kind); node.name = name
    node[TAG] = True
    return node


def apply_preset(mat, pre):
    b = principled(mat)
    if b is None or pre is None:
        return False
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    if 'color' in pre and not pre.get('keep_color'):
        if not (pre.get('keep_map') and b.inputs['Base Color'].is_linked):
            if b.inputs['Base Color'].is_linked and not pre.get('keep_map'):
                for l in list(b.inputs['Base Color'].links): links.remove(l)
            b.inputs['Base Color'].default_value = lin(pre['color'])
    b.inputs['Metallic'].default_value = pre.get('metal', b.inputs['Metallic'].default_value)
    if not b.inputs['Roughness'].is_linked or 'rough_noise' in pre:
        b.inputs['Roughness'].default_value = pre.get('rough', b.inputs['Roughness'].default_value)
    if 'spec' in pre: b.inputs['Specular IOR Level'].default_value = pre['spec']
    if 'aniso' in pre: b.inputs['Anisotropic'].default_value = pre['aniso']
    if 'coat' in pre:
        b.inputs['Coat Weight'].default_value = pre['coat']
        b.inputs['Coat Roughness'].default_value = pre.get('coat_rough', 0.3)
    if 'bump' in pre:
        scale, strength = pre['bump']
        tex = tagged_node(nodes, 'ShaderNodeTexNoise', 'mfc_bump_noise'); tex.inputs['Scale'].default_value = scale
        tex.inputs['Detail'].default_value = 2.0
        bump = tagged_node(nodes, 'ShaderNodeBump', 'mfc_bump'); bump.inputs['Strength'].default_value = strength
        bump.inputs['Distance'].default_value = 0.0005
        links.new(tex.outputs['Fac'], bump.inputs['Height'])
        if not b.inputs['Normal'].is_linked or b.inputs['Normal'].links[0].from_node == bump:
            links.new(bump.outputs['Normal'], b.inputs['Normal'])
    if 'rough_noise' in pre:
        scale, lo, hi = pre['rough_noise']
        tex = tagged_node(nodes, 'ShaderNodeTexNoise', 'mfc_rough_noise'); tex.inputs['Scale'].default_value = scale
        tex.inputs['Detail'].default_value = 4.0
        ramp = tagged_node(nodes, 'ShaderNodeMapRange', 'mfc_rough_range')
        ramp.inputs['To Min'].default_value = lo; ramp.inputs['To Max'].default_value = hi
        links.new(tex.outputs['Fac'], ramp.inputs['Value']); links.new(ramp.outputs['Result'], b.inputs['Roughness'])
    mat[TAG] = True
    return True


def key_of(name):
    m = re.match(r'mfc_material_\d+_(.*)$', name)
    return m.group(1) if m else name


def materials_pass():
    done, skipped = 0, []
    for mat in bpy.data.materials:
        if not mat.name.startswith('mfc_material_'):
            continue
        key = key_of(mat.name)
        pre = P.get(key)
        if pre is None:
            for rx, p in LOCAL:
                if re.search(rx, key, re.I):
                    pre = p; break
        if pre is None:
            b = principled(mat)
            for prefix, test, p in BY_VALUE:
                if b is not None and key.startswith(prefix) and test(b):
                    pre = p; break
        for rx, strength in GLOW.items():
            b = principled(mat)
            if b is not None and re.search(rx, key):
                b.inputs['Emission Strength'].default_value = strength; mat[TAG] = True
        if pre is not None and apply_preset(mat, pre):
            done += 1
        else:
            skipped.append(key)
    return done, skipped


# ---------------------------------------------------------------- hall skylights and roof
def objects_with_material(pattern):
    rx = re.compile(pattern, re.I)
    return [o for o in bpy.data.objects if o.type == 'MESH' and any(s.material and rx.search(s.material.name) for s in o.material_slots)]


def skylights():
    """Clear skylight sheets: transparent with a faint blue tint and a soft glow when seen from below."""
    n = 0
    for mat in bpy.data.materials:
        if not re.search(r'mfc_material_\d+_hall-.*sky', mat.name, re.I) or mat.get(TAG + '_sky'):
            continue
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        out = next(x for x in nodes if x.type == 'OUTPUT_MATERIAL')
        tr = tagged_node(nodes, 'ShaderNodeBsdfTransparent', 'mfc_sky_clear'); tr.inputs['Color'].default_value = (0.93, 0.96, 1.0, 1)
        em = tagged_node(nodes, 'ShaderNodeEmission', 'mfc_sky_glow'); em.inputs['Color'].default_value = (0.86, 0.92, 1.0, 1)
        em.inputs['Strength'].default_value = 0.6
        add = tagged_node(nodes, 'ShaderNodeAddShader', 'mfc_sky_add')
        links.new(tr.outputs[0], add.inputs[0]); links.new(em.outputs[0], add.inputs[1]); links.new(add.outputs[0], out.inputs['Surface'])
        mat[TAG + '_sky'] = True; n += 1
    # cut the roof deck open over the two strips (y = +-2.55, 1.40 wide, 24 m long), so the sun can pass
    cut = 0
    for obj in objects_with_material(r'hall-.*roof'):
        if obj.get(TAG + '_cut'):
            continue
        for y in (-2.55, 2.55):
            bpy.ops.mesh.primitive_cube_add(size=1, location=(1.0, y, TOP + 0.04))
            cutter = bpy.context.active_object; cutter.scale = (24.2, 1.40, 0.6); cutter.name = f'mfc_roof_cutter_{y:+.2f}'
            mod = obj.modifiers.new(f'mfc_skylight_{y:+.2f}', 'BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.object = cutter; mod.solver = 'EXACT'
            with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
                bpy.ops.object.modifier_apply(modifier=mod.name)
            bpy.data.objects.remove(cutter, do_unlink=True)
        obj[TAG + '_cut'] = True; cut += 1
    return n, cut


# ---------------------------------------------------------------- lights
def clear_look_lights():
    for obj in [o for o in bpy.data.objects if o.get(TAG)]:
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data is not None and data.users == 0 and isinstance(data, bpy.types.Light):
            bpy.data.lights.remove(data)
    # lights from the first-pass build_scene (named LED high-bay n, Skylight fill, Cell softbox)
    for obj in [o for o in bpy.data.objects if o.type == 'LIGHT' and re.match(r'(LED high-bay|Skylight fill|Cell softbox)', o.name)]:
        bpy.data.objects.remove(obj, do_unlink=True)


def add_light(scene, name, kind, loc, energy, kelvin_, aim=None, **kw):
    data = bpy.data.lights.new(name, kind); data.energy = energy; data.color = (1, 1, 1)
    data.use_temperature = True; data.temperature = kelvin_          # Blender 4.5 blackbody light colour
    for k, v in kw.items():
        setattr(data, k, v)
    obj = bpy.data.objects.new(name, data); scene.collection.objects.link(obj); obj.location = loc
    if aim is not None:
        obj.rotation_euler = Vector(aim).normalized().to_track_quat('-Z', 'Y').to_euler()
    obj[TAG] = True
    return obj


def lights(scene, L):
    clear_look_lights()
    hb = L['highbay_k']
    for x in (-9, -4, 1, 6, 11):
        for y in (-4.5, 0, 4.5):
            add_light(scene, f'mfc high-bay {x:+d},{y:+.1f}', 'AREA', (x, y, FLOOR + 6.5 - 0.06), L['highbay'], hb,
                      shape='DISK', size=0.42, spread=math.radians(110))
    cell = 5000
    for x in (-0.45, 0.45):     # 24 V LED bars under the guard roof rails, one each side of the delta portal
        add_light(scene, f'mfc cell bar {x:+.2f}', 'AREA', (x, -0.55, FLOOR + 1.95), L['cellbar'], cell,
                  shape='RECTANGLE', size=0.9, size_y=0.06, spread=math.radians(120))
    el, az = math.radians(L['sun_elevation']), math.radians(L['sun_azimuth'])
    sun_dir = Vector((math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), -math.sin(el)))   # where the light travels
    add_light(scene, 'mfc sun', 'SUN', (0, 0, TOP + 5), L['sun'], 5600, aim=sun_dir, angle=math.radians(1.2))
    return sun_dir


def world(scene, L):
    w = scene.world or bpy.data.worlds.new('mfc world')
    scene.world = w; w.use_nodes = True
    nodes, links = w.node_tree.nodes, w.node_tree.links
    bg = next((n for n in nodes if n.type == 'BACKGROUND'), None) or nodes.new('ShaderNodeBackground')
    out = next(n for n in nodes if n.type == 'OUTPUT_WORLD')
    coord = tagged_node(nodes, 'ShaderNodeTexCoord', 'mfc_sky_coord')
    sep = tagged_node(nodes, 'ShaderNodeSeparateXYZ', 'mfc_sky_sep')
    ramp = tagged_node(nodes, 'ShaderNodeValToRGB', 'mfc_sky_ramp')
    links.new(coord.outputs['Generated'], sep.inputs[0]); links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].position = 0.5; ramp.color_ramp.elements[0].color = (0.62, 0.64, 0.66, 1)   # haze at the horizon
    ramp.color_ramp.elements[1].position = 1.0; ramp.color_ramp.elements[1].color = (0.38, 0.55, 0.85, 1)   # blue zenith
    links.new(ramp.outputs['Color'], bg.inputs['Color']); links.new(bg.outputs[0], out.inputs['Surface'])
    bg.inputs['Strength'].default_value = L['world']


def colour(scene, L):
    vs = scene.view_settings
    vs.view_transform = 'AgX'
    try: vs.look = 'AgX - Medium High Contrast'
    except TypeError: vs.look = 'None'
    vs.exposure = L['exposure']; vs.gamma = 1.0
    if hasattr(vs, 'use_white_balance'):                       # camera white point between the high-bays and daylight
        vs.use_white_balance = True; vs.white_balance_temperature = L['white']; vs.white_balance_tint = 0.0


def render_settings(scene):
    c = scene.cycles
    c.use_denoising = True; c.max_bounces = 6; c.diffuse_bounces = 3; c.glossy_bounces = 4
    c.transmission_bounces = 6; c.transparent_max_bounces = 16; c.caustics_reflective = False; c.caustics_refractive = False
    c.blur_glossy = 0.6; c.sample_clamp_indirect = 8.0; c.use_light_tree = True
    c.use_adaptive_sampling = True; c.adaptive_threshold = 0.02          # the OptiX denoiser takes the rest
    scene.render.use_motion_blur = True; scene.render.motion_blur_shutter = 0.35; scene.render.motion_blur_position = 'CENTER'
    scene.render.use_persistent_data = True


# sun: real sunlight is ~100x the interior; 40 W/m2 against ~10 W/m2 from the high-bays gives bright stripes through the
# skylights without blowing the whole frame. exposure/white: camera exposure (EV) and white point (K).
LEVELS = dict(highbay=420.0, highbay_k=4300, cellbar=55.0, sun=40.0, sun_elevation=63.0, sun_azimuth=18.0, world=0.30,
              exposure=-1.2, white=4700)


def apply_look(scene=None, levels=None):
    scene = scene or bpy.context.scene
    L = {**LEVELS, **(levels or {})}
    done, skipped = materials_pass()
    sky, cut = skylights()
    sun_dir = lights(scene, L)
    world(scene, L); colour(scene, L); render_settings(scene)
    scene[TAG] = str(L)
    report = {'materials': done, 'untouched': sorted(set(skipped)), 'skylightMaterials': sky, 'roofCut': cut,
              'sun': [round(v, 3) for v in sun_dir], 'levels': L}
    print('LOOK_REPORT', report, flush=True)
    return report


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    import json
    levels = json.loads(argv[argv.index('--levels') + 1]) if '--levels' in argv else None
    apply_look(levels=levels)
    if '--save' in argv:
        bpy.ops.wm.save_mainfile()
        print('LOOK_SAVED', bpy.data.filepath, flush=True)
