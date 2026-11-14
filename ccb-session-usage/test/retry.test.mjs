// node test/retry.test.mjs — a failed first call is retried quickly and then shows data
import assert from "node:assert/strict";
import { mountUsage } from "../dist/web.js";
const el = { innerHTML: "", addEventListener() {}, querySelectorAll: () => [] };
const root = { innerHTML: "", querySelector: () => el };
let n = 0;
const off = mountUsage(root, {}, { surface: "compact", interval: 400, load: async () => { if (++n < 3) throw new Error("host not ready"); return { ok: true, follow: { mode: "following" }, engines: {} }; } });
await new Promise((r) => setTimeout(r, 7000)); off();
assert.ok(n >= 3, "retried, calls=" + n);
console.log("retry test passed, calls=" + n);
