#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api

echo "===== app logs webhook 15:49 ====="
railway logs --environment production --service TechFlash --lines 80 --filter '15:49:37' > /tmp/p85_wh.txt || true
# request ids from http timeframe
railway logs --environment production --service TechFlash --lines 120 --filter 'profile_photo' > /tmp/p85_photo.txt || true
echo "--- filter profile_photo ---"
tail -n 60 /tmp/p85_photo.txt

echo
echo "===== DiskController around 15:49 ====="
railway logs --environment production --service TechFlash --lines 40 --filter 'DiskController'

echo
echo "===== blob 43 / yvh1 ====="
railway logs --environment production --service TechFlash --lines 20 --filter 'yvh1g5a5fnh8j5o6tcjp4gf86hjh'
