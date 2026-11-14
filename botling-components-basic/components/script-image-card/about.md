Generic picture card: runs YOUR own script (fetch data + draw the chart) and shows the image it makes (title + picture only). Call it with `<show name="script-image-card"></show>` with nothing inside.
Icon: chart.xyaxis.line
Sizes: 2x2
Command: "$BOTLING_DATA_DIR/plugins/botling-components-basic/components/script-image-card/run.sh"
Board command: "$BOTLING_DATA_DIR/plugins/botling-components-basic/components/script-image-card/run.sh"
Refresh: every 10m

## Setup (3 steps, done by the user)
1. Write an executable script (chmod +x, or with a shebang) that fetches what it needs, draws the chart and prints the image path as its LAST stdout line.
2. Copy `script-image.conf.example` (next to `run.sh`) to `script-image.conf` and set `script=/absolute/path/to/your_script`. Optional lines: `title=...`, `timeout=120` (seconds), `workdir=/abs/dir`. The real conf is git-ignored.
3. Show the card and press "Allow and run" once. The Command runs whatever script the conf names, so only put scripts you trust there.

## Script contract
- Run with no stdin, in `workdir` (if set), stopped after `timeout` seconds (default 120).
- Exit code 0, and the LAST non-empty stdout line is either an absolute image path (.png/.jpg/.webp) or JSON `{"title": "...", "image": "/abs/path.png"}` (JSON title wins over the conf title).
- Other stdout lines are ignored; the last 5 stderr lines are shown on failure (values after password/token/secret/api key words are masked). Do not print secrets.
- `run.sh` copies the image to `cache/` next to it (timestamped, newest 3 kept).

## Data format (window.ccb.data)

```json
{ "title": "My chart", "image": "/.../script-image-card/cache/img_1762600000000.png" }
```
On failure: `{ "error": "Script exited with code 2.\nlast stderr lines", "title": "My chart" }` (always exit 0, so the card shows the message).

### From command
`title` and `image` (absolute path), or `error` (+ optional `title`) as above.

### Optional (bot only)
None. A bot may give `title`/`image` directly to show any picture; `error` shows the muted error text.

## How to call it
Write `<show name="script-image-card"></show>` (no JSON inside, or the Command is not run; optional `id`). It reruns every 10 minutes while on screen, and via ↻.

## Behaviour
- Click the picture (or Enter) to open it larger. Missing file: "Image not found".
- Error state shows the message and a hint to create `script-image.conf` from the example. Pin chip: "ok" (good) or "error" (bad).
- No user answer is needed; `ccb.answer` is never called.
