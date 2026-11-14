"""Focused collector regressions. All repository evidence is generated locally."""
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timedelta
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'contribution-board-json.py'
spec = importlib.util.spec_from_file_location('contribution_board', SCRIPT)
collector = importlib.util.module_from_spec(spec)


class CollectorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec.loader.exec_module(collector)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='contribution-board-fixture-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.repo = self.root / 'project'
        self.repo.mkdir()
        self.git('init', '-q', '-b', 'main')
        self.git('config', 'user.name', 'Fixture Author')
        self.git('config', 'user.email', 'fixture@example.invalid')
        self.git('config', 'commit.gpgsign', 'false')
        self.old_tz = os.environ.get('TZ')
        os.environ['TZ'] = 'Asia/Taipei'
        time.tzset()
        self.addCleanup(self.restore_tz)
        self.now = datetime.fromisoformat('2026-10-24T21:11:17+08:00')

    def restore_tz(self):
        if self.old_tz is None:
            os.environ.pop('TZ', None)
        else:
            os.environ['TZ'] = self.old_tz
        time.tzset()

    def git(self, *args, env=None, cwd=None):
        return subprocess.run(['git', '--no-optional-locks', *args], cwd=cwd or self.repo,
                              env=env, check=True, capture_output=True, text=True).stdout.strip()

    def commit(self, text, author_date, *, committer_date=None, author='Fixture Author', filename='file.txt'):
        (self.repo / filename).write_text(text)
        self.git('add', '--', filename)
        env = dict(os.environ, GIT_AUTHOR_NAME=author, GIT_COMMITTER_NAME=author,
                   GIT_AUTHOR_DATE=author_date, GIT_COMMITTER_DATE=committer_date or author_date)
        self.git('commit', '-qm', 'fixture', env=env)
        return self.git('rev-parse', 'HEAD')

    def collect(self, repo=None):
        return collector.collect(str(repo or self.repo), now=self.now)

    def cli(self, repo=None, env=None):
        return subprocess.run([sys.executable, str(SCRIPT), str(repo or self.repo)],
                              capture_output=True, text=True, env=env)

    def main(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(sys, 'argv', [str(SCRIPT), str(self.repo)]), \
                redirect_stdout(stdout), redirect_stderr(stderr):
            code = collector.main()
        self.assertEqual(code, 0)
        self.assertEqual(stderr.getvalue(), '')
        return json.loads(stdout.getvalue())

    def assert_error(self, data, *, known_repo=False):
        keys = {'status', 'error', 'detail'}
        if known_repo:
            keys.update(('repo', 'repoPath'))
            self.assertEqual(data['repo'], 'project')
            self.assertEqual(data['repoPath'], str(self.repo.resolve()))
        self.assertEqual(set(data), keys)
        self.assertEqual(data['status'], 'error')
        self.assertEqual(data['error'], 'Git read failed')
        self.assertTrue(data['detail'])
        self.assertLessEqual(len(data['detail']), 240)

    def assert_zero(self, data, *, unborn=False):
        self.assertEqual(set(data), {'repo', 'repoPath', 'revision', 'scope', 'dateBasis', 'generated', 'periods'})
        self.assertEqual(data['repo'], 'project')
        self.assertEqual(data['repoPath'], str(self.repo.resolve()))
        self.assertEqual(data['revision'], None if unborn else self.git('rev-parse', 'HEAD'))
        self.assertEqual(data['scope'], 'HEAD' if unborn else 'main')
        self.assertEqual(data['dateBasis'], 'author')
        self.assertEqual(set(data['periods']), {'day', 'week', 'month'})
        for key, length in (('day', 24), ('week', 7), ('month', 30)):
            self.assertEqual(data['periods'][key], {
                'authors': [], 'totals': {'commits': 0, 'added': 0, 'deleted': 0, 'authors': 0},
                'trend': [0] * length,
            })

    def test_nonzero_local_midnight_author_dates_and_future_exclusion(self):
        self.commit('before\n', '2026-10-23T23:59:59+08:00', author='Yesterday')
        self.commit('before\nmidnight\n', '2026-10-23T16:00:00Z', author='Boundary')
        self.commit('before\nmidnight\ntoday\n', '2026-10-24T20:00:00+08:00', author='Today')
        self.commit('before\nmidnight\ntoday\nfuture\n', '2026-10-25T00:00:00+08:00', author='Future')
        data = self.collect()
        day = data['periods']['day']
        self.assertEqual(day['totals'], {'commits': 2, 'added': 2, 'deleted': 0, 'authors': 2})
        self.assertEqual({a['name'] for a in day['authors']}, {'Boundary', 'Today'})
        self.assertEqual(day['trend'][0], 1)
        self.assertEqual(day['trend'][20], 1)
        self.assertEqual(sum(day['trend']), 2)
        self.assertEqual(data['periods']['month']['totals']['commits'], 3)

    def test_complete_rolling_month_and_week_boundaries(self):
        boundaries = [('month', self.now - timedelta(days=30)),
                      ('week', self.now - timedelta(days=7)),
                      ('day', self.now.replace(hour=0, minute=0, second=0))]
        for key, boundary in boundaries:
            for delta in (-1, 0, 1):
                label = f'{key}{delta:+d}'
                self.commit('line\n', (boundary + timedelta(seconds=delta)).isoformat(),
                            author=label, filename=label)
        for delta in (0, 1):
            label = f'now{delta:+d}'
            self.commit('line\n', (self.now + timedelta(seconds=delta)).isoformat(),
                        author=label, filename=label)
        data = self.collect()
        expected = {'day': {'day+0', 'day+1', 'now+0'}}
        expected['week'] = expected['day'] | {'day-1', 'week+0', 'week+1'}
        expected['month'] = expected['week'] | {'week-1', 'month+0', 'month+1'}
        for key, names in expected.items():
            with self.subTest(period=key):
                period = data['periods'][key]
                self.assertEqual({a['name'] for a in period['authors']}, names)
                self.assertEqual(period['totals'], {'commits': len(names), 'added': len(names),
                                                     'deleted': 0, 'authors': len(names)})
                self.assertEqual(sum(period['trend']), len(names))
                self.assertEqual(period['trend'][0], 2)
                if key == 'day':
                    self.assertEqual(period['trend'][21], 1)

    def test_author_and_line_totals_across_periods_match_success_payload(self):
        self.commit('keep\nold1\nold2\nold3\n', '2026-09-01T12:00:00+08:00', author='A')
        self.commit('keep\nold3\nmonth1\nmonth2\nmonth3\nmonth4\n',
                    '2026-10-01T12:00:00+08:00', author='B')  # +4 -2
        self.commit('keep\nmonth1\nmonth2\nmonth3\nmonth4\nweek1\nweek2\n',
                    '2026-10-20T12:00:00+08:00', author='A')  # +2 -1
        self.commit('keep\nmonth4\nweek1\nweek2\nday1\n',
                    '2026-10-24T08:00:00+08:00', author='B')  # +1 -3
        self.commit('keep\nmonth4\nweek1\nweek2\nday1\nday2\nday3\n',
                    '2026-10-24T09:00:00+08:00', author='A')  # +2 -0
        original = collector.collect
        with patch.object(collector, 'collect', wraps=lambda repo: original(repo, now=self.now)):
            data = self.main()
        self.assertEqual(set(data), {'repo', 'repoPath', 'revision', 'scope', 'dateBasis', 'generated', 'periods'})
        self.assertEqual(data['revision'], self.git('rev-parse', 'HEAD'))
        self.assertEqual(data['generated'], self.now.isoformat())
        self.assertEqual(data['dateBasis'], 'author')
        self.assertEqual(data['scope'], 'main')
        for key, expected in {'day': [('B', 1, 1, 3), ('A', 1, 2, 0)],
                              'week': [('A', 2, 4, 1), ('B', 1, 1, 3)],
                              'month': [('B', 2, 5, 5), ('A', 2, 4, 1)]}.items():
            with self.subTest(period=key):
                period = data['periods'][key]
                self.assertEqual(period['authors'], [dict(zip(('name', 'commits', 'added', 'deleted'), a))
                                                      for a in expected])
                self.assertEqual(period['totals'], {'commits': sum(a[1] for a in expected),
                                                     'added': sum(a[2] for a in expected),
                                                     'deleted': sum(a[3] for a in expected), 'authors': 2})
                self.assertEqual(sum(period['trend']), period['totals']['commits'])

    def test_root_lines_are_counted_even_when_git_hides_root_diffs(self):
        self.commit('first\nsecond\n', '2026-10-24T10:00:00+08:00')
        self.git('config', 'log.showRoot', 'false')
        self.assertEqual(self.collect()['periods']['day']['totals'],
                         {'commits': 1, 'added': 2, 'deleted': 0, 'authors': 1})

    def test_old_or_nonmonotonic_committer_dates_do_not_hide_recent_authorship(self):
        self.commit('first\n', '2026-10-24T08:00:00+08:00', committer_date='2026-09-01T00:00:00+08:00')
        self.commit('first\nsecond\n', '2026-10-24T09:00:00+08:00', committer_date='2026-08-01T00:00:00+08:00')
        self.assertEqual(self.collect()['periods']['day']['totals']['commits'], 2)

    def test_valid_empty_and_old_repository_are_zero(self):
        self.assert_zero(self.collect(), unborn=True)
        empty = self.cli()
        self.assertEqual(empty.returncode, 0, empty.stderr)
        self.assertEqual(empty.stderr, '')
        self.assert_zero(json.loads(empty.stdout), unborn=True)
        self.commit('old\n', '2026-08-01T00:00:00+08:00')
        self.assert_zero(self.collect())
        original = collector.collect
        with patch.object(collector, 'collect', wraps=lambda repo: original(repo, now=self.now)):
            self.assert_zero(self.main())

    def test_explicit_repo_subfolder_and_worktree_count_main(self):
        self.commit('main\n', '2026-10-24T10:00:00+08:00', author='Main')
        self.git('checkout', '-qb', 'feature')
        self.commit('main\nfeature\n', '2026-10-24T11:00:00+08:00', author='Feature')
        self.git('checkout', '-q', 'main')
        nested = self.repo / 'nested'
        nested.mkdir()
        main = self.collect(nested)
        self.assertEqual(main['repo'], 'project')
        self.assertEqual(main['repoPath'], str(self.repo.resolve()))
        self.assertEqual(main['periods']['day']['totals']['commits'], 1)
        worktree = self.root / 'feature-worktree'
        self.git('worktree', 'add', '-q', str(worktree), 'feature')
        self.assertEqual(self.collect(worktree)['periods']['day']['totals']['commits'], 1)
        # An explicit project cannot be silently redirected by inherited Git routing variables.
        with patch.dict(os.environ, {'GIT_DIR': str(worktree / '.git'), 'GIT_WORK_TREE': str(worktree)}):
            self.assertEqual(self.collect()['periods']['day']['totals']['commits'], 1)

    def test_stale_feature_checkout_still_counts_main(self):
        base = self.commit('base\n', '2026-10-24T09:00:00+08:00')
        self.git('checkout', '-qb', 'old-feature')
        self.git('checkout', '-q', 'main')
        self.commit('base\nmerged\n', '2026-10-24T10:00:00+08:00', author='Merged')
        self.commit('base\nmerged\nmore\n', '2026-10-24T11:00:00+08:00', author='Merged')
        self.git('checkout', '-q', 'old-feature')
        self.assertEqual(self.git('rev-parse', 'HEAD'), base)
        data = self.collect()
        self.assertEqual(data['scope'], 'main')
        self.assertEqual(data['revision'], self.git('rev-parse', 'main'))
        self.assertEqual(data['periods']['day']['totals']['commits'], 3)

    def test_repo_without_main_or_master_counts_head(self):
        self.git('checkout', '-qb', 'trunk')
        self.commit('trunk\n', '2026-10-24T10:00:00+08:00')
        self.git('branch', '-qD', 'main') if 'main' in self.git('branch', '--list', 'main') else None
        data = self.collect()
        self.assertEqual(data['scope'], 'HEAD')
        self.assertEqual(data['periods']['day']['totals']['commits'], 1)

    def test_cli_uses_project_cwd_not_script_location(self):
        self.commit('project data\n', '2026-10-24T10:00:00+08:00')
        nested = self.repo / 'nested'
        nested.mkdir()
        p = subprocess.run([sys.executable, str(SCRIPT)], cwd=nested, capture_output=True, text=True)
        self.assertEqual(p.returncode, 0, p.stderr)
        data = json.loads(p.stdout)
        self.assertEqual(data['repo'], 'project')
        self.assertEqual(data['repoPath'], str(self.repo.resolve()))
        self.assertEqual(data['revision'], self.git('rev-parse', 'HEAD'))

    def test_cli_explicit_repo_wins_over_different_cwd_and_git_environment(self):
        self.commit('selected\n', '2026-10-24T10:00:00+08:00')
        other = self.root / 'other'
        other.mkdir()
        self.git('init', '-q', '-b', 'main', cwd=other)
        env = dict(os.environ, GIT_DIR=str(other / '.git'), GIT_WORK_TREE=str(other))
        default = subprocess.run([sys.executable, str(SCRIPT)], cwd=other,
                                 capture_output=True, text=True, env=env)
        self.assertEqual(default.returncode, 0, default.stderr)
        default_data = json.loads(default.stdout)
        self.assertEqual(default_data['repo'], 'other')
        self.assertEqual(default_data['repoPath'], str(other.resolve()))
        self.assertIsNone(default_data['revision'])
        self.assertEqual(default_data['periods']['month']['totals']['commits'], 0)
        p = subprocess.run([sys.executable, str(SCRIPT), '../project'], cwd=other,
                           capture_output=True, text=True, env=env)
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(p.stderr, '')
        data = json.loads(p.stdout)
        self.assertEqual(data['repo'], 'project')
        self.assertEqual(data['repoPath'], str(self.repo.resolve()))
        self.assertEqual(data['revision'], self.git('rev-parse', 'HEAD'))
        self.assertEqual(data['periods']['month']['totals']['commits'], 1)

    def test_numstat_binary_rename_and_unusual_paths_and_author(self):
        self.commit('a\nb\n', '2026-10-24T10:00:00+08:00', author='作者\x1fName', filename='line\nbreak\tfile')
        self.git('mv', 'line\nbreak\tfile', 'renamed')
        (self.repo / 'binary').write_bytes(b'\x00binary\xff')
        self.git('add', 'binary')
        env = dict(os.environ, GIT_AUTHOR_DATE='2026-10-24T11:00:00+08:00', GIT_COMMITTER_DATE='2026-10-24T11:00:00+08:00')
        self.git('commit', '-qm', 'rename and binary', env=env)
        day = self.collect()['periods']['day']
        self.assertEqual(day['totals']['commits'], 2)
        self.assertEqual(day['totals']['added'], 2)
        self.assertEqual(day['totals']['deleted'], 0)
        self.assertIn('作者\x1fName', [a['name'] for a in day['authors']])

    def test_dst_midnight_uses_midnight_offset(self):
        os.environ['TZ'] = 'America/New_York'
        time.tzset()
        self.now = datetime.fromisoformat('2026-11-01T12:00:00-05:00')
        self.commit('before\n', '2026-11-01T03:59:59Z')
        self.commit('before\nafter\n', '2026-11-01T04:00:00Z')
        self.commit('before\nafter\nfirst\n', '2026-11-01T05:30:00Z')
        self.commit('before\nafter\nfirst\nrepeat\n', '2026-11-01T06:30:00Z')
        day = self.collect()['periods']['day']
        self.assertEqual(day['totals']['commits'], 3)
        self.assertEqual(day['trend'][0], 1)
        self.assertEqual(day['trend'][1], 2)
        self.assertEqual(sum(day['trend']), 3)

    def test_not_repo_missing_repo_and_broken_git_deliver_error_json(self):
        for path in (self.root, self.root / 'missing'):
            with self.subTest(path=path):
                p = self.cli(path)
                self.assertEqual(p.returncode, 0, p.stderr)
                self.assertEqual(p.stderr, '')
                self.assert_error(json.loads(p.stdout))
        self.commit('valid\n', '2026-10-24T10:00:00+08:00')
        obj = self.git('rev-parse', 'HEAD')
        (self.repo / '.git' / 'objects' / obj[:2] / obj[2:]).unlink()
        p = self.cli()
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(p.stderr, '')
        self.assert_error(json.loads(p.stdout), known_repo=True)

    def test_missing_git_delivers_error_json(self):
        p = self.cli(env=dict(os.environ, PATH=str(self.root / 'no-executables')))
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(p.stderr, '')
        self.assert_error(json.loads(p.stdout))

    def test_git_nonzero_status_is_checked_at_every_acquisition_stage(self):
        self.commit('valid\n', '2026-10-24T10:00:00+08:00')
        original = collector.subprocess.run
        for stage in ('root', 'head', 'metadata', 'statistics'):
            calls = []
            def fail_stage(command, **kwargs):
                current = ('statistics' if '--numstat' in command else
                           'metadata' if 'log' in command else
                           'root' if '--show-toplevel' in command else 'head')
                calls.append(current)
                result = original(command, **kwargs)
                if current == stage:
                    # Even plausible stdout from a failed read must be rejected.
                    return subprocess.CompletedProcess(command, 128, result.stdout,
                                                       'SECRET_TOKEN=private-value\n' * 1000)
                return result
            with self.subTest(stage=stage), patch.object(collector.subprocess, 'run', fail_stage):
                data = self.main()
                self.assertEqual(calls[-1], stage)
                self.assert_error(data, known_repo=stage != 'root')
                self.assertNotIn('SECRET_TOKEN', json.dumps(data))
                self.assertNotIn('private-value', json.dumps(data))

    def test_git_timeout_or_failure_is_not_empty(self):
        def timeout(*args, **kwargs):
            raise subprocess.TimeoutExpired(args[0], 10)
        with patch.object(collector.subprocess, 'run', timeout):
            with self.assertRaises(collector.CollectionError):
                self.collect()
            self.assert_error(self.main())
        self.commit('valid\n', '2026-10-24T10:00:00+08:00')
        # A valid commit whose file data is missing fails during numstat, after
        # metadata succeeds; it must not yield partially populated zeroes.
        blob = self.git('rev-parse', 'HEAD:file.txt')
        (self.repo / '.git' / 'objects' / blob[:2] / blob[2:]).unlink()
        with self.assertRaises(collector.CollectionError):
            self.collect()
        p = self.cli()
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(p.stderr, '')
        self.assert_error(json.loads(p.stdout), known_repo=True)
        original = collector.run_git
        def fail_log(repo, *args, **kwargs):
            if args[0] == 'log':
                raise collector.CollectionError('simulated git log failure')
            return original(repo, *args, **kwargs)
        with patch.object(collector, 'run_git', fail_log):
            with self.assertRaises(collector.CollectionError):
                self.collect()

    def test_malformed_git_data_is_error_not_zero(self):
        self.commit('valid\n', '2026-10-24T10:00:00+08:00')
        original = collector.subprocess.run
        for flag in ('--verify', '--format=%H%x00%an%x00%at', '--numstat'):
            def malformed(command, **kwargs):
                if flag in command:
                    return subprocess.CompletedProcess(command, 0, 'invalid', '')
                return original(command, **kwargs)
            with self.subTest(flag=flag), patch.object(collector.subprocess, 'run', malformed):
                self.assert_error(self.main(), known_repo=True)

    def test_os_error_diagnostics_are_not_exposed(self):
        with patch.object(collector.subprocess, 'run', side_effect=OSError('SECRET_TOKEN=private-value')):
            data = self.main()
        self.assert_error(data)
        self.assertNotIn('private-value', json.dumps(data))

    def test_unexpected_programming_error_remains_diagnosable(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(collector, 'collect', side_effect=RuntimeError('programming bug')), \
                patch.object(sys, 'argv', [str(SCRIPT), str(self.repo)]), \
                redirect_stdout(stdout), redirect_stderr(stderr):
            with self.assertRaisesRegex(RuntimeError, 'programming bug'):
                collector.main()
        self.assertEqual(stdout.getvalue(), '')

    def test_invalid_cli_arguments_remain_a_command_failure(self):
        p = subprocess.run([sys.executable, str(SCRIPT), 'one', 'two'], capture_output=True, text=True)
        self.assertEqual(p.returncode, 2)
        self.assertEqual(p.stdout, '')
        self.assertIn('Usage:', p.stderr)

    def test_merge_commits_remain_excluded(self):
        self.commit('base\n', '2026-10-24T08:00:00+08:00')
        self.git('checkout', '-qb', 'feature')
        self.commit('feature\n', '2026-10-24T09:00:00+08:00', filename='feature')
        self.git('checkout', '-q', 'main')
        self.commit('main\n', '2026-10-24T10:00:00+08:00', filename='main')
        env = dict(os.environ, GIT_AUTHOR_DATE='2026-10-24T11:00:00+08:00', GIT_COMMITTER_DATE='2026-10-24T11:00:00+08:00')
        self.git('merge', '--no-ff', '-qm', 'merge', 'feature', env=env)
        self.assertEqual(self.collect()['periods']['day']['totals']['commits'], 3)


if __name__ == '__main__':
    unittest.main(verbosity=2)
