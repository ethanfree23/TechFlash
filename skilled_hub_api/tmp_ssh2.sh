#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api
echo "===== ssh with deployment instance ====="
railway ssh -e production -s TechFlash -d 9cd4fa72-6e39-4bb6-a606-c5c80dc6fe2b -- echo SSH_OK || echo SSH_FAIL
echo "===== ssh help identity ====="
railway ssh --help | head -40
