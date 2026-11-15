"""Render only requested stills by default; an animation requires --animation explicitly.

blender -b _cad/blender/mini_factory_cell.blend --python blender/render.py -- --frames 76 361 901
"""
import argparse
import bisect
import json
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector


def install_deformations(scene, animation=None):
    root = Path(scene['mfc_export_dir'])
    if animation is None:
        animation = json.loads((root / 'animation.json').read_text())
    records = {}
    objects = {o.get('mfc_id'): o for o in bpy.data.objects if o.get('mfc_id')}
    for fi, sample in enumerate(animation['samples'], 1):
        for patch in sample.get('deform', []):
            records.setdefault(patch['id'], []).append((fi, patch))
    for ident in records:
        obj = objects[ident]
        if obj.type != 'MESH': raise ValueError(f'Geometry patch on non-mesh {ident}')
        count = len(obj.data.vertices)
        initial = np.empty(count * 3, dtype=np.float32); obj.data.vertices.foreach_get('co', initial)
        initial_normals = np.empty(count * 3, dtype=np.float32); obj.data.vertices.foreach_get('normal', initial_normals)
        records[ident].insert(0, (0, {'blender_positions': initial, 'blender_normals': initial_normals.reshape(-1, 3)}))
        for _, patch in records[ident][1:]:
            positions = np.asarray(patch['positions'], dtype=np.float32).reshape(-1, 3)
            if len(positions) != count:
                raise ValueError(f'glTF changed vertex order/count for {ident}: {count} != {len(positions)}')
            patch['blender_positions'] = positions[:, [0, 2, 1]].copy()
            patch['blender_positions'][:, 1] *= -1
            patch['blender_normals'] = np.asarray(patch['normals'], dtype=np.float32).reshape(-1, 3)[:, [0, 2, 1]].copy()
            patch['blender_normals'][:, 1] *= -1
        if obj.data.users > 1: obj.data = obj.data.copy()
    times = {ident: [fi for fi, _ in rows] for ident, rows in records.items()}

    def apply(frame_scene, *_):
        for ident, rows in records.items():
            i = bisect.bisect_right(times[ident], frame_scene.frame_current) - 1
            patch = rows[max(0, i)][1]; obj = objects[ident]
            obj.data.vertices.foreach_set('co', patch['blender_positions'].ravel())
            obj.data.update()
            obj.data.normals_split_custom_set_from_vertices(patch['blender_normals'])
    apply._mfc = True
    for handler in list(bpy.app.handlers.frame_change_pre):
        if getattr(handler, '_mfc', False): bpy.app.handlers.frame_change_pre.remove(handler)
    bpy.app.handlers.frame_change_pre.append(apply)
    apply(scene)
    return {'objects': len(records), 'samples': sum(len(v) - 1 for v in records.values())}


def devices(scene):
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
        for device in prefs.devices: device.use = device.type == 'OPTIX'
        if any(d.use for d in prefs.devices):
            scene.cycles.device = 'GPU'; scene.cycles.denoiser = 'OPTIX'
        else: scene.cycles.device = 'CPU'
        print('RENDER_DEVICES', [(d.name, d.type, d.use) for d in prefs.devices], flush=True)
    except Exception as exc:
        scene.cycles.device = 'CPU'; print('CPU fallback:', exc, flush=True)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--frames', nargs='+', type=int)
    p.add_argument('--view', help='fixed named browser view, useful for previews')
    p.add_argument('--out', type=Path)
    p.add_argument('--animation', action='store_true', help='explicit opt-in to long full-quality render')
    p.add_argument('--start', type=int, default=1); p.add_argument('--end', type=int)
    p.add_argument('--samples', type=int)
    args = p.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    scene = bpy.context.scene; root = Path(scene['mfc_export_dir'])
    manifest = json.loads((root / 'manifest.json').read_text())
    install_deformations(scene); devices(scene)
    scene.render.resolution_percentage = 100 if args.animation else 50
    scene.cycles.samples = args.samples or (48 if args.animation else 24)
    out = args.out or root / ('frames' if args.animation else 'previews'); out.mkdir(parents=True, exist_ok=True)
    frames = list(range(args.start, (args.end or scene.frame_end) + 1)) if args.animation else (args.frames or [min(76, scene.frame_end), min(361, scene.frame_end), min(901, scene.frame_end)])
    if any(f < 1 or f > scene.frame_end for f in frames): raise ValueError('Frame outside exported range')
    if args.view:
        if args.view not in manifest['views']: raise ValueError(f'Unknown view {args.view}')
        scene.camera.animation_data_clear()
        v = manifest['views'][args.view]; C = Matrix.Rotation(math.pi / 2, 3, 'X')
        scene.camera.location = C @ Vector(v['pos'])
        scene.camera.rotation_euler = (C @ Vector(v['target']) - scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
    for frame in dict.fromkeys(frames):
        if (root / 'STOP_RENDER').exists():
            print('STOP_RENDER found; exiting without deleting it', flush=True); break
        scene.frame_set(frame)
        scene.render.filepath = str(out / f'frame_{frame:04d}.png')
        bpy.ops.render.render(write_still=True)
        print('RENDERED', frame, scene.render.filepath, flush=True)


if __name__ == '__main__': main()
