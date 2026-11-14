Engine skills board: for each of Claude, Codex and Antigravity, lists the skills and MCP servers that are configured on this machine, plus the skills provided by Botling plugins and whether each engine really has them loaded (checked on disk). Meant for the Board; the data comes from a command, so a bot normally does not need to fill it.
Sizes: 4x2
Icon: square.stack.3d.up.fill
Command: python3 "$BOTLING_DATA_DIR/plugins/botling-components-basic/scripts/engine-skills.py"
Refresh: every 5m

The command is read-only (it reads ~/.claude, ~/.claude.json, ~/.codex, ~/.agents, ~/.gemini and Botling's plugin folders, and runs `claude mcp list` with a 25 s timeout when the claude CLI exists). A bot may also send the same JSON with `<show name="engine-skills">JSON</show>`. No user answer is needed (the component never calls `ccb.answer`).

## Data format (window.ccb.data)

From command:

```json
{
  "engines": [
    {
      "name": "Claude",
      "readable": true,
      "skills": [{ "name": "arbor", "desc": "One-line description from SKILL.md frontmatter" }],
      "mcp": [{ "name": "excalidraw", "status": "connected" }],
      "mcpMode": "live",
      "botlingSkills": [{ "name": "report", "plugin": "botling.report", "desc": "…", "loaded": true }]
    },
    { "name": "Codex", "readable": true, "skills": [], "mcp": [{ "name": "rea", "status": "configured" }], "botlingSkills": [{ "name": "report", "plugin": "botling.report", "loaded": true }] },
    { "name": "Antigravity", "readable": false, "skills": null, "mcp": null, "botlingSkills": [] }
  ]
}
```

- `engines`: in display order (Claude, Codex, Antigravity).
- `readable` (bool): `false` means the engine's config could not be read; the card shows 「無法讀取」 (never 0) and ignores that engine's other fields. `skills` or `mcp` may also be `null` on their own (shown 「無法讀取」 for that part).
- `skills`: loaded, usable skills (user skills, installed plugin skills, built-ins); `desc` is the SKILL.md frontmatter description on one line.
- `mcp[].status`: `connected` / `failed` / `auth` (needs sign-in) only when the engine can be asked cheaply (Claude, via `claude mcp list`, `mcpMode: "live"`); otherwise `configured` (listed in config, connection not checked).
- `botlingSkills[].loaded` (real check per engine, read-only; `<data>` = Botling's data folder): Claude: `<data>/plugin-skills/claude/<plugin>/skills/<name>/SKILL.md` exists. Codex: `<data>/plugin-guides/<plugin>/skills/<name>/SKILL.md` exists and the plugin is not in the `disabled` list of `<data>/plugins.json`. Antigravity: some `entries[].path` in `<data>/agy-acp/<bot>/config/skills.json` holds `<name>/SKILL.md` (missing or invalid JSON counts as not loaded). The card shows 「未載入」 only when the check fails.

Optional (bot only): none.

## Display rules

- Large tile / panel: one column per engine with expandable lists (Skills, MCP servers, Botling plugin skills); open sections stay open across refreshes.
- Small tile (about 1x1 / 2x1): only each engine's skill count and MCP count (failed MCP shown in red).
- Pin chip: status like "C60 X15 A16" (skill counts); tone warning when an engine is unreadable or an MCP failed, else good.
