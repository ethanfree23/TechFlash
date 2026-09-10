#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
source /usr/share/rvm/scripts/rvm
rvm use 3.0.2 >/dev/null
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api

railway variables --environment production --service Postgres --json > /tmp/pg_vars.json
railway variables --environment production --service TechFlash --json > /tmp/tf_vars.json
eval "$(python3 - <<'PY'
import json, shlex
pg=json.load(open("/tmp/pg_vars.json"))
tf=json.load(open("/tmp/tf_vars.json"))
print("export DATABASE_URL="+shlex.quote(pg["DATABASE_PUBLIC_URL"]))
print("export RAILS_MASTER_KEY="+shlex.quote(tf["RAILS_MASTER_KEY"]))
print("export RAILS_ENV=production")
print("export APP_HOST="+shlex.quote(tf.get("RAILWAY_PUBLIC_DOMAIN") or "skilledhub-production.up.railway.app"))
PY
)"
rm -f /tmp/pg_vars.json /tmp/tf_vars.json
bundle exec rails runner tmp_p85_url.rb > /tmp/p85_url.txt
cat /tmp/p85_url.txt
URL=$(python3 -c 'import re; t=open("/tmp/p85_url.txt").read(); m=re.search(r"^avatar_url=(.*)$", t, re.M); print(m.group(1) if m else "")')
echo
echo "===== curl avatar_url (no follow) ====="
echo "URL=$URL"
curl -sS -o /tmp/p85_first.bin -D /tmp/p85_first_headers.txt --max-redirs 0 -A "Mozilla/5.0" "$URL" || true
sed 's/\r$//' /tmp/p85_first_headers.txt
echo "first body bytes: $(wc -c < /tmp/p85_first.bin)"
echo
echo "===== curl avatar_url (follow) ====="
curl -sS -o /tmp/p85_avatar.bin -D /tmp/p85_headers.txt -L --max-redirs 5 -A "Mozilla/5.0" "$URL" || true
sed 's/\r$//' /tmp/p85_headers.txt
echo "--- body bytes ---"
wc -c /tmp/p85_avatar.bin
file /tmp/p85_avatar.bin || true
head -c 16 /tmp/p85_avatar.bin | xxd
