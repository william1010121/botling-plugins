// node test/host-follow.test.mjs  — runs dist/host.mjs against a fake ccb and a fake HOME.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import assert from "node:assert/strict";
const home = fs.mkdtempSync(path.join(os.tmpdir(), "su-home-"));
process.env.HOME = home;
const CL = "11111111-2222-3333-4444-555555555555", CX = "01a00000-0000-7000-8000-0000000000c1", OLD = "99999999-0000-0000-0000-000000000000";
const proj = path.join(home, ".claude/projects/-Users-x-proj"); fs.mkdirSync(proj, { recursive: true });
const asst = (id) => JSON.stringify({ type: "assistant", timestamp: "2026-11-06T00:00:00Z", message: { id, model: "claude-sonnet-5-5", usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 1000, cache_creation_input_tokens: 500 } } });
fs.writeFileSync(path.join(proj, CL + ".jsonl"), asst("a") + "\n");
fs.writeFileSync(path.join(proj, OLD + ".jsonl"), asst("b") + "\n" + asst("c") + "\n");
fs.utimesSync(path.join(proj, CL + ".jsonl"), 1, 1); // CL is OLDER than OLD: following must not pick "most recent"
const cdir = path.join(home, ".codex/sessions/2026/11/05"); fs.mkdirSync(cdir, { recursive: true });
const tc = (tot, last) => JSON.stringify({ timestamp: "t", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: tot, last_token_usage: last, model_context_window: 258400 } } });
fs.writeFileSync(path.join(cdir, `rollout-2026-11-05T14-40-57-${CX}.jsonl`),
  JSON.stringify({ type: "session_meta", payload: { id: CX, cwd: "/x/y" } }) + "\n" + JSON.stringify({ type: "turn_context", payload: { model: "gpt-6.1-sol" } }) + "\n" +
  tc({ input_tokens: 5000, cached_input_tokens: 4000, output_tokens: 100 }, { input_tokens: 5000, cached_input_tokens: 4000, output_tokens: 100, reasoning_output_tokens: 10 }) + "\n");

const { activate } = await import("../dist/host.mjs");
async function run(workspace, params = { id: "" }) {
  let h; activate({ web: { handle: (n, f) => { h = f; } }, settings: { get: () => "" }, workspace });
  return h(params);
}
const bots = async () => [{ id: "b1", name: "Docs bot" }];
const cur = (c) => ({ bots, current: async () => c });
const cases = [
  ["no workspace object", undefined, "unavailable"],
  ["current() throws", { bots, current: async () => { throw new Error("boom"); } }, "unavailable"],
  ["nothing open", cur(null), "none-open"],
  ["agy engine", cur({ botId: "b1", engine: "agy", sessionId: "z", heads: [] }), "unsupported"],
  ["session not started", cur({ botId: "b1", engine: "claude", sessionId: null, heads: [] }), "no-session"],
  ["log missing", cur({ botId: "b1", engine: "claude", sessionId: "nope", heads: [] }), "no-file"],
  ["claude open", cur({ botId: "b1", engine: "claude", sessionId: CL, heads: [], view: "chat" }), "following"],
  ["codex open", cur({ botId: "b1", engine: "codex", sessionId: CX, heads: [], view: "chat" }), "following"],
];
for (const [name, ws, mode] of cases) {
  const r = await run(ws);
  assert.equal(r.follow.mode, mode, name);
  console.log("ok", name, "->", r.follow.mode, r.follow.bot || "", r.follow.engine || "", "| shows", r.current && r.current.id.slice(0, 13));
  if (mode === "following") assert.equal(r.current.id, (ws.current ? (await ws.current()).engine === "codex" ? "codex:" + CX : CL : ""));
  else assert.equal(r.current.id, "codex:" + CX, name + " falls back to most recent (newest file)");
}
const p = await run(cur({ botId: "b1", engine: "claude", sessionId: CL }), { id: OLD });
assert.equal(p.follow.mode, "pinned"); assert.equal(p.current.id, OLD);
const c = await run(cur({ botId: "b1", engine: "codex", sessionId: CX }));
assert.equal(c.usage.window, 258400); assert.equal(c.usage.last.cacheRead, 4000);
const k = await run(cur({ botId: "b1", engine: "claude", sessionId: CL }));
assert.equal(k.usage.window, 1000000, "sonnet-5 without setting -> 1M"); assert.equal(k.follow.bot, "Docs bot");
// model windows without autoCompactWindow
const OP = "aaaaaaaa-0000-0000-0000-000000000001", HK = "aaaaaaaa-0000-0000-0000-000000000002", S4 = "aaaaaaaa-0000-0000-0000-000000000003";
const mkLog = (id, model) => fs.writeFileSync(path.join(proj, id + ".jsonl"), JSON.stringify({ type: "assistant", timestamp: "2026-11-06T00:00:00Z", message: { id: "m" + id, model, usage: { input_tokens: 10, output_tokens: 20 } } }) + "\n");
mkLog(OP, "claude-opus-5-5"); mkLog(HK, "claude-haiku-4-5"); mkLog(S4, "claude-sonnet-4-5");
const win = async (id) => (await run(cur({ botId: "b1", engine: "claude", sessionId: id }))).usage.window;
assert.equal(await win(OP), 1000000, "opus-5 -> 1M"); assert.equal(await win(HK), 200000, "haiku -> 200k"); assert.equal(await win(S4), 200000, "sonnet-4 -> 200k");
// autoCompactWindow: user settings, then project settings override
fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
fs.writeFileSync(path.join(home, ".claude/settings.json"), JSON.stringify({ autoCompactWindow: 300000 }));
assert.equal(await win(OP), 300000, "autoCompactWindow=300000 -> / 300k");
assert.equal(await win(HK), 300000, "setting applies to any model");
const pdir = path.join(home, "projx/.claude"); fs.mkdirSync(pdir, { recursive: true });
fs.writeFileSync(path.join(pdir, "settings.local.json"), JSON.stringify({ autoCompactWindow: 400000 }));
fs.writeFileSync(path.join(proj, OP + ".jsonl"), JSON.stringify({ type: "assistant", cwd: path.join(home, "projx"), timestamp: "2026-11-06T00:00:00Z", message: { id: "mx", model: "claude-opus-5-5", usage: { input_tokens: 10, output_tokens: 20 } } }) + "\n");
assert.equal(await win(OP), 400000, "project settings override user");
console.log("all host follow tests passed");
