// node test/agy-workers.test.mjs — agy workers: real per-worker usage, null = "—" (not 0), feature-detect fallback
import assert from "node:assert/strict";
import { usageAll } from "../dist/host.mjs";
import { renderBar, renderCard } from "../dist/web.js";
const call = (n) => ({ model: "gemini-x", input: n, output: n, cacheRead: 0, cacheWrite: 0 });
const mk = (extra) => ({
  current: async () => ({ botId: "b", engine: "agy", sessionId: "main1", heads: [{ engine: "agy", sessionId: "main1" }] }),
  bots: async () => [], agyUsage: async () => ({ calls: [call(100)], total: { input: 100, output: 100, cacheRead: 0, cacheWrite: 0 } }), ...extra });
const get = async (ws) => (await usageAll({ workspace: ws })).engines.agy;
// new API
const ws = mk({
  agyWorkers: async (id) => { assert.equal(id, "main1"); return [{ nativeId: "n1", name: "w1", state: "completed", model: "g", endedAt: 1 }, { nativeId: "n2", name: "w2", state: "running", model: "g", endedAt: null }, { nativeId: "n3", name: "old", state: "completed", model: "g", endedAt: 1 }]; },
  agyWorkerUsage: async (n) => n === "n3" ? null : { calls: [call(n === "n1" ? 1000 : 10)], total: { input: n === "n1" ? 1000 : 10, output: n === "n1" ? 1000 : 10, cacheRead: 0, cacheWrite: 0 } },
});
const e = await get(ws), s = e.subagents;
assert.equal(s.count, 3); assert.equal(s.tokens, 2000 + 20); assert.equal(s.missing, 1); assert.equal(s.unreadable, false); assert.equal(s.running, 1);
assert.equal(s.items.find((i) => i.id === "n3").tokens, null);
const r = { engines: { agy: { ...e, current: true } }, follow: { mode: "following", bot: "b", engine: "agy" } };
const card = renderCard(r, { tab: "agy" });
assert.ok(!/no subagent link/.test(card)); assert.match(card, /Combined/); assert.match(card, /usage not readable/); assert.match(card, /<span class="tk">—<\/span>/);
assert.match(renderBar(r), /class="co">2\.2k<sup>\+<\/sup>/);
// old app: degrade
const old = (await get(mk({}))).subagents;
assert.equal(old.unreadable, true); assert.match(old.note, /newer Botling/);
const c2 = renderCard({ engines: { agy: { ...(await get(mk({}))), current: true } }, follow: { mode: "following" } }, { tab: "agy" });
assert.ok(!/no subagent link/.test(c2)); assert.match(c2, /needs a newer Botling/);
// list throws -> fallback, no crash
assert.equal((await get(mk({ agyWorkers: async () => { throw new Error("x"); }, agyWorkerUsage: async () => null }))).subagents.unreadable, true);
console.log("agy-workers tests passed");
