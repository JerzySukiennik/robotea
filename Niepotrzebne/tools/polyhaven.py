# Robotea: downloads CC0 Poly Haven textures (1k diffuse/normal/roughness) and HDRIs into assets/
import json, os, sys, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'assets'))
TEX = sys.argv[1].split(',') if len(sys.argv) > 1 and sys.argv[1] else []
HDR = sys.argv[2].split(',') if len(sys.argv) > 2 and sys.argv[2] else []
RES = os.environ.get('RES', '1k')


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'robotea-asset-fetch'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def save(url, path):
    if os.path.exists(path):
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = get(url)
    with open(path, 'wb') as f:
        f.write(data)
    print('ok', os.path.relpath(path, ROOT), len(data) // 1024, 'KB')


for tid in TEX:
    files = json.loads(get(f'https://api.polyhaven.com/files/{tid}'))
    pick = {'diff': files.get('Diffuse'), 'nor': files.get('nor_gl'), 'rough': files.get('Rough')}
    for name, entry in pick.items():
        if not entry:
            print('missing', tid, name)
            continue
        res = entry.get(RES) or entry[sorted(entry.keys())[0]]
        fmt = res.get('jpg') or res.get('png')
        ext = 'jpg' if 'jpg' in res else 'png'
        save(fmt['url'], os.path.join(ROOT, 'tex', tid, f'{name}.{ext}'))

for hid in HDR:
    files = json.loads(get(f'https://api.polyhaven.com/files/{hid}'))
    res = files['hdri'].get(RES) or files['hdri']['1k']
    save(res['hdr']['url'], os.path.join(ROOT, 'hdri', f'{hid}.hdr'))
