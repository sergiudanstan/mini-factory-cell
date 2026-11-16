"""Import the browser glTF and the sampled world matrices into Blender 4.5.

blender -b --factory-startup --python blender/build_scene.py -- --input _cad/plan
The glTF supplies geometry/materials; animation.json is authoritative for motion. With a plan export (the default of
tools/export-blender.mjs) Blender frame f is one film frame of one plan segment and the film camera comes from the plan
(same Catmull-Rom path, fov and timing as tools/film.mjs). Segment cuts get isolating keys so motion blur never smears
across a cut. blender/look.py then sets materials, lights, world and colour management.
"""
import argparse
import json
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

CONVERT = Matrix.Rotation(math.pi / 2, 4, 'X')


def arguments():
    p = argparse.ArgumentParser()
    p.add_argument('--input', type=Path, default=Path('_cad/blender'))
    p.add_argument('--out', type=Path)
    return p.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def matrix(values):
    return CONVERT @ Matrix(np.asarray(values).reshape(4, 4).T.tolist()) @ CONVERT.inverted()


def curve(action, path, index, values, interpolation='LINEAR'):
    fc = action.fcurves.new(data_path=path, index=index)
    fc.keyframe_points.add(len(values))
    fc.keyframe_points.foreach_set('co', np.asarray(values, dtype=np.float32).ravel())
    for key in fc.keyframe_points:
        key.interpolation = interpolation
    fc.update()


def bind(owner, action):
    """Blender 4.5 slotted actions: bind the first slot explicitly (assigning an empty action leaves it unset)."""
    if action.slots: owner.animation_data.action_slot = action.slots[0]


def plan_camera(scene, manifest):
    """Film camera keyed per frame from the plan: location, look-at quaternion, lens (vertical fov), focus distance and
    f-stop (plan segment 'blender': {'fstop': N}; none = f/64, practically no depth of field)."""
    tl = manifest['timeline']; rows = manifest['camera']; segs = tl['segments']
    data = bpy.data.cameras.new('Film camera'); data.clip_start = .005; data.clip_end = 150
    data.sensor_fit = 'VERTICAL'; data.sensor_height = 24.0; data.sensor_width = 24.0 * 16 / 9
    data.dof.use_dof = True
    camera = bpy.data.objects.new('Film camera', data); scene.collection.objects.link(camera); scene.camera = camera
    camera.rotation_mode = 'QUATERNION'
    # shot settings: the current plan file wins over the export's copy, so f-stops can change without a re-export
    live = {}
    try:
        for i, ps in enumerate(json.loads(Path(tl['plan']).read_text())['segments'], 1):
            live[i] = ps.get('blender') or {}
    except (OSError, KeyError, ValueError):
        pass
    fstop = {}
    for sg in segs:
        shot = live.get(sg['n'], sg.get('blender') or {})
        for f in range(sg['f0'], sg['f1'] + 1):
            fstop[f] = float(shot.get('fstop', 64))
    loc, quat, lens, focus = [], [], [], []
    prior = None
    for f, r in enumerate(rows, 1):
        pos, target, fov = Vector(r[0:3]), Vector(r[3:6]), r[6]
        q = (target - pos).to_track_quat('-Z', 'Y')
        if prior is not None and q.dot(prior) < 0: q.negate()
        prior = q.copy()
        loc.append((f, pos)); quat.append((f, q)); lens.append((f, 12.0 / math.tan(math.radians(fov) / 2)))
        focus.append((f, max(0.05, (target - pos).length)))
    # isolate every cut: hold the outgoing pose until f - 0.51 and start the incoming one at f - 0.49
    def isolate(rows_):
        out = []
        starts = {sg['f0'] for sg in segs[1:]}
        for i, (f, v) in enumerate(rows_):
            if f in starts and i:
                out.append((f - 0.51, rows_[i - 1][1])); out.append((f - 0.49, v))
            out.append((f, v))
        return out
    loc, quat, lens, focus = isolate(loc), isolate(quat), isolate(lens), isolate(focus)
    camera.animation_data_create(); act = bpy.data.actions.new('Film camera motion'); camera.animation_data.action = act
    for axis in range(3): curve(act, 'location', axis, [(f, v[axis]) for f, v in loc])
    for axis in range(4): curve(act, 'rotation_quaternion', axis, [(f, v[axis]) for f, v in quat])
    bind(camera, act)
    data.animation_data_create(); dact = bpy.data.actions.new('Film camera optics'); data.animation_data.action = dact
    curve(dact, 'lens', 0, lens)
    curve(dact, 'dof.focus_distance', 0, focus)
    curve(dact, 'dof.aperture_fstop', 0, sorted(fstop.items()), 'CONSTANT')
    bind(data, dact)
    for sg in segs:
        marker = scene.timeline_markers.new(f"{sg['n']:02d} {sg['label']}", frame=sg['f0']); marker.camera = camera
    return camera


def camera_pose(camera, pos, target):
    camera.location = CONVERT.to_3x3() @ Vector(pos)
    aim = CONVERT.to_3x3() @ Vector(target)
    camera.rotation_euler = (aim - camera.location).to_track_quat('-Z', 'Y').to_euler()


def setup_lighting(scene):
    scene.world = bpy.data.worlds.new('Factory ambient')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (.65, .72, .82, 1)
    bg.inputs['Strength'].default_value = .22
    for i, (x, y) in enumerate((x, y) for x in (-7, 0, 7) for y in (-4, 3)):
        light = bpy.data.lights.new(f'LED high-bay {i + 1}', 'AREA')
        light.energy = 900
        light.color = (1.0, .91, .80)
        light.shape = 'RECTANGLE'
        light.size = 2.5
        light.size_y = 1.2
        obj = bpy.data.objects.new(light.name, light)
        scene.collection.objects.link(obj)
        obj.location = (x, y, 5.9)
    # Soft daylight through the hall skylights; no light is attached to moving equipment.
    for name, loc, power, size in [('Skylight fill', (1, 0, 5.8), 1400, 5), ('Cell softbox', (0, -2, 3.8), 500, 3)]:
        light = bpy.data.lights.new(name, 'AREA'); light.energy = power; light.size = size
        light.color = (.78, .87, 1)
        obj = bpy.data.objects.new(name, light); scene.collection.objects.link(obj); obj.location = loc
        obj.rotation_euler = (Vector((0, .4, .3)) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def main():
    args = arguments(); root = args.input.resolve()
    manifest = json.loads((root / 'manifest.json').read_text())
    animation = json.loads((root / 'animation.json').read_text())
    if manifest['schema'] != 'mfc-blender-1' or animation['fps'] != 30:
        raise ValueError('Unsupported export schema/rate')
    if len(animation['samples']) != manifest['frames']:
        raise ValueError('Incomplete animation export')
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(root / 'scene.glb'), merge_vertices=False)
    objects = {o.get('mfc_id'): o for o in bpy.data.objects if o.get('mfc_id')}
    missing = [n['id'] for n in manifest['nodes'] if n['id'] not in objects]
    if missing:
        raise ValueError(f'glTF lost node identities: {missing[:8]}')
    maximum = 0.
    for node in manifest['nodes']:
        obj = objects[node['id']]; expected = matrix(node['initial']['matrix'])
        maximum = max(maximum, max(abs(obj.matrix_world[r][c] - expected[r][c]) for r in range(4) for c in range(4)))
        obj.parent = None; obj.matrix_world = expected
        obj.hide_render = not node['initial']['visible']
        obj.rotation_mode = 'QUATERNION'
    if maximum > 1e-4:
        raise ValueError(f'glTF/JSON coordinate mismatch: {maximum}')
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 48; scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 8; scene.cycles.transmission_bounces = 6; scene.cycles.transparent_max_bounces = 12
    scene.render.use_persistent_data = True
    scene.render.resolution_x = 1920; scene.render.resolution_y = 1080; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGB'
    scene.render.fps = 30; scene.frame_start = 1; scene.frame_end = manifest['frames']
    scene.render.use_motion_blur = False  # look.py enables it for the film (shutter 0.35)
    scene['mfc_export_dir'] = str(root)
    scene['mfc_source_commit'] = manifest.get('sourceCommit', '')
    timeline = manifest.get('timeline') or {'mode': 'linear'}
    plan_mode = timeline.get('mode') == 'plan'
    scene['mfc_timeline'] = timeline.get('mode', 'linear')
    if plan_mode:
        scene['mfc_segments'] = json.dumps(timeline['segments'])
    starts = {sg['f0'] for sg in timeline.get('segments', [])[1:]} if plan_mode else set()
    # Each sparse patch is an exact sampled pose. Insert the prior frame before a
    # change following a gap, so interpolation never moves a stationary object early.
    # At a plan cut the old pose holds until f - 0.51 and the new one starts at f - 0.49 (motion blur stays inside a shot).
    tracks = {}
    previous = {n['id']: (1, n['initial']) for n in manifest['nodes']}
    for fi, sample in enumerate(animation['samples'], 1):
        if plan_mode:
            if sample.get('f', fi) != fi: raise ValueError('Plan export frames out of order')
        elif abs(sample['t'] - (fi - 1) / 30) > 1e-7:
            raise ValueError('Non-uniform sample times')
        for state in sample['states']:
            ident = state['id']; last_frame, last = previous[ident]
            if fi == 1:                     # the first sample holds every state (a plan export may not start at sim 0)
                tracks[ident] = [(1, state)]; previous[ident] = (1, state)
                continue
            if state == last:
                continue
            rows = tracks.setdefault(ident, [(1, last)])
            if fi in starts:
                rows.append((fi - 0.51, last)); rows.append((fi - 0.49, state))
            elif fi - last_frame > 1:
                rows.append((fi - 1, last))
            rows.append((fi, state))
            previous[ident] = (fi, state)
    animated = 0
    for ident, rows in tracks.items():
        if len(rows) < 2:                   # static over the export, but possibly not at its t = 0 pose
            obj = objects[ident]; m = matrix(rows[0][1]['matrix'])
            obj.matrix_world = m; obj.hide_render = not rows[0][1]['visible']
            continue
        obj = objects[ident]
        initial_loc, initial_quat, initial_scale = matrix(rows[0][1]['matrix']).decompose()
        obj.location = initial_loc; obj.rotation_quaternion = initial_quat; obj.scale = initial_scale
        obj.animation_data_create()
        action = bpy.data.actions.new(f'{ident}_motion'); obj.animation_data.action = action
        locs, quats, scales, visibility = [], [], [], []
        prior_q = None
        for fi, state in rows:
            loc, quat, scale = matrix(state['matrix']).decompose()
            if prior_q is not None and quat.dot(prior_q) < 0:
                quat.negate()
            prior_q = quat.copy()
            locs.append((fi, loc)); quats.append((fi, quat)); scales.append((fi, scale)); visibility.append((fi, not state['visible']))
        for path, data, dims in [('location', locs, 3), ('rotation_quaternion', quats, 4), ('scale', scales, 3)]:
            for axis in range(dims):
                values = [(f, v[axis]) for f, v in data]
                if any(abs(v - values[0][1]) > 1e-9 for _, v in values[1:]):
                    curve(action, path, axis, values)
        if any(v != visibility[0][1] for _, v in visibility[1:]):
            curve(action, 'hide_render', 0, visibility, 'CONSTANT')
            # Keep nodes evaluated even while invisible: animating hide_viewport can
            # disable their dependency-graph updates during nonsequential seeks.
        # Blender 4.5 creates the legacy slot lazily when the first F-curve is added.
        # Bind it explicitly: assigning an empty action earlier leaves action_slot=None.
        bind(obj, action)
        animated += 1
    # Drive emissive material strength from the exact sampled lamp states.
    for material in manifest['materials']:
        mat = bpy.data.materials.get(material['name'])
        if not mat or not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf:
            continue
        if (any(word in mat.name.lower() for word in ('pcclear', 'glass')) or
                (material.get('opacity', 1) < .5 and material.get('metalness', 0) < .2 and material.get('roughness', 1) < .2)):
            bsdf.inputs['Alpha'].default_value = 1
            # Browser PC can be a single sheet, not a closed dielectric volume.
            # Fresnel-reflected + straight-through rays avoid false slab magnification.
            bsdf.inputs['Transmission Weight'].default_value = 0
            bsdf.inputs['Metallic'].default_value = 1
            bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
            bsdf.inputs['Roughness'].default_value = .045
            nodes, links = mat.node_tree.nodes, mat.node_tree.links
            transparent = nodes.new('ShaderNodeBsdfTransparent')
            transparent.inputs['Color'].default_value = (.98, .99, 1, 1)
            # Two-sided Schlick reflectance: |N dot I| avoids back-face TIR on
            # zero-thickness sheets and on the second face of thin PC strips.
            geometry = nodes.new('ShaderNodeNewGeometry')
            dot = nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
            links.new(geometry.outputs['Normal'], dot.inputs[0]); links.new(geometry.outputs['Incoming'], dot.inputs[1])
            absolute = nodes.new('ShaderNodeMath'); absolute.operation = 'ABSOLUTE'; links.new(dot.outputs['Value'], absolute.inputs[0])
            inverse = nodes.new('ShaderNodeMath'); inverse.operation = 'SUBTRACT'; inverse.inputs[0].default_value = 1; links.new(absolute.outputs[0], inverse.inputs[1])
            power = nodes.new('ShaderNodeMath'); power.operation = 'POWER'; power.inputs[1].default_value = 5; links.new(inverse.outputs[0], power.inputs[0])
            fresnel = nodes.new('ShaderNodeMath'); fresnel.operation = 'MULTIPLY_ADD'; fresnel.inputs[1].default_value = .9613; fresnel.inputs[2].default_value = .0387; links.new(power.outputs[0], fresnel.inputs[0])
            mix = nodes.new('ShaderNodeMixShader')
            links.new(fresnel.outputs[0], mix.inputs[0])
            links.new(transparent.outputs[0], mix.inputs[1]); links.new(bsdf.outputs[0], mix.inputs[2])
            output = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
            links.new(mix.outputs[0], output.inputs['Surface'])
        if material.get('emissive') is not None:
            bsdf.inputs['Emission Color'].default_value = (*material['emissive'], 1)
            bsdf.inputs['Emission Strength'].default_value = material.get('intensity', 0)
        values, colors = [], []
        for fi, sample in enumerate(animation['samples'], 1):
            state = next((s for s in sample['lamps'] if s['id'] == material['id']), None)
            if state:
                values.append((fi, state['intensity']))
                colors.append((fi, state['color']))
        if values and any(v != values[0][1] for _, v in values):
            socket = bsdf.inputs['Emission Strength']
            for fi, value in values:
                socket.default_value = value; socket.keyframe_insert('default_value', frame=fi)
            for fc in mat.node_tree.animation_data.action.fcurves:
                for key in fc.keyframe_points: key.interpolation = 'CONSTANT'
        if colors and any(c != colors[0][1] for _, c in colors):
            socket = bsdf.inputs['Emission Color']
            for fi, color in colors:
                socket.default_value = (*color, 1); socket.keyframe_insert('default_value', frame=fi)
            for fc in mat.node_tree.animation_data.action.fcurves:
                for key in fc.keyframe_points: key.interpolation = 'CONSTANT'
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    if plan_mode:
        plan_camera(scene, manifest)
    else:
        setup_lighting(scene)
        cam_data = bpy.data.cameras.new('Film camera'); cam_data.lens = 38; cam_data.clip_start = .01; cam_data.clip_end = 100
        camera = bpy.data.objects.new('Film camera', cam_data); scene.collection.objects.link(camera); scene.camera = camera
        shots = [(0, 'hall'), (5, 'feederA'), (12, 'delta'), (18, 'press'), (23, 'tray'), (28, 'vision'), (34, 'dial'), (42, 'scara'), (51, 'iso')]
        for t, name in shots:
            if t >= manifest['duration']:
                continue
            view = manifest['views'][name]; camera_pose(camera, view['pos'], view['target'])
            frame = round(t * 30) + 1
            camera.keyframe_insert('location', frame=frame); camera.keyframe_insert('rotation_euler', frame=frame)
            marker = scene.timeline_markers.new(name, frame=frame); marker.camera = camera
        for fc in camera.animation_data.action.fcurves:
            for key in fc.keyframe_points: key.interpolation = 'CONSTANT'
    from look import apply_look
    look_report = apply_look(scene)
    scene.frame_set(1)
    # Install deterministic vertex-cache playback for flexible hoses. render.py
    # reinstalls it on load: Python handlers are deliberately not embedded in .blend.
    from render import install_deformations
    deform_info = install_deformations(scene, animation)
    # Check sampled transforms after Blender has evaluated the actual F-curves.
    checks = sorted(set(min(f, scene.frame_end) for f in (1, 76, 361, 721, 901, scene.frame_end)))
    expected_states = {n['id']: n['initial'] for n in manifest['nodes']}
    roundtrip_error = 0.; worst = None
    for fi, sample in enumerate(animation['samples'], 1):
        for patch in sample['states']: expected_states[patch['id']] = patch
        if fi not in checks: continue
        scene.frame_set(fi); bpy.context.view_layer.update()
        for ident, state in expected_states.items():
            if not state['visible']: continue
            actual = objects[ident].matrix_world; expected = matrix(state['matrix'])
            error = max(abs(actual[r][c] - expected[r][c]) for r in range(4) for c in range(4))
            if error > roundtrip_error: roundtrip_error = error; worst = (fi, ident, list(actual.translation), list(expected.translation))
    if roundtrip_error > 1e-4:
        debug = objects[worst[1]]
        print('ANIMATION_DEBUG', worst, list(debug.location), debug.animation_data.action_slot, [(fc.data_path, fc.array_index, len(fc.keyframe_points), fc.evaluate(worst[0])) for fc in debug.animation_data.action.fcurves], flush=True)
    if roundtrip_error > 1e-4: raise ValueError(f'Animation round-trip mismatch {roundtrip_error}, worst={worst}')
    scene.frame_set(1)
    output = (args.out or root / 'mini_factory_cell.blend').resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    report = {'ok': True, 'timeline': timeline.get('mode', 'linear'), 'look': look_report,
              'objects': len(objects), 'animatedObjects': animated, 'frames': scene.frame_end,
              'matrixImportMaxError': maximum, 'animationMatrixMaxError': roundtrip_error, 'checkedFrames': checks, 'deformations': deform_info, 'blend': str(output)}
    (root / 'build-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('BUILD_REPORT', json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
