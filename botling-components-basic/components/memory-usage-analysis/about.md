Memory usage analysis card: shows macOS physical memory used / total, memory pressure, the processes using the most memory, and a suggested next step. Show it with `<show name="memory-usage-analysis">JSON</show>`.
Sizes: 2x2
Icon: memorychip
Command: python3 "$BOTLING_DATA_DIR/plugins/botling-components-basic/scripts/memory-usage.py"

The command measures live and prints JSON (without `nextStep` and the per-process `note`/`flag`); the bot can also supply its own data (`<show name="memory-usage-analysis">JSON</show>`). `headline`, `nextStep` and each process's `note`/`flag` are optional. The user is not asked to answer (the component never calls `ccb.answer`).

## Data format (window.ccb.data)

All fields are optional; a section with no data is not shown:

```json
{
  "headline": "Chrome is using nearly 6 GB, memory pressure is elevated",
  "usedGB": 13.4,
  "totalGB": 16,
  "pressure": "warn",
  "swapUsedGB": 2.3,
  "processes": [
    { "name": "Google Chrome", "memMB": 5800, "note": "40+ tabs open", "flag": "warn" },
    { "name": "Xcode", "memMB": 2100 },
    { "name": "WindowServer", "memMB": 640 }
  ],
  "nextStep": "Close unused Chrome tabs first, then check whether pressure returns to normal."
}
```

- `headline` (string): one-sentence conclusion, shown under the title.
- `usedGB`, `totalGB` (numbers, GB): used and total physical memory, drawn as a big number (used %) plus a progress bar. Colors: green below 60%, amber below 85%, red at 85% and above. With only `usedGB`, just the GB number is shown, with no bar.
- `pressure` (string): `"normal"` (Normal, green), `"warn"` (Warning, amber), `"critical"` (Critical, red).
- `swapUsedGB` (number, GB): swap in use.
- `processes` (array of objects): shown in the given order, never re-sorted. Each object:
  - `name` (string): process or app name.
  - `memMB` (number, MB): memory used by the process; values of 1024 MB or more are shown as GB. Bars are scaled to the largest value.
  - `note` (string, optional): description.
  - `flag` (optional): `"warn"` highlights the row with an amber background and a "Warning" badge.
- `nextStep` (string): suggested next step, shown in a highlighted block at the bottom.

## Display rules

- The layout adapts to the cell size (Sizes is only a hint): with enough room everything is shown; when shorter it collapses to "memory gauge + top 3 processes (no notes)"; shorter still, only the gauge; at roughly one cell, only the big memory %.
- When pinned, the status chip reads "Memory 84%", colored by pressure (when `pressure` is given) or by the usage thresholds; with no `usedGB`/`totalGB` it shows the pressure (e.g. "Memory warning"); with neither, the chip is cleared.
- Drawn with the shared component kit (`<meta name="ccb-kit" content="1">`); the data format above is unchanged. Light and dark themes are both supported.
