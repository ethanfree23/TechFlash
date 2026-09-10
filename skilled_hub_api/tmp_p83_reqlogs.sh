#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api

echo "===== logs around blob 41 attach 00:36:33 ====="
railway logs --environment production --service TechFlash --lines 400 --since 2026-09-10T00:36:30Z --until 2026-09-10T00:36:55Z > /tmp/tf_around.txt || railway logs --environment production --service TechFlash --lines 50 --filter '3650111f-684c-4b99-9f5c-454b5b0c0c57' > /tmp/tf_around.txt
echo "lines $(wc -l < /tmp/tf_around.txt)"
cat /tmp/tf_around.txt

echo
echo "===== request 8f2bfb29 disk show ====="
railway logs --environment production --service TechFlash --lines 40 --filter '8f2bfb29-e386-44c1-abc0-83f2c1a3a757'

echo
echo "===== request 9e85b639 disk show ====="
railway logs --environment production --service TechFlash --lines 40 --filter '9e85b639-bc37-47fe-b96f-f7926be1f79e'
