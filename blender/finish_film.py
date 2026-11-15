#!/usr/bin/env python3
"""Deterministic factory sound from exported logic segments; CPU encode only.

python blender/finish_film.py --input _cad/blender --audio-only
python blender/finish_film.py --input _cad/blender --frames-dir _cad/blender/frames
Requires numpy and ffmpeg; no Blender process is launched.
"""
import argparse
import json
import math
from pathlib import Path
import subprocess
import wave

import numpy as np

RATE = 48000


def synthesize(meta):
    duration = meta['frames'] / meta['fps']
    count = round(duration * RATE)
    rng = np.random.default_rng(450125)
    t = np.arange(count) / RATE
    mix = np.zeros((count, 2), dtype=np.float64)

    def add(signal, start=0., pan=0.):
        offset = round(start * RATE)
        lo, hi = max(0, offset), min(count, offset + len(signal))
        if hi <= lo: return
        signal = signal[lo - offset:hi - offset]
        mix[lo:hi, 0] += signal * math.sqrt((1 - pan) / 2)
        mix[lo:hi, 1] += signal * math.sqrt((1 + pan) / 2)

    # The bowls are 100 Hz electromagnetic drives; small differences avoid a mono drone.
    for i, pan in enumerate((-.6, 0., .6)):
        hum = sum(.012 / h * np.sin(2 * np.pi * (100 + i * .12) * h * t + i) for h in range(1, 5))
        add(hum * (1 + .08 * np.sin(2 * np.pi * .4 * t)), pan=pan)
    add(rng.standard_normal(count) * .002)
    cues = []
    for actor, segments in meta['events'].items():
        for segment in segments:
            start, end = float(segment['t0']), float(segment['t1'])
            kind = segment.get('kind', '')
            if end <= 0 or start >= duration or kind in ('wait', 'idle', 'hold'): continue
            span = min(end - start, duration - start)
            if span <= 0: continue
            n = max(1, math.ceil(span * RATE)); u = np.arange(n) / RATE
            envelope = np.minimum(u / .012, 1) * np.minimum(np.maximum(span - u, 0) / .025, 1)
            pan = -.3 if actor == 'scara' else .25 if actor == 'press' else 0
            if actor == 'dial' and kind == 'index':
                signal = .045 * np.exp(-u * 20) * (np.sin(2 * np.pi * 170 * u) + .3 * rng.standard_normal(n))
                signal += .018 * np.sin(2 * np.pi * (180 * u + 300 * u * u)) * envelope
            elif actor in ('delta', 'scara'):
                if 'close' in kind or 'open' in kind or 'grip' in kind:
                    signal = .025 * rng.standard_normal(n) * np.exp(-u * 22)
                else:
                    signal = .012 * np.sin(2 * np.pi * (360 * u + 180 * u * u / max(span, .01))) * envelope
            elif actor in ('press', 'reject') or actor.startswith('feed'):
                signal = .014 * rng.standard_normal(n) * envelope + .016 * np.sin(2 * np.pi * 240 * u) * np.exp(-u * 26)
            elif actor == 'tray':
                signal = .018 * np.sin(2 * np.pi * (180 * u + 25 * u * u)) * envelope
            else: continue
            add(signal, start, pan); cues.append({'actor': actor, 'kind': kind, 't0': start, 't1': end})
    mix *= (np.minimum(t / .35, 1) * np.clip((duration - t) / .7, 0, 1))[:, None]
    peak = float(np.max(np.abs(mix)))
    mix *= 10 ** (-3 / 20) / max(peak, 1e-12)
    if not np.isfinite(mix).all(): raise ValueError('Nonfinite audio')
    pcm = np.rint(mix * 32767).astype('<i2')
    return pcm, {'duration': duration, 'sampleRate': RATE, 'channels': 2, 'samples': count,
                 'peakDbFS': -3., 'seed': 450125, 'cues': cues}


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--input', type=Path, default=Path('_cad/blender'))
    p.add_argument('--audio-only', action='store_true')
    p.add_argument('--frames-dir', type=Path)
    p.add_argument('--out', type=Path)
    args = p.parse_args(); root = args.input.resolve()
    meta = json.loads((root / 'manifest.json').read_text())
    pcm, report = synthesize(meta)
    wav = root / 'machine_sound.wav'
    with wave.open(str(wav), 'wb') as output:
        output.setnchannels(2); output.setsampwidth(2); output.setframerate(RATE); output.writeframes(pcm.tobytes())
    (root / 'audio-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f'Audio: {wav}; {len(pcm)} stereo samples, {len(report["cues"])} logic cues')
    if args.audio_only: return
    frames = (args.frames_dir or root / 'frames').resolve()
    from validate_video import validate_frames
    errors = validate_frames(frames, meta['frames'], (1920, 1080))
    if errors: raise ValueError('\n'.join(errors[:10]))
    movie = (args.out or root / 'mini_factory_cell.mp4').resolve(); movie.parent.mkdir(parents=True, exist_ok=True)
    duration = meta['frames'] / meta['fps']
    subprocess.run(['ffmpeg', '-y', '-v', 'warning', '-framerate', str(meta['fps']), '-start_number', '1',
                    '-i', str(frames / 'frame_%04d.png'), '-i', str(wav), '-map', '0:v:0', '-map', '1:a:0',
                    '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '192k', '-ar', str(RATE), '-t', str(duration),
                    '-movflags', '+faststart', str(movie)], check=True)
    print('Encoded', movie)


if __name__ == '__main__': main()
