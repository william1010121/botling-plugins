// Headless Chrome helper. In this environment Chrome writes the screenshot/DOM and then hangs in teardown,
// so run it with a hard timeout + its own profile and judge success by the output, not the exit code.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { spawnSync } from "node:child_process";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
function run(args, timeout) {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), "su-chrome-"));
  const r = spawnSync(CHROME, ["--headless=new", "--user-data-dir=" + ud, "--no-first-run", "--no-sandbox", "--disable-gpu", ...args], { encoding: "utf8", timeout, killSignal: "SIGKILL", maxBuffer: 1 << 26 });
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch {}
  return r;
}
export function screenshot(url, png, w, h, budget = 2500) {
  try { fs.rmSync(png); } catch {}
  for (let i = 0; i < 3 && !(fs.existsSync(png) && fs.statSync(png).size > 1000); i++) run(["--hide-scrollbars", "--force-device-scale-factor=2", `--window-size=${w},${h}`, `--virtual-time-budget=${budget}`, `--screenshot=${png}`, url], 12000);
  if (!fs.existsSync(png) || fs.statSync(png).size < 1000) throw new Error("no screenshot produced for " + url);
  return png;
}
export function dumpDom(url, budget = 3000) { const r = run([`--virtual-time-budget=${budget}`, "--dump-dom", url], 40000); return r.stdout || ""; }
