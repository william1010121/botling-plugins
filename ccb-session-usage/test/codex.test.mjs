import { parseCodex } from "./usage-core.mjs";
import fs from "node:fs";
const r = parseCodex(fs.readFileSync(process.argv[2], "utf8"));
console.log(JSON.stringify({ turns: r.turns, context: r.context, window: r.window, total: r.total, last: r.last }, null, 1));
console.log(JSON.stringify(parseCodex("")), JSON.stringify(parseCodex("garbage\n{}")).slice(0, 80));
