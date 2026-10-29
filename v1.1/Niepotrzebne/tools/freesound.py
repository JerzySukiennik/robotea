# Robotea: search freesound.org (CC0 only, no API key) and download HQ previews as candidates
import html, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
OUT = sys.argv[1]
QUERIES = sys.argv[2:]


def get(url, tries=6):
    for k in range(tries):
        try:
            time.sleep(1.5)
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or k == tries - 1:
                raise
            time.sleep(20 * (k + 1))


os.makedirs(OUT, exist_ok=True)
found = []
for q in QUERIES:
    url = 'https://freesound.org/search/?' + urllib.parse.urlencode({'q': q, 'f': 'license:"Creative Commons 0"', 's': 'Rating descending'})
    page = get(url).decode('utf-8', 'replace')
    for block in page.split('data-sound-id=')[1:9]:
        sid = re.match(r'"(\d+)"', block)
        mp3 = re.search(r'data-mp3="([^"]+)"', block)
        title = re.search(r'data-title="([^"]+)"', block) or re.search(r'title="([^"]+)"', block)
        user = re.search(r'/people/([^/]+)/sounds/', block)
        dur = re.search(r'data-duration="([\d.]+)"', block)
        if not (sid and mp3):
            continue
        found.append({'query': q, 'id': sid.group(1), 'title': html.unescape(title.group(1)) if title else '', 'user': user.group(1) if user else '',
                      'duration': float(dur.group(1)) if dur else None, 'mp3': mp3.group(1).replace('-lq.mp3', '-hq.mp3')})

seen = set()
keep = []
for f in found:
    if f['id'] in seen:
        continue
    seen.add(f['id'])
    keep.append(f)
for f in keep:
    path = os.path.join(OUT, f"{f['id']}.mp3")
    if not os.path.exists(path):
        try:
            with open(path, 'wb') as fh:
                fh.write(get(f['mp3']))
        except Exception as e:
            print('fail', f['id'], e)
            continue
    print(f"{f['id']}\t{f['query']}\t{f['duration']}\t{f['user']}\t{f['title']}")
with open(os.path.join(OUT, 'index.json'), 'w') as fh:
    json.dump(keep, fh, indent=1)
