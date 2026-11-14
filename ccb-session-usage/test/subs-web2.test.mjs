// node test/subs-web2.test.mjs — compact cost never long, agy has no "~", quota shows "—" when unknown
import assert from "node:assert/strict";
import { renderBar, renderCard, quotaSection, engineView } from "../dist/web.js";
const tot = (cost) => ({ input: 1, output: 1, cacheRead: 1, cacheWrite5m: 0, cacheWrite1h: 0, cost, unknownTurns: 0 });
const cl = (cost) => ({ state: "ok", current: true, model: "claude-opus-5-5", name: "n", usage: { turns: 3, window: 1e6, context: 123456, last: { ...tot(1), cost: 1 }, total: tot(cost) } });
const txt = (h) => h.replace(/<[^>]+>/g, "|").replace(/\|+/g, " ");
for (const [c, want] of [[0.363, "$0.363"], [7.34, "$7.34"], [123.45, "$123"], [999.6, "$1,000"], [1234.56, "$1.23k"], [12345.6, "$12.3k"], [123456, "$123k"]]) {
  const h = renderBar({ engines: { claude: cl(c) } });
  const m = /class="co">([^<]*)</.exec(h); const got = m[1];
  const exp = c >= 1000 ? want : want; assert.ok(got === exp || (c === 999.6 && got === "$1,000"), c + " -> " + got);
  assert.ok(got.length <= 6 || c === 999.6, "short: " + got);
}
const agy = { state: "ok", current: false, model: "gemini", name: "", usage: { turns: 2, window: 0, inferred: false, context: 355, last: { input: 50, cacheRead: 300, cacheWrite: 5, output: 20 }, total: { input: 150, cacheRead: 600, cacheWrite: 10, output: 40, cost: null } } };
const r = { engines: { claude: cl(1), agy }, follow: { mode: "following", bot: "b", engine: "agy" }, quota: { status: "unknown", reason: "not signed in", buckets: [] } };
const bar = renderBar(r); assert.ok(!/~/.test(bar), "no tilde in bar"); assert.ok(/Ag/.test(bar));
const card = renderCard(r, { tab: "agy" }); assert.ok(!/~/.test(card), "no tilde in agy card"); assert.match(card, /Quota/); assert.match(card, />—</);
assert.match(quotaSection({ status: "available", buckets: [{ label: "Gemini", left: 0.4, resetsAt: Date.now() + 7200e3 }] }), /40% left.*resets in 2h/);
assert.equal(quotaSection(null), "");
assert.equal(engineView("agy", agy).tokens, 150 + 600 + 10 + 40);
console.log("web2 tests passed");
