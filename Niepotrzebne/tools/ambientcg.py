# Robotea: downloads CC0 ambientCG materials (1K JPG zip) and keeps color/normal/roughness in assets/tex
import io, os, sys, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', 'assets', 'tex'))
DL = os.path.abspath(os.path.join(HERE, '..', 'dl'))
IDS = sys.argv[1].split(',')
WANT = {'Color': 'diff', 'NormalGL': 'nor', 'Roughness': 'rough'}

for aid in IDS:
    out = os.path.join(ROOT, aid)
    if os.path.isdir(out) and len(os.listdir(out)) >= 3:
        continue
    url = f'https://ambientcg.com/get?file={aid}_1K-JPG.zip'
    req = urllib.request.Request(url, headers={'User-Agent': 'robotea-asset-fetch'})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    os.makedirs(os.path.join(DL, aid), exist_ok=True)
    with open(os.path.join(DL, aid, f'{aid}.zip'), 'wb') as f:
        f.write(data)
    os.makedirs(out, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in z.namelist():
            base = os.path.basename(name)
            if not base.lower().endswith('.jpg') or base != name:
                continue
            for key, short in WANT.items():
                if base.endswith(f'_{key}.jpg'):
                    with open(os.path.join(out, f'{short}.jpg'), 'wb') as f:
                        f.write(z.read(name))
                    print('ok', aid, short, z.getinfo(name).file_size // 1024, 'KB')
