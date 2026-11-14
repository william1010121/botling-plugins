#!/usr/bin/env python3
"""Print recent commits with files and diff as JSON for the commit-log component. Usage: git-log-json.py [N] [--no-diff]"""
import json, subprocess, sys

args = [a for a in sys.argv[1:] if not a.startswith('--')]
NO_DIFF = '--no-diff' in sys.argv
n = int(args[0]) if args else 20
MAX = 40000
TOTAL = 900000
S = '\x1e'

def git(*a):
    return subprocess.run(['git', '-c', 'core.quotepath=false', *a], capture_output=True, text=True, errors='replace').stdout

out = git('log', '-%d' % n, '--pretty=format:%h\x1f%an\x1f%ad\x1f%D\x1f%s' + S, '--date=short')
rows = []
for rec in out.split(S):
    rec = rec.strip('\n')
    if not rec:
        continue
    h, author, date, refs, subject = rec.split('\x1f', 4)
    status = {}
    for line in git('show', '--no-color', '--name-status', '--pretty=format:', h).splitlines():
        p = line.split('\t')
        if len(p) >= 2:
            status[p[-1]] = p[0][0]
    files = []
    for line in git('show', '--no-color', '--numstat', '--pretty=format:', h).splitlines():
        p = line.split('\t')
        if len(p) == 3:
            path = p[2]
            files.append({'path': path, 'status': status.get(path, 'M'),
                          'added': int(p[0]) if p[0].isdigit() else 0,
                          'deleted': int(p[1]) if p[1].isdigit() else 0})
    diff = '' if NO_DIFF else git('show', '--no-color', '--patch', '--pretty=format:', h).lstrip('\n')
    row = {'hash': h, 'author': author, 'date': date, 'subject': subject,
           'refs': [r for r in refs.split(', ') if r], 'files': files, 'diff': diff}
    if len(diff.encode('utf-8')) > MAX:
        row['diff'] = diff.encode('utf-8')[:MAX].decode('utf-8', 'ignore')
        row['truncated'] = True
    rows.append(row)

def dump():
    return json.dumps(rows, ensure_ascii=False)

# keep the whole output under the app's 1,000,000 byte limit
text = dump()
limit = MAX
while len(text.encode('utf-8')) > TOTAL and limit > 0:
    limit //= 2
    for r in rows:
        b = r['diff'].encode('utf-8')
        if len(b) > limit:
            r['diff'] = b[:limit].decode('utf-8', 'ignore')
            r['truncated'] = True
    text = dump()
print(text)
