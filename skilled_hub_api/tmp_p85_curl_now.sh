#!/bin/bash
set -eo pipefail
source "$HOME/.railway/env"
unset RAILWAY_TOKEN
URL='https://skilledhub-production.up.railway.app/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsiZGF0YSI6NDMsInB1ciI6ImJsb2JfaWQifX0=--d0c056067fbff57b6d76cf6ce61464b5e9460fa0/MEeb6ee692b322c632e3d2427fb8fc37aa.jpg'
echo "===== curl blob 43 redirect (no follow) ====="
curl -sS -o /tmp/p85_first.bin -D /tmp/p85_first_headers.txt --max-redirs 0 -A "Mozilla/5.0" "$URL" || true
sed 's/\r$//' /tmp/p85_first_headers.txt
echo "first body bytes=$(wc -c < /tmp/p85_first.bin)"
echo
echo "===== curl follow ====="
curl -sS -o /tmp/p85_avatar.bin -D /tmp/p85_headers.txt -L --max-redirs 5 -A "Mozilla/5.0" "$URL" || true
sed 's/\r$//' /tmp/p85_headers.txt
echo "final body bytes=$(wc -c < /tmp/p85_avatar.bin)"
file /tmp/p85_avatar.bin || true
