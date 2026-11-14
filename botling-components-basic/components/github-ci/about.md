GitHub Actions build progress card: lists the most recent workflow runs (status, branch, duration), lets you expand each run to see its jobs, and fetches live data with the gh command. Show it with `<show name="github-ci"></show>` (the default Command supplies the data automatically; do not pass any yourself).
Command: gh run list --limit 8 --json databaseId,displayTitle,workflowName,headBranch,event,status,conclusion,createdAt,updatedAt,url
Detail command: gh run view {databaseId} --json jobs -q '.jobs[] | "\(.name)\t\(.status)\t\(.conclusion)"'
Icon: hammer

**Recommended usage**: `<show name="github-ci"></show>`. The Command runs `gh run list` in the current project folder (`gh` must be installed and signed in). No user answer is needed; the component never calls `ccb.answer`.

## Data format (window.ccb.data)

The Command output is a JSON array, newest first:

```json
[
  {"databaseId": 1234567890, "displayTitle": "Fix login bug", "workflowName": "CI", "headBranch": "main", "event": "push", "status": "in_progress", "conclusion": "", "createdAt": "2026-10-21T08:00:00Z", "updatedAt": "2026-10-21T08:01:10Z", "url": "https://github.com/o/r/actions/runs/1234567890"},
  {"databaseId": 1234567001, "displayTitle": "Bump deps", "workflowName": "Release", "headBranch": "v1.2.0", "event": "push", "status": "completed", "conclusion": "failure", "createdAt": "2026-10-21T06:00:00Z", "updatedAt": "2026-10-21T06:02:13Z", "url": "https://github.com/o/r/actions/runs/1234567001"}
]
```

- An object wrapping text is also accepted, e.g. `{"output": "[...JSON text...]"}`.
- If the output is not JSON (for example an error message because `gh` is not signed in), the component shows that text as is.
- An empty array shows "No runs".
- Expanding a row calls the Detail command (`ccb.runDetail({databaseId})`); each line has the format `name<TAB>status<TAB>conclusion`. Results are cached; a failed load is retried when the run is collapsed and expanded again. Every new data arrival (refresh or a new `<show>`) starts the list over: open runs and cached jobs are cleared.

## Display rules

- Each row: status dot, workflow name, title (displayTitle), branch / tag (headBranch), duration. Clicking the row opens that run's web page (url); the arrow on the right expands / collapses the job list.
- Status dot: in_progress / queued / waiting = blue spinner; success = green; failure / timed_out = red; cancelled / skipped = gray; action_required = orange.
- Duration: for in-progress runs, from createdAt to now (updates every second, and the timer only runs while some run is in progress); for completed runs, updatedAt - createdAt, formatted like `2m 13s`.
- Status labels: Queued, In progress, Success, Failed, Timed out, Cancelled, Skipped, Action required, Finished.
- Summary at the top: "N in progress" when any run is in progress, otherwise "Latest: Success", "Latest: Failed", "Latest: Cancelled", etc. (based on the newest run). Error text shows "Couldn't load runs".
- The layout adapts to the cell size: with enough room it shows the full list (two lines per row, jobs expandable); when shorter it collapses to a compact one-line-per-row list; shorter still keeps only the summary and the first few rows; the smallest cell shows only the newest run's status dot, workflow name and duration. It does not scroll on the Board (except that while a run's jobs are open the full list is kept and scrolls inside the tile); in chat and pinned panels it grows with its content. Job details can only be opened in the full two-line layout. Built on the shared component kit (`<meta name="ccb-kit" content="1">`); the data format and the Command / Detail command / Icon lines are unchanged.
- When pinned, the status chip shows the newest run's state: Success (green), Failed (red), In progress (neutral), Cancelled (neutral); Error (red) if the data could not be loaded.
- Light and dark themes are both supported.
