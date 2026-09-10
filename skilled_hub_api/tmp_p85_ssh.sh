#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api

echo "===== ssh keys ====="
railway ssh keys --help 2>&1 | head -40 || true
railway ssh keys list 2>&1 | cat || true

echo
echo "===== SSH id/uid/mounts/storage ====="
set +e
railway ssh -e production -s TechFlash -- bash -lc '
echo WHOAMI=$(whoami)
echo ID=$(id)
echo PWD=$PWD
echo RAILWAY_RUN_UID=$RAILWAY_RUN_UID
echo ACTIVE_STORAGE_ROOT=$ACTIVE_STORAGE_ROOT
echo RAILWAY_VOLUME_MOUNT_PATH=$RAILWAY_VOLUME_MOUNT_PATH
echo
echo "===== /proc/1 status uid ====="
awk "/^Uid:|^Gid:|^Name:/" /proc/1/status
echo
echo "===== ps rails ====="
ps aux | head -20
echo
echo "===== mounts ====="
awk "/storage|\/rails/ {print}" /proc/mounts
echo
echo "===== ls -ld /rails /rails/storage ====="
ls -ld /rails /rails/storage
echo
echo "===== ls /rails/storage top ====="
ls -la /rails/storage | head -40
'
echo SSH_EXIT=$?
