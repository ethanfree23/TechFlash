#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api
railway variables --environment production --service Postgres --json > /tmp/pg_vars.json
DATABASE_PUBLIC_URL=$(python3 -c 'import json; print(json.load(open("/tmp/pg_vars.json"))["DATABASE_PUBLIC_URL"])')
rm -f /tmp/pg_vars.json
export DATABASE_PUBLIC_URL PGSSLMODE=require
psql "$DATABASE_PUBLIC_URL" -v ON_ERROR_STOP=1 -f tmp_p85_find.sql
