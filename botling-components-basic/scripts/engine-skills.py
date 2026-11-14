#!/usr/bin/env python3
"""Read-only: list skills, MCP servers and Botling plugin skills per engine (Claude, Codex, Antigravity). Prints one JSON object."""
import json, os, re, subprocess, glob

HOME = os.path.expanduser("~")
P = lambda *a: os.path.join(HOME, *a)


def desc_of(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read(8000)
    except Exception:
        return None, None
    m = re.match(r"---\s*\n(.*?)\n---", text, re.S)
    if not m:
        return None, ""
    lines = m.group(1).split("\n")
    name, desc = None, ""
    for i, ln in enumerate(lines):
        k = re.match(r"(name|description):\s*(.*)$", ln)
        if not k:
            continue
        val = k.group(2).strip()
        if k.group(1) == "name":
            name = val.strip("'\"")
            continue
        if val in (">", ">-", "|", "|-", ">+", "|+", ""):
            parts = []
            for nx in lines[i + 1:]:
                if nx and not nx[0].isspace():
                    break
                parts.append(nx.strip())
            val = " ".join(p for p in parts if p)
        desc = val.strip("'\"")
    desc = re.sub(r"\s+", " ", desc).strip()
    return name, desc[:220]


def scan_skills(root, depth=2):
    """Folders under root that hold a SKILL.md (symlinks followed)."""
    out = {}
    if not os.path.isdir(root):
        return out
    def walk(d, lvl):
        try:
            entries = sorted(os.listdir(d))
        except Exception:
            return
        for e in entries:
            p = os.path.join(d, e)
            if not os.path.isdir(p):
                continue
            sk = os.path.join(p, "SKILL.md")
            if os.path.isfile(sk):
                n, ds = desc_of(sk)
                out[e] = {"name": e, "desc": ds or ""}
            elif lvl < depth and (e.startswith(".") or lvl == 0 and False or e == "skills" or e.startswith(".system")):
                walk(p, lvl + 1)
    walk(root, 0)
    return out


def merge(*dicts):
    r = {}
    for d in dicts:
        for k, v in d.items():
            r.setdefault(k, v)
    return sorted(r.values(), key=lambda s: s["name"].lower())


def load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


# ---------------- Claude ----------------
def claude():
    e = {"name": "Claude", "readable": os.path.isdir(P(".claude")), "skills": [], "mcp": [], "botlingSkills": [], "mcpMode": "configured"}
    if not e["readable"]:
        return e
    sk = [scan_skills(P(".claude", "skills"))]
    inst = load_json(P(".claude", "plugins", "installed_plugins.json")) or {}
    cfg_mcp = {}
    for key, lst in (inst.get("plugins") or {}).items():
        for it in lst[:1]:
            ip = it.get("installPath") or ""
            s = scan_skills(os.path.join(ip, "skills"))
            plug = key.split("@")[0]
            sk.append({k: {"name": v["name"], "desc": v["desc"]} for k, v in s.items()})
            mj = load_json(os.path.join(ip, ".mcp.json")) or {}
            for n in (mj.get("mcpServers") or mj if isinstance(mj, dict) else {}):
                if isinstance(mj.get("mcpServers", mj).get(n), dict):
                    cfg_mcp[n] = "configured"
    e["skills"] = merge(*sk)
    cj = load_json(P(".claude.json")) or {}
    for n in (cj.get("mcpServers") or {}):
        cfg_mcp[n] = "configured"
    for n in ((load_json(P(".claude", "settings.json")) or {}).get("mcpServers") or {}):
        cfg_mcp[n] = "configured"
    live = {}
    exe = P(".local", "bin", "claude")
    if os.path.isfile(exe):
        try:
            r = subprocess.run([exe, "mcp", "list"], capture_output=True, text=True, timeout=25, stdin=subprocess.DEVNULL)
            for ln in r.stdout.splitlines():
                m = re.match(r"^(.+?):\s.* - (?:\S+\s)?(.+)$", ln)
                if not m or "Checking" in ln:
                    continue
                st = m.group(2).lower()
                live[m.group(1).strip()] = "connected" if "connected" in st and "fail" not in st else ("auth" if "auth" in st else "failed")
        except Exception:
            live = {}
    if live:
        e["mcpMode"] = "live"
        merged = dict(live)
    else:
        merged = cfg_mcp
    e["mcp"] = [{"name": n, "status": merged[n]} for n in sorted(merged, key=str.lower)]
    return e


# ---------------- Codex ----------------
def codex():
    e = {"name": "Codex", "readable": os.path.isdir(P(".codex")), "skills": [], "mcp": [], "botlingSkills": [], "mcpMode": "configured"}
    if not e["readable"]:
        return e
    e["skills"] = merge(scan_skills(P(".codex", "skills")), scan_skills(P(".agents", "skills")))
    try:
        with open(P(".codex", "config.toml"), encoding="utf-8") as f:
            names = []
            for ln in f:
                m = re.match(r'^\[mcp_servers\.("([^"]+)"|([A-Za-z0-9_-]+))\]\s*$', ln.strip())
                if m:
                    names.append(m.group(2) or m.group(3))
        e["mcp"] = [{"name": n, "status": "configured"} for n in names]
    except Exception:
        e["mcp"] = None
    return e


# ---------------- Antigravity ----------------
def agy():
    dirs = [P(".gemini", d) for d in ("antigravity", "antigravity-cli", "config")]
    e = {"name": "Antigravity", "readable": any(os.path.isdir(d) for d in dirs[:2]), "skills": [], "mcp": [], "botlingSkills": [], "mcpMode": "configured"}
    if not e["readable"]:
        return e
    sks = [scan_skills(os.path.join(d, "skills")) for d in dirs] + [scan_skills(P(".gemini", "antigravity", "builtin", "skills"))]
    e["skills"] = merge(*sks)
    names, ok = {}, False
    for p in (P(".gemini", "config", "mcp_config.json"), P(".gemini", "antigravity", "mcp_config.json")):
        if not os.path.exists(p):
            continue
        try:
            raw = open(p, encoding="utf-8").read().strip()
            ok = True
            if raw:
                d = json.loads(raw)
                for n in (d.get("mcpServers") or {}):
                    names[n] = "configured"
        except Exception:
            pass
    e["mcp"] = [{"name": n, "status": s} for n, s in sorted(names.items())] if ok else None
    return e


def botling_skills():
    roots = glob.glob("/Users/*/Applications/Botling*.app/Contents/Resources/builtin-plugins/*") + glob.glob("/Applications/Botling*.app/Contents/Resources/builtin-plugins/*")
    here = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    roots += glob.glob(os.path.join(here, "*"))
    seen, out = set(), []
    for r in roots:
        plug = os.path.basename(r)
        for sd in (os.path.join(r, "skills"), os.path.join(r, "claude", "skills")):
            for k, v in scan_skills(sd, 0).items():
                key = (plug, k)
                if key in seen:
                    continue
                seen.add(key)
                out.append({"name": k, "plugin": plug, "desc": v["desc"]})
    return sorted(out, key=lambda x: (x["plugin"], x["name"]))


DATA = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def agy_skill_roots():
    roots = []
    for f in glob.glob(os.path.join(DATA, "agy-acp", "*", "config", "skills.json")):
        d = load_json(f)
        ents = d.get("entries") if isinstance(d, dict) else None
        if not isinstance(ents, list):
            continue
        for it in ents:
            if isinstance(it, dict) and isinstance(it.get("path"), str) and it["path"]:
                roots.append(it["path"])
    return roots


def loaded_checks():
    pj = load_json(os.path.join(DATA, "plugins.json"))
    disabled = set(pj.get("disabled") or []) if isinstance(pj, dict) and isinstance(pj.get("disabled"), list) else set()
    roots = agy_skill_roots()
    has = lambda *a: os.path.isfile(os.path.join(DATA, *a, "SKILL.md"))
    return [
        lambda b: has("plugin-skills", "claude", b["plugin"], "skills", b["name"]),
        lambda b: b["plugin"] not in disabled and has("plugin-guides", b["plugin"], "skills", b["name"]),
        lambda b: any(os.path.isfile(os.path.join(r, b["name"], "SKILL.md")) for r in roots),
    ]


def main():
    engines = [claude(), codex(), agy()]
    bs = botling_skills()
    checks = loaded_checks()
    for i, e in enumerate(engines):
        e["botlingSkills"] = [dict(b, loaded=bool(e["readable"] and checks[i](b))) for b in bs]
        if not e["readable"]:
            e["skills"], e["mcp"] = None, None
    print(json.dumps({"engines": engines}, ensure_ascii=False, separators=(",", ":")))


main()
