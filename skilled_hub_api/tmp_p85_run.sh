#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api

echo "===== production status / volumes / replicas ====="
railway status --environment production --json > /tmp/prod_status.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/prod_status.json"))
for e in d.get("environments",{}).get("edges",[]):
    node=e.get("node",{})
    if node.get("name")!="production":
        continue
    print("ENV", node.get("name"))
    for si in node.get("serviceInstances",{}).get("edges",[]):
        n=si.get("node",{})
        print("SERVICE", n.get("serviceName"), n.get("id"))
        ld=n.get("latestDeployment") or {}
        meta=ld.get("meta") or {}
        print("  deploy", ld.get("id"), ld.get("status"), ld.get("createdAt"))
        print("  instances", ld.get("instances"))
        print("  volumeMounts", meta.get("volumeMounts"))
        sm=(meta.get("serviceManifest") or {}).get("deploy") or {}
        print("  numReplicas", sm.get("numReplicas"))
        print("  startCommand", sm.get("startCommand"))
        print("  runtime", sm.get("runtime"))
        print("  builder", (meta.get("serviceManifest") or {}).get("build", {}).get("builder") if isinstance(meta.get("serviceManifest"), dict) else None)
PY

echo
echo "===== volumes ====="
railway volume -e production -p 61331edf-db81-4e9b-9f6e-67ee3cb67549 list --json

echo
echo "===== TechFlash storage/UID env ====="
railway variables --environment production --service TechFlash --json > /tmp/tf_vars.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/tf_vars.json"))
keys=["RAILWAY_RUN_UID","RAILWAY_RUN_AS_ROOT","ACTIVE_STORAGE_ROOT","RAILWAY_VOLUME_MOUNT_PATH","RAILWAY_VOLUME_NAME","RAILWAY_VOLUME_ID","RAILS_ENV","WEB_CONCURRENCY","USER","HOME","APP_HOST"]
for k in keys:
    print(f"{k}={'<UNSET>' if k not in d else d[k]}")
print("RAILWAY_RUN_UID present?", "RAILWAY_RUN_UID" in d)
PY

echo
echo "===== SQL profile 85 ====="
railway variables --environment production --service Postgres --json > /tmp/pg_vars.json
DATABASE_PUBLIC_URL=$(python3 -c 'import json; print(json.load(open("/tmp/pg_vars.json"))["DATABASE_PUBLIC_URL"])')
rm -f /tmp/pg_vars.json
export DATABASE_PUBLIC_URL PGSSLMODE=require
psql "$DATABASE_PUBLIC_URL" -v ON_ERROR_STOP=1 -f tmp_p85_audit.sql
