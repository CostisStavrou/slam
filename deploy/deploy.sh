#!/usr/bin/env bash
# Deploy (or re-deploy) the app from this Mac to the VPS:
#   bash deploy/deploy.sh <server-ip>
# Uses the slam_deploy SSH key. Database and backups on the server are never touched.
set -euo pipefail

IP=${1:?usage: bash deploy/deploy.sh <server-ip>}
KEY=~/.ssh/slam_deploy
DEST="slam@$IP:/home/slam/app/"
SRC="$(cd "$(dirname "$0")/.." && pwd)/"

echo "== Sync code to $IP =="
rsync -az --delete \
  -e "ssh -i $KEY" \
  --exclude node_modules --exclude .next --exclude '.next.nosync' --exclude 'node_modules.nosync' \
  --exclude 'beachbar.sqlite*' --exclude backups --exclude .git \
  "$SRC" "$DEST"

echo "== Install, build, restart =="
ssh -i "$KEY" "slam@$IP" 'cd /home/slam/app && npm ci && npm run build && sudo systemctl restart slam && sleep 2 && curl -sf -o /dev/null http://localhost:3000/api/menu && echo "DEPLOYED — app is answering"'
