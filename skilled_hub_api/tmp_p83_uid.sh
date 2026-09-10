#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api

echo "===== RAILWAY_RUN_UID / USER / HOME / UID-related ====="
railway variables --environment production --service TechFlash --json > /tmp/tf_vars.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/tf_vars.json"))
keys=["RAILWAY_RUN_UID","RAILWAY_RUN_AS_ROOT","USER","HOME","UID","RAILWAY_VOLUME_MOUNT_PATH","RAILWAY_VOLUME_NAME","RAILWAY_VOLUME_ID","ACTIVE_STORAGE_ROOT","APP_HOST","WEB_CONCURRENCY","RAILS_ENV","RAILS_LOG_LEVEL","PORT"]
for k in keys:
    print(f"{k}={'<UNSET>' if k not in d else d[k]}")
print("--- all RAILWAY_* (non-secret) ---")
for k in sorted(d):
    if k.startswith("RAILWAY_") and not any(x in k.upper() for x in ("TOKEN","SECRET","PASSWORD","KEY")):
        print(f"{k}={d[k]}")
PY

echo
echo "===== webhook request Disk Storage lines ====="
railway logs --environment production --service TechFlash --lines 30 --filter 'Uploaded file'
echo "-----"
railway logs --environment production --service TechFlash --lines 20 --filter '3650111f-684c-4b99-9f5c-454b5b0c0c57'
