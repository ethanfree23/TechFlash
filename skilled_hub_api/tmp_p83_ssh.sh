#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
cd /mnt/c/Users/ethan/Desktop/TechFlash/tech_flash/skilled_hub_api

echo "===== SSH inspect running TechFlash container ====="
railway ssh -e production -s TechFlash -- bash -lc '
echo WHOAMI=$(whoami) UID=$(id -u) GID=$(id -g)
echo PWD=$PWD
echo RAILS_ENV=$RAILS_ENV
echo ACTIVE_STORAGE_ROOT=${ACTIVE_STORAGE_ROOT-<unset>}
echo RAILWAY_VOLUME_MOUNT_PATH=$RAILWAY_VOLUME_MOUNT_PATH
echo RAILWAY_VOLUME_NAME=$RAILWAY_VOLUME_NAME
echo
echo "===== mounts matching storage/rails ====="
mount | grep -E "storage|/rails" || true
echo
echo "===== /proc/mounts storage ====="
awk "/storage|\/rails/ {print}" /proc/mounts || true
echo
echo "===== ls -ld /rails /rails/storage ====="
ls -ld /rails /rails/storage || true
echo
echo "===== ls /rails/storage (top) ====="
ls -la /rails/storage | head -40
echo
echo "===== expected blob path ====="
ls -la /rails/storage/vq/we/vqwee9kmoeytxk15yb0z4tukp3v2 || echo MISSING_EXPECTED_PATH
echo
echo "===== find blob key ====="
find /rails/storage /tmp /rails -name "vqwee9kmoeytxk15yb0z4tukp3v2" 2>/dev/null | head
echo
echo "===== df ====="
df -h /rails/storage /rails 2>/dev/null || true
echo
echo "===== rails runtime storage root ====="
cd /rails && bundle exec rails runner "puts({rails_root: Rails.root.to_s, service: ActiveStorage::Blob.service.class.name, root: (ActiveStorage::Blob.service.respond_to?(:root) ? ActiveStorage::Blob.service.root.to_s : nil), env: ENV[\"ACTIVE_STORAGE_ROOT\"], config_service: Rails.application.config.active_storage.service.to_s, path_for: (TechnicianProfile.find(83).avatar.attached? ? ActiveStorage::Blob.service.path_for(TechnicianProfile.find(83).avatar.blob.key) : nil), exists: (TechnicianProfile.find(83).avatar.attached? ? File.exist?(ActiveStorage::Blob.service.path_for(TechnicianProfile.find(83).avatar.blob.key)) : nil)}.inspect)"
'
