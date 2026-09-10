#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api

echo "===== app logs filter Disk/ENOENT/storage ====="
railway logs --environment production --service TechFlash --lines 200 --filter 'DiskController' > /tmp/tf_disk.txt || true
echo "--- DiskController lines ---"
wc -l /tmp/tf_disk.txt
tail -n 30 /tmp/tf_disk.txt

echo
railway logs --environment production --service TechFlash --lines 200 --filter 'No such file' > /tmp/tf_enoent.txt || true
echo "--- No such file lines ---"
wc -l /tmp/tf_enoent.txt
tail -n 20 /tmp/tf_enoent.txt

echo
railway logs --environment production --service TechFlash --lines 100 --filter 'ActiveStorage' > /tmp/tf_as.txt || true
echo "--- ActiveStorage lines ---"
wc -l /tmp/tf_as.txt
tail -n 20 /tmp/tf_as.txt
