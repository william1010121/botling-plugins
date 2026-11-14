const fmt = (n) => Number(n || 0).toLocaleString("en-US");
const usd = (n) => "$" + Number(n || 0).toFixed(n >= 1 ? 2 : 4);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ENGINE = { claude: "Claude", codex: "Codex", agy: "Antigravity" };

// Botling's theme tokens (Web/src/tokens.css, Theme.swift). The panel page does not load that sheet,
// so the same names and values are declared here, dark first and light under data-theme="light".
// Every colour below is read through var(--token); nothing else is hardcoded.
const TOKENS = `
:root{color-scheme:dark;--bubble:#1B1B1F;--card:#232328;--card-line:#303037;--line:#232327;--text:#EDEDF0;--muted:#A0A0A8;--faint:#8E8E96;--chip:#2A2A31;--border:#2E2E35;--blue:#4C8DFF;--green:#4CC38A;--orange:#F2A64A;--orange-text:#F7C27F;--waiting-bg:#2A2116;--orange-line:#6B4A1F;--error:#FF8A80;--ground:#0E0E10}
:root[data-theme="light"]{color-scheme:light;--bubble:#FFFFFF;--card:#FFFFFF;--card-line:#DADADF;--line:#E3E3E8;--text:#1C1C1F;--muted:#5F5F68;--faint:#7A7A83;--chip:#EEEEF2;--border:#DADADF;--blue:#2F6FE0;--green:#1E8A55;--orange:#B26A00;--orange-text:#9A5B00;--waiting-bg:#FFF4E2;--orange-line:#E8C79A;--error:#D0342C;--ground:#F5F5F7}`;

export function statusLine(f, pinned) {
  f = f || {};
  const who = f.bot ? esc(f.bot) + " · " + esc(ENGINE[f.engine] || f.engine || "?") : "";
  switch (f.mode) {
    case "following": return ["ok", `Following: <b>${who}</b>`];
    case "pinned": return ["pin", "Pinned to the session below. Choose “Follow current conversation” to follow again."];
    case "unavailable": return ["warn", "Workspace API unavailable: showing most recent session"];
    case "none-open": return ["warn", "No conversation open: showing most recent session"];
    case "unsupported": return ["warn", `${who}: no usage log for this engine: showing most recent session`];
    case "no-session": return ["warn", `${who}: no session started yet: showing most recent session`];
    case "no-file": return ["warn", `${who}: session log not found: showing most recent session`];
    default: return ["warn", "Waiting for the app: showing most recent session"];
  }
}
const ORDER = ["claude", "codex", "agy"];
const ABBR = { claude: "Cl", codex: "Cx", agy: "Ag" };
const short = (n) => { n = Number(n || 0); return n >= 1e9 ? (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "k" : String(Math.round(n)); };
const usdShort = (n) => n == null ? "—" : "$" + (n >= 100 ? Math.round(n).toLocaleString("en-US") : n >= 10 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(3));
// Compact cell: never longer than "$999" / "$12.3k" / "$123k" ($1,234.56 -> $1.23k), so the row never truncates it.
const usdBar = (n) => n == null ? "—" : n >= 1e5 ? "$" + Math.round(n / 1e3) + "k" : n >= 1e4 ? "$" + (n / 1e3).toFixed(1) + "k" : n >= 1e3 ? "$" + (n / 1e3).toFixed(2) + "k" : usdShort(n);
const totalTokens = (t) => t.input + t.cacheRead + (t.cacheWrite != null ? t.cacheWrite : (t.cacheWrite5m || 0) + (t.cacheWrite1h || 0)) + t.output;
// Codex input_tokens already INCLUDES cached + cache-write tokens, so adding them again would double count.
const codexTokens = (t) => t.input + t.output;

// One engine's numbers in display form; null usage = greyed.
export function engineView(key, e) {
  const v = { key, name: ENGINE[key], ok: false, current: !!(e && e.current), reason: (e && e.reason) || "" };
  if (!e || e.state !== "ok" || !e.usage) return v;
  const u = e.usage, l = u.last, t = u.total, codex = key === "codex", agy = key === "agy";
  const split = (x) => codex || agy ? { input: Math.max(0, x.input - (codex ? x.cacheRead + x.cacheWrite : 0)), cr: x.cacheRead, cw: x.cacheWrite, out: x.output }
    : { input: x.input, cr: x.cacheRead, cw: x.cacheWrite5m + x.cacheWrite1h, out: x.output };
  const win = u.window || 0;
  Object.assign(v, {
    ok: true, inferred: !!u.inferred, model: e.model || "", session: e.name || "", turns: u.turns, window: win, context: u.context,
    pct: win ? Math.min(100, (u.context / win) * 100) : null,
    last: l ? { ...split(l), cost: l.cost == null ? null : l.cost } : null,
    total: { ...split(t), cost: agy ? null : t.cost, unknown: t.unknownTurns || 0 },
    tokens: agy ? t.input + t.cacheRead + t.cacheWrite + t.output : codex ? codexTokens(t) : totalTokens(t),
  });
  v.sub = subView(e.subagents);
  // main / subagents / combined. Combined cost is main + the subagents that could be priced; `partial` says some could not.
  const s = v.sub;
  v.comb = {
    tokens: v.tokens + (s && !s.unreadable ? s.tokens : 0),
    cost: v.total.cost == null ? null : v.total.cost + (s && !s.unreadable && s.cost != null ? s.cost : 0),
    partial: !!(s && !s.unreadable && s.unknown),
    has: !!(s && !s.unreadable && s.count > 0),
  };
  return v;
}
export function subView(x) {
  if (!x || typeof x !== "object") return null;
  const items = Array.isArray(x.items) ? x.items : [];
  return { count: x.count || 0, agents: x.agents || 0, workers: x.workers || 0, running: x.running || 0, tokens: x.tokens || 0,
    cost: x.cost == null ? null : x.cost, unknown: x.unknown || 0, missing: x.missing || 0, replayed: x.replayed || 0,
    unreadable: !!x.unreadable, note: x.note || "", truncated: x.truncated || 0, items };
}
const pctText = (v) => v.pct == null ? (v.inferred ? "~" : "") + short(v.context) : (v.pct < 10 ? v.pct.toFixed(1) : Math.round(v.pct)) + "%";
const lvl = (p) => p == null ? "" : p >= 90 ? "hi" : p >= 70 ? "mid" : "";

// Two surfaces of one view ("ccb-session-usage.bar"), told apart by ccb.context.surface:
//   compact  = the one-line frame in the row above the composer (260 px wide, 30 px tall, no padding, takes no clicks: the app opens the card)
//   expanded = the card the app opens above it (380 px wide, 480 px high at most; its height follows our content via the page's own resize message)
// Rendering is pure (state -> HTML string), so it can be tested without a browser.
export const BAR_CSS = `<style>${TOKENS}
*{box-sizing:border-box}
html,body{overflow:hidden}
.cb{display:flex;height:30px;width:100%;font:11px/1 -apple-system,"PingFang TC","Segoe UI",sans-serif;color:var(--text);font-variant-numeric:tabular-nums;user-select:none}
.cb-c{container-type:inline-size;flex:1 1 0;min-width:0;position:relative;display:flex;align-items:center;justify-content:center;gap:4px;padding:0 3px;white-space:nowrap;overflow:hidden}
.cb-c+.cb-c{box-shadow:inset 1px 0 0 var(--border)}
.cb-c .en{font-size:10px;font-weight:650;color:var(--muted)}
.cb-c .p{font-weight:650}
.cb-c .co{font-size:10px;color:var(--muted)}
.cb-c sup{font-size:8px;color:var(--faint);vertical-align:baseline;margin-left:1px}
.cb-c .cur{position:absolute;left:3px;top:3px;width:4px;height:4px;border-radius:50%;background:var(--green)}
.cb-c .lv{position:absolute;left:0;bottom:0;height:2px;background:var(--blue)}
.cb-c.mid .lv{background:var(--orange)}.cb-c.hi .lv{background:var(--error)}
@container (max-width:104px){.cb-c .en{display:none}}
.cb-c.off .en,.cb-c.off .p,.cb-c.off .co{color:var(--faint);font-weight:500}
</style>`;

export const CARD_CSS = `<style>${TOKENS}
*{box-sizing:border-box}
.ex{font:12px/1.35 -apple-system,"PingFang TC","Segoe UI",sans-serif;color:var(--text);font-variant-numeric:tabular-nums;min-width:0}
.ex *{min-width:0}
.ex-tabs{display:flex;gap:4px;margin-bottom:8px}
.ex-tab{flex:1 1 0;display:flex;align-items:center;justify-content:center;gap:5px;padding:5px 4px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--muted);font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap;overflow:hidden}
.ex-tab:hover{background:var(--chip)}
.ex-tab.on{background:var(--chip);border-color:var(--blue);color:var(--text);font-weight:650}
.ex-tab .cur{width:5px;height:5px;border-radius:50%;background:var(--green);flex:none}
.ex-tab .tp{font-size:10.5px;color:var(--muted);font-weight:500}
.ex-tab.off{color:var(--faint)}
.uc-h{display:flex;align-items:center;gap:6px;font-weight:650;font-size:13px}
.uc-h .cur{width:6px;height:6px;border-radius:50%;background:var(--green)}
.uc-m b{font-weight:600;color:var(--text)}
.uc-m{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.uc-cx{display:flex;justify-content:space-between;align-items:baseline;margin-top:8px}
.uc-cx b{font-size:17px;font-weight:650;letter-spacing:-.01em}.uc-cx span{font-size:11px;color:var(--muted)}
.uc-bar{height:6px;border-radius:99px;background:var(--chip);overflow:hidden;margin:4px 0 8px}
.uc-bar i{display:block;height:100%;border-radius:99px;background:var(--blue)}
.uc-bar.mid i{background:var(--orange)}.uc-bar.hi i{background:var(--error)}
.uc-t{display:grid;grid-template-columns:1fr auto auto;column-gap:12px;font-size:11.5px;row-gap:3px}
.uc-t .th{font-size:10.5px;color:var(--faint);text-align:right;letter-spacing:.02em}
.uc-t .k{color:var(--muted)}.uc-t .n{text-align:right}
.uc-t .sep{grid-column:1/-1;border-top:1px solid var(--line);margin:2px 0}
.uc-t .cost{font-weight:650}
.uc-na{margin-top:10px;font-size:11.5px;color:var(--faint)}
.sb-box{margin-top:9px;padding-top:7px;border-top:1px solid var(--line)}
.sb-h{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:0 8px;font-size:11.5px;font-weight:650}
.sb-h .n{font-weight:500;color:var(--muted);font-size:10.5px}
.sb-t{margin-top:4px}
.sb-t .tot,.sb-t .tot.k{font-weight:650;color:var(--text)}
.sb-l{margin-top:5px;display:grid;grid-template-columns:8px minmax(0,1fr) auto auto auto;column-gap:6px;row-gap:2px;align-items:center;font-size:11px}
.sb-l .d{width:6px;height:6px;border-radius:50%;background:var(--faint);justify-self:center}
.sb-l .d.running{background:var(--green)}.sb-l .d.stopped,.sb-l .d.idle,.sb-l .d.failed{background:var(--orange)}.sb-l .d.done{background:var(--faint);opacity:.6}
.sb-l .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)}
.sb-l .md,.sb-l .tk{color:var(--muted);font-size:10.5px;text-align:right;white-space:nowrap}
.sb-l .cs{text-align:right;white-space:nowrap;font-weight:600}
.sb-l .cs.na{color:var(--faint);font-weight:500}
.sb-more{margin-top:4px}
.sb-more>summary{cursor:pointer;list-style:none;font-size:10.5px;color:var(--blue);padding:1px 0}
.sb-more>summary::-webkit-details-marker{display:none}
.sb-more>summary::before{content:"▸ "}.sb-more[open]>summary::before{content:"▾ "}
.sb-all{max-height:130px;overflow:auto;padding-right:2px;margin-top:2px}
.sb-none{margin-top:9px;padding-top:7px;border-top:1px solid var(--line);font-size:10.5px;color:var(--faint)}
.sb-note{margin-top:4px;font-size:10px;color:var(--faint);line-height:1.35}
.uc-warn{margin-top:6px;font-size:10.5px;color:var(--orange-text)}
.uq .qr{color:var(--faint);font-size:10.5px}.uq-na{margin-top:4px;color:var(--faint)}
.ex-load{padding:18px 0;text-align:center;color:var(--faint);font-size:11.5px}
</style>`;

// Compact: three equal cells "Cl 42% $7.34+". Context % = main thread only; tokens/cost include subagents (marked "+").
// r === null: placeholder (nothing loaded yet).
export function renderBar(r) {
  const eng = (r && r.engines) || {};
  const cells = ORDER.map((k) => {
    const v = engineView(k, eng[k]);
    if (!v.ok) return `<div class="cb-c off" title="${esc(ENGINE[k] + ": " + (v.reason || (r && r.follow && r.follow.mode) || "loading"))}"><span class="en">${ABBR[k]}</span><span class="p">${r ? "—" : "…"}</span></div>`;
    const cost = v.comb.cost == null ? (k === "agy" && v.comb.has ? short(v.comb.tokens) : "—") : (v.comb.partial ? "≥" : "") + usdBar(v.comb.cost);
    return `<div class="cb-c ${lvl(v.pct)}" title="${esc(v.name + " · " + v.model)}">${v.current ? '<span class="cur"></span>' : ""}<span class="en">${ABBR[k]}</span><span class="p">${pctText(v)}</span><span class="co">${cost}${v.comb.has ? "<sup>+</sup>" : ""}</span>${v.pct != null ? `<span class="lv" style="width:${v.pct.toFixed(1)}%"></span>` : ""}</div>`;
  }).join("");
  return cells;
}

const tilde = (on) => (on ? "~" : "");
const STATE_TXT = { running: "running", done: "finished", stopped: "stopped", idle: "no finish marker, idle", failed: "failed" };
const KIND_TXT = { agent: "subagent", fork: "forked subagent", workflow: "workflow subagent", nested: "nested subagent", worker: "Botling worker" };
const famShort = (m) => { m = String(m || ""); const f = /opus|sonnet|haiku/i.exec(m); if (f) return f[0][0].toUpperCase() + f[0].slice(1, 3).toLowerCase(); const x = /(sol|terra|astra|luna)$/i.exec(m); return x ? x[1][0].toUpperCase() + x[1].slice(1) : m.replace(/^claude-/, "").slice(0, 4) || "?"; };
const rowHtml = (i) => {
  const cost = i.tokens == null ? '<span class="cs na" title="usage not readable, not counted">—</span>' : i.cost == null ? '<span class="cs na" title="no price for this model, not counted">—</span>' : `<span class="cs"${i.partial ? ' title="some turns of this model have no price and are not counted"' : ""}>${i.partial ? "≥" : ""}${usdShort(i.cost)}</span>`;
  const tip = `${i.name}\n${KIND_TXT[i.kind] || i.kind} · ${i.model || "model ?"} · ${STATE_TXT[i.state] || i.state} · ${i.tokens == null ? "usage not readable" : fmt(i.tokens) + " tokens"}${i.turns != null ? " · " + i.turns + " calls" : ""}`;
  return `<span class="d ${esc(i.state)}" title="${esc(STATE_TXT[i.state] || i.state)}"></span><span class="nm" title="${esc(tip)}">${esc(i.name)}</span><span class="md" title="${esc(i.model || "model ?")}">${esc(famShort(i.model))}</span><span class="tk">${i.tokens == null ? "—" : short(i.tokens)}</span>${cost}`;
};
// Subagents block of one engine column. Main / subagents / combined are separate rows so they cannot be mixed up.
export function subSection(v, expanded, topN = 5) {
  const s = v.sub, px = tilde(v.inferred);
  if (!s) return "";
  if (s.unreadable) return `<div class="sb-none">Subagents: ${s.count ? s.count + " registered worker" + (s.count === 1 ? "" : "s") + ", usage not readable" : "not tracked"}${s.note ? " (" + esc(s.note) + ")" : ""}</div>`;
  if (!s.count && !s.missing) return `<div class="sb-none">Subagents: none</div>`;
  const parts = [];
  if (s.agents) parts.push(`${s.agents} agent${s.agents === 1 ? "" : "s"}`);
  if (s.workers) parts.push(`${s.workers} worker${s.workers === 1 ? "" : "s"}`);
  if (s.running) parts.push(`${s.running} running`);
  const partial = s.unknown || s.missing; // coverage not complete → "~"
  const top = s.items.slice(0, topN), rest = s.items.slice(topN);
  const c = (n) => (n == null ? "—" : usdShort(n));
  const notes = [];
  if (s.unknown) notes.push(`${s.unknown} with an unpriced model: cost not counted`);
  if (s.missing) notes.push(`${s.missing} worker(s) with no readable log: not counted`);
  if (s.replayed) notes.push(`${s.replayed} replayed parent message(s) excluded`);
  if (s.truncated) notes.push(`${s.truncated} more not listed`);
  return `<div class="sb-box"><div class="sb-h"><span>Subagents</span><span class="n" title="${esc(parts.join(" · "))}">${esc(parts.join(" · "))}</span></div>
    <div class="uc-t sb-t"><span></span><span class="th">TOKENS</span><span class="th">COST</span>
      <span class="k">Main</span><span class="n">${px}${short(v.tokens)}</span><span class="n">${c(v.total.cost)}</span>
      <span class="k">Subagents</span><span class="n">${tilde(partial)}${short(s.tokens)}</span><span class="n">${tilde(partial)}${c(s.cost)}</span>
      <span class="sep"></span><span class="k tot" title="main thread + subagents">Combined</span><span class="n tot">${tilde(partial)}${short(v.comb.tokens)}</span><span class="n tot">${v.comb.cost == null ? "—" : tilde(partial) + c(v.comb.cost)}</span></div>
    ${top.length ? `<div class="sb-l" role="list">${top.map(rowHtml).join("")}</div>` : ""}
    ${rest.length ? `<details class="sb-more" data-k="${esc(v.key)}"${expanded && expanded.has(v.key) ? " open" : ""}><summary>Show all ${s.items.length}</summary><div class="sb-l sb-all" data-k="${esc(v.key)}">${rest.map(rowHtml).join("")}</div></details>` : ""}
    ${notes.map((n) => `<div class="sb-note">${esc(n)}</div>`).join("")}</div>`;
}


// Expanded: tabs (one engine at a time keeps the card inside 380 x 480), the open tab's pane, a footer.
// opts.tab = chosen engine key (default: the conversation's own engine, else the first with data); opts.expanded = engines whose "Show all" is open.
export function pickTab(r, tab) {
  if (ORDER.includes(tab)) return tab;
  const eng = (r && r.engines) || {}, f = (r && r.follow) || {};
  if (eng[f.engine] && eng[f.engine].state === "ok") return f.engine;
  return ORDER.find((k) => eng[k] && eng[k].state === "ok") || "claude";
}
// Antigravity quota: one row per bucket, "—" while Botling cannot say (older app, no login, offline).
const when = (ms) => { if (!ms) return ""; const d = ms - Date.now(); if (d <= 0) return "resets now"; const m = Math.round(d / 60000); return "resets in " + (m >= 1440 ? Math.round(m / 1440) + "d" : m >= 60 ? Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "m" : "") : m + "m"); };
export function quotaSection(q) {
  if (!q) return "";
  const rows = (q.buckets || []).map((b) => {
    const left = b.disabled ? "off" : b.left != null ? Math.round(b.left * 100) + "% left" : b.amount != null ? esc(b.amount) : "—";
    return `<span class="k" title="${esc(b.group)}">${esc(b.label)}</span><span class="n">${left}</span><span class="n qr">${esc(when(b.resetsAt))}</span>`;
  }).join("");
  const body = rows ? `<div class="uc-t uq">${rows}</div>` : `<div class="uq-na" title="${esc(q.reason || "")}">—</div>`;
  const note = q.status === "available" ? "" : `<div class="sb-note">${q.stale ? "Last known values (live quota unavailable)" : "Quota unavailable"}${q.reason ? ": " + esc(q.reason) : ""}</div>`;
  return `<div class="sb-box"><div class="sb-h"><span>Quota</span></div>${body}${note}</div>`;
}
function pane(k, eng, expanded, quota) {
  const v = engineView(k, eng[k]);
  if (!v.ok) return `<div class="uc-h">${v.name}</div><div class="uc-na">${esc(v.reason ? (k === "agy" && eng[k] && eng[k].state === "nodata" ? "No data: " + v.reason : "—  " + v.reason) : "—  no session for this bot")}</div>${k === "agy" ? quotaSection(quota) : ""}`;
  const px = v.inferred ? "~" : "";
  const row = (label, a, b) => `<span class="k">${label}</span><span class="n">${a == null ? "—" : px + fmt(a)}</span><span class="n">${b == null ? "—" : px + fmt(b)}</span>`;
  const L = v.last || {}, T = v.total;
  return `<div class="uc-m" title="${esc(v.model)}"><b>${esc(v.model || "model ?")}</b> · ${v.turns} ${k === "claude" ? "msgs" : "calls"}</div>
    <div class="uc-m" title="${esc(v.session)}">${esc(v.session || "(untitled)")}</div>
    <div class="uc-cx"><b>${pctText(v)}</b><span>${px}${fmt(v.context)}${v.window ? " / " + short(v.window) : " ctx"}</span></div>
    ${v.pct != null ? `<div class="uc-bar ${lvl(v.pct)}"><i style="width:${v.pct.toFixed(1)}%"></i></div>` : '<div class="uc-bar"></div>'}
    ${k === "agy" ? `<div class="uc-t"><span class="k">Current context</span><span class="n" title="last call: input + cache read + cache write">${fmt(v.context)}</span><span class="k">Session total</span><span class="n" title="all calls; mostly cache reads">${fmt(v.tokens)}</span></div>${v.window ? '<div class="uc-warn">window = the model\'s full window; Antigravity compacts earlier (~290k), so % is not distance to compaction.</div>' : ""}` : ""}
    <div class="uc-t"><span></span><span class="th">LATEST</span><span class="th">TOTAL</span>
      ${row("Input", L.input, T.input)}${row("Cache read", L.cr, T.cr)}${row("Cache write", L.cw, T.cw)}${row("Output", L.out, T.out)}
      <span class="sep"></span><span class="k">Cost</span><span class="n">${L.cost == null ? "—" : usdShort(L.cost)}</span><span class="n cost">${T.cost == null ? "—" : usdShort(T.cost)}</span></div>
    ${subSection(v, expanded)}
    ${k === "agy" ? quotaSection(quota) : ""}
    ${k === "agy" ? '<div class="uc-warn">No price table: tokens only.</div>' : ""}
    ${T.unknown ? `<div class="uc-warn">${T.unknown} turn(s) with unknown price not counted</div>` : ""}`;
}
export function renderCard(r, opts) {
  const expanded = (opts && opts.expanded) || null;
  if (!r) return `<div class="ex-load">Loading usage…</div>`;
  const eng = r.engines || {}, on = pickTab(r, opts && opts.tab);
  const tabs = ORDER.map((k) => {
    const v = engineView(k, eng[k]);
    return `<button type="button" class="ex-tab${k === on ? " on" : ""}${v.ok ? "" : " off"}" data-tab="${k}" aria-pressed="${k === on}">${v.current ? '<span class="cur"></span>' : ""}${v.name}<span class="tp">${v.ok ? pctText(v) : "—"}</span></button>`;
  }).join("");
  const f = r.follow || {};
  // No footer. Only when the card is NOT following the open conversation, say so (otherwise the numbers could be mistaken for it).
  const warn = f.mode === "following" ? "" : `<div class="uc-warn">${statusLine(f)[1]}</div>`;
  return `<div class="ex-tabs">${tabs}</div><div class="ex-pane" data-pane="${on}">${pane(on, eng, expanded, r.quota)}</div>${warn}`;
}

// Mounts one surface into `root`. A placeholder is drawn first (both frames are rebuilt on every chat switch), then data is asked of
// the program part and refreshed every `interval` ms (30 s). Only the DOM that actually changed is replaced, so an open card never
// closes: no full-page redraw, same HTML = no write, tab / "Show all" / scroll positions are kept. Returns a dispose function.
export function mountUsage(root, ccb, { surface = "compact", interval = 30000, load } = {}) {
  load = load || (() => ccb.host.call("usageAll", {}));
  const card = surface === "expanded";
  root.innerHTML = (card ? CARD_CSS : BAR_CSS) + `<div class="${card ? "ex" : "cb"}"></div>`;
  const el = root.querySelector(card ? ".ex" : ".cb");
  let last = "", state = null, tab = null, busy = false, dead = false;
  const expanded = new Set();
  const html = () => (card ? renderCard(state, { tab, expanded }) : renderBar(state));
  const draw = () => {
    const h = html();
    if (h === last) return;
    const scroll = {}; el.querySelectorAll(".sb-all").forEach((x) => { scroll[x.dataset.k] = x.scrollTop; });
    el.innerHTML = h; last = h;
    el.querySelectorAll(".sb-all").forEach((x) => { if (scroll[x.dataset.k]) x.scrollTop = scroll[x.dataset.k]; });
  };
  if (card) {
    el.addEventListener("click", (e) => {
      const b = e.target.closest && e.target.closest("[data-tab]");
      if (b) { tab = b.dataset.tab; draw(); }
    });
    // <details> toggle does not bubble: capture it; keep `last` in step so the toggle itself never triggers a redraw.
    el.addEventListener("toggle", (e) => {
      const d = e.target; if (!d || !d.classList || !d.classList.contains("sb-more")) return;
      if (d.open) expanded.add(d.dataset.k); else expanded.delete(d.dataset.k);
      last = html();
    }, true);
  }
  draw(); // placeholder first
  // A failed call, or the app not yet saying which chat is open, is retried quickly (2 s, 4 s, ... up to `interval`): a frame is
  // made again on every chat switch and app start, and its first call can land before the plugin host or the chat is ready.
  let timer = null, fails = 0;
  const tick = async () => {
    if (busy || dead) return; busy = true;
    let bad = false;
    try {
      const next = await load(), m = next && next.follow && next.follow.mode;
      state = next;
      bad = !next || next.ok === false || m === "none-open" || m === "unavailable";
    } catch (e) { bad = true; if (!state) state = { ok: false, engines: {}, follow: { mode: "error", detail: String((e && e.message) || e) } }; }
    busy = false;
    if (dead) return;
    draw();
    fails = bad ? fails + 1 : 0;
    timer = setTimeout(tick, bad ? Math.min(interval, 2000 * 2 ** (fails - 1)) : interval);
  };
  tick();
  return () => { dead = true; clearTimeout(timer); };
}

export function activate(ccb) {
  return ccb.panels.register("ccb-session-usage.bar", (root) => {
    const surface = ccb.context && ccb.context.surface === "expanded" ? "expanded" : "compact";
    return mountUsage(root, ccb, { surface });
  });
}
