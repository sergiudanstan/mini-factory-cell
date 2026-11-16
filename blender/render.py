"""Render the Blender film: stills by default, frames of plan segments or the whole animation on request.

Plan exports (tools/export-blender.mjs default):
  blender -b _cad/plan/mini_factory_cell.blend --python blender/render.py -- --stills            # middle frame of every segment
  blender -b _cad/plan/mini_factory_cell.blend --python blender/render.py -- --segments 7 8 --samples 16 --percent 50
      -> <export>/frames/s07/f_00000.png ... (the layout tools/film.mjs --frames-from reads; existing frames are kept)
  blender -b _cad/plan/mini_factory_cell.blend --python blender/render.py -- --segments 1 14 --animation   # the film
Linear exports: --frames N ... (stills) or --animation [--start --end].  A STOP_RENDER file in the export stops a run.
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
    p.add_argument('--stills', action='store_true', help='plan export: the middle frame of every segment (or of --segments A B)')
    p.add_argument('--segments', nargs=2, type=int, metavar=('A', 'B'), help='plan export: segments A..B')
    p.add_argument('--percent', type=int, help='resolution percentage (default 50 for stills and previews, 100 with --animation)')
    p.add_argument('--at', type=float, default=0.5, help='--stills: position inside each segment, 0..1 (default 0.5)')
    args = p.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    scene = bpy.context.scene; root = Path(scene['mfc_export_dir'])
    manifest = json.loads((root / 'manifest.json').read_text())
    install_deformations(scene); devices(scene)
    if scene.get('mfc_timeline') == 'plan' and (args.stills or args.segments):
        return render_plan(scene, root, manifest, args)
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


def render_plan(scene, root, manifest, args):
    segs = manifest['timeline']['segments']
    lo, hi = args.segments or (segs[0]['n'], segs[-1]['n'])
    chosen = [sg for sg in segs if lo <= sg['n'] <= hi]
    if not chosen: raise ValueError(f'No plan segments {lo}..{hi} in this export ({segs[0]["n"]}..{segs[-1]["n"]})')
    scene.render.resolution_percentage = args.percent or (100 if args.animation else 50)
    # measured on the RTX 5050 (1080p, 32 samples, OptiX denoise): 7.5-10.5 s/frame after the first; 24 keeps the
    # 2100-frame film near 3.5-4.5 h, 32 near 4.5-6 h
    scene.cycles.samples = args.samples or 24
    jobs = []                                   # (frame, output path)
    if args.stills:
        out = args.out or root / 'previews'; out.mkdir(parents=True, exist_ok=True)
        for sg in chosen:
            f = sg['f0'] + min(sg['frames'] - 1, max(0, round(args.at * (sg['frames'] - 1))))
            label = ''.join(c if c.isalnum() else '_' for c in sg['label']).strip('_').lower()
            jobs.append((f, out / f"seg{sg['n']:02d}_{label}.png"))
    else:
        out = args.out or root / 'frames'
        for sg in chosen:
            d = out / sg['dir']; d.mkdir(parents=True, exist_ok=True)
            jobs += [(f, d / f'f_{f - sg["f0"]:05d}.png') for f in range(sg['f0'], sg['f1'] + 1)]
    print(f'PLAN_RENDER {len(jobs)} frames, segments {lo}..{hi}, {scene.render.resolution_percentage}% , {scene.cycles.samples} samples', flush=True)
    import time
    t0 = time.time(); done = 0
    for frame, path in jobs:
        if (root / 'STOP_RENDER').exists():
            print('STOP_RENDER found; exiting without deleting it', flush=True); break
        if not args.stills and path.exists():
            continue
        scene.frame_set(frame)
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        done += 1
        print(f'RENDERED {frame} {path} {(time.time() - t0) / done:.2f} s/frame', flush=True)
    print(f'PLAN_RENDER_DONE {done} frames in {time.time() - t0:.1f} s', flush=True)


if __name__ == '__main__': main()
