CPU load diagnosis card: shows overall CPU usage, load average, top CPU-consuming processes and a suggested next step. The bot supplies the data. Show it with `<show name="cpu-load">JSON</show>`.
Sizes: 2x2, 4x2
Icon: cpu
Command: python3 "$BOTLING_DATA_DIR/plugins/botling-components-basic/scripts/cpu-load.py"

The command measures live and prints JSON (without `nextStep` or the per-process `note`/`flag`); the bot can also supply its own data (`<show name="cpu-load">JSON</show>`). `headline`, `nextStep` and each process's `note`/`flag` are optional. No user answer is needed (the component never calls `ccb.answer`).

## Data format (window.ccb.data)

All fields are optional; a section with no data is not shown:

```json
{
  "headline": "BTLEServer is using nearly 90% of the CPU; the system is overloaded",
  "cpuPercent": 83,
  "loadAvg": [97, 110, 124],
  "cores": 10,
  "processes": [
    { "name": "BTLEServer", "cpu": 87, "note": "48 hours of accumulated CPU time, likely a Bluetooth device reconnecting repeatedly", "flag": "warn" },
    { "name": "WindowServer", "cpu": 24, "note": "Screen compositing, normal" }
  ],
  "nextStep": "Try turning Bluetooth off first and see whether BTLEServer drops."
}
```

- `headline` (string): one-sentence conclusion, shown under the title.
- `cpuPercent` (number, 0-100): overall CPU usage, drawn as a big number plus a progress bar. Color: below 60 green, below 85 amber, 85 and above red.
- `loadAvg` (array of numbers, at most 3, in order 1, 5, 15 minutes): load average.
- `cores` (number): CPU core count. When given, each load shows "~N x core count" and is colored by that ratio (below 1 green, below 2 amber, otherwise red); when omitted only the number is shown.
- `processes` (array of objects): shown in the given order, never re-sorted. Each object:
  - `name` (string): process name.
  - `cpu` (number): the process's CPU %, may exceed 100 on multi-core machines (the bar is full at the maximum value, with a tick drawn at 100). Colors follow the same rules as `cpuPercent`.
  - `note` (string, optional): description.
  - `flag` (optional): `"warn"` highlights the row with an amber background and a "Warn" badge.
- `nextStep` (string): suggested next step, shown in a highlighted block at the bottom.

## Display rules

- The layout adapts to the cell size (Sizes are only a hint): with enough room everything is shown; when shorter it collapses to "CPU bar + top 3 processes (no notes)"; shorter still, only the CPU bar; at about one cell, only a big CPU %.
- When pinned, the status chip shows "CPU 83%", green/orange/red by the thresholds above; it is cleared when there is no `cpuPercent`.
- Drawn with the shared component kit (`<meta name="ccb-kit" content="1">`); the data format above is unchanged. Light and dark themes are both supported.
