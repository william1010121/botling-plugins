#!/usr/bin/env python3
"""Print one JSON object for the cpu-load component (macOS, stdlib only)."""
import json
import os
import re
import subprocess


def run(cmd, timeout):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout
    except Exception:
        return ""


def main():
    out = {}
    try:
        text = run(["top", "-l", "2", "-s", "1", "-n", "0"], 15)
        lines = [l for l in text.splitlines() if "CPU usage" in l]
        if lines:
            m = re.search(r"([\d.]+)%\s*user,\s*([\d.]+)%\s*sys,\s*([\d.]+)%\s*idle", lines[-1])
            if m:
                u, s, i = (float(x) for x in m.groups())
                out["cpuPercent"] = round(u + s)
                out["headline"] = "User %g%% · System %g%% · Idle %g%%" % (u, s, i)
    except Exception:
        pass
    try:
        out["loadAvg"] = [round(x, 2) for x in os.getloadavg()]
    except Exception:
        pass
    try:
        if os.cpu_count():
            out["cores"] = os.cpu_count()
    except Exception:
        pass
    try:
        procs = []
        for line in run(["ps", "-axo", "pid,pcpu,comm", "-r"], 1.3).splitlines()[1:]:
            parts = line.split(None, 2)
            if len(parts) < 3:
                continue
            try:
                cpu = float(parts[1])
            except ValueError:
                continue
            procs.append({"name": os.path.basename(parts[2]) or parts[2], "cpu": cpu})
            if len(procs) >= 8:
                break
        if procs:
            out["processes"] = procs
    except Exception:
        pass
    print(json.dumps(out, ensure_ascii=False))


try:
    main()
except Exception:
    print("{}")
