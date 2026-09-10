#!/bin/bash
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
VOL=e8b4ed1f-8c3f-4ba8-9e53-7cc93b65464c
PROJ=61331edf-db81-4e9b-9f6e-67ee3cb67549
{
  echo "===== / ====="
  railway volume -e production -p "$PROJ" files -v "$VOL" list / --json
  echo EXIT_ROOT=$?
  echo "===== /vq ====="
  railway volume -e production -p "$PROJ" files -v "$VOL" list /vq --json
  echo EXIT_VQ=$?
  echo "===== /vq/we ====="
  railway volume -e production -p "$PROJ" files -v "$VOL" list /vq/we --json
  echo EXIT_WE=$?
  echo "===== /storage ====="
  railway volume -e production -p "$PROJ" files -v "$VOL" list /storage --json
  echo EXIT_ST=$?
} > /tmp/vf_all.out 2>&1
wc -c /tmp/vf_all.out
