#!/usr/bin/env node
// Privacy scan of every file in this repo (but .git): IP addresses, e-mail addresses, home folder
// paths, ssh targets, keys and tokens, high-entropy strings, URLs to hosts not reviewed yet, private
// host suffixes, and private words (names, machines, projects) from a list kept OUTSIDE the repo.
//
//   node tools/scan.mjs [--show]
//
// Exit 1 on any hit that tools/scan-allowlist.json does not list. Hits are printed as
// file:line kind id; the value itself is printed only with --show (never in CI: logs are public).
// The id is the first 16 hex of sha256("<kind>\0<value>"): the allowlist names reviewed false
// positives by file, kind and id, so the allowlist holds no values either.
//
// Private words: BOTLING_SCAN_TERMS (one per line; in CI a repository secret) and/or
// BOTLING_SCAN_TERMS_FILE (default ../botling-plugins-private/scan-terms.txt). A hit on one is
// reported as "private-word #<n>" and its word is never printed.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isIPv6 } from "node:net";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const show = process.argv.includes("--show");
const id = (kind, value) => createHash("sha256").update(`${kind}\0${value}`).digest("hex").slice(0, 16);
const posix = (p) => p.split(sep).join("/");
const listFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.name === ".git" ? [] : e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]);

const allowFile = join(root, "tools", "scan-allowlist.json");
const allow = existsSync(allowFile) ? JSON.parse(readFileSync(allowFile, "utf8")).entries : [];
const allowed = new Set(allow.map((a) => `${a.file}\0${a.kind}\0${a.id}`));
const hostsFile = join(root, "tools", "scan-hosts.txt");
const publicHosts = existsSync(hostsFile) ? readFileSync(hostsFile, "utf8").split("\n").map((l) => l.replace(/#.*/, "").trim().toLowerCase()).filter(Boolean) : [];

const termsFile = process.env.BOTLING_SCAN_TERMS_FILE ?? join(root, "..", "botling-plugins-private", "scan-terms.txt");
const terms = [...new Set([
  ...(process.env.BOTLING_SCAN_TERMS ?? "").split("\n"),
  ...(existsSync(termsFile) ? readFileSync(termsFile, "utf8").split("\n") : []),
].map((t) => t.trim()).filter((t) => t.length >= 3))];
const termRes = terms.map((t) => {
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return /^[\x00-\x7f]+$/.test(t) ? new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`, "gi") : new RegExp(esc, "g");
});

const EXAMPLE_HOMES = new Set(["me", "you", "name", "username", "yourname", "example", "user", "x", "Shared", "runner"]);
const EXAMPLE_MAIL = /@(example\.(com|org|net|invalid)|[a-z0-9-]+\.invalid|users\.noreply\.github\.com)$/i;
const DOC_IP = /^(0\.0\.0\.0|127\.0\.0\.1|255\.255\.255\.255|192\.0\.2\.\d+|198\.51\.100\.\d+|203\.0\.113\.\d+)$/;
// Key prefixes, spelled in parts so this file does not match itself.
const KEYS = [
  ["key: anthropic", "sk-" + "ant-[A-Za-z0-9_-]{20,}"],
  ["key: openai-style", "\\bsk-" + "(?:proj-)?[A-Za-z0-9]{20,}"],
  ["key: github", "\\bgh" + "[pousr]_[A-Za-z0-9]{30,}"],
  ["key: github", "github" + "_pat_[A-Za-z0-9_]{30,}"],
  ["key: slack", "\\bxox" + "[abprs]-[A-Za-z0-9-]{10,}"],
  ["key: aws", "\\bAKI" + "A[0-9A-Z]{16}\\b"],
  ["key: google", "\\bAI" + "za[0-9A-Za-z_-]{35}"],
  ["key: gitlab", "\\bglp" + "at-[A-Za-z0-9_-]{20,}"],
  ["key: npm", "\\bnp" + "m_[A-Za-z0-9]{36}\\b"],
  ["key: private key", "-----BEGIN [A-Z ]*PRIVATE" + " KEY-----"],
  ["key: bearer", "\\bBearer" + " [A-Za-z0-9._~+/-]{24,}=*"],
].map(([kind, re]) => [kind, new RegExp(re, "g")]);

function entropy(s) {
  const n = {}; for (const c of s) n[c] = (n[c] ?? 0) + 1;
  return Object.values(n).reduce((h, k) => h - (k / s.length) * Math.log2(k / s.length), 0);
}

function* findings(text) {
  for (const m of text.matchAll(/(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d]|\.\d)/g)) {
    if (m.slice(1, 5).every((o) => Number(o) <= 255) && !DOC_IP.test(m[0])) yield ["ipv4", m[0], m.index];
  }
  for (const m of text.matchAll(/(?<![\w:.])[0-9a-fA-F]{0,4}(?::[0-9a-fA-F]{0,4}){2,7}(?![\w:])/g)) {
    const groups = m[0].split(":").filter(Boolean);
    const looksIp = isIPv6(m[0]) && ((m[0].includes("::") && groups.length >= 2 && groups.some((g) => /[a-f]/i.test(g) || g.length >= 3)) || groups.length >= 5);
    if (looksIp && m[0] !== "::1") yield ["ipv6", m[0], m.index];
  }
  for (const m of text.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g)) if (!EXAMPLE_MAIL.test(m[0])) yield ["e-mail", m[0], m.index];
  for (const m of text.matchAll(/(?:\/Users|\/home|[A-Za-z]:\\Users|-Users)[\/\\-]([A-Za-z0-9._]+)/g)) if (!EXAMPLE_HOMES.has(m[1])) yield ["home path", m[0], m.index];
  for (const m of text.matchAll(/\bssh\s+(?:-[A-Za-z]+(?:\s+[^\s-][^\s]*)?\s+)*([A-Za-z0-9._-]+@)?([A-Za-z0-9][A-Za-z0-9._-]*)/g)) {
    if (!/^(host|hostname|example|user|remote|server)$/i.test(m[2])) yield ["ssh target", m[0], m.index];
  }
  for (const [kind, re] of KEYS) for (const m of text.matchAll(re)) yield [kind, m[0], m.index];
  for (const m of text.matchAll(/[A-Za-z0-9+/_=-]{32,}/g)) {
    const s = m[0];
    if (/^[0-9a-f]{40,}$/i.test(s)) { yield ["long hex", s, m.index]; continue; }
    if (/[0-9]/.test(s) && /[A-Za-z]/.test(s) && entropy(s) > 4.3) yield ["high-entropy string", s, m.index];
  }
  for (const m of text.matchAll(/\b(?:https?|wss?|ssh|ftp|sftp|git):\/\/(?:[^@\/\s"'`<>]+@)?([A-Za-z0-9.-]+)/g)) {
    const host = m[1].toLowerCase().replace(/\.$/, "");
    if (!host.includes(".") && host !== "localhost") { yield ["url host", host, m.index]; continue; }
    if (host === "localhost" || /^(\d+\.){3}\d+$/.test(host)) continue; // localhost; IPs are reported as ipv4
    if (!publicHosts.some((h) => host === h || host.endsWith("." + h))) yield ["url host", host, m.index];
  }
  for (const m of text.matchAll(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:local|lan|internal|intranet|corp|home\.arpa|ts\.net|ngrok\.io|ngrok-free\.app)\b/gi)) yield ["private host", m[0], m.index];
  for (let i = 0; i < termRes.length; i++) for (const m of text.matchAll(termRes[i])) yield [`private-word #${i + 1}`, m[0], m.index, terms[i]];
}

let hits = 0, reviewed = 0, files = 0;
const reviewedKinds = {};
for (const file of listFiles(root)) {
  const rel = posix(relative(root, file));
  if (rel === "tools/scan-allowlist.json") continue; // ids only
  const text = readFileSync(file, "utf8"); // binary files too: what is text in them is what leaks
  files++;
  const lineAt = (i) => text.slice(0, i).split("\n").length;
  for (const [kind, value, index, word] of findings(text)) {
    if (rel === "index.json" && kind === "long hex") continue; // the folder hashes this repo generates
    const fid = id(kind.startsWith("private-word") ? "private-word" : kind, word ?? value);
    if (allowed.has(`${rel}\0${kind.startsWith("private-word") ? "private-word" : kind}\0${fid}`)) { reviewed++; reviewedKinds[kind] = (reviewedKinds[kind] ?? 0) + 1; continue; }
    hits++;
    const shown = show && !kind.startsWith("private-word") ? `  ${JSON.stringify(value.length > 120 ? value.slice(0, 120) + "…" : value)}` : "";
    console.log(`${rel}:${lineAt(index)}  ${kind}  ${fid}${shown}`);
  }
}
console.log(`scan: ${files} files, ${terms.length} private words, ${hits} unreviewed hits, ${reviewed} allowlisted ${JSON.stringify(reviewedKinds)}`);
process.exit(hits ? 1 : 0);
