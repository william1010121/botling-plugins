#!/usr/bin/env python3
"""Disk usage summary as ONE JSON object on stdout. Read-only; deletes nothing.

Units: GB = 1000^3 bytes (like Finder). df -k reports 1024-byte blocks, so
bytes = KB * 1024, gb = bytes / 1e9.

Cache: ~/.cache/ccb-disk-usage.json, reused if younger than 10 minutes
unless --force is given.
"""
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

CACHE = os.path.expanduser("~/.cache/ccb-disk-usage.json")
CACHE_TTL = 600
TIMEOUT = 100
TOP_N = 8


def gb(kb):
    return round(kb * 1024 / 1e9, 1)


def run(cmd):
    """Return (stdout, error_or_None). stderr is discarded."""
    try:
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                           timeout=TIMEOUT, text=True, errors="replace")
        return p.stdout, None
    except subprocess.TimeoutExpired as e:
        out = e.stdout if isinstance(e.stdout, str) else ""
        return out, "timeout after %ds: %s" % (TIMEOUT, " ".join(cmd))
    except Exception as e:  # noqa: BLE001
        return "", "failed %s: %s" % (" ".join(cmd), e)


def parse_du(out):
    rows = []
    for line in out.splitlines():
        parts = line.split("\t", 1)
        if len(parts) == 2 and parts[0].isdigit():
            rows.append((int(parts[0]), parts[1]))
    return rows


def compute():
    errors = []
    home = os.path.expanduser("~")

    with ThreadPoolExecutor(max_workers=4) as ex:
        f_home = ex.submit(run, ["du", "-xk", "-d1", home])
        f_apps = ex.submit(run, ["du", "-sk", "/Applications"]) if os.path.isdir("/Applications") else None
        f_brew = ex.submit(run, ["du", "-sk", "/opt/homebrew"]) if os.path.isdir("/opt/homebrew") else None
        f_snap = ex.submit(run, ["tmutil", "listlocalsnapshots", "/"])

        out, err = run(["df", "-k", "/System/Volumes/Data"])
        total = used = free = 0.0
        try:
            cols = out.strip().splitlines()[-1].split()
            total, used, free = gb(int(cols[1])), gb(int(cols[2])), gb(int(cols[3]))
        except Exception as e:  # noqa: BLE001
            errors.append(err or "df parse failed: %s" % e)

        items = []
        out, err = f_home.result()
        if err:
            errors.append(err)
        rows = [(k, p) for k, p in parse_du(out) if os.path.normpath(p) != home]
        rows.sort(reverse=True)
        for k, p in rows[:TOP_N]:
            items.append({"name": "~/" + os.path.basename(p), "gb": gb(k), "group": "Home folder"})
        rest = sum(k for k, _ in rows[TOP_N:])
        if rows[TOP_N:]:
            items.append({"name": "~ other", "gb": gb(rest), "group": "Home folder"})

        for fut, name in ((f_apps, "/Applications"), (f_brew, "/opt/homebrew")):
            if fut is None:
                continue
            out, err = fut.result()
            if err:
                errors.append(err)
            r = parse_du(out)
            if r:
                items.append({"name": name, "gb": gb(r[-1][0]), "group": "System / Apps"})

        out, err = f_snap.result()
        snapshots = [l.strip() for l in out.splitlines() if l.strip().startswith("com.apple")]

    items.sort(key=lambda i: i["gb"], reverse=True)
    unclassified = max(0.0, round(used - sum(i["gb"] for i in items), 1))
    return {
        "total": total, "used": used, "free": free, "unit": "GB",
        "updated": time.strftime("%H:%M"),
        "items": items,
        "unclassified": {"gb": unclassified, "note": "System, snapshots and other items with no known source"},
        "snapshots": snapshots,
        "errors": errors,
    }


def main():
    force = "--force" in sys.argv[1:]
    if not force:
        try:
            if time.time() - os.path.getmtime(CACHE) < CACHE_TTL:
                with open(CACHE) as f:
                    data = f.read()
                json.loads(data)
                sys.stdout.write(data)
                return
        except Exception:  # noqa: BLE001
            pass
    result = compute()
    text = json.dumps(result, ensure_ascii=False)
    try:
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        tmp = CACHE + ".tmp"
        with open(tmp, "w") as f:
            f.write(text)
        os.replace(tmp, CACHE)
    except Exception:  # noqa: BLE001
        pass
    sys.stdout.write(text)


if __name__ == "__main__":
    main()
