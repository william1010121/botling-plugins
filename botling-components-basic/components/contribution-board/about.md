Contribution board: ranks the authors of the current project's git repo (the repo name is shown next to the title) by lines changed, with commits, +added/-deleted, per-author bars, period totals and a small commits trend, and a Day / Week / Month toggle (default Week). Call it up with `<show name="contribution-board"></show>` (the Command supplies the data).
Command: python3 "$BOTLING_DATA_DIR/plugins/botling-components-basic/scripts/contribution-board-json.py"
Icon: chart.bar.fill
Sizes: 2x2, 4x2
Refresh: every 5m

The script is read-only git (`git --no-optional-locks log --numstat`, merges skipped, binary `-` counts as 0) on the git repo of the current project folder (cwd, like commit-log). It counts that repo's `main` branch (else `master`, else the checked-out HEAD), so a project folder sitting on an old feature branch still shows everything merged; `scope` in the data names the branch counted. The command accepts an optional first argument, a repo path: append a repo path after the script name to count another repo instead; `repo` in the data is that repo's folder name. Periods use local time: day = since today 00:00, week = last 7 days, month = last 30 days.

## Data format

```json
{
  "repo": "plugins",
  "periods": {
    "day":   {"authors": [{"name": "alice", "commits": 3, "added": 351, "deleted": 100}],
              "totals": {"commits": 3, "added": 351, "deleted": 100, "authors": 1},
              "trend": [0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1,0,0,0,0,0,0,0,0]},
    "week":  {"authors": [{"name": "alice", "commits": 64, "added": 52509, "deleted": 2540},
                          {"name": "Deck", "commits": 2, "added": 4350, "deleted": 0}],
              "totals": {"commits": 66, "added": 56859, "deleted": 2540, "authors": 2},
              "trend": [0,0,0,0,8,49,9]},
    "month": {"authors": [], "totals": {"commits": 0, "added": 0, "deleted": 0, "authors": 0}, "trend": []}
  }
}
```

- `authors`: ranked by lines changed (added + deleted); the component re-sorts anyway.
- `trend`: commits per bucket, oldest first (day: 24 hours, week: 7 days, month: 30 days); optional.
- `totals`: optional (summed from authors when missing).
- Optional `period` ("day" | "week" | "month"): the period selected at first.

## Unavailable vs. genuinely empty

A period that was read successfully with no commits is real data: give it `"authors": []` and zero totals (the Command always writes all three periods; an empty or unborn repo gives zeros). It shows `0` and "No commits in this period", and the chip says "0 commits".

Data that could not be read is **not** zero. The component then shows a warning "Unavailable" state (with the error text), hides counts, ranking, trend and "No commits", and sets the chip to "Unavailable" (warning). That happens when:

- the data is an acquisition error, which the Command prints on an expected Git failure (exit 0, no periods or counts): `{"status":"error","error":"Git read failed","detail":"short safe detail","repo":"plugins","repoPath":"/path"}` (`detail`, `repo`, `repoPath` optional); any `status: "error"` or non-empty `error` string counts. The Day / Week / Month toggle is then disabled but keeps its selection;
- `periods` is missing or not an object, or the data is not a JSON object;
- the **selected** period is missing or malformed: `authors` must be an array whose entries have a string `name` and numeric `commits`, `added`, `deleted` (finite, >= 0); a `totals` or `trend` present must be numbers >= 0 / an array of them. Do not omit a period to mean "no commits": write it with `"authors": []`.

Refreshes follow the data: success -> error -> success keeps the selected Day / Week / Month. Never invent counts for a repo you could not read; pass the error object instead.

The component is display-only: it never calls `ccb.answer` and sends nothing back. The selected period is remembered (ccb.save when allowed, else local storage), and the pin chip shows the commit count of the selected period ("Unavailable" when the data could not be read).

## Layout

One responsive, frameless layout (no border, background or radius of its own, at most 12px outer padding) built on the shared `ccb.kit` (Card and the app's design tokens, so it follows the light and dark themes). It adapts to the frame through container queries on the host `#ccb-root` size container. Chat and natural-height pinned panels grow with their content and list every author. A Board tile or a pinned panel with a height of its own fills it: the author list scrolls inside it when it does not fit (its position is kept across data events and reset when the period changes). Below about 300px tall the trend is dropped and only the top 4 authors are listed, below about 230px the top 2, and below about 190px only the commit count, the period and the toggle remain (title, +added/-deleted and authors are left out). Below about 260px wide the title and repo name are hidden, and below about 200px the per-author commit counts. `Sizes: 2x2, 4x2` is only the initial pin hint.

The data format, parsing, sorting, number format, the Unavailable / empty states and the pin chip above are unchanged. Every time the card receives data, even identical data, it redraws and sets the chip again; the selected Day / Week / Month survives data events and resizes, and `period` in the data only picks the first selection.
