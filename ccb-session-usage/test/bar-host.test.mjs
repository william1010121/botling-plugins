// node test/bar-host.test.mjs — usageAll against a fake HOME (claude + codex + a copy of a real agy db) and a fake ccb.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import assert from "node:assert/strict";
const home = fs.mkdtempSync(path.join(os.tmpdir(), "su2-home-")); process.env.HOME = home;
const CL = "11111111-2222-3333-4444-555555555555", CX = "01a00000-0000-7000-8000-0000000000c1", AG = "7c000000-0000-4000-8000-0000000000a9";
const proj = path.join(home, ".claude/projects/-Users-x-proj"); fs.mkdirSync(proj, { recursive: true });
fs.writeFileSync(path.join(proj, CL + ".jsonl"), '{"type":"custom-title","customTitle":"My session"}\n' + JSON.stringify({ type: "assistant", message: { id: "a", model: "claude-sonnet-5-5", usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 1000, cache_creation_input_tokens: 500 } } }) + "\n");
const cdir = path.join(home, ".codex/sessions/2026/11/05"); fs.mkdirSync(cdir, { recursive: true });
const tc = (tot, last) => JSON.stringify({ type: "event_msg", payload: { type: "token_count", info: { total_token_usage: tot, last_token_usage: last, model_context_window: 258400 } } });
fs.writeFileSync(path.join(cdir, `rollout-2026-11-05T14-40-57-${CX}.jsonl`), JSON.stringify({ type: "session_meta", payload: { id: CX, cwd: "/x/y" } }) + "\n" + JSON.stringify({ type: "turn_context", payload: { model: "gpt-6.1-sol" } }) + "\n" + tc({ input_tokens: 5000, cached_input_tokens: 4000, output_tokens: 100 }, { input_tokens: 5000, cached_input_tokens: 4000, output_tokens: 100 }) + "\n");
const realAgy = path.join(os.userInfo().homedir, ".gemini/antigravity/conversations", AG + ".db"); // os.userInfo ignores $HOME
const agyDir = path.join(home, ".gemini/antigravity-acp/conversations"); fs.mkdirSync(agyDir, { recursive: true });
const haveAgy = fs.existsSync(realAgy); if (haveAgy) fs.copyFileSync(realAgy, path.join(agyDir, AG + ".db"));
const { activate, usageAll } = await import("../dist/host.mjs");
const mk = (cur) => ({ workspace: { bots: async () => [{ id: "b1", name: "Docs bot" }], current: async () => cur } });
let r = await usageAll(mk({ botId: "b1", engine: "claude", sessionId: CL, heads: [{ engine: "claude", sessionId: CL }, { engine: "codex", sessionId: CX }, { engine: "agy", sessionId: AG }] }));
assert.equal(r.engines.claude.state, "ok"); assert.equal(r.engines.claude.name, "My session"); assert.equal(r.engines.claude.current, true);
assert.equal(r.engines.codex.state, "ok"); assert.equal(r.engines.codex.current, false); assert.equal(r.engines.codex.usage.window, 258400);
console.log("agy:", haveAgy ? JSON.stringify({ state: r.engines.agy.state, reason: r.engines.agy.reason, turns: r.engines.agy.usage && r.engines.agy.usage.turns, last: r.engines.agy.usage && r.engines.agy.usage.last, ctx: r.engines.agy.usage && r.engines.agy.usage.context }) : "real db missing, skipped");
r = await usageAll(mk({ botId: "b1", engine: "claude", sessionId: CL, heads: [] }));
assert.equal(r.engines.codex.state, "none"); assert.equal(r.engines.agy.state, "none");
r = await usageAll(mk(null)); assert.equal(r.follow.mode, "none-open");
r = await usageAll({}); assert.equal(r.follow.mode, "unavailable");
let handlers = {}; activate({ web: { handle: (n, f) => { handlers[n] = f; } }, settings: { get: () => "" }, workspace: mk(null).workspace });
assert.ok(handlers.usageAll && handlers.usage);
console.log("bar host tests passed");

// Antigravity through ccb.workspace.agyUsage / agyQuota (no ~/.gemini), and graceful when they are absent or unknown
{
  const call = { model: "gemini-3.8-flash", input: 100, output: 20, cacheRead: 300, cacheWrite: 5, reasoning: 4, retry: false, key: "k" };
  const ws = (extra) => ({ workspace: { bots: async () => [{ id: "b1", name: "Docs bot" }], current: async () => ({ botId: "b1", engine: "agy", sessionId: AG, heads: [{ engine: "agy", sessionId: AG }] }), ...extra } });
  let x = await usageAll(ws({ agyUsage: async () => ({ sessionId: AG, calls: [call, { ...call, input: 50, retry: true }], total: { input: 150, output: 40, cacheRead: 600, cacheWrite: 10, reasoning: 8 }, retries: 1, models: ["gemini-3.8-flash"] }), agyQuota: async () => ({ status: "unavailable", source: "x", reason: "not signed in" }) }));
  assert.equal(x.engines.agy.state, "ok"); assert.equal(x.engines.agy.usage.inferred, false); assert.equal(x.engines.agy.usage.turns, 2); assert.equal(x.engines.agy.usage.total.output, 40);
  assert.equal(x.engines.agy.usage.context, 50 + 300 + 5); assert.equal(x.quota.status, "unknown"); assert.deepEqual(x.quota.buckets, []);
  x = await usageAll(ws({ agyUsage: async () => null })); assert.equal(x.engines.agy.state, "none"); assert.equal(x.quota.status, "unknown");
  x = await usageAll(ws({ agyUsage: async () => { throw new Error("boom"); }, agyQuota: async () => ({ status: "available", source: "s", seen: 1, buckets: [{ group: "g", label: "Gemini", remainingFraction: 0.4, resetsAt: Date.now() + 3600e3 }] }) }));
  assert.equal(x.engines.agy.state, "nodata"); assert.equal(x.quota.status, "available"); assert.equal(x.quota.buckets[0].left, 0.4);
  console.log("agy via workspace api ok");
}
