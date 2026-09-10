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
        print("  requiredMountPath", sm.get("requiredMountPath"))
        print("  multiRegion", sm.get("multiRegionConfig"))
    for vi in node.get("volumeInstances",{}).get("edges",[]):
        n=vi.get("node",{})
        vol=n.get("volume") or {}
        print("VOLUME", vol.get("name"), "mountPath=", n.get("mountPath"), "serviceId=", n.get("serviceId"), "state=", n.get("state"), "sizeMB=", n.get("sizeMB"), "currentSizeMB=", n.get("currentSizeMB"))
PY

echo
echo "===== TechFlash storage-related env (no secrets) ====="
railway variables --environment production --service TechFlash --json > /tmp/tf_vars.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/tf_vars.json"))
for k in sorted(d):
    if any(x in k.upper() for x in ("STORAGE","APP_HOST","DOMAIN","RAILS_ENV","VOLUME","PWD")):
        if any(x in k.upper() for x in ("SECRET","PASSWORD","KEY","TOKEN","DATABASE")):
            print(f"{k}: present")
        else:
            print(f"{k}: {d[k]}")
print("ACTIVE_STORAGE_ROOT set?", "ACTIVE_STORAGE_ROOT" in d, "value=", d.get("ACTIVE_STORAGE_ROOT"))
print("APP_HOST set?", "APP_HOST" in d, "value=", d.get("APP_HOST"))
PY

echo
echo "===== SQL profile 83 ====="
railway variables --environment production --service Postgres --json > /tmp/pg_vars.json
export DATABASE_PUBLIC_URL
DATABASE_PUBLIC_URL=$(python3 -c 'import json; print(json.load(open("/tmp/pg_vars.json"))["DATABASE_PUBLIC_URL"])')
rm -f /tmp/pg_vars.json
export PGSSLMODE=require
psql "$DATABASE_PUBLIC_URL" -v ON_ERROR_STOP=1 -f tmp_p83_audit.sql
