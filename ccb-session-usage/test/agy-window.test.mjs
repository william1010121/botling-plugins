// node test/agy-window.test.mjs — agy window from ACP usage_update: present => %, null => no % and no estimate
import assert from "node:assert/strict";
import { usageAll } from "../dist/host.mjs";
import { renderBar, renderCard } from "../dist/web.js";
const calls = [{ model: "g", input: 100000, output: 10, cacheRead: 50000, cacheWrite: 0 }];
const total = { input: 100000, output: 10, cacheRead: 98000000, cacheWrite: 0 };
const mk = (window) => ({
  current: async () => ({ botId: "b", engine: "agy", sessionId: "s", heads: [{ engine: "agy", sessionId: "s" }] }),
  bots: async () => [], agyUsage: async () => ({ calls, total, window }) });
const run = async (w) => { const e = (await usageAll({ workspace: mk(w) })).engines.agy; return { r: { engines: { agy: { ...e, current: true } }, follow: { mode: "following", bot: "b", engine: "agy" } }, e }; };

let { r, e } = await run(1048576);
assert.equal(e.usage.window, 1048576); assert.equal(e.usage.inferred, false);
assert.match(renderBar(r), /14%/); // 150000 / 1048576
const card = renderCard(r, { tab: "agy" });
assert.match(card, /150,000 \/ 1\.0M/);assert.match(card, /Current context/); assert.match(card, /Session total/);
assert.match(card, /compacts earlier \(~290k\)/); assert.match(card, /<i style="width:14\./);

for (const w of [null, undefined, 0]) {
  ({ r, e } = await run(w));
  assert.equal(e.usage.window, 0); assert.equal(e.usage.inferred, false);
  const bar = renderBar(r); assert.ok(!/%/.test(bar.split("Ag")[1]), bar); assert.ok(!/~/.test(bar));
  const c = renderCard(r, { tab: "agy" });
  assert.ok(!/compacts earlier/.test(c)); assert.match(c, /Current context/); assert.ok(!/<i style="width/.test(c));
}
console.log("agy-window ok");
