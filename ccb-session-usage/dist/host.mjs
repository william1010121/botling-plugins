import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Pure logic: price table + transcript parsing. Edit PRICES to change prices.
// USD per million tokens (API list price). cacheRead may be omitted = 10% of input.
// cache write: 1.25x input (5m), 2x input (1h).
const PRICES = {
  "opus-5-5": { label: "Opus 5.5", input: 4, output: 20, cacheRead: 0.2 },
  "sonnet-5-5": { label: "Sonnet 5.5", input: 2, output: 10, cacheRead: 0.2 },
  "haiku-5-5": { label: "Haiku 5.5", input: 0.1, output: 0.5 },
};

function priceFor(model) {
  const m = String(model || "").toLowerCase();
  for (const key of Object.keys(PRICES)) if (m.includes(key)) return { key, ...PRICES[key] };
  return null;
}

function costOf(u, price) {
  if (!price) return null;
  const cr = price.cacheRead ?? price.input * 0.1;
  return (u.input * price.input + u.output * price.output + u.cacheRead * cr +
    u.cacheWrite5m * price.input * 1.25 + u.cacheWrite1h * price.input * 2) / 1e6;
}

// One Map per transcript: dedupe key -> turn (last wins). Keys without any id are anonymous (prefix "\0") and never
// take part in cross-file de-duplication.
function claudeTurnMap(text) {
  const seen = new Map();
  let n = 0;
  for (const line of String(text || "").split("\n")) {
    if (!line.trim()) continue;
    let d; try { d = JSON.parse(line); } catch { continue; }
    const m = d && d.message;
    if (d.type !== "assistant" || !m || !m.usage) continue;
    const us = m.usage, cc = us.cache_creation || {};
    const w = us.cache_creation_input_tokens || 0;
    const w5 = cc.ephemeral_5m_input_tokens, w1 = cc.ephemeral_1h_input_tokens;
    const split = w5 != null || w1 != null;
    const turn = {
      model: m.model || "",
      input: us.input_tokens || 0, output: us.output_tokens || 0,
      cacheRead: us.cache_read_input_tokens || 0,
      cacheWrite5m: split ? (w5 || 0) : w, cacheWrite1h: split ? (w1 || 0) : 0,
      time: d.timestamp || null,
    };
    if (m.model === "<synthetic>") continue;
    const key = m.id || d.requestId || d.uuid || "\0n" + n++;
    if (seen.has(key)) seen.delete(key); // keep order of last occurrence
    seen.set(key, turn);
  }
  return seen;
}

function tally(turns) {
  const total = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, cost: 0, unknownTurns: 0, unknownModels: [] };
  for (const t of turns) {
    total.input += t.input; total.output += t.output; total.cacheRead += t.cacheRead;
    total.cacheWrite5m += t.cacheWrite5m; total.cacheWrite1h += t.cacheWrite1h;
    const c = costOf(t, priceFor(t.model));
    t.cost = c;
    if (c == null) { total.unknownTurns++; if (!total.unknownModels.includes(t.model)) total.unknownModels.push(t.model); }
    else total.cost += c;
  }
  const last = turns[turns.length - 1] || null;
  return {
    turns: turns.length, last, total,
    context: last ? last.input + last.cacheRead + last.cacheWrite5m + last.cacheWrite1h : 0,
  };
}

function parseTranscript(text) { return tally([...claudeTurnMap(text).values()]); }

// ===================== Codex (OpenAI) =====================
// CODEX PRICE TABLE — edit here. USD per million tokens, OpenAI API standard tier.
// Source: https://developers.openai.com/api/docs/pricing (checked 2026-11-05).
// `long` applies to a request whose input exceeds 272,000 tokens. cacheWrite = 30-minute rate.
// Models not listed here are shown as "price unknown" (never guessed).
const CODEX_PRICES = {
  "gpt-6-astra":   { label: "GPT-6 Astra",   input: 10,  cached: 1,    cacheWrite: 12.5,  output: 50, long: { input: 20,  cached: 2,    cacheWrite: 25,   output: 75 } },
  "gpt-6.1-sol":   { label: "GPT-6.1 Sol",   input: 2,   cached: 0.1,  cacheWrite: 2.5,   output: 10, long: { input: 4,   cached: 0.2,  cacheWrite: 5,    output: 15 } },
  "gpt-6.1-terra": { label: "GPT-6.1 Terra", input: 1,   cached: 0.05, cacheWrite: 1.25,  output: 5,  long: { input: 2,   cached: 0.1,  cacheWrite: 2.5,  output: 7.5 } },
  "gpt-6-luna":    { label: "GPT-6 Luna",    input: 0.1, cached: 0.01, cacheWrite: 0.125, output: 0.5, long: { input: 0.2, cached: 0.02, cacheWrite: 0.25, output: 0.75 } },
};
const CODEX_LONG_CONTEXT = 272000;

function codexPriceFor(model) {
  const m = String(model || "").toLowerCase();
  return CODEX_PRICES[m] ? { key: m, ...CODEX_PRICES[m] } : null; // exact match only
}

// Codex input_tokens INCLUDES cached (and cache-write) tokens; output_tokens INCLUDES reasoning.
function codexCostOf(t, price) {
  if (!price) return null;
  const p = t.input > CODEX_LONG_CONTEXT ? price.long : price;
  const fresh = Math.max(0, t.input - t.cacheRead - t.cacheWrite);
  return (fresh * p.input + t.cacheRead * p.cached + t.cacheWrite * p.cacheWrite + t.output * p.output) / 1e6;
}

// Turns carry `sig` (the cumulative total_token_usage they were first seen under) so a forked/replayed copy of another
// thread's history can be recognised and dropped. `ended` = the last lifecycle event was task_complete / turn_aborted.
function codexTurns(text) {
  let model = "", prev = null, window = 0, ended = false;
  const turns = [];
  for (const line of String(text || "").split("\n")) {
    if (!line.trim()) continue;
    if (!line.includes('"turn_context"') && !line.includes('"token_count"') && !line.includes('"task_complete"') && !line.includes('"turn_aborted"') && !line.includes('"task_started"')) continue;
    let d; try { d = JSON.parse(line); } catch { continue; }
    const p = d && d.payload;
    if (!p) continue;
    if (d.type === "turn_context") { if (p.model) model = p.model; continue; }
    if (d.type !== "event_msg") continue;
    if (p.type === "task_started") { ended = false; continue; }
    if (p.type === "task_complete" || p.type === "turn_aborted") { ended = true; continue; }
    if (p.type !== "token_count" || !p.info) continue;
    const tot = p.info.total_token_usage, u = p.info.last_token_usage;
    if (!tot || !u) continue;
    const sig = JSON.stringify(tot);
    if (sig === prev) continue; // Codex repeats token_count events
    prev = sig;
    if (p.info.model_context_window) window = p.info.model_context_window;
    turns.push({
      model, input: u.input_tokens || 0, cacheRead: u.cached_input_tokens || 0,
      cacheWrite: u.cache_write_input_tokens || 0, output: u.output_tokens || 0,
      reasoning: u.reasoning_output_tokens || 0, time: d.timestamp || null, sig,
    });
  }
  return { turns, window, ended };
}

function codexTally(turns, window) {
  const total = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, cost: 0, unknownTurns: 0, unknownModels: [] };
  for (const t of turns) {
    total.input += t.input; total.cacheRead += t.cacheRead; total.cacheWrite += t.cacheWrite;
    total.output += t.output; total.reasoning += t.reasoning;
    const c = codexCostOf(t, codexPriceFor(t.model));
    t.cost = c;
    if (c == null) { total.unknownTurns++; if (!total.unknownModels.includes(t.model)) total.unknownModels.push(t.model); }
    else total.cost += c;
  }
  const last = turns[turns.length - 1] || null;
  return { turns: turns.length, last, total, context: last ? last.input : 0, window: window || 0 };
}

function parseCodex(text) { const r = codexTurns(text); return codexTally(r.turns, r.window); }

const ROOT = path.join(os.homedir(), ".claude", "projects");
const CODEX_ROOT = path.join(os.homedir(), ".codex", "sessions");

function listClaude(filter) {
  const out = [];
  let dirs = [];
  try { dirs = fs.readdirSync(ROOT); } catch { return out; }
  for (const d of dirs) {
    if (filter && !d.toLowerCase().includes(filter.toLowerCase())) continue;
    let files; try { files = fs.readdirSync(path.join(ROOT, d)); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      try {
        const p = path.join(ROOT, d, f);
        out.push({ kind: "claude", folder: d, id: f.slice(0, -6), file: p, mtime: fs.statSync(p).mtimeMs });
      } catch {}
    }
  }
  return out;
}

// Codex: ~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<uuid>.jsonl ; dropdown id is "codex:<uuid>"
function listCodex() {
  const out = [];
  const ls = (p) => { try { return fs.readdirSync(p); } catch { return []; } };
  for (const y of ls(CODEX_ROOT)) for (const m of ls(path.join(CODEX_ROOT, y))) for (const d of ls(path.join(CODEX_ROOT, y, m)))
    for (const f of ls(path.join(CODEX_ROOT, y, m, d))) {
      if (!f.startsWith("rollout-") || !f.endsWith(".jsonl")) continue;
      try {
        const p = path.join(CODEX_ROOT, y, m, d, f);
        const uuid = f.slice(0, -6).replace(/^rollout-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-/, "");
        out.push({ kind: "codex", folder: "", id: "codex:" + uuid, file: p, mtime: fs.statSync(p).mtimeMs });
      } catch {}
    }
  return out;
}

// Project folder of a Codex session = cwd in the first line (session_meta)
function codexFolder(file) {
  try {
    const fd = fs.openSync(file, "r");
    try {
      const buf = Buffer.alloc(262144);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      const first = buf.toString("utf8", 0, n).split("\n")[0];
      const m = first.match(/"cwd":"((?:[^"\\]|\\.)*)"/);
      return m ? JSON.parse('"' + m[1] + '"') : "";
    } finally { fs.closeSync(fd); }
  } catch { return ""; }
}

function listSessions(filter, limit = 15) {
  // keep the newest of each kind so Codex sessions stay selectable even when Claude is busier
  const byNew = (a, b) => b.mtime - a.mtime;
  const half = Math.ceil(limit / 2);
  const top = listClaude(filter).sort(byNew).slice(0, half).concat(listCodex().sort(byNew).slice(0, half)).sort(byNew);
  for (const s of top) if (s.kind === "codex") {
    s.folder = codexFolder(s.file);
  }
  if (filter) return top.filter((s) => s.kind === "claude" || s.folder.toLowerCase().replace(/[\/._ ]/g, "-").includes(filter.toLowerCase().replace(/[\/._ ]/g, "-")));
  return top;
}

// Which window to measure the context against (Claude logs do not carry it).
// 1) autoCompactWindow from Claude settings (user, then project, then project-local; later wins), as Claude Code itself does.
// 2) the model's real window: Opus/Sonnet/Fable 5.x and Opus 4.7+ = 1M; Haiku and older models = 200k.
// Codex logs carry the real window, so that one is used instead.
function autoCompactWindow(cwd) {
  const files = [path.join(os.homedir(), ".claude", "settings.json")];
  if (cwd) files.push(path.join(cwd, ".claude", "settings.json"), path.join(cwd, ".claude", "settings.local.json"));
  let w = 0;
  for (const f of files) { const v = Number((readJson(f) || {}).autoCompactWindow); if (Number.isFinite(v) && v > 0) w = v; }
  return w;
}
function modelWindow(model, context) {
  const m = String(model || "").toLowerCase();
  if (/\[1m\]|-1m/.test(m) || context > 200000) return 1000000;
  if (/haiku/.test(m)) return 200000;
  if (/(opus|sonnet|fable)-?5/.test(m)) return 1000000;
  const o = m.match(/opus-?4[-.]?(\d+)/);
  if (o && Number(o[1]) >= 7) return 1000000;
  return 200000;
}
function claudeWindow(model, context, cwd) {
  return autoCompactWindow(cwd) || modelWindow(model, context);
}
function logCwd(text) {
  const m = String(text).slice(0, 262144).match(/"cwd":"((?:[^"\\]|\\.)*)"/);
  try { return m ? JSON.parse('"' + m[1] + '"') : ""; } catch { return ""; }
}

// Resolve "the conversation the user has open" to a session log on disk.
// ccb.workspace is a program-part API (the panel page's ccb has none), so it is read here.
// Needs no permission. current() = { botId, engine: "claude"|"codex"|"agy", sessionId, heads, view, tab } | null.
async function resolveFollow(ccb, find) {
  const ws = ccb.workspace;
  if (!ws || typeof ws.current !== "function") return { mode: "unavailable" };
  let cur;
  try { cur = await ws.current(); } catch (e) { return { mode: "unavailable", detail: String((e && e.message) || e) }; }
  if (!cur) return { mode: "none-open" };
  let bot = cur.botId || "";
  try {
    const list = await ws.bots();
    const b = Array.isArray(list) && list.find((x) => x && x.id === cur.botId);
    if (b && b.name) bot = b.name;
  } catch {}
  const info = { bot, engine: String(cur.engine || ""), view: cur.view || "" };
  if (info.engine !== "claude" && info.engine !== "codex") return { mode: "unsupported", ...info };
  if (!cur.sessionId) return { mode: "no-session", ...info };
  const id = info.engine === "codex" ? "codex:" + cur.sessionId : String(cur.sessionId);
  const s = find(id);
  if (!s) return { mode: "no-file", ...info };
  return { mode: "following", ...info, id: s.id };
}

// ===================== Antigravity (agy) =====================
// Botling reads agy's own conversation file and hands us exact per-call tokens: ccb.workspace.agyUsage(sessionId)
// (calls[] with input / output / cacheRead / cacheWrite / reasoning / retry, plus total). Nothing is read from ~/.gemini.
// ccb.workspace.agyQuota() gives the quota buckets. Both are newer than app 2.4.0, so a missing function or a null is
// reported as a reason, never an error. There is no Gemini price table, so cost is never shown for agy (null).
export function agyUsageOf(u) {
  const calls = Array.isArray(u && u.calls) ? u.calls : [];
  const turns = calls.map((c) => ({ model: c.model || "", input: c.input || 0, cacheRead: c.cacheRead || 0, cacheWrite: c.cacheWrite || 0, output: c.output || 0 }));
  const sum = (k) => turns.reduce((n, t) => n + t[k], 0);
  const t = u && u.total ? u.total : null;
  const total = { input: t ? t.input || 0 : sum("input"), cacheRead: t ? t.cacheRead || 0 : sum("cacheRead"), cacheWrite: t ? t.cacheWrite || 0 : sum("cacheWrite"), output: t ? t.output || 0 : sum("output"), cost: null };
  const last = turns[turns.length - 1] || null;
  return { turns: calls.length, last, total, context: last ? last.input + last.cacheRead + last.cacheWrite : 0, window: u && typeof u.window === "number" && u.window > 0 ? u.window : 0, inferred: false, retries: (u && u.retries) || 0 };
}

async function agyEngine(ws, sessionId) {
  if (!ws || typeof ws.agyUsage !== "function") return { state: "none", reason: "needs a newer Botling (workspace.agyUsage)" };
  let r; try { r = await ws.agyUsage(sessionId); } catch (e) { return { state: "nodata", reason: String((e && e.message) || e) }; }
  if (!r || !Array.isArray(r.calls) || !r.calls.length) return { state: "none", reason: "no Antigravity log readable for this conversation" };
  const usage = agyUsageOf(r);
  return { state: "ok", sessionId, name: "", model: usage.last ? usage.last.model : "", usage, models: r.models || [], mtime: Date.now(), subagents: await agySubagents(ws, sessionId) };
}

// Quota in display form; anything that is not "available" is "unknown" (the card shows —).
async function agyQuotaOf(ws) {
  if (!ws || typeof ws.agyQuota !== "function") return { status: "unknown", reason: "needs a newer Botling (workspace.agyQuota)", buckets: [] };
  let q; try { q = await Promise.race([ws.agyQuota(), new Promise((_, no) => setTimeout(() => no(new Error("quota timed out")), 4000))]); } catch (e) { return { status: "unknown", reason: String((e && e.message) || e), buckets: [] }; }
  const pick = (bs) => (Array.isArray(bs) ? bs : []).map((b) => ({ group: String(b.group || ""), label: String(b.label || b.group || ""), left: typeof b.remainingFraction === "number" ? b.remainingFraction : null, amount: b.remainingAmount == null ? null : String(b.remainingAmount), resetsAt: typeof b.resetsAt === "number" ? b.resetsAt : null, disabled: !!b.disabled }));
  if (q && q.status === "available") return { status: "available", buckets: pick(q.buckets), seen: q.seen || null };
  const last = q && q.lastKnown && pick(q.lastKnown.buckets);
  return { status: "unknown", reason: (q && q.reason) || "quota not available", buckets: last || [], stale: !!(last && last.length), seen: last && q.lastKnown.seen || null };
}

// ===================== subagents =====================
// Linking rules (found in real logs, see NEXT.md):
//  Claude : <projects>/<proj>/<sessionId>/subagents/**/agent-<id>.jsonl (+ .meta.json). Own API calls only: the main log never
//           contains them. TRAP 1: a "fork" subagent starts with a replay of the parent's messages (same message.id and usage),
//           so every key already in the main log (or an earlier sibling) is dropped. TRAP 2: the Agent tool result's
//           totalTokens/usage is the LAST turn's context size, not a running total: never used.
//  Codex  : rollout whose first line session_meta.payload.source.subagent.thread_spawn.parent_thread_id points at the parent
//           thread (walk it recursively for grandchildren). Its token_count events are its own; replayed parent totals are dropped.
//  Botling workers (agents.json, host.sessionId === this session): claude-process -> handle.sessionId is a Claude session file;
//           codex-thread -> handle.threadId is a Codex rollout. They are counted as kind "worker". Registry rows whose log
//           cannot be found are only counted in `missing` (coverage), never invented.
//  Antigravity: logs have no link; Botling's workspace.agyWorkers / agyWorkerUsage (see agySubagents) provide workers and their usage.
const RUNNING_MS = 3 * 60 * 1000;
const tick = () => new Promise((r) => setImmediate(r)); // let other handlers run between big log files
const MAX_ITEMS = 200;
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const statSig = (p) => { try { const s = fs.statSync(p); return { sig: s.mtimeMs + ":" + s.size, mtime: s.mtimeMs }; } catch { return null; } };

const SUBC = new Map(); // file -> { sig, map, meta }
function claudeSubFile(file) {
  const st = statSig(file); if (!st) return null;
  const metaFile = file.replace(/\.jsonl$/, ".meta.json"), ms = statSig(metaFile);
  const sig = st.sig + "|" + (ms ? ms.sig : "");
  const hit = SUBC.get(file);
  if (hit && hit.sig === sig) return hit;
  const v = { sig, mtime: st.mtime, map: claudeTurnMap(fs.readFileSync(file, "utf8")), meta: ms ? readJson(metaFile) || {} : {} };
  SUBC.set(file, v); return v;
}
function claudeSubPaths(mainFile, sessionId) {
  const out = [];
  (function rec(d, depth) {
    let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 3) rec(p, depth + 1); } else if (/^agent-.+\.jsonl$/.test(e.name)) out.push(p);
    }
  })(path.join(path.dirname(mainFile), sessionId, "subagents"), 0);
  return out;
}
const firstTime = (map) => { for (const t of map.values()) if (t.time) return t.time; return "~"; };
const ownKeys = (map) => [...map.keys()].filter((k) => k[0] !== "\0");

// Botling's agent registry. Found next to the plugins folder (…/core/agents.json) or via SU_AGENTS_FILE (tests).
function agentsFile() {
  if (process.env.SU_AGENTS_FILE) return process.env.SU_AGENTS_FILE;
  try {
    let d = path.dirname(fileURLToPath(import.meta.url)); // not URL.pathname: it keeps %20 for "Application Support"
    for (let i = 0; i < 8; i++, d = path.dirname(d)) { const p = path.join(d, "agents.json"); if (fs.existsSync(p)) return p; }
  } catch {}
  return null;
}
let REG = { sig: "", byHost: new Map() };
function registry() {
  const f = agentsFile(), st = f && statSig(f);
  if (!st) return REG.byHost.size ? (REG = { sig: "", byHost: new Map() }).byHost : REG.byHost;
  if (REG.sig === f + st.sig) return REG.byHost;
  const by = new Map(), j = readJson(f);
  for (const a of (j && Array.isArray(j.agents)) ? j.agents : []) {
    const sid = a && a.host && a.host.sessionId; if (!sid) continue;
    if (!by.has(sid)) by.set(sid, []);
    by.get(sid).push(a);
  }
  REG = { sig: f + st.sig, byHost: by }; return by;
}
const REG_STATE = { completed: "done", idle: "idle", running: "running", stopped: "stopped", interrupted: "stopped", failed: "failed" };

function nameOf(...c) { for (const x of c) if (x && String(x).trim()) return String(x).trim().replace(/\s+/g, " ").slice(0, 120); return "(unnamed)"; }

function summarize(items, extra) {
  items.sort((a, b) => (a.cost == null) - (b.cost == null) || (b.cost || 0) - (a.cost || 0) || b.tokens - a.tokens); // unpriced last
  let tokens = 0, cost = 0, unknown = 0, running = 0, workers = 0;
  for (const i of items) { tokens += i.tokens; if (i.cost == null || i.partial) unknown++; if (i.cost != null) cost += i.cost; if (i.state === "running") running++; if (i.kind === "worker") workers++; }
  return { count: items.length, agents: items.length - workers, workers, running, tokens, cost, unknown, ...extra, items: items.slice(0, MAX_ITEMS), truncated: Math.max(0, items.length - MAX_ITEMS) };
}

function stateOf(finished, stopped, mtime, ended) {
  if (stopped) return "stopped";
  if (finished || ended) return "done";
  return Date.now() - mtime < RUNNING_MS ? "running" : "idle";
}

const costInfo = (u) => {
  const allUnknown = u.turns > 0 && u.total.unknownTurns === u.turns;
  return { cost: allUnknown ? null : u.total.cost, partial: !allUnknown && u.total.unknownTurns > 0 };
};
const claudeTokens = (t) => t.input + t.cacheRead + t.cacheWrite5m + t.cacheWrite1h + t.output;

// Claude: scan the session's subagents dir, then add Botling workers that are their own sessions.
async function claudeSubagents(sessionId, mainFile, mainKeys) {
  const claimed = new Set(mainKeys), items = [], seenFiles = new Set(); let replayed = 0;
  const files = [];
  for (const f of claudeSubPaths(mainFile, sessionId)) { const v = claudeSubFile(f); if (v) files.push({ f, v }); await tick(); }
  files.sort((a, b) => (firstTime(a.v.map) < firstTime(b.v.map) ? -1 : 1)); // earliest file owns a replayed message
  const toolIds = new Set(files.map((x) => x.v.meta.toolUseId).filter(Boolean));
  const add = (f, v, info) => {
    if (seenFiles.has(f)) return; seenFiles.add(f);
    const turns = [];
    for (const [k, t] of v.map) { if (k[0] !== "\0" && claimed.has(k)) replayed++; else turns.push(t); }
    for (const k of ownKeys(v.map)) claimed.add(k);
    const u = tally(turns);
    items.push({ id: info.id, name: info.name, kind: info.kind, model: (u.last && u.last.model) || info.model || "", tokens: claudeTokens(u.total),
      ...costInfo(u), state: info.state, mtime: v.mtime, turns: u.turns });
  };
  for (const { f, v } of files) {
    const m = v.meta, id = path.basename(f).slice(6, -6);
    add(f, v, { id, model: m.model && m.model !== "inherit" ? m.model : "", kind: m.isFork ? "fork" : /[\/\\]workflows[\/\\]/.test(f) ? "workflow" : "agent",
      name: nameOf(m.description, m.name, m.agentType, id), state: stateOf(m.finished === true, m.stoppedByUser === true, v.mtime) });
  }
  let missing = 0;
  for (const a of registry().get(sessionId) || []) {
    const h = a.handle || {}, kind = a.host && a.host.kind;
    if (kind === "claude-process" && a.engine === "claude") {
      const wf = h.sessionId && h.sessionId !== sessionId ? claudeFile(h.sessionId) : null, v = wf && claudeSubFile(wf);
      if (!v) { missing++; continue; }
      add(wf, v, { id: h.sessionId, model: "", kind: "worker", name: nameOf(a.summary && a.summary.description, a.id), state: REG_STATE[a.state] || "idle" });
    } else if (kind === "claude-sidechain" && a.engine === "claude") {
      if (!(h.toolUseId && toolIds.has(h.toolUseId))) missing++; // when its file exists it was counted above
    } else if (kind === "claude-sidechain" && a.engine === "codex") {
      missing++; // a Codex worker launched from a Claude chat: its rollout has no link back, nothing readable
    }
  }
  return summarize(items, { missing, replayed });
}

const CXC = new Map(); // file -> { sig, turns, window, ended }
function codexFileTurns(file) {
  const st = statSig(file); if (!st) return null;
  const hit = CXC.get(file); if (hit && hit.sig === st.sig) return hit;
  const r = codexTurns(fs.readFileSync(file, "utf8")); const v = { sig: st.sig, mtime: st.mtime, ...r };
  CXC.set(file, v); return v;
}
const SPAWN = new Map(); // rollout file -> spawn info | null (first line never changes)
function codexSpawn(file) {
  if (SPAWN.has(file)) return SPAWN.get(file);
  let info = null;
  try {
    const fd = fs.openSync(file, "r");
    try {
      let acc = Buffer.alloc(0); const buf = Buffer.alloc(65536);
      for (let pos = 0; acc.indexOf(10) < 0 && acc.length < 4 << 20;) { const n = fs.readSync(fd, buf, 0, buf.length, pos); if (!n) break; acc = Buffer.concat([acc, buf.subarray(0, n)]); pos += n; }
      const d = JSON.parse(acc.toString("utf8").split("\n")[0]), p = d && d.payload;
      const sp = p && p.source && p.source.subagent && p.source.subagent.thread_spawn;
      if (sp && (sp.parent_thread_id || p.parent_thread_id)) info = { id: p.id, parent: sp.parent_thread_id || p.parent_thread_id, nick: p.agent_nickname || sp.agent_nickname || "", path: p.agent_path || sp.agent_path || "", depth: sp.depth || 1 };
    } finally { fs.closeSync(fd); }
  } catch {}
  SPAWN.set(file, info); return info;
}
async function codexSubagents(uuid, parentTurns) {
  const all = listCodex(), root = all.find((x) => x.id === "codex:" + uuid);
  const stamp = (f) => (path.basename(f).match(/rollout-(\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d)/) || [])[1] || "";
  const since = root ? stamp(root.file) : "";
  const kids = new Map();
  for (const s of all) { // only rollouts created after the parent can be its children
    if (since && stamp(s.file) < since) continue;
    const sp = codexSpawn(s.file); if (!sp) continue;
    if (!kids.has(sp.parent)) kids.set(sp.parent, []);
    kids.get(sp.parent).push({ ...sp, file: s.file });
  }
  const skip = new Set((parentTurns || []).map((t) => t.sig)), items = [], done = new Set([uuid]); let replayed = 0;
  const queue = [uuid];
  while (queue.length) {
    for (const k of kids.get(queue.shift()) || []) {
      if (done.has(k.id)) continue; done.add(k.id); queue.push(k.id);
      const v = codexFileTurns(k.file); await tick(); if (!v) continue;
      const turns = v.turns.filter((t) => { if (skip.has(t.sig)) { replayed++; return false; } return true; });
      const u = codexTally(turns, v.window), model = u.last ? u.last.model : "";
      items.push({ id: k.id, name: nameOf(k.nick && k.path ? k.nick + " · " + k.path.replace(/^\/root\//, "") : k.nick || k.path, k.id.slice(0, 8)), kind: k.depth > 1 ? "nested" : "agent", model,
        tokens: u.total.input + u.total.output, ...costInfo(u),
        state: stateOf(false, false, v.mtime, v.ended), mtime: v.mtime, turns: u.turns });
    }
  }
  let missing = 0;
  for (const a of registry().get(uuid) || []) {
    if (!(a.host && a.host.kind === "codex-thread" && a.engine === "codex")) continue;
    const tid = a.handle && a.handle.threadId, f = tid && tid !== uuid ? codexFile(tid) : null, v = f && codexFileTurns(f);
    if (!v || done.has(tid)) { if (!v) missing++; continue; }
    done.add(tid);
    const u = codexTally(v.turns.filter((t) => !skip.has(t.sig)), v.window);
    items.push({ id: tid, name: nameOf(a.summary && a.summary.description, a.id), kind: "worker", model: u.last ? u.last.model : (a.model || ""),
      tokens: u.total.input + u.total.output, ...costInfo(u),
      state: v.ended && !(a.state === "running") ? "done" : (REG_STATE[a.state] || "idle"), mtime: v.mtime, turns: u.turns });
  }
  return summarize(items, { missing, replayed });
}

// Antigravity workers: ccb.workspace.agyWorkers(mainSessionId) lists them, ccb.workspace.agyWorkerUsage(nativeId) reads each one's
// usage (null = unreadable: shown as "—", never counted as 0). Both are newer than the installed app, so they are feature-detected;
// without them (or if the list call fails) we fall back to counting registry rows only, with a short note.
const AGYW = new Map(); // nativeId -> tokens, for ended workers whose usage was read (it no longer changes)
const AGY_STATE = { running: "running", completed: "done", done: "done", idle: "idle", stopped: "stopped", interrupted: "stopped", failed: "failed" };
function agyFallback(sessionId, note) {
  const n = (registry().get(sessionId) || []).filter((a) => a.engine === "agy").length;
  return { count: n, agents: 0, workers: n, running: 0, tokens: 0, cost: null, unknown: n, missing: 0, replayed: 0, items: [], truncated: 0, unreadable: true, note };
}
async function agySubagents(ws, sessionId) {
  if (!ws || typeof ws.agyWorkers !== "function" || typeof ws.agyWorkerUsage !== "function") return agyFallback(sessionId, "needs a newer Botling (workspace.agyWorkers)");
  let list; try { list = await ws.agyWorkers(sessionId); } catch (e) { return agyFallback(sessionId, "worker list failed: " + String((e && e.message) || e)); }
  if (!Array.isArray(list)) return agyFallback(sessionId, "worker list not available");
  const rows = list.filter((w) => w && w.nativeId);
  const out = new Array(rows.length); let next = 0;
  const one = async (w) => {
    const hit = AGYW.get(w.nativeId); if (hit) return hit;
    let r = null; try { r = await ws.agyWorkerUsage(w.nativeId); } catch {}
    if (!r || typeof r !== "object") return null;
    const u = agyUsageOf(r), t = u.total, v = { tokens: t.input + t.cacheRead + t.cacheWrite + t.output, turns: u.turns, model: u.last ? u.last.model : "" };
    if (w.endedAt) AGYW.set(w.nativeId, v);
    return v;
  };
  await Promise.all(Array.from({ length: Math.min(6, rows.length) }, async () => { while (next < rows.length) { const i = next++; out[i] = await one(rows[i]); } }));
  const items = rows.map((w, i) => {
    const v = out[i];
    return { id: w.nativeId, name: nameOf(w.name, String(w.nativeId).slice(0, 8)), kind: "worker", model: (v && v.model) || w.model || "", tokens: v ? v.tokens : null, cost: null,
      state: w.endedAt && w.state === "running" ? "done" : AGY_STATE[w.state] || "idle", turns: v ? v.turns : null, unreadable: !v };
  });
  items.sort((a, b) => (a.tokens == null) - (b.tokens == null) || (b.tokens || 0) - (a.tokens || 0));
  const bad = items.filter((i) => i.tokens == null).length;
  const tokens = items.reduce((n, i) => n + (i.tokens || 0), 0);
  return { count: items.length, agents: 0, workers: items.length, running: items.filter((i) => i.state === "running").length, tokens, cost: null, unknown: 0, missing: bad, replayed: 0,
    items: items.slice(0, MAX_ITEMS), truncated: Math.max(0, items.length - MAX_ITEMS), unreadable: false };
}

// ===================== all engines for the open conversation =====================
const cache = new Map(); // file -> { sig, value }
async function cached(file, make) {
  let st; try { st = fs.statSync(file); } catch { return null; }
  const sig = st.mtimeMs + ":" + st.size, hit = cache.get(file);
  if (hit && hit.sig === sig) return hit.value;
  const value = await make(st);
  cache.set(file, { sig, value }); return value;
}
const MAINKEYS = new Map(); // main claude file -> { sig, keys }
const MAINCX = new Map();   // main codex file -> { sig, turns }
function claudeFile(id) {
  let dirs = []; try { dirs = fs.readdirSync(ROOT); } catch { return null; }
  for (const d of dirs) { const p = path.join(ROOT, d, id + ".jsonl"); try { fs.statSync(p); return p; } catch {} }
  return null;
}
function codexFile(uuid) { const s = listCodex().find((x) => x.id === "codex:" + uuid); return s ? s.file : null; }
function claudeTitle(text) {
  let t = ""; const re = /"(?:customTitle|aiTitle)":"((?:[^"\\]|\\.)*)"/g; let m;
  while ((m = re.exec(text))) { try { t = JSON.parse('"' + m[1] + '"'); } catch {} }
  return t;
}
function codexTitle(uuid) {
  try {
    const lines = fs.readFileSync(path.join(os.homedir(), ".codex", "session_index.jsonl"), "utf8").split("\n"); let t = "";
    for (const l of lines) if (l.includes(uuid)) { try { const d = JSON.parse(l); if (d.id === uuid && d.thread_name) t = d.thread_name; } catch {} }
    return t;
  } catch { return ""; }
}

async function engineUsage(engine, sessionId, ws) {
  if (engine === "agy") return sessionId ? agyEngine(ws, sessionId) : { state: "none", reason: "no session for this bot" };
  if (!sessionId) return { state: "none", reason: "no session for this bot" };
  if (engine === "claude") {
    const f = claudeFile(sessionId); if (!f) return { state: "none", reason: "session log not found" };
    const r = await cached(f, (st) => {
      const text = fs.readFileSync(f, "utf8"), map = claudeTurnMap(text), usage = tally([...map.values()]);
      MAINKEYS.set(f, { sig: st.mtimeMs + ":" + st.size, keys: ownKeys(map) });
      usage.window = claudeWindow(usage.last && usage.last.model, usage.context, logCwd(text));
      return { state: "ok", sessionId, cwd: logCwd(text), name: claudeTitle(text), model: usage.last ? usage.last.model : "", usage, mtime: st.mtimeMs };
    });
    // Subagents are NOT cached under the main file's signature: they keep writing while the main log is quiet.
    // window re-resolved on every call so editing autoCompactWindow applies without a new log line
    return r && r.state === "ok" ? { ...r, usage: { ...r.usage, window: claudeWindow(r.model, r.usage.context, r.cwd) }, subagents: await claudeSubagents(sessionId, f, (MAINKEYS.get(f) || { keys: [] }).keys) } : r;
  }
  if (engine === "codex") {
    const f = codexFile(sessionId); if (!f) return { state: "none", reason: "session log not found" };
    const r = await cached(f, (st) => {
      const t = codexTurns(fs.readFileSync(f, "utf8")), usage = codexTally(t.turns, t.window);
      MAINCX.set(f, { turns: t.turns });
      return { state: "ok", sessionId, name: codexTitle(sessionId) || codexFolder(f).split("/").filter(Boolean).pop() || "", model: usage.last ? usage.last.model : "", usage, mtime: st.mtimeMs };
    });
    return r && r.state === "ok" ? { ...r, subagents: await codexSubagents(sessionId, (MAINCX.get(f) || { turns: [] }).turns) } : r;
  }
  return { state: "none", reason: "unsupported" };
}

// What the bar shows: one entry per engine for the bot of the chat open now. Sessions come from current().heads
// (every engine session the bot has) plus its primary; an engine without a session stays grey, never guessed.
export async function usageAll(ccb) {
  const ws = ccb.workspace;
  if (!ws || typeof ws.current !== "function") return { ok: true, follow: { mode: "unavailable" }, engines: {} };
  let cur; try { cur = await ws.current(); } catch (e) { return { ok: true, follow: { mode: "unavailable", detail: String((e && e.message) || e) }, engines: {} }; }
  if (!cur) return { ok: true, follow: { mode: "none-open" }, engines: {} };
  let bot = cur.botId || "";
  try { const b = (await ws.bots()).find((x) => x && x.id === cur.botId); if (b && b.name) bot = b.name; } catch {}
  const ids = {};
  for (const h of Array.isArray(cur.heads) ? cur.heads : []) if (h && h.engine && h.sessionId && !ids[h.engine]) ids[h.engine] = String(h.sessionId);
  if (cur.engine && cur.sessionId) ids[cur.engine] = String(cur.sessionId);
  const engines = {};
  for (const e of ["claude", "codex", "agy"]) {
    let r; try { r = await engineUsage(e, ids[e], ws); } catch (err) { r = { state: "nodata", reason: String((err && err.message) || err) }; }
    engines[e] = { ...(r || { state: "none" }), current: e === cur.engine };
  }
  const quota = ids.agy ? await agyQuotaOf(ws) : null;
  return { ok: true, at: Date.now(), quota, follow: { mode: "following", bot, engine: String(cur.engine || ""), view: cur.view || "" }, engines, prices: { claude: PRICES, codex: CODEX_PRICES } };
}

export function activate(ccb) {
  ccb.web.handle("usageAll", () => usageAll(ccb));
  ccb.web.handle("usage", async (params) => {
    const filter = (ccb.settings.get("session-usage.folder") || "").trim();
    const sessions = listSessions(filter);
    const list = sessions.map(({ kind, folder, id, mtime }) => ({ kind, folder, id, mtime }));
    // The wanted session may be older than the dropdown list, so look it up on disk and add it.
    const find = (id) => {
      if (!id) return null;
      let s = sessions.find((x) => x.id === id);
      if (s) return s;
      const all = String(id).startsWith("codex:") ? listCodex() : listClaude("");
      s = all.find((x) => x.id === id);
      if (!s) return null;
      if (s.kind === "codex") s.folder = codexFolder(s.file);
      sessions.push(s);
      list.push({ kind: s.kind, folder: s.folder, id: s.id, mtime: s.mtime });
      return s;
    };
    // params.id = manual pick (pinned); empty = follow the open conversation.
    const manual = find(params && params.id);
    const follow = manual ? { mode: "pinned" } : await resolveFollow(ccb, find);
    const pick = manual || (follow.id ? find(follow.id) : null) || sessions[0];
    const prices = { claude: PRICES, codex: CODEX_PRICES };
    if (!pick) return { ok: true, sessions: list, empty: true, prices, follow };
    let text = "";
    try { text = fs.readFileSync(pick.file, "utf8"); } catch (e) { return { ok: false, error: String(e.message || e), sessions: list }; }
    const current = { kind: pick.kind, folder: pick.folder, id: pick.id, mtime: pick.mtime };
    const usage = pick.kind === "codex" ? parseCodex(text) : parseTranscript(text);
    if (pick.kind === "claude") usage.window = claudeWindow(usage.last && usage.last.model, usage.context, logCwd(text));
    return { ok: true, sessions: list, current, usage, prices, follow };
  });
}
