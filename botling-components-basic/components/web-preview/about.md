Web preview card: shows a shrunken live preview of a single-page HTML result right in the chat, with a title and an "Open" button that opens it full size in its own window. Call it with `<show name="web-preview">JSON</show>`.

## Data format (window.ccb.data)

```json
{
  "path": "/Users/me/project/.bot/artifacts/competitor-report.html",
  "title": "Competitor comparison report"
}
```

- `path`: full path to the HTML file. A `file://` URL or a path starting with `~/` also works.
- `title`: title shown on the card; defaults to the file name when omitted.
- `src`, `url`, `name`, `missing` are filled in by the app itself, do not write them. If the file does not exist, the card shows "File not found".

## When to use

- When a reply links to an .html file in the `artifacts` folder, e.g. `[Competitor comparison](file:///…/.bot/artifacts/report.html)`, the app automatically draws this card. Just include the link as usual; no separate `<show>` is needed.
- Use `<show>` only to change the card title, or when the page is not in the `artifacts` folder. A page outside `artifacts` loads only that single file, so images next to it will not display.
- One reply can contain several `<show>` blocks; each is drawn where it is written.
- No user answer is needed; `ccb.answer` is never called.
- Layout: one responsive layout. The page is scaled to the card width (in chat and pinned, at most 400px wide and 150px tall, showing the top of the page); on the Board it fills the tile, the preview shrinking before the title and the "Open" button do. A new data event for the same card (including the same data again) reloads the preview.
