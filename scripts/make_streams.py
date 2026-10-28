"""Make the full-length copies the website plays directly.

For every video on the site (the synced collections plus the hand-made project pages) this makes two files:
  <id>-hd.mp4  up to 1080p (short side), sharp, for normal connections
  <id>-sd.mp4  480p (short side), light, for slow connections or Data Saver
Both are H.264/AAC with the index at the front so they start playing straight away.
They are uploaded to the GitHub release "videos" (served as video/mp4) and listed in streams.json,
which player.js reads to choose the quality.

Usage:
  python3 scripts/make_streams.py plan N          -> prints the shard plan (JSON) for N parallel jobs
  python3 scripts/make_streams.py run I N         -> encodes shard I of N, writes streams-part-I.json
  python3 scripts/make_streams.py merge PARTS...  -> merges parts into streams.json
Needs ffmpeg, DRIVE_API_KEY (to read Drive) and GITHUB_TOKEN + GITHUB_REPOSITORY (to upload).
"""
import glob, json, os, re, subprocess, sys, tempfile, time, urllib.error, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sync_videos as sv   # reuse Drive download and probe

ROOT = sv.ROOT
MANIFEST = os.path.join(ROOT, 'streams.json')
TAG = 'videos'
MAX_ASSET = 1_950_000_000           # GitHub release files must stay under 2 GB
BUDGET = float(os.environ.get('STREAM_BUDGET_MIN', '330')) * 60   # stop starting new videos after this long
T0 = time.time()

COLLECTION_FILES = [('events/events.json', 'events'), ('brand-films/films.json', 'films'), ('ads/ads.json', 'ads'),
                    ('interviews/interviews.json', 'interviews'), ('more/more.json', 'videos'),
                    ('social/social.json', 'reels'), ('features/features.json', 'features')]


LOG = []


def log(*a):
    line = ' '.join(str(x) for x in a)
    LOG.append(time.strftime('%H:%M:%S ') + line)
    print(line, flush=True)


def load_manifest():
    try:
        return json.load(open(MANIFEST))
    except Exception:
        return {'videos': {}}


def all_videos():
    """Every Drive video the site can play: id -> {duration, size(bytes of the Drive original or 0)}."""
    vids = {}
    sizes = {}
    for src in glob.glob(os.path.join(ROOT, '*', 'sources.json')) + glob.glob(os.path.join(ROOT, '*', 'extra.json')):
        try:
            for f in json.load(open(src)).get('files', []):
                sizes[f['id']] = int(f.get('size') or 0)
        except Exception:
            pass
    for path, key in COLLECTION_FILES:
        p = os.path.join(ROOT, path)
        if not os.path.exists(p): continue
        for e in json.load(open(p)).get(key, []):
            if e.get('id'):
                vids[e['id']] = {'duration': e.get('duration') or 60, 'size': sizes.get(e['id'], e.get('size') or 0)}
    for page in glob.glob(os.path.join(ROOT, 'projects', '*.html')):
        for fid in re.findall(r'drive\.google\.com/file/d/([A-Za-z0-9_-]{20,})/', open(page, encoding='utf-8').read()):
            vids.setdefault(fid, {'duration': 120, 'size': sizes.get(fid, 0)})
    return vids


def todo(vids, man):
    out = []
    for fid, v in vids.items():
        m = man['videos'].get(fid)
        if m and (not v['size'] or not m.get('src') or m['src'] == v['size']):
            continue
        out.append(fid)
    return out


def plan(n):
    vids, man = all_videos(), load_manifest()
    need = sorted(todo(vids, man), key=lambda f: -vids[f]['duration'])
    bins = [[] for _ in range(n)]
    load = [0.0] * n
    for f in need:
        i = load.index(min(load)); bins[i].append(f); load[i] += vids[f]['duration']
    return {'shards': bins, 'minutes': [round(x / 60) for x in load], 'total': len(need)}


# ---------- GitHub release ----------
def gh(method, url, data=None, headers=None):
    h = {'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'], 'Accept': 'application/vnd.github+json',
         'X-GitHub-Api-Version': '2022-11-28', **(headers or {})}
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=3600) as r:
        body = r.read()
        return json.loads(body) if body else None


def release():
    repo = os.environ['GITHUB_REPOSITORY']
    try:
        return gh('GET', f'https://api.github.com/repos/{repo}/releases/tags/{TAG}')
    except urllib.error.HTTPError as e:
        if e.code != 404: raise
    body = json.dumps({'tag_name': TAG, 'name': 'Website videos',
                       'body': 'Full-length HD and SD copies of the portfolio videos, played by the website. Made automatically from Google Drive; do not edit by hand.',
                       'prerelease': True}).encode()
    try:
        return gh('POST', f'https://api.github.com/repos/{repo}/releases', body, {'Content-Type': 'application/json'})
    except urllib.error.HTTPError:
        time.sleep(5)   # another job created it at the same moment
        return gh('GET', f'https://api.github.com/repos/{repo}/releases/tags/{TAG}')


def upload(rel, path, name, ctype='video/mp4'):
    repo = os.environ['GITHUB_REPOSITORY']
    assets = gh('GET', f'https://api.github.com/repos/{repo}/releases/{rel["id"]}/assets?per_page=100')
    page = 2
    while assets and len(assets) % 100 == 0:
        more = gh('GET', f'https://api.github.com/repos/{repo}/releases/{rel["id"]}/assets?per_page=100&page={page}')
        if not more: break
        assets += more; page += 1
    for a in assets or []:
        if a['name'] == name:
            gh('DELETE', a['url'])
    size = os.path.getsize(path)
    for attempt in range(3):
        try:
            with open(path, 'rb') as f:
                req = urllib.request.Request(
                    f'https://uploads.github.com/repos/{repo}/releases/{rel["id"]}/assets?name={urllib.parse.quote(name)}',
                    data=f, method='POST',
                    headers={'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'], 'Content-Type': ctype,
                             'Content-Length': str(size), 'Accept': 'application/vnd.github+json'})
                with urllib.request.urlopen(req, timeout=3600) as r:
                    return json.load(r)
        except Exception as e:
            log(f'  upload of {name} failed ({e}), retrying')
            time.sleep(10 * (attempt + 1))
    raise RuntimeError('upload failed: ' + name)


# ---------- encoding ----------
def scale(short):
    s = str(short)
    return (f"scale='if(gte(iw,ih),-2,trunc(min({s},iw)/2)*2)':'if(gte(iw,ih),trunc(min({s},ih)/2)*2,-2)':flags=lanczos,"
            "format=yuv420p")


def encode(src, dur, hd, sd):
    long = dur > 1500
    cap = 6000 if not long else max(1200, min(6000, int(MAX_ASSET * 0.94 * 8 / dur / 1000) - 160))
    hd_opts = ['-c:v', 'libx264', '-preset', 'veryfast' if long else 'medium', '-crf', '23' if long else '21',
               '-maxrate', f'{cap}k', '-bufsize', f'{cap * 2}k', '-profile:v', 'high', '-level', '4.1',
               '-force_key_frames', 'expr:gte(t,n_forced*2)', '-c:a', 'aac', '-b:a', '160k', '-ac', '2',
               '-movflags', '+faststart']
    sd_opts = ['-c:v', 'libx264', '-preset', 'veryfast' if long else 'medium', '-crf', '27',
               '-maxrate', '1000k', '-bufsize', '2000k', '-profile:v', 'main',
               '-force_key_frames', 'expr:gte(t,n_forced*2)', '-c:a', 'aac', '-b:a', '96k', '-ac', '2',
               '-movflags', '+faststart']
    fc = f'[0:v]split=2[a][b];[a]{scale(1080)}[hd];[b]{scale(480)}[sd]'
    cmd = ['ffmpeg', '-v', 'error', '-stats_period', '30', '-stats', '-y', *sv.net(src), '-i', src, '-filter_complex', fc,
           '-map', '[hd]', '-map', '0:a:0?', *hd_opts, hd, '-map', '[sd]', '-map', '0:a:0?', *sd_opts, sd]
    subprocess.run(cmd, check=True)


class QuotaError(Exception):
    pass


PER_RUN = int(os.environ.get('STREAM_PER_RUN', '3'))   # Drive limits downloads, so a few videos per run


def fetch(fid, dest, errors):
    """Download the Drive original, waiting and retrying when Drive asks us to slow down."""
    urls = []
    if sv.KEY:
        urls.append(('api', f'https://www.googleapis.com/drive/v3/files/{fid}?alt=media&key={sv.KEY}'))
    urls.append(('web', f'https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t'))
    for attempt in range(3):
        for name, url in urls:
            try:
                req = urllib.request.Request(url, headers=sv.UA)
                with urllib.request.urlopen(req, timeout=900) as r, open(dest, 'wb') as out:
                    ctype = r.headers.get('Content-Type') or ''
                    if 'text/html' in ctype:
                        page = r.read(400000).decode('utf-8', 'replace')
                        m = re.search(r'name="uuid" value="([^"]+)"', page)
                        if m and name == 'web':   # big files: Drive asks to confirm once more
                            url2 = url + '&uuid=' + m.group(1)
                            with urllib.request.urlopen(urllib.request.Request(url2, headers=sv.UA), timeout=900) as r2:
                                if 'text/html' in (r2.headers.get('Content-Type') or ''):
                                    raise ValueError('Drive returned a web page')
                                while True:
                                    chunk = r2.read(1 << 20)
                                    if not chunk: break
                                    out.write(chunk)
                        else:
                            raise ValueError('Drive returned a web page: ' + re.sub(r'\s+', ' ', re.sub('<[^>]+>', ' ', page))[:160])
                    else:
                        while True:
                            chunk = r.read(1 << 20)
                            if not chunk: break
                            out.write(chunk)
                if sv.probe(dest):
                    return True
                errors.append(f'{name}: downloaded file is not a readable video')
            except urllib.error.HTTPError as e:
                body = ''
                try: body = e.read(300).decode('utf-8', 'replace')
                except Exception: pass
                body = re.sub(r'\s+', ' ', body)[:160]
                errors.append(f'{name}: HTTP {e.code} {body}')
            except Exception as e:
                errors.append(f'{name}: {e}'[:200])
        if any('Quota exceeded' in x for x in errors[-len(urls):]):
            raise QuotaError('Drive download quota reached')
        if attempt == 2: break
        wait = 20 * (3 ** attempt)
        log(f'  Drive refused ({errors[-1]}); waiting {wait}s')
        time.sleep(wait)
    return False


def info(path, dur):
    d = sv.probe(path) or {}
    size = os.path.getsize(path)
    return {'w': d.get('width'), 'h': d.get('height'), 'kbps': int(size * 8 / max(dur, 1) / 1000), 'mb': round(size / 1e6, 1)}


def run(i, n):
    vids, man = all_videos(), load_manifest()
    mine = plan(n)['shards'][i]
    log(f'shard {i}/{n}: {len(mine)} videos')
    out_path = os.path.join(ROOT, f'streams-part-{i}.json')
    done, failed = {}, {}
    if not mine:
        json.dump(done, open(out_path, 'w')); return
    rel = release()
    work = os.environ.get('STREAM_WORK') or tempfile.gettempdir()
    for n, fid in enumerate(mine):
        if n >= PER_RUN:
            log(f'{PER_RUN} videos done this run; the rest follow on the next runs'); break
        if time.time() - T0 > BUDGET:
            log('time budget used; the rest will be made on the next run'); break
        log(f'== {fid} ({vids[fid]["duration"]:.0f}s)')
        src = os.path.join(work, fid + '.src')
        try:
            errors = []
            path = src if fetch(fid, src, errors) else sv.drive_url(fid)
            meta = sv.probe(path)
            if not meta:
                failed[fid] = ' | '.join(errors[-3:]) or 'could not read the video'
                log('  could not read this video; skipped: ' + failed[fid]); save_log(rel, i); continue
            dur = meta['duration']
            hd, sd = os.path.join(work, fid + '-hd.mp4'), os.path.join(work, fid + '-sd.mp4')
            encode(path, dur, hd, sd)
            if os.path.getsize(hd) > MAX_ASSET:
                failed[fid] = 'HD copy over 2 GB'
                log('  HD copy too big for a release file; skipped'); continue
            upload(rel, hd, fid + '-hd.mp4')
            upload(rel, sd, fid + '-sd.mp4')
            done[fid] = {'d': round(dur, 1), 'src': vids[fid]['size'], 'hd': info(hd, dur), 'sd': info(sd, dur),
                         't': int(time.time())}
            log(f'  done: HD {done[fid]["hd"]} SD {done[fid]["sd"]}')
            json.dump({**done, '_failed': failed}, open(out_path, 'w'), indent=1)   # keep progress if the job is stopped
        except QuotaError:
            log('  Drive download quota reached; stopping until the next run'); break
        except Exception as e:
            failed[fid] = str(e)[:300]
            log(f'  failed: {e}'); save_log(rel, i)
        finally:
            for f in glob.glob(os.path.join(work, fid + '*')):
                try: os.remove(f)
                except OSError: pass
    json.dump({**done, '_failed': failed}, open(out_path, 'w'), indent=1)
    save_log(rel, i)


def save_log(rel, i):
    try:
        p = os.path.join(tempfile.gettempdir(), f'log-{i}.txt')
        open(p, 'w').write('\n'.join(LOG) + '\n')
        upload(rel, p, f'log-{i}.txt', 'text/plain')
    except Exception as e:
        print('could not save log', e)


def merge(parts):
    man = load_manifest()
    man.setdefault('videos', {})
    repo = os.environ.get('GITHUB_REPOSITORY', 'shubhamshetty77778-sketch/shubhamshetty77778-sketch.github.io')
    man['base'] = f'https://github.com/{repo}/releases/download/{TAG}/'
    added = 0
    for p in parts:
        try:
            d = json.load(open(p))
        except Exception:
            continue
        for k, v in d.items():
            if k == '_failed':
                man.setdefault('failed', {}).update(v); continue
            man['videos'][k] = v; added += 1
            man.get('failed', {}).pop(k, None)
    man['videos'] = dict(sorted(man['videos'].items()))
    json.dump(man, open(MANIFEST, 'w'), indent=1)
    log(f'streams.json: {len(man["videos"])} videos ({added} new or updated)')


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'plan':
        p = plan(int(sys.argv[2]))
        print(json.dumps(p))
    elif cmd == 'run':
        run(int(sys.argv[2]), int(sys.argv[3]))
    elif cmd == 'merge':
        merge(sys.argv[2:])
