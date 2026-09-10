#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api

echo "===== HTTP logs ====="
railway logs --environment production --service TechFlash --http -n 40 --json > /tmp/http_logs.json
python3 - <<'PY'
import json
raw=open("/tmp/http_logs.json").read().strip()
print("bytes", len(raw), "lines", raw.count("\n")+1 if raw else 0)
for line in raw.splitlines()[-40:]:
    try:
        o=json.loads(line)
    except Exception:
        print(line[:250])
        continue
    interesting={k:o.get(k) for k in ("timestamp","method","path","httpStatus","status") if k in o}
    path=str(o.get("path") or "")
    if any(x in path for x in ("active_storage","ghl","webhook","technicians/profile")) or True:
        if any(x in path for x in ("active_storage","ghl","webhook","technicians/profile","Disk")) or o.get("httpStatus") in (202,302,404):
            print(interesting)
PY
