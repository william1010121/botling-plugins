Git diff viewer: shows one commit's (or the working tree's) changes with repo, branch, short hash, subject, totals (files, +additions, -deletions), a file list with status badges and per-file +/- counts, and each file expandable to its unified diff. Call it up with `<show name="git-diff">JSON</show>`.
Board command: R=${R:-.}; C=${C:-HEAD}; a script printing one JSON object {repo, branch, commit, subject, totals, files[with diff]} built from git -C "$R" show "$C" --numstat --format= / --name-status --format= / show "$C" --format= -- <path>; if the working tree is dirty and no commit is given use git diff and git diff --numstat.
Icon: plus.forwardslash.minus

## Data format (window.ccb.data)

```json
{
  "repo": "acme/webapp",
  "branch": "feat/cache-cleanup",
  "commit": "cb4af73",
  "subject": "fix(cache): remove expired snapshot files",
  "totals": {"files": 3, "additions": 21, "deletions": 5},
  "files": [
    {"path": "config/cache.yaml", "additions": 1, "deletions": 0, "status": "modified",
     "diff": "--- a/config/cache.yaml\n+++ b/config/cache.yaml\n@@ -1,4 +1,5 @@\n type: memory\n+  - x\n"}
  ],
  "note": "Local commit, not pushed yet; PR #32"
}
```

### From command
- `repo`, `branch`, `commit` (short hash), `subject`: strings, all optional (a missing one is simply left out; with no commit and no subject the title reads "Working tree changes").
- `totals`: `{files, additions, deletions}`; if missing, summed from `files`.
- `files`: array of `{path, additions, deletions, status, diff}`; `status` is `added`, `modified` or `deleted`; `diff` is the file's unified diff text (lines starting with `+` are green, `-` red, `@@` hunk headers and `---`/`+++` file headers dimmed). If `additions`/`deletions` are missing they are counted from `diff`.

### Optional (bot only)
- `note`: one short line shown under the totals (for example "Local commit, not pushed yet").

## Layout
One responsive layout. Wide or tall (and in chat): header, totals, optional note, and a file list where each file expands to its diff (the first file starts open; long lines scroll sideways inside the diff). Short Board tile: header, totals and the file list only. Tiny tile: just +additions, -deletions and the file count. Dark and light themes are supported. The card sets its pin status to e.g. "3 files +21 -5".

## Answer format
This component sends no answer back to the bot.
