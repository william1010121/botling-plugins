Release progress card: shows the to-do progress of the current release (merged / total) and the status of each item, refreshed automatically every 60 seconds (the refresh button updates it at once). Show it with `<show name="release-progress"></show>` (the Command supplies the data automatically; do not pass any yourself).
Sizes: 2x2
Command: python3 .bot/artifacts/release-progress.py
Refresh: every 60s
Icon: shippingbox

The Command runs in the bot's project folder and executes the script `.bot/artifacts/release-progress.py`, which prints JSON in the format below. To update progress, just change that script (or the source it reads) so its output changes; the component redraws automatically without reloading the page. No user answer is needed; the component never calls `ccb.answer`.

## Data format (window.ccb.data)

The output is a single JSON object (if a string is received, the component runs `JSON.parse` on it itself; missing fields and malformed data are tolerated):

```json
{
  "version": "1.12.0",
  "updated": "2026-10-21 13:55",
  "items": [
    { "title": "Fix login timeout", "status": "merged" },
    { "title": "Add dark mode toggle", "status": "working" },
    { "title": "Update dependencies", "status": "queued" },
    { "title": "Integration tests", "status": "failed" }
  ]
}
```

- `version` (string): the version number, shown at the top.
- `updated` (string): last update time; the component takes the `HH:MM` part and shows it as "Updated 13:55".
- `items` (array of objects): each has a `title` (string) and a `status`, which is one of the following four (any other value is treated as `queued`):
  - `merged`: merged (green check mark), label "Merged"
  - `working`: in progress (blue spinner), label "In progress"
  - `queued`: waiting (gray circle), label "Queued"
  - `failed`: failed (red cross), label "Failed"

## Display rules

- Top: the version number, a progress bar (merged count / total), "8/12" and the update time. Below, one row per item, ordered in progress, failed, queued, merged (original order is kept within the same status).
- The layout adapts to the available space: with enough room it shows the full list; shrunk to a small card (about 280x160) it keeps only the version, progress bar, "8/12" and the names of in-progress items; at the smallest size (one line or very narrow) it shows only "1.12.0 · 8/12".
- When pinned, the status chip shows "8/12": red (bad) if any item failed, green (good) if all are merged, neutral otherwise.
- Every time the card receives data (a Command run, a pin refresh, or the bot updating it), even when the data is identical, it redraws and sets the chip again; it also notices a change of the data that arrives without an event within a second. Nothing is kept in screen memory, so resizing only changes the layout.
- When the Board tile is shorter than the list, the list scrolls inside the tile (the version, bar and count stay put); in the chat and when pinned the card is as tall as its content.
- It is built on the shared `ccb.kit` (Card and the app's design tokens, so it follows the light and dark themes) and draws no border or background of its own on the board, in the chat or when pinned.
