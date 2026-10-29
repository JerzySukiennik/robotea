# Robotea: cuts chosen freesound candidates (claps, gunshots, range foley), normalizes them and writes assets/sfx, sounds.json and CREDITS.md
import json, os, subprocess, urllib.parse
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.path.abspath(os.path.join(HERE, '..', '..', 'assets', 'sfx'))
SR = 44100

CLAPS = {
    'clap': ['467997', '412157', '391898', '478657', '388042', '860150'],
    'slap': ['537735', '463687'],
    'bump': ['683031', '387973'],
}
CUTS = {
    'glock': [('sfx-guns', '855652', 0.0, 0.95), ('sfx-guns', '855652', 3.19, 0.95), ('sfx-guns', '828786', 0.0, 0.95)],
    'beretta': [('sfx-guns', '415912', 0.0, 0.95), ('sfx-guns', '828786', 0.0, 0.8)],
    'm1911': [('sfx-guns', '392229', 0.0, 1.0), ('sfx-guns', '346906', 2.93, 1.0)],
    'deagle': [('sfx-guns', '330634', 0.0, 0.8), ('sfx-guns', '231243', 1.03, 1.1), ('sfx-guns', '712310', 0.0, 1.2)],
    'revolver': [('sfx-guns', '541818', 0.0, 0.9), ('sfx-guns', '541818', 0.985, 0.9), ('sfx-guns', '541818', 1.94, 0.9), ('sfx-guns', '346906', 0.36, 1.05)],
    'pew': [('sfx-guns', '819682', 0.0, 0.42), ('sfx-guns', '660404', 0.0, 0.5), ('sfx-guns', '713312', 0.29, 0.32)],
    'casing': [('sfx-guns', '210102', 2.28, 0.8), ('sfx-guns', '210102', 4.08, 0.9), ('sfx-guns', '347604', 0.65, 0.4)],
    'steel': [('sfx-guns2', '351371', 0.0, 0.42), ('sfx-guns2', '837455', 0.0, 0.77), ('sfx-guns2', '182263', 4.45, 0.9), ('sfx-guns2', '182263', 7.25, 1.0), ('sfx-guns2', '711881', 0.05, 1.6)],
    'dry': [('sfx-guns2', '119168', 0.36, 0.3), ('sfx-guns2', '725402', 0.02, 0.35)],
    'magout': [('sfx-guns', '854499', 0.3, 0.45)],
    'magin': [('sfx-guns', '854499', 1.28, 0.55), ('sfx-guns2', '171209', 1.18, 0.35)],
    'rack': [('sfx-guns', '854499', 2.36, 0.4), ('sfx-guns', '151070', 0.03, 0.26)],
    'smgout': [('sfx-guns', '677160', 0.05, 0.5)],
    'smgin': [('sfx-guns', '677160', 1.85, 0.4)],
    'smgbolt': [('sfx-guns', '677160', 3.05, 0.6)],
}
UZI = ('sfx-guns', '418433', [3, 6, 9, 12])


def pcm(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768


def write(seg, name, fade=0.08):
    seg = seg.astype(np.float32).copy()
    n = len(seg)
    fi = min(n, int(0.002 * SR))
    seg[:fi] *= np.linspace(0, 1, fi)
    fo = min(n, max(int(0.04 * SR), int(fade * SR), int(n * 0.15)))
    seg[n - fo:] *= np.linspace(1, 0, fo) ** 1.5
    seg *= 10 ** (-1.5 / 20) / max(np.abs(seg).max(), 1e-6)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-b:a', '128k', os.path.join(OUT, name)], input=seg.tobytes(), check=True)


def meta(folder, sid):
    for f in json.load(open(os.path.join(ROOT, folder, 'index.json'))):
        if f['id'] == sid:
            return f
    return {}


def onsets(a):
    w = int(0.002 * SR)
    n = len(a) // w
    env = np.abs(a[:n * w]).reshape(n, w).max(1)
    thr = env.max() * 0.45
    out, last = [], -999
    for i in range(1, n - 1):
        if env[i] >= thr and env[i] >= env[i - 1] and env[i] >= env[i + 1] and i - last > 25:
            out.append(i * w)
            last = i
    return out


os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if f.endswith('.mp3'):
        os.remove(os.path.join(OUT, f))
manifest, credits, used = {}, ['# Robotea sound credits', '', 'All sounds from freesound.org, license CC0 1.0 (public domain). Cut, trimmed and normalized for the game.', ''], {}

for kind, ids in CLAPS.items():
    manifest[kind] = []
    for sid in ids:
        a = pcm(os.path.join(ROOT, 'sfx-candidates', sid + '.mp3'))
        win = 441
        env = np.sqrt(np.convolve(a * a, np.ones(win) / win, mode='same'))
        start = max(0, int(np.argmax(env > env.max() * 0.2)) - int(0.004 * SR))
        seg = a[start:start + int(0.7 * SR)]
        name = f'{kind}-{sid}.mp3'
        write(seg, name)
        manifest[kind].append(name)
        used.setdefault(('sfx-candidates', sid), []).append(name)

for kind, cuts in CUTS.items():
    manifest[kind] = []
    for k, (folder, sid, start, dur) in enumerate(cuts):
        a = pcm(os.path.join(ROOT, folder, sid + '.mp3'))
        seg = a[int(start * SR):int((start + dur) * SR)]
        name = f'{kind}-{sid}' + (f'-{k}' if sum(1 for c in cuts if c[1] == sid) > 1 else '') + '.mp3'
        write(seg, name)
        manifest[kind].append(name)
        used.setdefault((folder, sid), []).append(name)
        print(kind, name, f'{len(seg) / SR:.2f}s')

folder, sid, picks = UZI
a = pcm(os.path.join(ROOT, folder, sid + '.mp3'))
on = onsets(a)
print('uzi onsets', len(on), [round(o / SR, 3) for o in on])
gap = int(np.median(np.diff(on)))
tail = a[on[-1] + gap - int(0.004 * SR):on[-1] + int(0.42 * SR)]
manifest['uzi'] = []
for k in picks:
    s0 = on[k] - int(0.003 * SR)
    body = a[s0:on[k] + gap - int(0.004 * SR)].copy()
    x = int(0.006 * SR)
    mix = body[-x:] * np.linspace(1, 0, x) + tail[:x] * np.linspace(0, 1, x)
    seg = np.concatenate([body[:-x], mix, tail[x:]])
    name = f'uzi-{sid}-{k}.mp3'
    write(seg, name, 0.2)
    manifest['uzi'].append(name)
    used.setdefault((folder, sid), []).append(name)

for (folder, sid), names in used.items():
    f = meta(folder, sid)
    user = urllib.parse.unquote(f.get('user', '?'))
    credits.append(f"- {', '.join(f'`{n}`' for n in names)}: \"{f.get('title', '?')}\" by {user}, https://freesound.org/s/{sid}/ (CC0)")
json.dump(manifest, open(os.path.join(OUT, 'sounds.json'), 'w'), indent=1)
open(os.path.join(OUT, 'CREDITS.md'), 'w').write('\n'.join(credits) + '\n')
print('banks', {k: len(v) for k, v in manifest.items()})
