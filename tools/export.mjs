#!/usr/bin/env node
// Rebuilds this repo's plugin folders from a private Botling plugin library: copies only what
// tools/export.config.json lists, applies the scrubs, regenerates index.json and runs the scan.
// Rerunning it gives the same tree. It never writes to the library.
//
//   node tools/export.mjs --from "<plugin library>" [--private <folder>]
//
// --private (or BOTLING_EXPORT_PRIVATE) names a folder OUTSIDE this repo that may hold
//   scrubs.json      [{ "kind", "from", "to" }]  literal replacements of private words
//   scan-terms.txt   one private word per line (names, machines, projects) for tools/scan.mjs
//   export-report.json  written here: what was scrubbed, by kind and count (never the values)
// Default: ../botling-plugins-private next to this repo. Without it only the generic scrubs run.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const from = opt("--from") ?? process.env.BOTLING_PLUGIN_LIBRARY;
if (!from || !existsSync(join(from, "PLUGINS.md"))) {
  console.error("usage: node tools/export.mjs --from <plugin library folder> [--private <folder>]");
  process.exit(2);
}
const privateDir = resolve(opt("--private") ?? process.env.BOTLING_EXPORT_PRIVATE ?? join(root, "..", "botling-plugins-private"));
if (privateDir === root || privateDir.startsWith(root + sep)) { console.error("The private folder must be outside this repo."); process.exit(2); }
const config = JSON.parse(readFileSync(join(root, "tools", "export.config.json"), "utf8"));
const privateScrubs = existsSync(join(privateDir, "scrubs.json")) ? JSON.parse(readFileSync(join(privateDir, "scrubs.json"), "utf8")) : [];

const counts = {};
const count = (kind, n = 1) => { if (n) counts[kind] = (counts[kind] ?? 0) + n; };
const listFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]);
const toPosix = (p) => p.split(sep).join("/");
const glob = (pattern) => new RegExp("^" + pattern.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$");

// 1. Fresh copies.
for (const plugin of config.plugins) {
  const src = join(from, plugin.from);
  const dst = join(root, plugin.to);
  rmSync(dst, { recursive: true, force: true });
  const skip = new Set((plugin.skip ?? []).map((p) => join(src, p)));
  const filter = (p) => !config.skipNames.includes(p.split(sep).pop()) && !skip.has(p);
  if (plugin.ref) {
    // The committed version (e.g. "HEAD") instead of the working tree: read with git, never written.
    const git = (...a) => spawnSync("git", ["-C", from, ...a], { maxBuffer: 256 * 1024 * 1024 });
    const tree = git("ls-tree", "-r", "-z", plugin.ref, "--", plugin.from);
    if (tree.status !== 0) throw new Error(`git ls-tree ${plugin.ref} ${plugin.from} failed`);
    for (const line of tree.stdout.toString("utf8").split("\0").filter(Boolean)) {
      const [meta, path] = line.split("\t");
      const [mode, type, hash] = meta.split(" ");
      if (type !== "blob") continue;
      const rel = relative(plugin.from, path);
      if (rel.split("/").some((part) => config.skipNames.includes(part)) || skip.has(join(src, rel))) continue;
      const blob = git("cat-file", "blob", hash);
      if (blob.status !== 0) throw new Error(`git cat-file ${path} failed`);
      mkdirSync(dirname(join(dst, rel)), { recursive: true });
      writeFileSync(join(dst, rel), blob.stdout, { mode: mode === "100755" ? 0o755 : 0o644 });
    }
  } else if (plugin.include) {
    for (const part of plugin.include) {
      if (!existsSync(join(src, part))) throw new Error(`${plugin.from}/${part} is not in the library`);
      mkdirSync(dirname(join(dst, part)), { recursive: true });
      cpSync(join(src, part), join(dst, part), { recursive: true, filter });
    }
  } else {
    cpSync(src, dst, { recursive: true, filter });
  }
  if (plugin.packageJson) writeFileSync(join(dst, "package.json"), JSON.stringify(plugin.packageJson, null, 2) + "\n");
}

// 2. Scrubs on every text file of the exported plugins.
const EXAMPLE_HOMES = new Set(["me", "you", "name", "username", "yourname", "example", "user", "x", "Shared"]);
const EXAMPLE_MAIL = /@(example\.(com|org|net|invalid)|[a-z0-9-]+\.invalid|users\.noreply\.github\.com)$/i;
const isText = (buf) => !buf.subarray(0, 8000).includes(0);
for (const plugin of config.plugins) {
  for (const file of listFiles(join(root, plugin.to))) {
    const buf = readFileSync(file);
    if (!isText(buf)) continue;
    const rel = toPosix(relative(root, file));
    let text = buf.toString("utf8");
    const before = text;
    for (const s of privateScrubs) {
      const n = text.split(s.from).length - 1;
      if (n) { text = text.split(s.from).join(s.to); count(s.kind, n); }
    }
    for (const r of config.rewrites) {
      if (!glob(r.files).test(rel)) continue;
      text = text.replace(new RegExp(r.pattern, "g"), (...m) => { count(r.kind); return r.replace.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? ""); });
    }
    text = text.replace(/(?<![\w.-])(\/Users|\/home)\/([A-Za-z0-9._-]+)(?=\/|\b)/g, (all, _base, name) => {
      if (EXAMPLE_HOMES.has(name)) return all;
      count("home folder path → ~"); return "~";
    });
    text = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, (mail) => {
      if (EXAMPLE_MAIL.test(mail)) return mail;
      count("e-mail → example address"); return "someone@example.com";
    });
    if (text !== before) writeFileSync(file, text);
  }
}

// 3. Licence files, added verbatim after the scrubs. Each plugin's package.json must name the licence the config expects.
const legal = (name) => readFileSync(join(root, "tools", "legal", name), "utf8");
const fill = (text, plugin) => text.replaceAll("{{year}}", String(plugin.copyrightYear ?? config.copyrightYear)).replaceAll("{{holder}}", plugin.copyrightHolder ?? config.copyrightHolder);
for (const plugin of config.plugins) {
  const dst = join(root, plugin.to);
  const pkg = JSON.parse(readFileSync(join(dst, "package.json"), "utf8"));
  if (pkg.license !== plugin.license) throw new Error(`${plugin.to}: package.json license is ${pkg.license}, the config expects ${plugin.license}`);
  for (const [to, name] of Object.entries(plugin.legal ?? {})) {
    mkdirSync(dirname(join(dst, to)), { recursive: true });
    writeFileSync(join(dst, to), fill(legal(name), plugin));
    count("licence file added");
  }
}

// 4. Index and scan.
const run = (script) => spawnSync(process.execPath, [join(root, "tools", script)], { cwd: root, stdio: "inherit", env: { ...process.env, BOTLING_SCAN_TERMS_FILE: process.env.BOTLING_SCAN_TERMS_FILE ?? join(privateDir, "scan-terms.txt") } }).status;
const indexStatus = run("build-index.mjs");
const scanStatus = run("scan.mjs");
const report = { plugins: config.plugins.map((p) => p.to), scrubbed: counts, index: indexStatus === 0 ? "ok" : "failed", scan: scanStatus === 0 ? "clean" : "hits" };
if (existsSync(privateDir)) writeFileSync(join(privateDir, "export-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
process.exit(indexStatus || scanStatus ? 1 : 0);
