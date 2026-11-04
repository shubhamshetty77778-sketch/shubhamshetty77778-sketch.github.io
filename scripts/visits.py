"""Visitor counts, visit details and email notifications.

visits.js sends two kinds of ntfy messages:
  arrivals  (TOPIC)    one per visitor per day: page, device, source, time zone, first visit or returning
  reports   (REPORTS)  while someone browses: pages seen, seconds with the site in view, full videos played
                       and seconds watched, first-visit date and visit number (the latest report of a visit wins)
This script (run hourly by .github/workflows/visits.yml) gathers both into visits/log.json, which the private
stats page (visits.html) reads, and emails the owner:
  collect  - add new messages; email the visits that have finished since the last email
  digest   - email the day's summary
  test     - send a test email (fails if the Gmail secrets are missing or refused)

Email goes through Gmail with an app password, set as repository secrets MAIL_USERNAME and MAIL_PASSWORD.
"""
import json, os, re, smtplib, sys, time, urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.path.join(ROOT, 'visits', 'log.json')
TOPIC = 'ss-portfolio-sh2gtrcxui2m'
REPORTS = 'ss-portfolio-sh2gtrcxui2m-r'
TO = os.environ.get('NOTIFY_TO', 'shubhamshetty653@gmail.com')
SITE = 'https://shubhamshetty77778-sketch.github.io'
IST = timezone(timedelta(hours=5, minutes=30))
PAT = re.compile(r'Opened "(?P<page>.*?)" on an? (?P<device>\w+) · came from (?P<src>.*?)'
                 r'(?: · time zone (?P<tz>.*?))?(?: · (?P<ret>first visit|returning \(visit (?P<n>\d+), first came (?P<first>[\d-]+)\)))?$')
DONE_AFTER = 10 * 60      # a visit counts as finished once no report has come for 10 minutes
NO_REPORT_AFTER = 30 * 60  # arrivals that never sent a report are emailed after 30 minutes


def now():
    return int(datetime.now(timezone.utc).timestamp())


def load():
    try:
        data = json.load(open(LOG))
    except Exception:
        data = {'visits': []}
    if 'sessions' not in data:                 # first run with visit reports: older arrivals were already emailed
        for v in data['visits']:
            v['mailed'] = True
        data['sessions'] = {}
    return data


def save(data):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    data['visits'].sort(key=lambda v: v['t'])
    data['updated'] = now()
    json.dump(data, open(LOG, 'w'), indent=0, ensure_ascii=False)


def poll(topic):
    req = urllib.request.Request(f'https://ntfy.sh/{topic}/json?poll=1&since=all', headers={'User-Agent': 'portfolio-visits'})
    out = []
    with urllib.request.urlopen(req, timeout=60) as r:
        for line in r.read().decode('utf-8').splitlines():
            try:
                m = json.loads(line)
            except Exception:
                continue
            if m.get('event') == 'message':
                out.append(m)
    return out


def parse_arrival(m):
    p = PAT.match((m.get('message') or '').strip())
    v = {'id': m['id'], 't': int(m['time'])}
    sid = next((t[2:] for t in m.get('tags') or [] if t.startswith('v-')), None)
    if sid:
        v['sid'] = sid
    if p:
        v.update(page=p['page'], device=p['device'], src=p['src'], tz=(p['tz'] or '').strip())
        if p['ret'] == 'first visit':
            v['n'] = 1
        elif p['n']:
            v['n'], v['first'] = int(p['n']), p['first']
    else:
        v.update(page='', device='', src='', tz='', raw=(m.get('message') or '')[:200])
    return v


def when(t):
    return datetime.fromtimestamp(t, IST)


def mmss(s):
    s = int(round(s or 0))
    if s >= 3600:
        return f'{s // 3600} h {s % 3600 // 60} min'
    return f'{s // 60}:{s % 60:02d}' if s < 600 else f'{s // 60} min'


def spent(s):
    s = int(s or 0)
    if s < 60:
        return f'{s} s'
    if s < 3600:
        return f'{s // 60} min {s % 60} s'
    return f'{s // 3600} h {s % 3600 // 60} min'


def ordinal(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def visit_lines(a, s):
    """Lines describing one visitor: arrival a (may be None) and visit report s (may be None)."""
    t = a['t'] if a else s['t0']
    device = (s or {}).get('device') or (a or {}).get('device') or 'device'
    src = (s or {}).get('from') or (a or {}).get('src') or 'unknown'
    tz = (s or {}).get('tz') or (a or {}).get('tz') or ''
    head = f"{when(t).strftime('%I:%M %p').lstrip('0')} · {device} · from {src}" + (f' · {tz}' if tz else '')
    n = (s or {}).get('n') or (a or {}).get('n')
    first = (s or {}).get('first') or (a or {}).get('first')
    if n == 1:
        who = 'First visit'
    elif n:
        who = f"Returning visitor ({ordinal(n)} visit, first came {datetime.strptime(first, '%Y-%m-%d').strftime('%d %b')})" if first else f'Returning visitor ({ordinal(n)} visit)'
    else:
        who = ''
    lines = [head]
    if who:
        lines.append('  ' + who)
    if s:
        pages = ' → '.join(s.get('pages') or []) or (a or {}).get('page', '')
        lines.append(f"  Time on site: {spent(s.get('secs'))}" + (f'   Pages: {pages}' if pages else ''))
        vids = [v for v in s.get('videos') or [] if v.get('s', 0) >= 1]
        if vids:
            for v in vids:
                pct = f" ({min(100, round(100 * v['s'] / v['d']))}%)" if v.get('d') else ''
                lines.append(f"  Watched: {v['t']} — {mmss(v['s'])}" + (f" of {mmss(v['d'])}" if v.get('d') else '') + pct)
        else:
            lines.append('  Did not play a full video')
    else:
        lines.append(f"  Opened: {(a or {}).get('page') or 'a page'} (no details sent; they may have left quickly)")
    return lines


def send(subject, body):
    user, pw = os.environ.get('MAIL_USERNAME', '').strip(), os.environ.get('MAIL_PASSWORD', '').replace(' ', '').strip()
    if not user or not pw:
        print('email skipped: MAIL_USERNAME / MAIL_PASSWORD not set. It would have said:\n' + subject + '\n' + body)
        return False
    msg = MIMEText(body, 'plain', 'utf-8')
    msg['Subject'], msg['From'], msg['To'] = subject, f'Portfolio visits <{user}>', TO
    errors = []
    for attempt in ('starttls', 'ssl', 'starttls'):
        stage = 'connect'
        try:
            if attempt == 'ssl':
                s = smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=60)
            else:
                s = smtplib.SMTP('smtp.gmail.com', 587, timeout=60); stage = 'hello'; s.ehlo(); stage = 'tls'; s.starttls(); s.ehlo()
            with s:
                stage = 'login'
                s.login(user, pw)
                stage = 'send'
                s.sendmail(user, [TO], msg.as_string())
            print('email sent:', subject)
            return True
        except smtplib.SMTPAuthenticationError as e:
            raise RuntimeError(f'Gmail did not accept the address or app password ({e.smtp_code})') from e
        except Exception as e:
            errors.append(f'{attempt} at {stage}: {type(e).__name__} {e}')
            time.sleep(5)
    raise RuntimeError('could not reach Gmail: ' + ' | '.join(errors))


def collect():
    data = load()
    changed = False
    known = {v['id'] for v in data['visits']}
    for m in poll(TOPIC):
        if m['id'] not in known:
            data['visits'].append(parse_arrival(m)); changed = True
    for m in poll(REPORTS):
        try:
            r = json.loads(m.get('message') or '')
            sid = str(r['sid'])[:16]
        except Exception:
            continue
        cur = data['sessions'].get(sid)
        t = int(m['time'])
        if cur and t <= cur.get('t1', 0):
            continue
        new = {k: r.get(k) for k in ('day', 'first', 'n', 'from', 'device', 'tz', 'secs', 'span', 'pages', 'videos')}
        new['t0'] = min(t, cur['t0']) if cur else t
        new['t1'] = t
        new['mailed'] = cur.get('mailed', False) if cur else False
        if cur and cur.get('mailed'):
            new['mailed'] = True
        data['sessions'][sid] = new
        changed = True
    if changed:
        save(data)

    # email the visits that have finished since the last email
    t_now = now()
    by_sid = {v['sid']: v for v in data['visits'] if v.get('sid')}
    blocks, mark = [], []
    for sid, s in sorted(data['sessions'].items(), key=lambda kv: kv[1]['t0']):
        if not s.get('mailed') and t_now - s['t1'] >= DONE_AFTER:
            blocks.append(visit_lines(by_sid.get(sid), s)); mark.append(s)
    for a in data['visits']:
        if not a.get('mailed') and (not a.get('sid') or a['sid'] not in data['sessions']) and t_now - a['t'] >= NO_REPORT_AFTER:
            blocks.append(visit_lines(a, None)); mark.append(a)
        elif a.get('sid') in data['sessions'] and data['sessions'][a['sid']].get('mailed'):
            a['mailed'] = True
    if not blocks:
        print('nothing new to email'); return
    if os.environ.get('SEND_ALERTS', '1') == '1':
        n = len(blocks)
        today = when(t_now).date()
        today_n = sum(1 for v in data['visits'] if when(v['t']).date() == today)
        body = '\n\n'.join('\n'.join(b) for b in blocks)
        body += f"\n\nVisitors today so far: {today_n}. All time: {len(data['visits'])}.\nSee all visits: {SITE}/visits.html\n"
        send(f"{n} {'visit' if n == 1 else 'visits'} on your portfolio", f"{'This visit has' if n == 1 else 'These visits have'} finished since the last email:\n\n" + body)
    for x in mark:
        x['mailed'] = True
    save(data)


def digest():
    data = load()
    today = when(now()).date()
    on_day = lambda d: [v for v in data['visits'] if when(v['t']).date() == d]
    tv = on_day(today)
    sess = {sid: s for sid, s in data['sessions'].items() if when(s['t0']).date() == today}
    week = sum(1 for v in data['visits'] if (today - when(v['t']).date()).days < 7)
    month = sum(1 for v in data['visits'] if (today - when(v['t']).date()).days < 30)
    first_timers = sum(1 for s in sess.values() if s.get('n') == 1)
    returning = sum(1 for s in sess.values() if (s.get('n') or 0) > 1)
    secs = [s.get('secs') or 0 for s in sess.values()]
    vids = defaultdict(lambda: {'plays': 0, 's': 0, 'd': 0, 'pct': []})
    for s in sess.values():
        for v in s.get('videos') or []:
            if v.get('s', 0) < 1:
                continue
            r = vids[v['t']]; r['plays'] += 1; r['s'] += v['s']; r['d'] = v.get('d') or r['d']
            if v.get('d'):
                r['pct'].append(min(100, 100 * v['s'] / v['d']))
    def top(vs, key, k=5):
        c = Counter(v.get(key) or 'unknown' for v in vs)
        return '\n'.join(f'  {n}  {name}' for name, n in c.most_common(k)) or '  none'
    lines = [
        f"Visitors on {today.strftime('%d %b %Y')}: {len(tv)} (yesterday {len(on_day(today - timedelta(days=1)))})",
        f'New: {first_timers}   Returning: {returning}',
        f"Average time on site: {spent(sum(secs) / len(secs)) if secs else '—'}   Total time: {spent(sum(secs)) if secs else '—'}",
        f"Last 7 days: {week}   Last 30 days: {month}   All time: {len(data['visits'])}",
        '', 'Videos watched today:',
        '\n'.join(f"  {r['plays']} {'play' if r['plays'] == 1 else 'plays'} · {mmss(r['s'])} watched" +
                  (f" · {round(sum(r['pct']) / len(r['pct']))}% of the video on average" if r['pct'] else '') + f'  {t}'
                  for t, r in sorted(vids.items(), key=lambda kv: -kv[1]['s'])) or '  none',
        '', 'Where they came from:', top(tv, 'src'),
        '', 'Devices:', top(tv, 'device', 3),
        '', 'Each visit today:',
    ]
    by_sid = {v['sid']: v for v in tv if v.get('sid')}
    shown = set()
    for sid, s in sorted(sess.items(), key=lambda kv: kv[1]['t0']):
        lines += visit_lines(by_sid.get(sid), s) + ['']
        shown.add(sid)
    for a in tv:
        if a.get('sid') not in shown:
            lines += visit_lines(a, data['sessions'].get(a.get('sid'))) + ['']
    if not sess and not tv:
        lines.append('  none')
    lines.append(f'See all visits: {SITE}/visits.html')
    send(f"Portfolio today: {len(tv)} visitor{'s' if len(tv) != 1 else ''}", '\n'.join(lines) + '\n')


def test():
    """One-off check that email works; fails the run if the secrets are missing or Gmail refuses them."""
    data = load()
    if not os.environ.get('MAIL_USERNAME', '').strip() or not os.environ.get('MAIL_PASSWORD', '').strip():
        missing = [n for n in ('MAIL_USERNAME', 'MAIL_PASSWORD') if not os.environ.get(n, '').strip()]
        print('::error::Secrets not found: ' + ', '.join(missing)); sys.exit(1)
    try:
        send('Visitor emails are set up',
             'Your portfolio will now email you when someone visits (checked every hour) and send a summary each evening.\n\n'
             f"Visits recorded so far: {len(data['visits'])}.\nSee them any time: {SITE}/visits.html\n")
    except Exception as e:
        p = os.environ['MAIL_PASSWORD'].replace(' ', '').strip()
        if not (len(p) == 16 and p.isalpha()):
            print('::warning::MAIL_PASSWORD is not a Google app password (16 letters).')
        print('::error::Gmail refused: ' + str(e)[:300]); sys.exit(1)
    print('::notice::Test email sent to ' + TO)


if __name__ == '__main__':
    {'collect': collect, 'digest': digest, 'test': test}[sys.argv[1]]()
