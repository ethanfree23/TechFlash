#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api

echo "===== railway ssh help (first lines) ====="
railway ssh --help | head -40 || true

echo
echo "===== SSH into running TechFlash ====="
set +e
railway ssh -e production -s TechFlash -- whoami
echo "ssh_exit=$?"
set -e

echo
echo "===== SSH with service id ====="
set +e
railway ssh -e production -s b9250581-b3a3-4db9-a430-36652f4a04df -- id
echo "ssh_id_exit=$?"
set -e
