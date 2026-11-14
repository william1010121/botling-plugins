// node test/subs-web.test.mjs — pure rendering: main vs subagents vs combined, '~' / '—' honesty, top-N + show-all, no-subagent case.
import assert from "node:assert/strict";
import { engineView, renderBar, renderCard, subSection } from "../dist/web.js";
const item = (n, cost, o = {}) => ({ id: "i" + n, name: "agent " + n, kind: "agent", model: "claude-sonnet-5-5", tokens: 1000 * n, cost, state: "done", turns: 3, ...o });
const items = [item(7, 0.7), item(6, 0.6, { state: "running" }), item(5, 0.5), item(4, 0.4, { kind: "fork" }), item(3, 0.3), item(2, 0.2), item(1, null, { model: "claude-mystery-9", state: "idle" })];
const sub = { count: 7, agents: 7, workers: 0, running: 1, tokens: 28000, cost: 2.7, unknown: 1, missing: 0, replayed: 2, truncated: 0, items };
const mk = (subagents) => ({ state: "ok", current: true, model: "claude-sonnet-5-5", name: "t", usage: { turns: 10, window: 200000, context: 50000,
  last: { input: 1, cacheRead: 2, cacheWrite5m: 3, cacheWrite1h: 0, output: 4, cost: 0.01 }, total: { input: 100, cacheRead: 2000, cacheWrite5m: 300, cacheWrite1h: 0, output: 400, cost: 1.5, unknownTurns: 0 } }, subagents });
const st = (e) => ({ ok: true, follow: { mode: "following", bot: "B", engine: "claude" }, engines: { claude: e } });

// engineView: combined = main + subagents, partial flagged, context untouched
let v = engineView("claude", mk(sub));
assert.equal(v.tokens, 2800); assert.equal(v.comb.tokens, 2800 + 28000); assert.ok(Math.abs(v.comb.cost - 4.2) < 1e-9); assert.equal(v.comb.partial, true); assert.equal(v.comb.has, true); assert.equal(v.pct, 25);
// bar: ONE cost per engine = combined, with a tiny "+" marker; context % stays main only
let bar = renderBar(st(mk(sub)));
assert.match(bar, /class="co">≥\$4\.20<sup>\+<\/sup>/); assert.match(bar, /class="p">25%/); assert.ok(!bar.includes("tk"), "no token column in the 260px strip");
// no subagents: bar identical to before (no marker), card says "none"
const none = { count: 0, agents: 0, workers: 0, running: 0, tokens: 0, cost: 0, unknown: 0, missing: 0, replayed: 0, truncated: 0, items: [] };
bar = renderBar(st(mk(none))); assert.ok(!bar.includes("sup")); assert.match(bar, /class="co">\$1\.50</);
assert.match(renderCard(st(mk(none))), /Subagents: none/);
bar = renderBar(st(mk(undefined))); assert.match(bar, /class="co">\$1\.50</); // older host without the field

// card: three labelled rows, top 5 + collapsible rest, '~' on partial, '—' for unpriced, notes
let card = renderCard(st(mk(sub)));
 assert.match(card, />Main<\/span>/); assert.match(card, />Subagents<\/span>/); assert.match(card, />Combined</);
assert.match(card, /~\$2\.70/); assert.match(card, /~\$4\.20/); assert.match(card, /7 agents · 1 running/);
assert.equal((card.match(/class="nm"/g) || []).length, 7); assert.match(card, /Show all 7/);
const topPart = card.split('class="sb-more"')[0]; assert.equal((topPart.match(/class="nm"/g) || []).length, 5, "top 5 outside the collapsed part");
assert.ok(card.indexOf("agent 7") < card.indexOf("agent 6") && !topPart.includes("agent 2"));
assert.match(card, /class="cs na"[^>]*>—</); assert.match(card, /1 with an unpriced model/); assert.match(card, /2 replayed parent message\(s\) excluded/);
assert.ok(!card.includes(" open>") && !card.includes('data-k="claude" open'), "collapsed by default");
assert.match(renderCard(st(mk(sub)), { expanded: new Set(["claude"]) }), /<details class="sb-more" data-k="claude" open>/);
// 5 or fewer: no show-all
assert.ok(!renderCard(st(mk({ ...sub, count: 3, unknown: 0, items: items.slice(0, 3) }))).includes("Show all"));
// workers + missing coverage
card = renderCard(st(mk({ ...sub, workers: 2, agents: 5, missing: 3, unknown: 0 }))); assert.match(card, /5 agents · 2 workers · 1 running/); assert.match(card, /3 worker\(s\) with no readable log/); assert.match(card, /~\$2\.70/);
// escaping
assert.ok(!renderCard(st(mk({ ...sub, items: [item(1, 1, { name: '<img src=x onerror=1>' })] }))).includes("<img"));
// codex tokens: input already includes cached
const cx = { state: "ok", current: false, model: "gpt-6.1-sol", name: "c", usage: { turns: 2, window: 258400, context: 5000, last: { input: 5000, cacheRead: 4000, cacheWrite: 0, output: 100, cost: .003 }, total: { input: 5000, cacheRead: 4000, cacheWrite: 0, output: 100, cost: .003, unknownTurns: 0 } },
  subagents: { ...none, count: 1, agents: 1, tokens: 600, cost: 0.002, items: [item(1, 0.002, { model: "gpt-6.1-sol", tokens: 600 })] } };
v = engineView("codex", cx); assert.equal(v.tokens, 5100, "codex main tokens = input + output"); assert.equal(v.comb.tokens, 5700);
// antigravity: never usage, honest text
const agy = { state: "ok", current: false, model: "gemini", name: "", usage: { turns: 1, window: 0, inferred: true, context: 400, last: { input: 100, cacheRead: 300, cacheWrite: 0, output: 20 }, total: { input: 100, cacheRead: 300, cacheWrite: 0, output: 20, cost: null } }, subagents: { ...none, count: 2, workers: 2, unreadable: true } };
v = engineView("agy", agy); assert.equal(v.comb.has, false); assert.equal(v.comb.tokens, v.tokens); assert.match(subSection(v), /2 registered workers, usage not readable/);
assert.match(subSection(engineView("agy", { ...agy, subagents: { ...none, count: 0, unreadable: true } })), /not tracked/);
// unpriced main cost stays "—"
v = engineView("claude", { ...mk(sub), usage: { ...mk(sub).usage, total: { ...mk(sub).usage.total, cost: null } } }); assert.equal(v.comb.cost, null);
console.log("subagent web tests passed");
