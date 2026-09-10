#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api

echo "===== boot/deploy logs UID ====="
railway logs --environment production --service TechFlash --lines 80 --filter 'Booting' > /tmp/p85_boot.txt || true
head -40 /tmp/p85_boot.txt
echo "----- uid/root -----"
railway logs --environment production --service TechFlash --lines 40 --filter 'uid' || true
echo "----- Puma -----"
railway logs --environment production --service TechFlash --lines 30 --filter 'Puma starting' || true
echo "----- Starting Container -----"
railway logs --environment production --service TechFlash --lines 20 --filter 'Starting Container' || true
