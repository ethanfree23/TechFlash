#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api
railway logs --environment production --service TechFlash --http -n 30 --json > /tmp/http_logs.json
python3 - <<'PY'
import json
raw=open("/tmp/http_logs.json").read().strip()
print("bytes", len(raw), "lines", raw.count("\n")+1 if raw else 0)
for line in raw.splitlines()[-30:]:
    try:
        o=json.loads(line)
    except Exception:
        print(line[:250])
        continue
    path=o.get("path") or o.get("httpPath") or o.get("url") or ""
    if "active_storage" in str(o).lower() or "ghl" in str(o).lower() or "webhook" in str(o).lower() or True:
        interesting={k:o[k] for k in o if any(x in k.lower() for x in ("path","status","method","time","code","url"))}
        print(interesting or list(o.keys())[:20])
PY
