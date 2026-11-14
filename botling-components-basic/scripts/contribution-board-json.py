#!/usr/bin/env python3
"""Read-only author contributions on the current project's HEAD.

Usage: contribution-board-json.py [repo_dir] (default: cwd's repository).
Day starts at local midnight; week/month cover the last 7/30 elapsed days,
through now. Dates and author names retain the original author-date semantics.
Expected Git acquisition failures return error JSON through the command-data
channel (exit 0), without periods or counts. Unexpected errors still propagate.
"""
import json
import math
import os
import re
import subprocess
import sys
from datetime import datetime


class CollectionError(Exception):
    """The source could not be read completely; its counts are unknown."""

    repo = None  # Set only after Git has identified the repository root.


# A bot may inherit Git's routing environment. The documented source is cwd (or
# the explicit repo argument), not a different GIT_DIR left by its parent.
GIT_ROUTING = (
    'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE',
)
HASH = re.compile(r'(?:[0-9a-f]{40}|[0-9a-f]{64})\Z')


def run_git(repo, *args, timeout=10, input=None, allowed=(0,)):
    env = {key: value for key, value in os.environ.items() if key not in GIT_ROUTING}
    try:
        result = subprocess.run(
            ['git', '--no-optional-locks', '--no-pager', '-c', 'log.showSignature=false', *args],
            cwd=repo, env=env, input=input, capture_output=True, text=True,
            encoding='utf-8', errors='replace', timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise CollectionError('Git read timed out; contribution counts are unknown.') from exc
    except OSError as exc:
        # Git/OS diagnostics can contain private paths, config or credentials.
        raise CollectionError('Git could not start or the repository is inaccessible.') from exc
    if result.returncode not in allowed:
        raise CollectionError('Git ' + args[0] + ' failed; contribution counts are unknown.')
    return result


def read_head(repo):
    # Count the project's main line, not whatever branch this checkout happens
    # to be on: a stale feature branch would hide everything merged since.
    for branch in ('main', 'master'):
        result = run_git(repo, 'rev-parse', '--verify', '--quiet', 'refs/heads/' + branch, allowed=(0, 1))
        if result.returncode == 0:
            head = result.stdout.strip()
            if HASH.fullmatch(head):
                return head, branch
            raise CollectionError('Git returned an invalid branch; counts are unknown.')
    result = run_git(repo, 'rev-parse', '--verify', '--quiet', 'HEAD', allowed=(0, 1))
    if result.returncode == 0:
        head = result.stdout.strip()
        if HASH.fullmatch(head):
            return head, 'HEAD'
        raise CollectionError('Git returned an invalid HEAD; counts are unknown.')
    # An initialized repo without a first commit is genuinely empty. A corrupt
    # or otherwise unreadable HEAD must not take the same path.
    ref = run_git(repo, 'symbolic-ref', '--quiet', 'HEAD').stdout.strip()
    missing = run_git(repo, 'show-ref', '--verify', '--quiet', ref, allowed=(0, 1))
    if missing.returncode == 1:
        return None, 'HEAD'
    raise CollectionError('Cannot resolve project HEAD; counts are unknown.')


def read_commits(repo, head, start, end):
    if head is None:
        return {}
    # Git's --since filters COMMITTER dates and can stop walking early at an
    # older commit. Read cheap metadata for all reachable commits instead, then
    # request numstat only for author dates in the complete rolling month.
    raw = run_git(repo, 'log', '--no-merges', '-z', '--format=%H%x00%an%x00%at',
                  head, '--').stdout
    fields = raw.split('\0')
    if not fields or fields[-1] != '' or (len(fields) - 1) % 3:
        raise CollectionError('Incomplete Git metadata; counts are unknown.')
    commits = {}
    for i in range(0, len(fields) - 1, 3):
        commit, name, stamp = fields[i:i + 3]
        if not HASH.fullmatch(commit) or not re.fullmatch(r'-?\d+', stamp):
            raise CollectionError('Invalid Git metadata; counts are unknown.')
        ts = int(stamp)
        if start <= ts <= end:
            commits[commit] = {'name': name or 'unknown', 'ts': ts, 'added': 0, 'deleted': 0}
    if not commits:
        return commits

    # Count the initial commit against the empty tree even when the user's
    # log.showRoot setting hides root diffs in their interactive Git log.
    raw = run_git(repo, 'log', '--no-walk=unsorted', '--stdin', '--no-merges', '--root',
                  '--no-ext-diff', '--no-textconv', '--no-color', '--numstat', '-z',
                  '--format=%x00COMMIT%x00%H', '--',
                  input='\n'.join(commits) + '\n', timeout=35).stdout
    # NUL framing keeps tabs/newlines/control characters in paths and names
    # from becoming fake records. A rename has two extra path tokens.
    tokens = raw.split('\0')
    if tokens[-1] != '':
        raise CollectionError('Incomplete Git statistics; counts are unknown.')
    seen, current, i = set(), None, 0
    while i < len(tokens) - 1:
        token = tokens[i]
        if token == '':
            if i + 2 >= len(tokens) - 1 or tokens[i + 1] != 'COMMIT':
                raise CollectionError('Invalid Git commit frame; counts are unknown.')
            commit = tokens[i + 2]
            if commit not in commits or commit in seen:
                raise CollectionError('Unexpected Git commit; counts are unknown.')
            seen.add(commit)
            current = commits[commit]
            i += 3
            continue
        parts = token.lstrip('\n').split('\t', 2)
        if current is None or len(parts) != 3:
            raise CollectionError('Invalid Git numstat; counts are unknown.')
        added, deleted, path = parts
        if added == deleted == '-':  # Binary files contribute commits, not lines.
            added = deleted = 0
        elif added.isascii() and added.isdigit() and deleted.isascii() and deleted.isdigit():
            added, deleted = int(added), int(deleted)
        else:
            raise CollectionError('Invalid Git line counts; counts are unknown.')
        current['added'] += added
        current['deleted'] += deleted
        i += 1
        if path == '':  # -z numstat's rename/copy form: counts, old path, new path.
            if i + 1 >= len(tokens) - 1 or not tokens[i] or not tokens[i + 1]:
                raise CollectionError('Incomplete Git rename; counts are unknown.')
            i += 2
    if seen != set(commits):
        raise CollectionError('Missing Git statistics; counts are unknown.')
    return commits


def collect(repo_dir, now=None):
    try:
        repo = os.path.abspath(os.path.expanduser(repo_dir))
    except OSError as exc:
        raise CollectionError('The project directory is inaccessible.') from exc
    repo = run_git(repo, 'rev-parse', '--show-toplevel').stdout.rstrip('\n')
    if not repo:
        raise CollectionError('No project repository found; counts are unknown.')
    try:
        return collect_repository(repo, now)
    except CollectionError as exc:
        exc.repo = repo
        raise


def collect_repository(repo, now):
    head, scope = read_head(repo)
    now = now or datetime.now().astimezone()
    end = now.timestamp()
    # Resolve midnight using the system timezone at MIDNIGHT, not the current
    # UTC offset: those differ on daylight-saving transition days.
    midnight = datetime.fromtimestamp(end).replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    starts = {'day': midnight, 'week': end - 7 * 86400, 'month': end - 30 * 86400}
    commits = read_commits(repo, head, starts['month'], end)
    periods = {}
    for key, start in starts.items():
        count = {'day': 24, 'week': 7, 'month': 30}[key]
        trend, authors = [0] * count, {}
        for commit in commits.values():
            if commit['ts'] < start:
                continue
            author = authors.setdefault(commit['name'],
                                        {'name': commit['name'], 'commits': 0, 'added': 0, 'deleted': 0})
            author['commits'] += 1
            author['added'] += commit['added']
            author['deleted'] += commit['deleted']
            if key == 'day':
                bucket = datetime.fromtimestamp(commit['ts']).hour
            else:
                # Right-closed 24h buckets include the exact oldest boundary.
                bucket = max(0, count - max(1, math.ceil((end - commit['ts']) / 86400)))
            trend[bucket] += 1
        ranked = sorted(authors.values(), key=lambda a: (-(a['added'] + a['deleted']), -a['commits'], a['name']))
        periods[key] = {
            'authors': ranked,
            'totals': {'commits': sum(a['commits'] for a in ranked), 'added': sum(a['added'] for a in ranked),
                       'deleted': sum(a['deleted'] for a in ranked), 'authors': len(ranked)},
            'trend': trend,
        }
    return {'repo': os.path.basename(repo), 'repoPath': repo, 'revision': head, 'scope': scope,
            'dateBasis': 'author', 'generated': datetime.fromtimestamp(end).astimezone().isoformat(timespec='seconds'),
            'periods': periods}


def main():
    if len(sys.argv) > 2:
        print('Usage: contribution-board-json.py [repo_dir]', file=sys.stderr)
        return 2
    try:
        data = collect(sys.argv[1] if len(sys.argv) == 2 else '.')
    except CollectionError as exc:
        # The host only passes successful command output to the component.
        # These details are collector-authored, never raw Git/OS diagnostics.
        data = {'status': 'error', 'error': 'Git read failed', 'detail': str(exc)[:240]}
        if exc.repo:
            data.update(repo=os.path.basename(exc.repo), repoPath=exc.repo)
    print(json.dumps(data, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
