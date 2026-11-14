Disk usage breakdown: shows used/total space of the Mac Data volume, a donut chart, and a bar list of what takes up the space (read-only, no delete actions). Show it with `<show name="disk-usage-breakdown"></show>`; the default Command supplies the data automatically.
Command: python3 "$BOTLING_DATA_DIR/plugins/botling-components-basic/scripts/disk-usage.py"
Detail command: python3 "$BOTLING_DATA_DIR/plugins/botling-components-basic/scripts/disk-usage.py" --force {scan}
Icon: internaldrive
Refresh: manual
Sizes: 4x2, 2x2, 1x1

**Recommended usage**: `<show name="disk-usage-breakdown"></show>`. The user does not need to answer anything; the component never calls `ccb.answer`.

## Data format (window.ccb.data, a JSON string is also accepted)

```json
{"total":460.0,"used":409.0,"free":51.0,"unit":"GB","updated":"14:52",
 "items":[{"name":"~/Library","gb":58.1,"group":"Home folder"},{"name":"/Applications","gb":36,"group":"System / Apps"}],
 "unclassified":{"gb":110.0,"note":"System, snapshots, and other space with no traceable source"},
 "snapshots":["com.apple.TimeMachine..."],
 "errors":["A folder could not be read"]}
```

- Only `items` and `total`/`used` are the main fields; `free`, `unit` (default GB), `updated`, `unclassified`, `snapshots`, and `errors` are optional.

## Display rules

- The header shows "Used 409 / 460 GB" on the right, with a percentage bar below it (orange above 85%, red above 95%).
- The donut colors the top 8 items by size and merges the rest into "Other (N items)"; the unclassified part is shown hatched in gray, labeled "Unclassified / system & snapshots". Next to it (below it when narrow) is a bar list sorted by size, with GB and the percentage of used space.
- Local snapshots show a count, expandable to see the names; errors are listed in small warning-colored text; "Updated HH:MM".
- Refresh button: clicking it calls `ccb.runDetail({scan:"now"}, {save:true})` to run the Detail command (forced rescan, about 1 minute). While scanning, the button shows "Scanning... about 1 min" and is disabled. On success the whole card is redrawn from the returned JSON (same format as above) and the status chip is updated. The result is saved into the card (save:true), so the scan still completes if the user switches chats and no stale data shows when they return (if the option is ignored, the card still redraws from the returned value). On failure a small warning shows "Refresh failed: reason" and the button is restored. The user must first allow the Command on the card. If `ccb.runDetail` is unavailable, the card suggests using the ↻ button at the top right.
- Layout depends on size: wide puts the donut on the left and the list on the right; narrow stacks them; short shows only the summary and a small donut; the smallest cell shows only "409/460".

## Layout

One responsive, frameless layout (no border, background or radius of its own, at most 12px outer padding) built on the shared `ccb.kit` (Card, Button and the app's design tokens, so it follows the light and dark themes). It adapts to the frame through container queries on the host `#ccb-root` size container. Chat and natural-height pinned panels grow with their content and show every category, snapshot name, warning and the Refresh button. In a Board tile or a pinned panel with a height of its own the capacity header stays on top and the donut, category list, snapshots, warnings and Refresh scroll inside the rest. The donut shrinks to the width of a narrow frame instead of overflowing it.

Content left out at small sizes is unchanged from before, but is now named: below about 300px tall the donut is small and the category list, snapshots, warnings and Refresh are not shown, and a one-line note says how many categories and warnings are hidden; below about 150px tall, or about 170px wide (1x1), only "used/total" is shown. `Sizes: 4x2, 2x2, 1x1` is only the initial pin hint.

The data format, parsing (JSON string, `{"output": "..."}` wrapper), units (`unit` default GB), rounding, thresholds, sorting (by size, ties keep their order), missing-vs-zero handling, the empty state, the read-only behaviour, the Command / Detail command / Refresh / Icon lines and the pin chip above are unchanged. The donut and the bars are shares of max(used, sum of the listed categories), not of the volume total; categories can overlap and "Unclassified" is only what the data reports. Every time the card receives data, even identical data (and after a successful Refresh), it redraws and sets the chip again.
- When pinned, the status chip shows "409/460 GB", in warning tone when used space exceeds 85%.
- Light and dark themes are both supported.
