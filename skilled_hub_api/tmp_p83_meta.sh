#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api

echo "===== status json size ====="
railway status --environment production --json | head -c 200
echo
railway status --environment production --json > /tmp/prod_status.json
wc -c /tmp/prod_status.json
python3 - <<'PY'
import json
raw=open("/tmp/prod_status.json").read()
print("first200", raw[:200])
d=json.loads(raw)
for e in d.get("environments",{}).get("edges",[]):
    node=e.get("node",{})
    if node.get("name")!="production":
        continue
    for si in node.get("serviceInstances",{}).get("edges",[]):
        n=si.get("node",{})
        if n.get("serviceName")!="TechFlash":
            continue
        ld=n.get("latestDeployment") or {}
        meta=ld.get("meta") or {}
        print("META_KEYS", sorted(meta.keys()))
        sm=meta.get("serviceManifest") or {}
        print("SM_KEYS", sorted(sm.keys()) if isinstance(sm, dict) else sm)
        print(json.dumps({"build": sm.get("build") if isinstance(sm, dict) else None,
                          "deploy": sm.get("deploy") if isinstance(sm, dict) else None,
                          "volumeMounts": meta.get("volumeMounts"),
                          "imageDigest": meta.get("imageDigest") or meta.get("image"),
                          "nixpacks": meta.get("nixpacks"),
                          "builder": meta.get("builder"),
                          "dockerfile": meta.get("dockerfilePath") or meta.get("dockerfile"),
                          "rootDirectory": meta.get("rootDirectory"),
                          "startCmd": meta.get("startCommand") or meta.get("startCmd"),
                          }, indent=2, default=str)[:8000])
        # dump remaining interesting meta fields
        for k,v in meta.items():
            if k in ("serviceManifest","logs","buildLogs"):
                continue
            s=json.dumps(v, default=str)
            if len(s)>500:
                s=s[:500]+"..."
            print(f"META[{k}]={s}")
PY
