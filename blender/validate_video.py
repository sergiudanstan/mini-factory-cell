#!/usr/bin/env python3
"""Validate final video dimensions, exact sampled frame count, stereo sound and decode.

Expected duration/count come from the export manifest, never a hard-coded film length.
"""
import argparse
from fractions import Fraction
import json
from pathlib import Path
import struct
import subprocess


def validate_frames(directory, count, size):
    errors = []
    for i in range(1, count + 1):
        path = directory / f'frame_{i:04d}.png'
        try:
            with path.open('rb') as stream: header = stream.read(33)
            if len(header) != 33 or header[:8] != b'\x89PNG\r\n\x1a\n' or header[12:16] != b'IHDR':
                raise ValueError('invalid PNG header')
            found = struct.unpack('>II', header[16:24])
            if found != size: raise ValueError(f'resolution {found}, expected {size}')
        except (OSError, ValueError) as exc:
            errors.append(f'{path.name}: {exc}')
    return errors


def validate(movie, meta, frames=None, contact=True):
    errors = validate_frames(frames, meta['frames'], (1920, 1080)) if frames else []
    report = {'status': 'FAIL', 'errors': errors, 'decode': 'NOT_RUN', 'expectedFrames': meta['frames']}
    try:
        probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', str(movie)], text=True))
        videos = [s for s in probe['streams'] if s['codec_type'] == 'video']
        audios = [s for s in probe['streams'] if s['codec_type'] == 'audio']
        if len(videos) != 1 or len(audios) != 1: raise ValueError('Expected exactly one video and one audio stream')
        v, a = videos[0], audios[0]; duration = meta['frames'] / meta['fps']
        checks = [((v['width'], v['height']) == (1920, 1080), 'resolution'),
                  (Fraction(v['r_frame_rate']) == meta['fps'] and Fraction(v['avg_frame_rate']) == meta['fps'], 'fps'),
                  (int(v.get('nb_read_frames', 0)) == meta['frames'], 'frame count'),
                  (abs(float(v.get('duration', probe['format']['duration'])) - duration) <= 1 / meta['fps'], 'duration'),
                  (a['channels'] == 2 and int(a['sample_rate']) == 48000, 'stereo 48 kHz audio'),
                  (abs(float(a.get('duration', probe['format']['duration'])) - duration) < .08, 'audio duration')]
        errors.extend(f'Incorrect {name}' for ok, name in checks if not ok)
        decoded = subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(movie), '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'], capture_output=True, text=True)
        report.update(frames=int(v.get('nb_read_frames', 0)), resolution=[v['width'], v['height']],
                      fps=v['avg_frame_rate'], duration=float(probe['format']['duration']),
                      videoCodec=v['codec_name'], audioCodec=a['codec_name'], sizeBytes=movie.stat().st_size,
                      decode='PASS' if decoded.returncode == 0 and not decoded.stderr.strip() else 'FAIL')
        if report['decode'] != 'PASS': errors.append('Decode failed: ' + decoded.stderr.strip())
        if contact:
            sheet = movie.with_name(movie.stem + '_contact.jpg')
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(movie), '-vf',
                            f'fps={10 / duration},scale=480:270,tile=5x2', '-frames:v', '1', '-update', '1', str(sheet)], check=True)
            report['contactSheet'] = str(sheet)
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as exc:
        errors.append(str(exc))
    report['status'] = 'PASS' if not errors else 'FAIL'
    return report


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--input', type=Path, default=Path('_cad/blender'))
    p.add_argument('--video', type=Path)
    p.add_argument('--frames-dir', type=Path)
    p.add_argument('--no-contact', action='store_true')
    args = p.parse_args(); root = args.input.resolve()
    meta = json.loads((root / 'manifest.json').read_text())
    video = args.video or root / 'mini_factory_cell.mp4'
    report = validate(video, meta, args.frames_dir, not args.no_contact)
    (root / 'validation.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if report['status'] == 'PASS' else 1)


if __name__ == '__main__': main()
