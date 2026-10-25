"""Keep website sections in step with Google Drive folders.

Each collection below has:
  <dir>/sources.json  - the Drive files it contains (id, name, size, times), newest first.
                        Updated here when DRIVE_API_KEY is set, otherwise by the daily Drive check.
  <dir>/exclude.json  - optional {"ids": [...]} of Drive files to keep off the site.
  <dir>/<out>         - what the website reads: title, poster, preview clip and size of each video.
  assets/<dir>/       - poster (<id>.jpg) and 8-second silent preview (<id>.mp4) for each video.

Only the Python standard library and ffmpeg are needed.
"""
import json, os, re, subprocess, sys, tempfile, urllib.parse, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = os.environ.get('DRIVE_API_KEY', '').strip()
UA = {'User-Agent': 'Mozilla/5.0 (portfolio video sync)'}

COLLECTIONS = [
    {   # Events: videos named "Event…" in the Portfolio folder; shown on the social media arc
        'dir': 'events', 'out': 'events.json', 'key': 'events',
        'folder': '1VeaXvPleEwLOva3C3M8-EG88hO2gtusN',
        'match': re.compile(r'(^|[^a-z])events?([^a-z]|$)', re.I),
        'strip': r'events?', 'fallback': 'Event highlights', 'preview': 'vertical',
    },
    {   # Brand Films: every video in the "Brand Films" folder
        'dir': 'brand-films', 'out': 'films.json', 'key': 'films',
        'folder': '1LOAZT60MTeelynndrzET1UvZlEGo2KCy',
        'match': None,
        'strip': r'brand\s*films?(\s*\(\d+\))?', 'fallback': 'Brand film', 'preview': 'native',
        'preview_size': (1280, 720), 'pv': 2,   # shown on a large screen, so sharper previews
    },
    {   # Digital Ads (Google and Meta ads): every video in the "Ads" folder
        'dir': 'ads', 'out': 'ads.json', 'key': 'ads',
        'folder': '1Bj18V1Q2ylIQytH_BNKIS2P1f7PFmntQ',
        'match': None,
        'strip': r'(ad\s*films?|ads?)(\s*\(\d+\))?', 'fallback': 'Digital ad', 'preview': 'native',
    },
    {   # Interviews: every video in the "Interview" folder; shown under Podcasts & Interviews
        'dir': 'interviews', 'out': 'interviews.json', 'key': 'interviews',
        'folder': '1qrxLQg-9HSa7YB6_kL-ddgPxGScpmki-',
        'match': None,
        'strip': r'interviews?(\s*\(\d+\))?', 'fallback': 'Student interview', 'preview': 'native',
    },
]


def log(*a):
    print(*a, flush=True)


def list_drive(c):
    """List the collection's videos with the Drive API (needs DRIVE_API_KEY)."""
    files, token = [], None
    q = f"'{c['folder']}' in parents and trashed = false and mimeType contains 'video/'"
    while True:
        params = {'q': q, 'key': KEY, 'pageSize': '1000', 'orderBy': 'modifiedTime desc',
                  'fields': 'nextPageToken,files(id,name,size,createdTime,modifiedTime)'}
        if token: params['pageToken'] = token
        url = 'https://www.googleapis.com/drive/v3/files?' + urllib.parse.urlencode(params)
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
            data = json.load(r)
        files += data.get('files', [])
        token = data.get('nextPageToken')
        if not token: break
    return [{'id': f['id'], 'name': f['name'], 'size': int(f.get('size', 0)),
             'createdTime': f.get('createdTime', ''), 'modifiedTime': f.get('modifiedTime', '')}
            for f in files if not c['match'] or c['match'].search(f['name'])]


def title_from(name, c):
    """'Event - Graduation Day.mp4' -> 'Graduation Day'; 'Brand Films.mp4' -> 'Brand film'."""
    base = re.sub(r'\.[A-Za-z0-9]{2,4}$', '', name)
    rest = re.sub(r'^\s*' + c['strip'] + r'(?![a-z])', '', base, flags=re.I)
    rest = re.sub(r'^[\s.\-_:|–—]+|[\s.\-_:|–—]+$', '', rest)
    return rest or c['fallback']


def download(fid, dest):
    urls = []
    if KEY:
        urls.append(f'https://www.googleapis.com/drive/v3/files/{fid}?alt=media&key={KEY}')
    urls.append(f'https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t')
    for url in urls:
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=900) as r, open(dest, 'wb') as out:
                if 'text/html' in (r.headers.get('Content-Type') or ''):
                    raise ValueError('Drive returned a web page instead of the video')
                while True:
                    chunk = r.read(1 << 20)
                    if not chunk: break
                    out.write(chunk)
            if probe(dest): return True
        except Exception as e:
            log(f'  download failed via {url.split("?")[0]}: {e}')
    return False


def probe(path):
    try:
        out = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                                       'stream=width,height:stream_tags=rotate:format=duration', '-of', 'json', path])
        d = json.loads(out)
        s = d['streams'][0]
        w, h = int(s['width']), int(s['height'])
        if str(s.get('tags', {}).get('rotate', '0')) in ('90', '270'): w, h = h, w
        return {'width': w, 'height': h, 'duration': float(d['format']['duration'])}
    except Exception:
        return None


def render(src, fid, info, assets, shape, size=None):
    dur, portrait = info['duration'], info['height'] >= info['width']
    poster, preview = os.path.join(assets, fid + '.jpg'), os.path.join(assets, fid + '.mp4')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{dur * 0.3:.2f}', '-i', src, '-frames:v', '1',
                    '-vf', 'scale=-2:1000' if portrait else 'scale=1280:-2', '-q:v', '4', poster], check=True)
    w, h = (360, 640) if shape == 'vertical' or portrait else (size or (640, 360))
    start = max(0.0, min(dur * 0.18, dur - 8.5))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{start:.2f}', '-t', '8', '-i', src, '-an', '-vf',
                    f'scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=0x0b0d11,fps=24,format=yuv420p',
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-profile:v', 'main', '-movflags', '+faststart',
                    preview], check=True)


def sync(c):
    d = os.path.join(ROOT, c['dir'])
    sources, out, exclude = (os.path.join(d, n) for n in ('sources.json', c['out'], 'exclude.json'))
    assets = os.path.join(ROOT, 'assets', c['dir'])
    if not os.path.exists(sources):
        log(f'[{c["dir"]}] no sources.json yet'); return
    os.makedirs(assets, exist_ok=True)
    if KEY:
        try:
            listed = list_drive(c)
            json.dump({'folder': c['folder'], 'files': listed}, open(sources, 'w'), indent=2)
            log(f'[{c["dir"]}] Drive lists {len(listed)} videos')
        except Exception as e:
            log(f'[{c["dir"]}] could not list Drive ({e}); using sources.json')
    files = json.load(open(sources))['files']
    excluded = set(json.load(open(exclude)).get('ids', [])) if os.path.exists(exclude) else set()
    files = [f for f in files if f['id'] not in excluded]
    previous = {e['id']: e for e in json.load(open(out))[c['key']]} if os.path.exists(out) else {}

    items = []
    for f in files:
        fid, old = f['id'], previous.get(f['id'])
        have = all(os.path.exists(os.path.join(assets, fid + x)) for x in ('.jpg', '.mp4'))
        entry = {'id': fid, 'title': title_from(f['name'], c), 'name': f['name'],
                 'drive': f'https://drive.google.com/file/d/{fid}/view'}
        if c.get('pv'): entry['pv'] = c['pv']
        if old and have and old.get('size') == f.get('size') and old.get('width') and old.get('pv', 1) == c.get('pv', 1):
            entry.update({k: old[k] for k in ('poster', 'preview', 'width', 'height', 'duration', 'size')})
        else:
            log(f'[{c["dir"]}] processing {fid} ({f["name"]}, {f.get("size", 0) // 1_000_000} MB)')
            with tempfile.TemporaryDirectory() as tmp:
                src = os.path.join(tmp, 'video')
                info = probe(src) if download(fid, src) else None
                if info:
                    render(src, fid, info, assets, c['preview'], c.get('preview_size'))
                    entry.update({'poster': f'/assets/{c["dir"]}/{fid}.jpg', 'preview': f'/assets/{c["dir"]}/{fid}.mp4',
                                  'width': info['width'], 'height': info['height'],
                                  'duration': round(info['duration'], 1), 'size': f.get('size')})
                else:
                    # still list it with Drive's own thumbnail; the next run retries the preview
                    entry.update({'poster': f'https://drive.google.com/thumbnail?id={fid}&sz=w1000', 'preview': '',
                                  'width': 0, 'height': 0, 'duration': 0, 'size': None})
        items.append(entry)

    keep = {e['id'] for e in items}
    for name in os.listdir(assets):
        if name.rsplit('.', 1)[0] not in keep:
            os.remove(os.path.join(assets, name)); log(f'[{c["dir"]}] removed {name}')

    old_items = json.load(open(out))[c['key']] if os.path.exists(out) else None
    if old_items != items:
        json.dump({'updated': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), c['key']: items},
                  open(out, 'w'), indent=2, ensure_ascii=False)
        log(f'[{c["dir"]}] {c["out"]} updated: {len(items)} videos')
    else:
        log(f'[{c["dir"]}] no changes')


def main():
    for c in COLLECTIONS:
        sync(c)


if __name__ == '__main__':
    sys.exit(main())
