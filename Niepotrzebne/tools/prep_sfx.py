# Robotea: trims chosen freesound candidates to the hit, normalizes them and writes assets/sfx + credits
import json, os, re, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.path.join(HERE, '..', 'sfx-candidates'))
OUT = os.path.abspath(os.path.join(HERE, '..', '..', 'assets', 'sfx'))
PICK = {
    'clap': ['467997', '412157', '391898', '478657', '388042', '860150'],
    'slap': ['537735', '463687'],
    'bump': ['683031', '387973'],
}
os.makedirs(OUT, exist_ok=True)
index = {f['id']: f for f in json.load(open(os.path.join(SRC, 'index.json')))}


def pcm(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', '44100', '-f', 's16le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768


manifest, credits = {}, ['# Robotea sound credits', '', 'All sounds from freesound.org, license CC0 1.0 (public domain). Trimmed and normalized.', '']
for kind, ids in PICK.items():
    manifest[kind] = []
    for sid in ids:
        src = os.path.join(SRC, sid + '.mp3')
        a = pcm(src)
        win = 441
        env = np.sqrt(np.convolve(a * a, np.ones(win) / win, mode='same'))
        onset = int(np.argmax(env > env.max() * 0.2))
        start = max(0, onset / 44100 - 0.004)
        dur = min(0.7, len(a) / 44100 - start)
        seg = a[int(start * 44100):int((start + dur) * 44100)]
        gain = 10 ** (-1.5 / 20) / max(np.abs(seg).max(), 1e-6)
        name = f'{kind}-{sid}.mp3'
        fade = max(0.02, dur - 0.08)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{start:.4f}', '-t', f'{dur:.4f}', '-i', src, '-ac', '1', '-ar', '44100',
                        '-af', f'volume={gain:.4f},afade=t=out:st={fade:.3f}:d=0.08', '-b:a', '128k', os.path.join(OUT, name)], check=True)
        manifest[kind].append(name)
        f = index.get(sid, {})
        user = re.sub(r'%[0-9A-F]{2}', '', f.get('user', '?'))
        credits.append(f"- `{name}`: \"{f.get('title', '?')}\" by {user}, https://freesound.org/s/{sid}/ (CC0)")
        print(kind, sid, f'start {start:.3f}s dur {dur:.2f}s gain {20 * np.log10(gain):.1f} dB')
json.dump(manifest, open(os.path.join(OUT, 'sounds.json'), 'w'), indent=1)
open(os.path.join(OUT, 'CREDITS.md'), 'w').write('\n'.join(credits) + '\n')
