Versions summary timeline: the bot writes each version's theme and highlights in plain English, and the component draws them as a collapsible vertical timeline; summon it with `<show name="versions-summary">JSON</show>`, the data is supplied by the bot itself (no Command).
Icon: list.bullet.rectangle

**Suggested usage**: first turn the version history (changelog, git log, release notes) into plain English yourself, then display it with `<show name="versions-summary">…JSON…</show>`. No user answer is needed; the component never calls `ccb.answer`.

## Data format (window.ccb.data)

```json
{
  "title": "ClaudeCodeBot versions at a glance",
  "subtitle": "Newest first. One sentence of theme per version, highlights below.",
  "versions": [
    {
      "version": "1.11.0",
      "theme": "Bots no longer stop at just saying it, and finding a bot is faster",
      "points": [
        "When a bot says \"I will do this next\" but doesn't, it is sent back to finish; the reply is still shown first",
        "Pin your favorite bots in the left column, and search bots with Cmd+K",
        "Cards can be freely resized, and the content lays itself out"
      ]
    },
    { "version": "1.10.1", "theme": "Stability fixes", "points": ["When the app restarts or updates, the bot no longer spends an extra round on handoff"] },
    { "version": "1.0.0", "theme": "First release", "points": ["Main bot, one manager bot per project, temporary teams, scheduled jobs"] }
  ]
}
```

- `versions` is ordered newest to oldest (the first one is the latest version).
- `version`: the version number (a string; something like `"1.7.0 / 1.7.1"` is fine too). `theme`: a one-sentence theme. `points`: an array of highlight strings, written in plain English, one sentence per point.
- All fields are optional: without `title`/`subtitle` no heading is shown; a version without `points` cannot be expanded; `versions` alone is enough. The data can also be a bare array of versions, or a JSON string.
- If the data is missing or malformed, the component shows its built-in sample (the ClaudeCodeBot versions list). An empty `versions` array shows "No version data yet".

## Display rules

- The top shows the title and subtitle; below is a vertical timeline with one row per version: version badge + one-sentence theme + the highlight list when expanded.
- The newest version is expanded by default and the others are collapsed; click a version row to expand/collapse it, and the "Expand all" / "Collapse all" button at the top right toggles everything at once.
- The layout adapts to the tile size: wide or large tiles show the full list (scrolling inside the tile when it does not fit); very small tiles show only the newest version's badge and theme.
- When pinned, the status chip shows the newest version number (cleared when there is none).
- When the bot sends new data to the same card, the timeline redraws and returns to the default (newest expanded); the user's expand/collapse choices are not saved.
- Light and dark modes are both supported; Board, chat and the pinned panel do not draw their own border.

## Answers

None. This component never sends anything back to the bot (no `ccb.answer` / `deck.answer`).
