// node test/subagents.test.mjs — usageAll subagent linking against a fake HOME that contains:
//  Claude: main session + 3 subagent logs (normal / fork that REPLAYS a parent message = trap / nested workflow with an unpriced model)
//          + a Botling worker (own session) + registry rows (one duplicate of a scanned subagent, 2 with no log)
//          + an Agent tool result whose totalTokens is the LAST turn's size (trap: must not be used)
//  Codex : parent thread + child + child that replays the parent's token_count events (trap) + grandchild + unrelated thread + codex-thread worker
//  Antigravity: a tiny gen_metadata db and 2 registered agy workers (count only, never usage)
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import assert from "node:assert/strict";
const home = fs.mkdtempSync(path.join(os.tmpdir(), "su3-home-")); process.env.HOME = home;
const J = (o) => JSON.stringify(o) + "\n", w = (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);
const asst = (id, model, i, o, cr, cw, t = "2026-11-06T01:00:00Z") => J({ type: "assistant", timestamp: t, message: { id, model, usage: { input_tokens: i, output_tokens: o, cache_read_input_tokens: cr, cache_creation_input_tokens: cw } } });

// ---------- Claude
const CL = "11111111-2222-3333-4444-555555555555", WK = "99999999-aaaa-bbbb-cccc-000000000001";
const proj = path.join(home, ".claude/projects/-Users-x-proj");
const M1 = asst("m1", "claude-sonnet-5-5", 10, 20, 1000, 500, "2026-11-06T01:00:00Z");
w(path.join(proj, CL + ".jsonl"), M1 + asst("m2", "claude-sonnet-5-5", 5, 10, 2000, 0, "2026-11-06T01:01:00Z") +
  J({ type: "user", toolUseResult: { status: "completed", agentId: "aaa", totalTokens: 999999, usage: { input_tokens: 2, output_tokens: 3320, cache_read_input_tokens: 117039 } } }));
const sd = path.join(proj, CL, "subagents");
w(path.join(sd, "agent-aaa.jsonl"), asst("sa1", "claude-sonnet-5-5", 100, 200, 10000, 1000, "2026-11-06T01:02:00Z") + asst("sa2", "claude-haiku-5-5", 50, 50, 0, 0, "2026-11-06T01:03:00Z"));
w(path.join(sd, "agent-aaa.meta.json"), JSON.stringify({ agentType: "Explore", description: "Explore auth", toolUseId: "toolu_a", finished: true, spawnDepth: 1 }));
w(path.join(sd, "agent-fork.jsonl"), M1.replace("01:00:00", "01:00:00") /* replayed parent message: same id + usage */ + asst("f1", "claude-opus-5-5", 1000, 500, 0, 0, "2026-11-06T01:04:00Z"));
w(path.join(sd, "agent-fork.meta.json"), JSON.stringify({ agentType: "fork", isFork: true, description: "Fork: refactor", toolUseId: "toolu_f", spawnDepth: 1 }));
w(path.join(sd, "workflows/wf_1/agent-w.jsonl"), asst("w1", "claude-mystery-9", 10, 10, 0, 0, "2026-11-06T01:05:00Z"));
w(path.join(sd, "workflows/wf_1/agent-w.meta.json"), JSON.stringify({ agentType: "workflow-subagent", description: "component-kit", finished: true }));
w(path.join(proj, WK + ".jsonl"), asst("k1", "claude-sonnet-5-5", 1000, 1000, 0, 0, "2026-11-06T01:06:00Z"));

// ---------- Codex
const CXP = "01a00000-0000-7000-8000-000000000001", CXA = "01a00000-0000-7000-8000-00000000000a", CXB = "01a00000-0000-7000-8000-00000000000b",
  CXG = "01a00000-0000-7000-8000-00000000000c", CXU = "01a00000-0000-7000-8000-00000000000d", CXW = "01a00000-0000-7000-8000-00000000000e", OTHER = "01a00000-0000-7000-8000-0000000000ff";
const cdir = path.join(home, ".codex/sessions/2026/11/05");
const meta = (id, source, extra = {}) => J({ type: "session_meta", payload: { id, cwd: "/x/y", source, ...extra } });
const spawn = (parent, depth, nick, p) => ({ subagent: { thread_spawn: { parent_thread_id: parent, depth, agent_path: p, agent_nickname: nick } } });
const tc = (tot, last) => J({ timestamp: "2026-11-06T02:00:00Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: tot, last_token_usage: last, model_context_window: 258400 } } });
const ctx = J({ type: "turn_context", payload: { model: "gpt-6.1-sol" } }), done = J({ type: "event_msg", payload: { type: "task_complete" } }), started = J({ type: "event_msg", payload: { type: "task_started" } });
const P1 = tc({ input_tokens: 1000, cached_input_tokens: 800, output_tokens: 50 }, { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 50 });
const P2 = tc({ input_tokens: 3000, cached_input_tokens: 2000, output_tokens: 150 }, { input_tokens: 2000, cached_input_tokens: 1200, output_tokens: 100 });
const cf = (t, id) => path.join(cdir, `rollout-2026-11-05T${t}-${id}.jsonl`);
w(cf("10-00-00", CXP), meta(CXP, "exec") + ctx + P1 + P2);
w(cf("10-05-00", CXA), meta(CXA, spawn(CXP, 1, "Euler", "/root/audit")) + ctx + started + tc({ input_tokens: 5000, cached_input_tokens: 4000, output_tokens: 100 }, { input_tokens: 5000, cached_input_tokens: 4000, output_tokens: 100 }) + done);
w(cf("10-06-00", CXB), meta(CXB, spawn(CXP, 1, "Gauss", "/root/fork")) + meta(CXP, "exec") + ctx + started + P1 + P2 + tc({ input_tokens: 7000, cached_input_tokens: 3000, output_tokens: 400 }, { input_tokens: 4000, cached_input_tokens: 1000, output_tokens: 250 }));
w(cf("10-07-00", CXG), meta(CXG, spawn(CXA, 2, "Noether", "/root/audit/sub")) + ctx + started + tc({ input_tokens: 2000, cached_input_tokens: 0, output_tokens: 500 }, { input_tokens: 2000, cached_input_tokens: 0, output_tokens: 500 }) + done);
w(cf("10-08-00", CXU), meta(CXU, spawn(OTHER, 1, "Stranger", "/root/x")) + ctx + tc({ input_tokens: 9999, cached_input_tokens: 0, output_tokens: 999 }, { input_tokens: 9999, cached_input_tokens: 0, output_tokens: 999 }));
w(cf("10-09-00", CXW), meta(CXW, "vscode") + ctx + started + tc({ input_tokens: 1000, cached_input_tokens: 0, output_tokens: 100 }, { input_tokens: 1000, cached_input_tokens: 0, output_tokens: 100 }) + done);
for (const f of fs.readdirSync(cdir)) if (f.includes(CXA) || f.includes(CXG) || f.includes(CXW)) fs.utimesSync(path.join(cdir, f), 1, 1); // finished long ago

// ---------- Antigravity: one gen_metadata row (counters f2=input f3=output f5=cache read), 2 registered workers
const AG = "7c000000-0000-4000-8000-0000000000a9";

// ---------- Botling registry
const ag = (o) => ({ background: true, state: "completed", ...o });
fs.writeFileSync(path.join(home, "agents.json"), JSON.stringify({ format: "botling-agents-v1", agents: [
  ag({ id: "ag-worker", engine: "claude", host: { engine: "claude", kind: "claude-process", sessionId: CL }, handle: { kind: "claude-session", sessionId: WK }, summary: { description: "slides worker" } }),
  ag({ id: "ag-dup", engine: "claude", host: { engine: "claude", kind: "claude-sidechain", sessionId: CL }, handle: { kind: "claude-sidechain", parentSessionId: CL, toolUseId: "toolu_a", agentId: "aaa" } }),
  ag({ id: "ag-gone", engine: "claude", host: { engine: "claude", kind: "claude-sidechain", sessionId: CL }, handle: { kind: "claude-sidechain", parentSessionId: CL, toolUseId: "toolu_gone", agentId: "zzz" } }),
  ag({ id: "ag-cx-in-claude", engine: "codex", host: { engine: "claude", kind: "claude-sidechain", sessionId: CL }, handle: { kind: "claude-sidechain", parentSessionId: CL, agentId: "01a99999-0000-7000-8000-000000000000" } }),
  ag({ id: "ag-other", engine: "claude", host: { engine: "claude", kind: "claude-process", sessionId: "someone-else" }, handle: { kind: "claude-session", sessionId: WK } }),
  ag({ id: "ag-cx-worker", engine: "codex", model: "gpt-6.1-sol", host: { engine: "codex", kind: "codex-thread", sessionId: CXP }, handle: { kind: "codex-thread", threadId: CXW }, summary: { description: "review worker" } }),
  ag({ id: "ag-agy1", engine: "agy", host: { engine: "agy", kind: "agy-acp", sessionId: AG }, handle: { kind: "agy-session", sessionId: null } }),
  ag({ id: "ag-agy2", engine: "agy", host: { engine: "agy", kind: "agy-acp", sessionId: AG }, handle: { kind: "agy-session", sessionId: null } }),
] }));
process.env.SU_AGENTS_FILE = path.join(home, "agents.json");

const { usageAll } = await import("../dist/host.mjs");
const ws = { bots: async () => [{ id: "b1", name: "Bot" }], current: async () => ({ botId: "b1", engine: "claude", sessionId: CL, heads: [{ engine: "claude", sessionId: CL }, { engine: "codex", sessionId: CXP }, { engine: "agy", sessionId: AG }] }), agyUsage: async (id) => id === AG ? { sessionId: AG, calls: [{ model: "gemini-x", input: 100, output: 20, cacheRead: 300, cacheWrite: 0, reasoning: 0, retry: false, key: "k" }], total: { input: 100, output: 20, cacheRead: 300, cacheWrite: 0, reasoning: 0 }, retries: 0, models: ["gemini-x"] } : null };
const r = await usageAll({ workspace: ws });

// Claude: main totals untouched by subagents
const c = r.engines.claude; near(c.usage.total.cost, 2180e-6, "main cost"); assert.equal(c.usage.turns, 2);
let s = c.subagents;
assert.equal(s.count, 4, "3 scanned + 1 worker (registry duplicate not counted twice)"); assert.equal(s.agents, 3); assert.equal(s.workers, 1);
near(s.cost, 6730e-6 + 14000e-6 + 12000e-6, "sub cost (unpriced one excluded)"); assert.equal(s.tokens, 11400 + 1500 + 20 + 2000, "tokens: tool-result totalTokens=999999 must NOT be used");
assert.equal(s.replayed, 1, "fork's replay of main message m1 dropped"); assert.equal(s.unknown, 1); assert.equal(s.missing, 2, "gone sidechain + codex-in-claude");
assert.deepEqual(s.items.map((i) => i.name), ["Fork: refactor", "slides worker", "Explore auth", "component-kit"], "sorted by cost desc, unpriced last");
const by = Object.fromEntries(s.items.map((i) => [i.name, i]));
assert.equal(by["Fork: refactor"].state, "running"); assert.equal(by["Fork: refactor"].kind, "fork"); assert.equal(by["Fork: refactor"].tokens, 1500);
assert.equal(by["Explore auth"].state, "done"); assert.equal(by["Explore auth"].model, "claude-haiku-5-5", "model = last real model in the log");
assert.equal(by["component-kit"].kind, "workflow"); assert.equal(by["component-kit"].cost, null); assert.equal(by["slides worker"].kind, "worker"); assert.equal(by["slides worker"].state, "done");
assert.equal(s.running, 1);

// Codex
const x = r.engines.codex; s = x.subagents;
assert.equal(x.usage.turns, 2); assert.equal(s.count, 4, "child + fork-child + grandchild + codex-thread worker; unrelated thread excluded");
near(s.cost, 3400e-6 + 8600e-6 + 9000e-6 + 3000e-6, "codex sub cost"); assert.equal(s.tokens, 5100 + 4250 + 2500 + 1100, "codex tokens = input + output (input already includes cached)");
assert.equal(s.replayed, 2, "two replayed parent token_count events dropped"); assert.equal(s.workers, 1); assert.equal(s.running, 1);
const cb = Object.fromEntries(s.items.map((i) => [i.name, i]));
assert.equal(cb["Noether · audit/sub"].kind, "nested"); assert.equal(cb["Gauss · fork"].state, "running"); assert.equal(cb["Euler · audit"].state, "done"); assert.equal(cb["review worker"].kind, "worker");
assert.ok(!s.items.some((i) => i.name.includes("Stranger")));

// Antigravity: counted from the registry only, never given usage
const a = r.engines.agy; assert.equal(a.state, "ok"); assert.equal(a.subagents.unreadable, true); assert.equal(a.subagents.count, 2); assert.equal(a.subagents.tokens, 0);

// no registry file / no subagents dir: plain session, subagents empty not an error
delete process.env.SU_AGENTS_FILE; fs.rmSync(path.join(home, "agents.json"));
fs.rmSync(sd, { recursive: true });
const r2 = await usageAll({ workspace: ws }); assert.equal(r2.engines.claude.subagents.count, 0); assert.equal(r2.engines.claude.subagents.missing, 0); near(r2.engines.claude.usage.total.cost, 2180e-6, "main unchanged");
console.log("subagent host tests passed");
