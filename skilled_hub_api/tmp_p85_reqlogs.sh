#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api

echo "===== webhook request 4a4ac07d ====="
railway logs --environment production --service TechFlash --lines 80 --filter '4a4ac07d-33f6-4b52-88f5-84f93edd0d44'

echo
echo "===== disk 36486333 ====="
railway logs --environment production --service TechFlash --lines 40 --filter '36486333-f64c-4948-8030-49d34eb4ccf4'

echo
echo "===== purge 15755c04 ====="
railway logs --environment production --service TechFlash --lines 80 --filter '15755c04-c206-4b81-b196-4fca44e44691'

echo
echo "===== earlier photo 15:39 ====="
railway logs --environment production --service TechFlash --lines 40 --filter '15:39:57'
