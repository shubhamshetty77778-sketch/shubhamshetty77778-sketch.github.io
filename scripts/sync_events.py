"""Sync the Events section with videos named "Event…" in the Google Drive Portfolio folder.

events/sources.json  - the Drive files that count as events (id, name, size, times), newest first.
                       Updated here when DRIVE_API_KEY is set, otherwise by the daily Drive check.
events/events.json   - what the website reads: title, poster, preview clip and size for each event.
assets/events/       - poster (<id>.jpg) and 8-second silent preview (<id>.mp4) for each event.

Only the Python standard library and ffmpeg are needed.
"""
import json, os, re, subprocess, sys, tempfile, urllib.parse, urllib.request
from datetime import datetime, timezone

FOLDER_ID = '1VeaXvPleEwLOva3C3M8-EG88hO2gtusN'   # Drive: Portfolio
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = os.path.join(ROOT, 'events', 'sources.json')
OUT = os.path.join(ROOT, 'events', 'events.json')
ASSETS = os.path.join(ROOT, 'assets', 'events')
KEY = os.environ.get('DRIVE_API_KEY', '').strip()
EVENT_NAME = re.compile(r'(^|[^a-z])events?([^a-z]|$)', re.I)
UA = {'User-Agent': 'Mozilla/5.0 (portfolio event sync)'}


def log(*a):
    print(*a, flush=True)


def list_drive():
    """List event videos in the folder with the Drive API (needs DRIVE_API_KEY)."""
    files, token = [], None
    q = f"'{FOLDER_ID}' in parents and trashed = false and mimeType contains 'video/'"
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
    events = [{'id': f['id'], 'name': f['name'], 'size': int(f.get('size', 0)),
               'createdTime': f.get('createdTime', ''), 'modifiedTime': f.get('modifiedTime', '')}
              for f in files if EVENT_NAME.search(f['name'])]
    return events


def title_from(name):
    """'Event - Graduation Day 2026.mp4' -> 'Graduation Day 2026'; 'Event.mp4' -> 'Event highlights'."""
    base = re.sub(r'\.[A-Za-z0-9]{2,4}$', '', name)
    rest = re.sub(r'^\s*events?(?![a-z])', '', base, flags=re.I)
    rest = re.sub(r'^[\s.\-_:|–—]+|[\s.\-_:|–—]+$', '', rest)
    return rest or 'Event highlights'


def download(fid, dest):
    urls = []
    if KEY:
        urls.append(f'https://www.googleapis.com/drive/v3/files/{fid}?alt=media&key={KEY}')
    urls.append(f'https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t')
    for url in urls:
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r, open(dest, 'wb') as out:
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


def render(src, fid, info):
    dur = info['duration']
    poster, preview = os.path.join(ASSETS, fid + '.jpg'), os.path.join(ASSETS, fid + '.mp4')
    scale = 'scale=-2:1000' if info['height'] >= info['width'] else 'scale=1000:-2'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{dur * 0.3:.2f}', '-i', src, '-frames:v', '1',
                    '-vf', scale, '-q:v', '4', poster], check=True)
    start = max(0.0, min(dur * 0.18, dur - 8.5))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{start:.2f}', '-t', '8', '-i', src, '-an', '-vf',
                    'scale=360:640:force_original_aspect_ratio=decrease,pad=360:640:(ow-iw)/2:(oh-ih)/2:color=0x0b0d11,fps=24,format=yuv420p',
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-profile:v', 'main', '-movflags', '+faststart',
                    preview], check=True)


def main():
    os.makedirs(ASSETS, exist_ok=True)
    if KEY:
        try:
            files = list_drive()
            json.dump({'folder': FOLDER_ID, 'files': files}, open(SOURCES, 'w'), indent=2)
            log(f'Drive lists {len(files)} event videos')
        except Exception as e:
            log(f'Could not list Drive ({e}); using events/sources.json')
    files = json.load(open(SOURCES))['files']
    previous = {e['id']: e for e in json.load(open(OUT))['events']} if os.path.exists(OUT) else {}

    events = []
    for f in files:
        fid, old = f['id'], previous.get(f['id'])
        have = os.path.exists(os.path.join(ASSETS, fid + '.jpg')) and os.path.exists(os.path.join(ASSETS, fid + '.mp4'))
        entry = {'id': fid, 'title': title_from(f['name']), 'name': f['name'],
                 'drive': f'https://drive.google.com/file/d/{fid}/view'}
        if old and have and old.get('size') == f.get('size') and old.get('width'):
            entry.update({k: old[k] for k in ('poster', 'preview', 'width', 'height', 'duration', 'size')})
        else:
            log(f'Processing {fid} ({f["name"]})')
            with tempfile.TemporaryDirectory() as tmp:
                src = os.path.join(tmp, 'video')
                info = probe(src) if download(fid, src) else None
                if info:
                    render(src, fid, info)
                    entry.update({'poster': f'/assets/events/{fid}.jpg', 'preview': f'/assets/events/{fid}.mp4',
                                  'width': info['width'], 'height': info['height'],
                                  'duration': round(info['duration'], 1), 'size': f.get('size')})
                else:
                    # still list it, using Drive's own thumbnail; the next run retries the preview
                    entry.update({'poster': f'https://drive.google.com/thumbnail?id={fid}&sz=w600', 'preview': '',
                                  'width': 0, 'height': 0, 'duration': 0, 'size': None})
        events.append(entry)

    keep = {e['id'] for e in events}
    for name in os.listdir(ASSETS):
        if name.rsplit('.', 1)[0] not in keep:
            os.remove(os.path.join(ASSETS, name)); log(f'Removed {name}')

    data = {'updated': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'events': events}
    old_events = json.load(open(OUT))['events'] if os.path.exists(OUT) else None
    if old_events != events:
        json.dump(data, open(OUT, 'w'), indent=2, ensure_ascii=False)
        log(f'events.json updated: {len(events)} events')
    else:
        log('No changes')


if __name__ == '__main__':
    sys.exit(main())
