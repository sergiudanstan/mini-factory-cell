#!/usr/bin/env python3
"""Validate the Blender film independently of the tool that made it.

Plan exports (default): the expected frame count follows film/plan.json as exported, i.e. the frames of the rendered
segments minus their dissolve overlaps (a subset starts clean on its first segment), at the export's fps; the size is
read from the rendered PNG frames. Linear exports: the count is manifest['frames'] at 1920x1080 (frames frame_NNNN.png).
Checks: PNG frames complete and of one size, one H.264 video + one AAC stereo 48 kHz stream, exact frame count, frame
rate, durations, BT.709 tags (plan mode), a full decode that prints nothing, and a contact sheet.

  python3 blender/validate_video.py --input _cad/plan --video _cad/plan/mini_factory_cell_s07-08.mp4 --from-seg 7 --to-seg 8
"""
import argparse
from fractions import Fraction
import json
from pathlib import Path
import struct
import subprocess


def png_size(path):
    with path.open('rb') as stream:
        header = stream.read(33)
    if len(header) != 33 or header[:8] != b'\x89PNG\r\n\x1a\n' or header[12:16] != b'IHDR':
        raise ValueError('invalid PNG header')
    return struct.unpack('>II', header[16:24])


def validate_frames(directory, count, size):
    """Linear exports: frame_0001.png .. frame_<count>.png, all of size."""
    errors = []
    for i in range(1, count + 1):
        path = directory / f'frame_{i:04d}.png'
        try:
            found = png_size(path)
            if found != size: raise ValueError(f'resolution {found}, expected {size}')
        except (OSError, ValueError) as exc:
            errors.append(f'{path.name}: {exc}')
    return errors


def validate_plan_frames(directory, segments):
    """Plan exports: sNN/f_00000.png .. per segment, exactly its frame count, one size for all."""
    errors, size = [], None
    for sg in segments:
        d = directory / sg['dir']
        for j in range(sg['frames']):
            path = d / f'f_{j:05d}.png'
            try:
                found = png_size(path)
                size = size or found
                if found != size: raise ValueError(f'resolution {found}, expected {size}')
            except (OSError, ValueError) as exc:
                errors.append(f'{sg["dir"]}/{path.name}: {exc}')
                if len(errors) > 20: return errors, size
        extra = sorted(p.name for p in d.glob('f_*.png'))[sg['frames']:] if d.exists() else []
        if extra: errors.append(f'{sg["dir"]}: {len(extra)} extra frames ({extra[0]} ...)')
    return errors, size


def expectations(meta, lo, hi):
    tl = meta.get('timeline') or {}
    if tl.get('mode') != 'plan':
        return {'frames': meta['frames'], 'fps': meta['fps'], 'size': (1920, 1080), 'segments': None, 'bt709': False}
    segs = [s for s in tl['segments'] if lo <= s['n'] <= hi]
    if not segs: raise ValueError(f'no segments {lo}..{hi} in this export')
    fps = tl['fps']
    frames = sum(s['frames'] for s in segs) - sum(round(s['xfade'] * fps) for s in segs[1:])
    return {'frames': frames, 'fps': fps, 'size': None, 'segments': segs, 'bt709': True}


def validate(movie, meta, frames_dir=None, contact=True, lo=None, hi=None):
    tl = meta.get('timeline') or {}
    if tl.get('mode') == 'plan':
        lo = lo or tl['segments'][0]['n']; hi = hi or tl['segments'][-1]['n']
    want = expectations(meta, lo, hi)
    errors = []
    if frames_dir and want['segments']:
        errs, size = validate_plan_frames(frames_dir, want['segments']); errors += errs; want['size'] = size
    elif frames_dir:
        errors += validate_frames(frames_dir, want['frames'], want['size'])
    report = {'status': 'FAIL', 'errors': errors, 'decode': 'NOT_RUN', 'expectedFrames': want['frames'],
              'segments': [lo, hi] if want['segments'] else None}
    try:
        probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', str(movie)], text=True))
        videos = [s for s in probe['streams'] if s['codec_type'] == 'video']
        audios = [s for s in probe['streams'] if s['codec_type'] == 'audio']
        if len(videos) != 1 or len(audios) != 1: raise ValueError('Expected exactly one video and one audio stream')
        v, a = videos[0], audios[0]; duration = want['frames'] / want['fps']
        size = tuple(want['size']) if want['size'] else (v['width'], v['height'])
        checks = [((v['width'], v['height']) == size, f'resolution (want {size[0]}x{size[1]})'),
                  (v['codec_name'] == 'h264' and v.get('pix_fmt') == 'yuv420p', 'H.264 yuv420p'),
                  (Fraction(v['r_frame_rate']) == want['fps'] and Fraction(v['avg_frame_rate']) == want['fps'], 'fps'),
                  (int(v.get('nb_read_frames', 0)) == want['frames'], f'frame count (want {want["frames"]})'),
                  (abs(float(v.get('duration', probe['format']['duration'])) - duration) <= 1 / want['fps'], 'duration'),
                  (a['codec_name'] == 'aac' and a['channels'] == 2 and int(a['sample_rate']) == 48000, 'AAC stereo 48 kHz audio'),
                  (abs(float(a.get('duration', probe['format']['duration'])) - duration) < .08, 'audio duration')]
        if want['bt709']:
            checks.append((v.get('color_space') == 'bt709' and v.get('color_range') == 'tv', 'BT.709 limited-range tags'))
        errors.extend(f'Incorrect {name}' for ok, name in checks if not ok)
        decoded = subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(movie), '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'], capture_output=True, text=True)
        report.update(frames=int(v.get('nb_read_frames', 0)), resolution=[v['width'], v['height']],
                      fps=v['avg_frame_rate'], duration=float(probe['format']['duration']),
                      videoCodec=v['codec_name'], audioCodec=a['codec_name'], sizeBytes=movie.stat().st_size,
                      color=f"{v.get('color_space')}/{v.get('color_range')}",
                      decode='PASS' if decoded.returncode == 0 and not decoded.stderr.strip() else 'FAIL')
        if report['decode'] != 'PASS': errors.append('Decode failed: ' + decoded.stderr.strip())
        if contact:
            sheet = movie.with_name(movie.stem + '_validate_contact.jpg')
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(movie), '-vf',
                            f'fps={10 / duration},scale=480:-2,tile=5x2', '-frames:v', '1', '-update', '1', str(sheet)], check=True)
            report['contactSheet'] = str(sheet)
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as exc:
        errors.append(str(exc))
    report['status'] = 'PASS' if not errors else 'FAIL'
    return report


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--input', type=Path, default=Path('_cad/plan'))
    p.add_argument('--video', type=Path)
    p.add_argument('--frames-dir', type=Path, help='default <input>/frames (plan) ; linear: only when given')
    p.add_argument('--from-seg', type=int); p.add_argument('--to-seg', type=int)
    p.add_argument('--no-contact', action='store_true')
    args = p.parse_args(); root = args.input.resolve()
    meta = json.loads((root / 'manifest.json').read_text())
    plan = (meta.get('timeline') or {}).get('mode') == 'plan'
    frames = args.frames_dir or (root / 'frames' if plan else None)
    video = args.video or root / 'mini_factory_cell.mp4'
    report = validate(video, meta, frames, not args.no_contact, args.from_seg, args.to_seg)
    out = video.with_name(video.stem + '_validation.json') if plan else root / 'validation.json'
    out.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if report['status'] == 'PASS' else 1)


if __name__ == '__main__': main()
