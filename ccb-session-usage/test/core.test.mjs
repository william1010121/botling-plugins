import { parseTranscript } from "./usage-core.mjs";
import fs from "node:fs";
const f = process.argv[2];
const r = parseTranscript(fs.readFileSync(f, "utf8"));
console.log(JSON.stringify({ turns: r.turns, context: r.context, total: r.total, last: r.last }, null, 1));
console.log(JSON.stringify(parseTranscript("")), JSON.stringify(parseTranscript("garbage\n{}")).slice(0, 60));
