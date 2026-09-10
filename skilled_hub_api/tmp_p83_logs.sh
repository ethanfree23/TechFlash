#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api

echo "===== railway logs help ====="
railway logs --help | head -50

echo
echo "===== recent TechFlash logs (filter storage/ENOENT/avatar) ====="
railway logs --environment production --service TechFlash --lines 200 2>/dev/null | tail -n 200
