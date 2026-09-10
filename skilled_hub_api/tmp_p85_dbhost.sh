#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api

echo "===== compare DB hosts (no secrets) ====="
railway variables --environment production --service TechFlash --json > /tmp/tf_vars.json
railway variables --environment production --service Postgres --json > /tmp/pg_vars.json
python3 - <<'PY'
import json
from urllib.parse import urlparse
tf=json.load(open("/tmp/tf_vars.json"))
pg=json.load(open("/tmp/pg_vars.json"))

def host_of(url):
    if not url:
        return None
    u=urlparse(url)
    return {"scheme": u.scheme, "host": u.hostname, "port": u.port, "db": (u.path or "").lstrip("/"), "user": u.username}

for name, src in [("TechFlash DATABASE_URL", tf.get("DATABASE_URL")),
                  ("TechFlash DATABASE_PRIVATE_URL", tf.get("DATABASE_PRIVATE_URL")),
                  ("Postgres DATABASE_URL", pg.get("DATABASE_URL")),
                  ("Postgres DATABASE_PUBLIC_URL", pg.get("DATABASE_PUBLIC_URL")),
                  ("Postgres DATABASE_PRIVATE_URL", pg.get("DATABASE_PRIVATE_URL"))]:
    print(name, host_of(src))

print("TechFlash DATABASE_URL == Postgres DATABASE_URL", tf.get("DATABASE_URL")==pg.get("DATABASE_URL") if tf.get("DATABASE_URL") and pg.get("DATABASE_URL") else "n/a")
print("TechFlash DATABASE_URL host == Postgres PUBLIC host",
      host_of(tf.get("DATABASE_URL")) and host_of(pg.get("DATABASE_PUBLIC_URL")) and
      host_of(tf.get("DATABASE_URL"))["host"]==host_of(pg.get("DATABASE_PUBLIC_URL"))["host"] and
      host_of(tf.get("DATABASE_URL"))["db"]==host_of(pg.get("DATABASE_PUBLIC_URL"))["db"])
PY

echo
echo "===== webhook event 35 payload excerpt ====="
export DATABASE_PUBLIC_URL
DATABASE_PUBLIC_URL=$(python3 -c 'import json; print(json.load(open("/tmp/pg_vars.json"))["DATABASE_PUBLIC_URL"])')
export PGSSLMODE=require
psql "$DATABASE_PUBLIC_URL" -v ON_ERROR_STOP=1 <<'SQL'
\pset pager off
SELECT id, event_type, user_id, processed_at,
       payload->>'event' AS event,
       payload->>'email' AS email,
       payload->>'phone' AS phone,
       payload->>'ghl_contact_id' AS contact
FROM ghl_webhook_events WHERE id IN (31,35);

\echo ===== event 35 payload keys =====
SELECT jsonb_object_keys(payload::jsonb) FROM ghl_webhook_events WHERE id = 35;

\echo ===== users matching latest ghl contact =====
SELECT id, email, role, first_name, last_name, phone, ghl_contact_id, created_at
FROM users
WHERE ghl_contact_id IN ('lig7qGIXH1yV6cPpNTEk','ayJpuFFnMUMQsRrmBEnm')
   OR email ILIKE '%huboem%'
ORDER BY id DESC;
SQL
