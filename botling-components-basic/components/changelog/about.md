Changelog: see what a given version did (data comes from CHANGELOG.md). The 2x2 size toggles between "Single" (a dropdown plus a slider to pick a version) and "Overview" (a timeline of all versions). Just call it with `<show name="changelog"></show>`; you do not need to pass any data.
Command: head -c 200000 CHANGELOG.md
Sizes: 1x1, 2x1, 2x2

The default Command reads the first 200 KB of CHANGELOG.md in the current project folder and hands the whole text to the component. The component splits versions the keep-a-changelog way: every line starting with `## ` is a version (any preamble before the first version heading is ignored); both `## 1.9.0` and `## [1.9.0] - 2026-10-20` work, and the date is shown next to the version number. Headings such as `### Added` or `### Fixed` inside a version are sub-headings (shown as colored tags: Added green, Fixed orange, Changed blue, Removed red). Lines starting with `- ` are entries; the first `**bold**` part of an entry is its title and the text after it is the description (in a softer color); indented continuation lines (two spaces) are merged into the same entry. `**bold**` and `` `code` `` are rendered as bold text and code. Versions keep the order of the file: the first one is the newest and is selected by default.

## Data format (window.ccb.data)

The simplest input is the full text of CHANGELOG.md (a string). A JSON object is also accepted:

```json
{
  "versions": [
    {"version": "1.9.0", "date": "2026-10-20", "theme": "Board tiles", "body": "### Added\n- **Board tiles.** Components on the board can be pinned from 1x1 up to 4x2.\n\n### Fixed\n- **Chat scroll.** Scrolling a long conversation no longer jumps."},
    {"version": "1.8.0", "date": "2026-10-10", "theme": "Collapsible sidebars", "body": "### Changed\n- **Sidebars.** Both the left and right sidebars can be collapsed."}
  ],
  "selected": "1.9.0",
  "link": "https://example.com/changelog.html"
}
```

- `versions`: an array; each item has `version` (required), `date`, `theme` and `body` (the same content as a version section in CHANGELOG). The first item is treated as the newest version.
- `selected`: optional. A version string or an index (starting at 0) that decides which version is selected at first; if omitted, the first version is selected.
- `link`: optional. If present, the 2x2 size shows "Open full changelog" at the bottom (only http, https and file URLs are accepted).
- A JSON string, or a JSON array `[{version, date, theme, body}, ...]` (without `link`), is also accepted.
- Empty data (no versions at all) shows "No data".

## Sizes

- 1x1: the version number and date of the newest version, plus the title of its first entry.
- 2x1: a dropdown plus the titles of the first two entries of the selected version (no slider or toggle).
- 2x2 (default): "Single" and "Overview" toggle buttons. Single shows the version number, date and theme, a dropdown and a slider (oldest on the left, newest on the right, current version in the middle), then the full content of that version (scrollable). Overview is a timeline of all versions; each node shows the version number, date and theme (or the first two entry titles when there is no theme). When `link` is set, "Open full changelog" appears at the bottom.

The Single / Overview choice and the selected version are kept in screen memory only and are not saved. They stay while the card is resized, and start again (newest or `selected` version, Single) every time the card receives data (a Command refresh, a pin refresh, or the bot updating it), even when the data is identical. Clicking a version in Overview switches back to Single and selects it.

## Answer

This is a display-only component: it asks the user no questions and never calls `ccb.answer`, so the bot that showed it receives no reply. "Open full changelog" opens the link in a new window. It is built on the shared `ccb.kit` (Card, Empty and the app's design tokens, so it follows the light and dark themes) and draws no border or background of its own on the board, in the chat or when pinned. It sets no pin status chip and has no Icon.
