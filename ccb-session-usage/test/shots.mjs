// node test/shots.mjs <outdir> [nameRegex] — harness pages with fake ccb data, compact (258x30 inside the 260px bordered slot) and expanded (358px in the 380px card), screenshotted in headless Chrome.
import fs from "node:fs"; import path from "node:path"; import { screenshot } from "./chrome.mjs";
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const web = fs.readFileSync(new URL("../dist/web.js", import.meta.url), "utf8").replace(/^export /gm, "");
const claude = { state: "ok", current: true, name: "session-usage composerBar", model: "claude-sonnet-5-5", mtime: 1, usage: { turns: 148, window: 200000, context: 131400,
  last: { input: 6, cacheRead: 118200, cacheWrite5m: 13194, cacheWrite1h: 0, output: 842, cost: 0.0612, model: "claude-sonnet-5-5" },
  total: { input: 920, cacheRead: 14820000, cacheWrite5m: 1210000, cacheWrite1h: 0, output: 96400, cost: 7.34, unknownTurns: 0 } } };
const codex = { state: "ok", current: false, name: "Review parser", model: "gpt-6.1-sol", usage: { turns: 22, window: 258400, context: 41200,
  last: { input: 41200, cacheRead: 36000, cacheWrite: 0, output: 1300, cost: 0.0381 },
  total: { input: 612000, cacheRead: 480000, cacheWrite: 0, output: 21800, cost: 1.12, unknownTurns: 0 } } };
const agy = { state: "ok", current: false, name: "", model: "gemini-3.8-flash", usage: { turns: 545, window: 0, inferred: true, context: 39369,
  last: { input: 5451, cacheRead: 32600, cacheWrite: 0, output: 497 }, total: { input: 2100000, cacheRead: 11800000, cacheWrite: 0, output: 310000, cost: null } } };
// ---- subagent data (fake but shaped like real host output)
const it = (name, kind, model, tokens, cost, state, extra = {}) => ({ id: name, name, kind, model, tokens, cost, state, turns: 12, ...extra });
const claudeSubs = { count: 8, agents: 6, workers: 2, running: 1, tokens: 18400000, cost: 12.41, unknown: 1, missing: 3, replayed: 2, truncated: 0, items: [
  it("Fix stuck wave select screen", "agent", "claude-sonnet-5-5", 6200000, 4.12, "running"),
  it("Upgrade project and build macOS", "agent", "claude-sonnet-5-5", 4100000, 3.05, "done"),
  it("slides worker (demo-deck)", "worker", "claude-opus-5-5", 2300000, 2.88, "done"),
  it("LaTeX blur to SVG", "fork", "claude-sonnet-5-5", 1700000, 1.27, "done"),
  it("Explore: auth flow", "agent", "claude-haiku-5-5", 3000000, 0.61, "done"),
  it("component-kit", "workflow", "claude-sonnet-5-5", 640000, 0.31, "stopped"),
  it("github-ci", "workflow", "claude-sonnet-5-5", 280000, 0.17, "idle"),
  it("probe (unknown model)", "agent", "claude-mystery-9", 180000, null, "done") ] };
const codexSubs = { count: 3, agents: 3, workers: 0, running: 0, tokens: 1243855, cost: 2.754, unknown: 0, missing: 0, replayed: 0, truncated: 0, items: [
  it("Rawls · protocol_audit", "agent", "gpt-6-astra", 496384, 1.048, "done"), it("Nietzsche · results_audit", "agent", "gpt-6-astra", 376901, 0.877, "done"), it("Heisenberg · mechanism_audit", "agent", "gpt-6-astra", 370570, 0.83, "done") ] };
const none0 = { count: 0, agents: 0, workers: 0, running: 0, tokens: 0, cost: 0, unknown: 0, missing: 0, replayed: 0, truncated: 0, items: [] };
const withSubs = (e, subagents) => ({ ...e, subagents });
const none = (reason) => ({ state: "none", reason, current: false });
const scenes = {
  all: { ok: true, at: Date.now(), follow: { mode: "following", bot: "Maintainer", engine: "claude" }, engines: { claude, codex, agy } },
  subs: { ok: true, at: Date.now(), follow: { mode: "following", bot: "Maintainer", engine: "claude" }, engines: { claude: withSubs(claude, claudeSubs), codex: withSubs(codex, codexSubs), agy: withSubs(agy, { ...none0, count: 2, workers: 2, unreadable: true }) } },
  nosubs: { ok: true, at: Date.now(), follow: { mode: "following", bot: "Maintainer", engine: "claude" }, engines: { claude: withSubs(claude, none0), codex: withSubs(codex, none0), agy: none("no session for this bot") } },
  claude: { ok: true, at: Date.now(), follow: { mode: "following", bot: "Maintainer", engine: "claude" }, engines: { claude, codex: none("no session for this bot"), agy: none("no session for this bot") } },
};
const BORDER = (t) => (t === "light" ? "#DADADF" : "#2E2E35"), BUBBLE = (t) => (t === "light" ? "#FFFFFF" : "#1B1B1F");
// Same page the app builds (panel-page.ts fit mode): margin 0, transparent body, ccb.context.surface, our module drawn into #panel-root.
const frame = (scene, theme, surface, extra = "") => `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>
html,body{margin:0;background:transparent;color:${theme === "light" ? "#1C1C1F" : "#EDEDF0"};font:13px/1.5 -apple-system,"PingFang TC",sans-serif}*{box-sizing:border-box}#panel-root{display:flow-root;overflow-wrap:anywhere}</style></head>
<body><div id="panel-root"></div><script>(()=>{
const data=${JSON.stringify(scenes[scene])};
${web.replace(/<\/script>/g, "<\\/script>")}
const ccb={context:{surface:${JSON.stringify(surface)}},host:{call:async()=>data}};
mountUsage(document.getElementById("panel-root"),ccb,{surface:${JSON.stringify(surface)}});
${extra}
const post=(m)=>parent.postMessage(m,"*"),root=document.getElementById("panel-root");let lastH=-1;const tell=()=>{const h=Math.ceil(root.getBoundingClientRect().height);if(h!==lastH){lastH=h;post({ccb:"resize",height:h});}};new ResizeObserver(tell).observe(root);tell();
})();</script></body></html>`;
// compact: the row slot is 260px wide, 32px tall incl. 1px border; pins on its left like the real row.
const compactPage = (scene, theme) => `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>
body{margin:0;padding:16px;font:13px -apple-system,sans-serif;background:${theme === "light" ? "#F5F5F7" : "#0E0E10"};color:${theme === "light" ? "#1C1C1F" : "#EDEDF0"}}
.row{position:relative;width:540px;height:32px}
.pins{position:absolute;left:0;bottom:0;height:32px;display:inline-flex;align-items:center;gap:6px;border:1px solid ${BORDER(theme)};border-radius:10px;background:${BUBBLE(theme)};padding:0 10px;font-size:12px;color:#8E8E96}
.slot{position:absolute;right:0;bottom:0;width:260px;height:32px;border:1px solid ${BORDER(theme)};border-radius:10px;background:${BUBBLE(theme)};overflow:hidden}
iframe{display:block;width:100%;height:100%;border:0}
.input{margin-top:8px;width:540px;height:44px;border:1px solid ${BORDER(theme)};border-radius:14px;background:${BUBBLE(theme)};padding:12px;color:#8E8E96}
</style></head><body><div class="row"><span class="pins">📊 3 new · 🗒 Docs ok</span><div class="slot"><iframe sandbox="allow-scripts" srcdoc="${frame(scene, theme, "compact").replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"></iframe></div></div><div class="input">Message…</div></body></html>`;
// expanded: the card is 380px wide with 8px 10px padding; the iframe fills it (358px) and is as tall as its content.
const expandedPage = (scene, theme, extra, h) => `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>
body{margin:0;padding:16px;font:13px -apple-system,sans-serif;background:${theme === "light" ? "#F5F5F7" : "#0E0E10"}}
.card{width:380px;padding:8px 10px;border:1px solid ${BORDER(theme)};border-radius:12px;background:${BUBBLE(theme)};box-shadow:0 8px 28px rgb(0 0 0/.35);overflow-y:auto;max-height:480px}
iframe{display:block;width:100%;height:64px;border:0}
</style></head><body><div class="card"><iframe sandbox="allow-scripts" srcdoc="${frame(scene, theme, "expanded", extra).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"></iframe></div><script>addEventListener("message",(e)=>{if(e.data&&e.data.ccb==="resize")document.querySelector("iframe").style.height=Math.max(24,Math.min(20000,e.data.height))+"px";});</script></body></html>`;
const tab = (k) => `setTimeout(()=>document.querySelector('[data-tab="${k}"]').click(),60);`;
const jobs = [];
for (const theme of ["light", "dark"]) {
  jobs.push(["compact-all", compactPage("all", theme), theme, 572, 110]);
  jobs.push(["compact-subs", compactPage("subs", theme), theme, 572, 110]);
  jobs.push(["compact-claude-only", compactPage("claude", theme), theme, 572, 110]);
  jobs.push(["expanded-claude-subs", expandedPage("subs", theme, "", 470), theme, 440, 520]);
  jobs.push(["expanded-codex-subs", expandedPage("subs", theme, tab("codex"), 380), theme, 440, 440]);
  jobs.push(["expanded-agy", expandedPage("subs", theme, tab("agy"), 250), theme, 440, 300]);
  jobs.push(["expanded-nosubs", expandedPage("nosubs", theme, "", 380), theme, 440, 440]);
}
const only = process.argv[3] ? new RegExp(process.argv[3]) : null;
for (const [name, html, theme, w, h] of jobs) {
  if (only && !only.test(name)) continue;
  const f = path.join(out, `${name}-${theme}.html`); fs.writeFileSync(f, html);
  const png = path.join(out, `${name}-${theme}.png`);
  screenshot("file://" + f, png, w, h + 90);
  console.log(png);
}
