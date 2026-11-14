#!/usr/bin/env python3
"""Read-only: print `git show` for one commit, safe for the component's 1MB output limit.
Usage: git-show-detail.py <hash>
Merges are shown against the first parent (like the file list); lines are cut at 1000 chars;
total output is capped at 900KB."""
import re, subprocess, sys

LINE, TOTAL = 1000, 900_000
h = sys.argv[1] if len(sys.argv) > 1 else "HEAD"
if not re.fullmatch(r"[0-9A-Za-z._/-]{1,200}", h) or h.startswith("-"):
    sys.exit("bad hash")
p = subprocess.Popen(["git", "show", "-m", "--first-parent", "--patch", "--stat", h, "--"],
                     stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
out, size, trunc = [], 0, False
for raw in p.stdout:
    line = raw.decode("utf-8", "replace").rstrip("\n")
    if len(line) > LINE:
        line = line[:LINE] + " …"
    size += len(line) + 1
    if size > TOTAL:
        trunc = True
        p.kill()
        break
    out.append(line)
sys.stdout.write("\n".join(out) + "\n")
if trunc:
    sys.stdout.write("\n… (diff truncated)\n")
