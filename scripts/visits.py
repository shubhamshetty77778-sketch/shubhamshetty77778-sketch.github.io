"""Visitor counts and email notifications.

visits.js sends one ntfy message per visitor per day. This script (run hourly by
.github/workflows/visits.yml) collects those messages into visits/log.json, which the
private stats page (visits.html) reads, and emails the owner:
  collect  - add new visits to the log; email a short "new visitors" alert if there are any
  digest   - email the day's summary with totals

Email is sent through Gmail SMTP with an app password, set as repository secrets:
  MAIL_USERNAME  the Gmail address that sends the email
  MAIL_PASSWORD  its 16-character app password
Until those exist the log and the stats page still work; emails are skipped.
"""
import json, os, re, smtplib, sys, time, urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.path.join(ROOT, 'visits', 'log.json')
TOPIC = 'ss-portfolio-sh2gtrcxui2m'
TO = os.environ.get('NOTIFY_TO', 'shubhamshetty653@gmail.com')
SITE = 'https://shubhamshetty77778-sketch.github.io'
IST = timezone(timedelta(hours=5, minutes=30))
PAT = re.compile(r'Opened "(?P<page>.*?)" on an? (?P<device>\w+) · came from (?P<src>.*?)(?: · time zone (?P<tz>.*))?$')


def load():
    try:
        return json.load(open(LOG))
    except Exception:
        return {'visits': []}


def save(data):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    data['visits'].sort(key=lambda v: v['t'])
    data['updated'] = int(datetime.now(timezone.utc).timestamp())
    json.dump(data, open(LOG, 'w'), indent=0, ensure_ascii=False)


def poll():
    url = f'https://ntfy.sh/{TOPIC}/json?poll=1&since=all'
    req = urllib.request.Request(url, headers={'User-Agent': 'portfolio-visits'})
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


def parse(m):
    p = PAT.match((m.get('message') or '').strip())
    v = {'id': m['id'], 't': int(m['time'])}
    if p:
        v.update(page=p['page'], device=p['device'], src=p['src'], tz=(p['tz'] or '').strip())
    else:
        v.update(page='', device='', src='', tz='', raw=(m.get('message') or '')[:200])
    return v


def when(t):
    return datetime.fromtimestamp(t, IST)


def describe(v):
    place = f", {v['tz']}" if v.get('tz') else ''
    return f"{when(v['t']).strftime('%I:%M %p').lstrip('0')}  {v['page'] or 'a page'} · {v['device'] or 'device'} · from {v['src'] or 'unknown'}{place}"


def send(subject, body):
    user, pw = os.environ.get('MAIL_USERNAME', '').strip(), os.environ.get('MAIL_PASSWORD', '').replace(' ', '').strip()
    if not user or not pw:
        print('email skipped: MAIL_USERNAME / MAIL_PASSWORD not set. It would have said:\n' + subject + '\n' + body)
        return False
    msg = MIMEText(body, 'plain', 'utf-8')
    msg['Subject'], msg['From'], msg['To'] = subject, f'Portfolio visits <{user}>', TO
    errors = []
    for attempt in ('starttls', 'ssl', 'starttls'):
        try:
            if attempt == 'ssl':
                s = smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=60)
            else:
                s = smtplib.SMTP('smtp.gmail.com', 587, timeout=60); s.ehlo(); s.starttls(); s.ehlo()
            with s:
                s.login(user, pw)
                s.sendmail(user, [TO], msg.as_string())
            print('email sent:', subject)
            return True
        except smtplib.SMTPAuthenticationError as e:
            raise RuntimeError(f'Gmail did not accept the address or app password ({e.smtp_code})') from e
        except Exception as e:
            errors.append(f'{attempt}: {e}')
            time.sleep(5)
    raise RuntimeError('could not reach Gmail: ' + ' | '.join(errors))


def collect():
    data = load()
    known = {v['id'] for v in data['visits']}
    new = [parse(m) for m in poll() if m['id'] not in known]
    if not new:
        print('no new visits'); return
    data['visits'] += new
    save(data)
    print(f'{len(new)} new visit(s)')
    if os.environ.get('SEND_ALERTS', '1') != '1':
        return
    new.sort(key=lambda v: v['t'])
    today = when(datetime.now(timezone.utc).timestamp()).date()
    today_n = sum(1 for v in data['visits'] if when(v['t']).date() == today)
    n = len(new)
    subject = f"{n} new visitor{'s' if n != 1 else ''} on your portfolio"
    body = (f"{n} new visitor{'s' if n != 1 else ''} since the last check:\n\n" + '\n'.join(describe(v) for v in new) +
            f"\n\nToday so far: {today_n}. All time: {len(data['visits'])}.\nSee all visits: {SITE}/visits.html\n")
    send(subject, body)


def digest():
    data = load()
    now = when(datetime.now(timezone.utc).timestamp())
    today = now.date()
    def on(d):
        return [v for v in data['visits'] if when(v['t']).date() == d]
    tv = on(today)
    week = [v for v in data['visits'] if (today - when(v['t']).date()).days < 7]
    month = [v for v in data['visits'] if (today - when(v['t']).date()).days < 30]
    def top(vs, key, k=5):
        c = Counter(v.get(key) or 'unknown' for v in vs)
        return '\n'.join(f'  {n}  {name}' for name, n in c.most_common(k)) or '  none'
    yest = len(on(today - timedelta(days=1)))
    lines = [
        f"Visitors on {today.strftime('%d %b %Y')}: {len(tv)} (yesterday {yest})",
        f"Last 7 days: {len(week)}   Last 30 days: {len(month)}   All time: {len(data['visits'])}",
        '', 'Pages opened today:', top(tv, 'page'),
        '', 'Where they came from:', top(tv, 'src'),
        '', 'Devices:', top(tv, 'device', 3),
        '', 'Visitors today:', '\n'.join('  ' + describe(v) for v in sorted(tv, key=lambda v: v['t'])) or '  none',
        '', f'See all visits: {SITE}/visits.html',
    ]
    send(f"Portfolio today: {len(tv)} visitor{'s' if len(tv) != 1 else ''}", '\n'.join(lines) + '\n')


def test():
    """One-off check that email works; fails the run if the secrets are missing or Gmail refuses them."""
    data = load()
    if not os.environ.get('MAIL_USERNAME', '').strip() or not os.environ.get('MAIL_PASSWORD', '').strip():
        missing = [n for n in ('MAIL_USERNAME', 'MAIL_PASSWORD') if not os.environ.get(n, '').strip()]
        print('::error::Secrets not found: ' + ', '.join(missing)); sys.exit(1)
    try:
        ok = send('Visitor emails are set up',
              'Your portfolio will now email you when someone visits (checked every hour) and send a summary each evening.\n\n'
              f"Visits recorded so far: {len(data['visits'])}.\nSee them any time: {SITE}/visits.html\n")
    except Exception as e:
        print('::error::Gmail refused: ' + str(e)[:300]); sys.exit(1)
    print('::notice::Test email sent to ' + TO)


if __name__ == '__main__':
    {'collect': collect, 'digest': digest, 'test': test}[sys.argv[1]]()
