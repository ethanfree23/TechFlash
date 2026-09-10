#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api

echo "===== admin user 106 show ====="
railway logs --environment production --service TechFlash --lines 30 --filter 'admin/users/106'

echo
echo "===== blob 42 / user 105 photo 15:39 ====="
railway logs --environment production --service TechFlash --lines 40 --filter 'ActiveStorage::Blob/42'

echo
echo "===== Uploaded file ====="
railway logs --environment production --service TechFlash --lines 20 --filter 'Uploaded file'

echo
echo "===== Disk Storage ====="
railway logs --environment production --service TechFlash --lines 30 --filter 'Disk Storage'
