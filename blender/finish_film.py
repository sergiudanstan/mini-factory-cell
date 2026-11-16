#!/usr/bin/env python3
"""Finish the Blender film with the browser film's own pipeline: tools/film.mjs --frames-from.

Both films share one choreography (film/plan.json), so the Blender frames get exactly what the browser film gets:
the plan's dissolves and cuts, the title, chapter lower-thirds, the S4 force-travel inset and the end card, and the
procedural soundtrack of tools/audio.mjs (machine events mapped through the same segments, slow motion included).
Encode: x264 CRF 17 yuv420p with BT.709 limited-range tags, AAC 48 kHz stereo; then ffprobe, a full decode and a
contact sheet (tools/film.mjs), see also blender/validate_video.py.

  python3 blender/finish_film.py --input _cad/plan                       # the whole film
  python3 blender/finish_film.py --input _cad/plan --from-seg 7 --to-seg 8   # a test of two segments
Frames come from <input>/frames/sNN/f_00000.png ... (blender/render.py --segments A B). Needs node, ffmpeg and
Chrome (overlays; the shared Chrome lock is respected). No Blender process is launched.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys

REPO = Path(__file__).resolve().parents[1]


def png_size(path):
    with open(path, 'rb') as stream:
        head = stream.read(24)
    if head[:8] != b'\x89PNG\r\n\x1a\n' or head[12:16] != b'IHDR':
        raise ValueError(f'{path}: not a PNG')
    return struct.unpack('>II', head[16:24])


def main():
    p = argparse.ArgumentParser(description='Finish the Blender film through tools/film.mjs --frames-from')
    p.add_argument('--input', type=Path, default=Path('_cad/plan'), help='plan export directory (manifest.json)')
    p.add_argument('--frames-dir', type=Path, help='default <input>/frames')
    p.add_argument('--from-seg', type=int); p.add_argument('--to-seg', type=int)
    p.add_argument('--out', type=Path, help='default <input>/mini_factory_cell[_sAA-BB].mp4')
    p.add_argument('--port', type=int, default=8788)
    p.add_argument('--no-overlays', action='store_true'); p.add_argument('--no-audio', action='store_true')
    args = p.parse_args()
    root = args.input.resolve()
    meta = json.loads((root / 'manifest.json').read_text())
    tl = meta.get('timeline') or {}
    if tl.get('mode') != 'plan':
        sys.exit('finish_film.py needs a plan export (tools/export-blender.mjs without --linear)')
    segs = tl['segments']
    lo = args.from_seg or segs[0]['n']; hi = args.to_seg or segs[-1]['n']
    if not any(s['n'] == lo for s in segs) or not any(s['n'] == hi for s in segs) or lo > hi:
        sys.exit(f'segments {lo}..{hi} are not in this export ({segs[0]["n"]}..{segs[-1]["n"]})')
    plan = Path(tl['plan'])
    current = hashlib.sha256(plan.read_bytes()).hexdigest()[:16]
    if current != tl.get('planHash'):
        print(f'warning: {plan} changed since the export (hash {current} != {tl.get("planHash")}); '
              'segment lengths are checked frame by frame, captions follow the current plan', flush=True)
    frames = (args.frames_dir or root / 'frames').resolve()
    width, height = png_size(frames / f's{lo:02d}' / 'f_00000.png')
    full = (lo, hi) == (segs[0]['n'], segs[-1]['n'])
    out = (args.out or root / ('mini_factory_cell.mp4' if full else f'mini_factory_cell_s{lo:02d}-{hi:02d}.mp4')).resolve()
    cmd = ['node', str(REPO / 'tools/film.mjs'), '--plan', str(plan), '--frames-from', str(frames),
           '--from-seg', str(lo), '--to-seg', str(hi), '--size', f'{width}x{height}', '--out', str(out), '--port', str(args.port)]
    if args.no_overlays: cmd.append('--no-overlays')
    if args.no_audio: cmd.append('--no-audio')
    print('FINISH', ' '.join(cmd), flush=True)
    sys.exit(subprocess.call(cmd, cwd=REPO))


if __name__ == '__main__':
    main()
