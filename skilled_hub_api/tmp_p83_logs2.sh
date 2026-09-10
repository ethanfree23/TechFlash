#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api

echo "===== HTTP logs for active_storage ====="
railway logs --environment production --service TechFlash --http --lines 50 --filter '@path:*active_storage*' --json > /tmp/http_as.json || true
python3 - <<'PY'
import json
p="/tmp/http_as.json"
try:
    raw=open(p).read().strip()
except Exception as e:
    print("no file", e); raise SystemExit
if not raw:
    print("empty http logs")
else:
    for line in raw.splitlines()[-40:]:
        try:
            o=json.loads(line)
        except Exception:
            print(line[:300]); continue
        print({k:o.get(k) for k in ("timestamp","status","path","method","message") if k in o or True})
        # compact
        print({k:o.get(k) for k in o if k.lower() in ("timestamp","time","status","path","method","statuscode","httpstatus") or "status" in k.lower() or "path" in k.lower()})
PY

echo
echo "===== deploy logs mentioning storage/ENOENT ====="
railway logs --environment production --service TechFlash --lines 80 --filter 'active_storage' > /tmp/deploy_as.txt || true
wc -l /tmp/deploy_as.txt
tail -n 40 /tmp/deploy_as.txt
