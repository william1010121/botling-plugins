Commit log: shows git commit history as a timeline (short hash, subject, author, date, ref tags). Call it up with `<show name="commit-log"></show>` (the default Command supplies the data automatically).
Command: python3 "$BOTLING_DATA_DIR/plugins/botling-components-basic/scripts/git-log-json.py" 20 --no-diff
Detail command: python3 "$BOTLING_DATA_DIR/plugins/botling-components-basic/scripts/git-show-detail.py" {hash}
Sizes: 2x1, 1x2, 2x2, 4x2

**Recommended usage**: `<show name="commit-log"></show>` (no need to pass data yourself). The default Command outputs a JSON list for the current project folder (hash, subject, author, date, refs, files stats) without diffs; to change the number of entries, replace the trailing 20. When a row is expanded and it has files but no diff, the component runs the Detail command above through the app's `ccb.runDetail({hash})` to fetch that commit's diff (loaded once, then served from cache for the same hash).

## Data format (window.deck.data)

### JSON array (or `{"commits":[…]}`)

```json
[
  {
    "hash": "400b962",
    "subject": "ccb-laas: render $…$ SVG while focused, skipping spans touching the selection",
    "author": "alice",
    "date": "2026-10-20",
    "refs": ["HEAD -> master", "tag: v1.7.1"],
    "files": [{"path": "a/b.js", "status": "M", "added": 3, "deleted": 1}]
  },
  {
    "hash": "9e7af16",
    "subject": "ccb-laas: render $…$ as SVG on blur",
    "date": "2026-10-19"
  }
]
```

You can also wrap it: `{"commits": [ …same as above… ]}`.

- `hash`: short hash, shown in monospace. The `{hash}` in the Detail command is this value.
- `subject`: commit subject. The prefix before the first ": " (colon plus space), such as `ccb-laas`, becomes a small tag; the rest is shown as is.
- `author`, `date`: text, optional (omitted means not shown).
- `refs`: array of strings, optional; each becomes a ref tag (for example `HEAD -> master`, `tag: v1.7.1`).
- `files`: optional; array of objects `[{"path":"a/b.js","status":"M","added":3,"deleted":1}]` (`status` is A/M/D/R; if `added`/`deleted` are missing they are counted from the diff). The older array of strings (or a newline-separated string) is also accepted.
- `diff`: optional; string with the commit's unified diff text. If `diff` is already provided (old data or supplied by you), expanding shows it directly and `ccb.runDetail` is not called.
- `truncated`: optional; when `true`, the bottom of the expanded area shows "diff truncated (too long)".

Click a row to expand the diff view:
- Summary at the top "N files +x −y", with small buttons on the right: Unified / Split toggle and Copy diff (copies only the diff of the currently selected file).
- File list: status marker A/M/D/R and per-file +/−, with its own max height and scrolling. After the diff loads, the first file is selected automatically; the diff area below always shows only the selected file, and clicking another file name switches to it (there is no stacked "all files" view).
- Syntax coloring: by file extension (js/ts/json/swift/py/css/html/md/sh etc.), single lines get keyword, string, comment and number coloring; unknown extensions stay plain text; the `+`/`-` line backgrounds are kept.
- Each line has old/new line numbers, `+` green, `-` red, `@@` blue; the diff area takes the height remaining below the list, and long content scrolls horizontally and vertically inside the diff block only, never stretching the card.
- Performance guards: the Detail script (`git-show-detail.py`) compares merge commits against the first parent, limits each line to 1000 characters (longer lines get " …" appended) and the total to about 900KB, ending with "… (diff truncated)" when exceeded. The component also truncates single lines to about 1000 characters plus "…" when parsing; lines over 600 characters are not syntax-colored; split mode uses `white-space:pre` with horizontal scrolling like unified mode; each file renders 1500 lines first, and a "Show more" button adds 1500 more lines at a time; the file list renders at most 300 entries and the rest shows "N more files". The auto-selected file is scrolled into view in the file list and highlighted.
- The raw diff may be the output of `git show --patch --stat`: the commit header and stat block before `diff --git` are ignored.
- Above the list (when there are more than 3 entries) there is a small search box that filters commits by subject / hash / author.

Loading states when expanded: a row with files but no diff shows "Loading…" on expand; a failed load shows "Failed to load: reason" (when the reason contains "1000 KB" it shows "diff too large to load"); collapse and expand again to retry. If the load succeeds but no diff can be parsed (for example a merge commit with only a stat), the file list is still shown and the diff area shows "This commit has no diff to display (possibly a merge commit)". Successful results are cached by hash, so the same commit is never fetched twice.
Rows without `files` and `diff` cannot be expanded (no arrow is shown). If the app does not expose `ccb.runDetail`, expanding a row with files shows only the file list. The component itself never runs git.

On the hash line of each row there are two small buttons on the right (nothing expands by default):


These buttons do not return a result to the bot that called up the component and do not call `deck.answer`.

### Display when the command fails or there are no commits

If the command output contains no parsable commit (for example a `git` error message, or `not a git repository`), the component shows "The command produced no commit log" along with the first line of the raw output. Truly empty data shows "No commits".

## Sizes

Built on the shared component kit (`<meta name="ccb-kit" content="1">`); the data format and the Command / Detail command lines are unchanged. One responsive layout picks what to show from the room it has (`ccb.size`, the frame's real width and height), for any Board size, chat width or pinned panel, and follows the size live. Search text, open rows, the selected commit and each diff's view (selected file, Unified / Split, shown lines) are kept while it is resized.

- **One cell (narrow and short, for example 1x1)**: only the newest commit: hash, "N total" and its subject (up to three lines).
- **Short (a Board tile about one row tall, for example 2x1)**: shows only the latest 1–2 entries, one line each (hash + subject), no buttons, not expandable. The header reads "Latest N".
- **Narrow and tall (under about 240px wide, for example 1x2)**: compact vertical list, each entry only hash + subject (long subjects wrap), no search box, not expandable, scrolls inside the tile. The header reads "N total".
- **Medium (for example 2x2, 3x3; also the chat and pinned panels when under about 560px wide)**: full list with all the features described above (search, expandable diff); on the Board the list fills the tile and scrolls inside it.
- **Wide (about 560px wide or more and not short, for example 4x2)**: the list is on the left and the selected commit's diff is shown directly on the right. The first entry is selected by default; click a row to select it. The left column is collapsed by default to a narrow strip of about 68px (each row has only a small monospace hash and month-day, with the full subject in the title tooltip; no search box, refs; the selected row is highlighted; the strip scrolls on its own and never exceeds the panel), so the diff gets the rest of the width; the small button ›/‹ at the top of the left column expands it to the full list (search, refs) and collapses it again. The right-hand header is reduced to two lines: the first line is the hash + a single-line ellipsized subject, the second line is small text author · date. The right toolbar is a thin row (N files +x −y, Unified / Split / Copy diff); the file list is at most about 96px (about 3 rows, scrollable) and the remaining height all goes to the diff; file names show the basename in bold with the directory dimmed and truncated from the left. The diff's +/- is marked only once, in the line-number gutter (the leading symbol of the content is removed); the combined diff of merge commits (`diff --cc`, `@@@`, multi-column markers) is parsed correctly too. The diff uses the same lazy-loading path (`ccb.runDetail`, cached by hash) and shows "Loading…" while loading; a failed load shows "Failed to load: reason" and clicking the row again retries. The card has no max width (it fills the cell). List rows are no longer expandable (the diff is only on the right).

Every new data arrival (a refresh, or a new `<show>`, even with identical data) starts the log over: open rows, search text, the selection and cached diffs are cleared. None of the layouts shows a horizontal scrollbar on the card, and both light and dark themes work as usual.

## Display rules

- Rows are ordered top to bottom as output (git log defaults to newest first).
- The title "Commit log" and "N total" stay fixed at the top; the timeline itself has a max height (about 420px) and scrolls vertically inside the block when exceeded. Row spacing is compact.
- Narrow columns (for example a 260px-wide board column) are fully supported: overly long subjects, refs and paths wrap or are ellipsized, and the card itself never gets a horizontal scrollbar.
- Empty data (empty array, truly empty string) shows "No commits"; if the command has output but no parsable commit line, it shows "The command produced no commit log" and the first line of the raw output.
- The list itself needs no answer from the user and does not call `deck.answer`. Supports light and dark themes and phone width.
- On the board (`ccb.surface === 'board'` or `<html data-surface="board">`; since app v1.9.0 the board has no title bar): the component drops its own border, background and rounded corners, uses about 12px padding, fills the full height of the cell, and the list and the right-hand diff stretch to the available height; the background is transparent. The appearance in chat is unchanged.

## Answer format

This component sends no answers back to the bot (no `ccb.answer` / `deck.answer` calls).
