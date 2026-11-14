#!/usr/bin/env python3
"""Print one JSON object for the memory-usage-analysis component (macOS, read-only, stdlib only)."""
import json
import os
import re
import subprocess


def run(cmd, timeout=5):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout
    except Exception:
        return ""


def app_name(path):
    m = re.search(r"/([^/]+)\.app(?:/|$)", path)
    if m:
        return m.group(1)
    return os.path.basename(path) or path


def main():
    out = {}
    total = 0
    try:
        total = int(run(["sysctl", "-n", "hw.memsize"]).strip())
    except Exception:
        pass
    try:
        text = run(["vm_stat"])
        m = re.search(r"page size of (\d+) bytes", text)
        page = int(m.group(1)) if m else 16384
        pages = {}
        for line in text.splitlines():
            mm = re.match(r"\s*\"?([^:\"]+)\"?:\s+(\d+)", line)
            if mm:
                pages[mm.group(1).strip()] = int(mm.group(2))
        used = (pages.get("Pages active", 0) + pages.get("Pages wired down", 0)
                + pages.get("Pages occupied by compressor", 0)) * page
        if used > 0:
            out["usedGB"] = round(used / 1024 ** 3, 1)
    except Exception:
        pass
    if total:
        out["totalGB"] = round(total / 1024 ** 3, 1)
    try:
        lvl = run(["sysctl", "-n", "kern.memorystatus_vm_pressure_level"]).strip()
        if lvl:
            out["pressure"] = {"1": "normal", "2": "warn", "4": "critical"}.get(lvl, "normal")
    except Exception:
        pass
    try:
        m = re.search(r"used = ([\d.]+)([MGK])", run(["sysctl", "-n", "vm.swapusage"]))
        if m:
            v = float(m.group(1)) / {"K": 1024 ** 2, "M": 1024, "G": 1}[m.group(2)]
            out["swapUsedGB"] = round(v, 2)
    except Exception:
        pass
    try:
        agg = {}
        for line in run(["ps", "-axo", "rss,comm"], 4).splitlines()[1:]:
            parts = line.strip().split(None, 1)
            if len(parts) < 2:
                continue
            try:
                kb = int(parts[0])
            except ValueError:
                continue
            n = app_name(parts[1])
            agg[n] = agg.get(n, 0) + kb
        top = sorted(agg.items(), key=lambda x: -x[1])[:8]
        if top:
            out["processes"] = [{"name": n, "memMB": round(kb / 1024)} for n, kb in top]
    except Exception:
        pass
    print(json.dumps(out, ensure_ascii=False))


try:
    main()
except Exception:
    print("{}")
