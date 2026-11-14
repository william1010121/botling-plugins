#!/bin/zsh
# Runs the user's script named in script-image.conf (next to this file) and prints card JSON.
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.cargo/bin"
D="${0:A:h}"
exec python3 -I - "$D" <<'PY'
import json, os, re, shutil, signal, subprocess, sys, time
D = sys.argv[1]
def out(o):
    print(json.dumps(o, ensure_ascii=False)); sys.exit(0)
def err(m, title=""):
    o = {"error": m}
    if title: o["title"] = title
    out(o)
def redact(s):
    return re.sub(r'(?i)((?:pass(?:word|wd)?|token|secret|api[_-]?key|authorization|bearer)\S*\s*[=:]\s*)\S+', r'\1***', s)
conf = os.path.join(D, "script-image.conf")
if not os.path.isfile(conf):
    err("script-image.conf not found next to run.sh. Copy script-image.conf.example to script-image.conf and set script=/abs/path.")
cfg = {}
for line in open(conf, encoding="utf-8", errors="replace"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line: continue
    k, v = line.split("=", 1); cfg[k.strip().lower()] = v.strip()
title = cfg.get("title", "")
script = cfg.get("script", "")
if not script: err("script-image.conf has no script= line.", title)
if not os.path.isabs(script): err("script= must be an absolute path.", title)
if not os.path.isfile(script): err("Script not found: " + script, title)
try: tmo = max(1, min(int(cfg.get("timeout", "120")), 3600))
except ValueError: err("timeout= must be a number of seconds.", title)
wd = cfg.get("workdir") or None
if wd and not os.path.isdir(wd): err("workdir not found: " + wd, title)
try:
    p = subprocess.Popen([script], cwd=wd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True, errors="replace", start_new_session=True)
except OSError as e:
    err("Cannot run script (%s). Make it executable (chmod +x) or give it a shebang." % e.strerror, title)
try:
    so, se = p.communicate(timeout=tmo)
except subprocess.TimeoutExpired:
    try: os.killpg(p.pid, signal.SIGKILL)
    except Exception: pass
    p.communicate()
    err("Script timed out after %ds." % tmo, title)
tail = redact("\n".join(se.strip().splitlines()[-5:]))[-600:]
if p.returncode != 0:
    err("Script exited with code %d.%s" % (p.returncode, ("\n" + tail) if tail else ""), title)
lines = [l.strip() for l in so.splitlines() if l.strip()]
if not lines: err("Script printed nothing; last stdout line must be an image path or JSON." + (("\n" + tail) if tail else ""), title)
last, img = lines[-1], ""
if last.startswith("{"):
    try:
        j = json.loads(last); img = str(j.get("image", "")); title = str(j.get("title") or title)
    except ValueError: err("Last stdout line looks like JSON but is invalid.", title)
else: img = last
if img.startswith("file://"): img = img[7:]
if not os.path.isabs(img) or not re.search(r'\.(png|jpe?g|webp)$', img, re.I) or not os.path.isfile(img):
    err("Last stdout line is not an existing absolute image path (.png/.jpg/.webp): " + redact(img)[:200], title)
cd = os.path.join(D, "cache"); os.makedirs(cd, exist_ok=True)
ext = os.path.splitext(img)[1].lower()
dst = os.path.join(cd, "img_%d%s" % (time.time_ns() // 1000000, ext))
shutil.copyfile(img, dst)
fs = sorted((f for f in os.listdir(cd) if f.startswith("img_")), reverse=True)
for f in fs[3:]:
    try: os.remove(os.path.join(cd, f))
    except OSError: pass
out({"title": title, "image": dst})
PY
