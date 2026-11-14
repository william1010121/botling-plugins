// The registry (agents.json) is found by walking up from the host file. A plugins folder under "Application Support" has a
// space, which URL.pathname keeps as %20 -> registry silently not found -> Subagents "none". Regression test.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import assert from "node:assert";
const base = fs.mkdtempSync(path.join(os.tmpdir(), "su space "));
const dist = path.join(base, "plugins", "p", "dist"); fs.mkdirSync(dist, { recursive: true });
fs.copyFileSync(new URL("../dist/host.mjs", import.meta.url), path.join(dist, "host.mjs"));
fs.writeFileSync(path.join(base, "agents.json"), JSON.stringify({ agents: [{ id: "a1", engine: "agy", host: { sessionId: "S1", kind: "agy-acp" }, handle: {} }] }));
delete process.env.SU_AGENTS_FILE;
const { usageAll } = await import(path.join(dist, "host.mjs"));
const r = await usageAll({ workspace: { current: async () => ({ botId: "b", engine: "agy", sessionId: "S1", heads: [] }), bots: async () => [], agyUsage: async () => ({ calls: [{ input: 1, output: 1 }] }) } });
assert.equal(r.engines.agy.subagents.count, 1, "registry must be found in a path with a space");
console.log("space path test passed");
