#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api
railway logs --environment production --service TechFlash --http -n 80 --json > /tmp/http_logs2.json
python3 - <<'PY'
import json
raw=open("/tmp/http_logs2.json").read().strip()
for line in raw.splitlines():
    try:
        o=json.loads(line)
    except Exception:
        continue
    ts=o.get("timestamp","")
    path=str(o.get("path") or "")
    method=o.get("method")
    status=o.get("httpStatus")
    if any(x in path for x in ("active_storage","ghl","webhook","admin/users","technicians")) or method in ("DELETE","POST","PATCH"):
        print(f"{ts} {method} {status} {path[:180]}")
PY
