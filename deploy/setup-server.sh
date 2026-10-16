#!/usr/bin/env bash
# One-time server preparation. Run ONCE as root on a fresh Ubuntu VPS:
#   bash setup-server.sh
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "== System updates =="
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git build-essential python3 ufw unattended-upgrades \
  debian-keyring debian-archive-keyring apt-transport-https

echo "== Swap (small box: keeps installs/builds from running out of memory) =="
if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== Node.js (Ubuntu's own LTS package — patched by security updates) =="
apt-get install -y nodejs npm
node --version

echo "== Caddy (HTTPS reverse proxy, official repo for the current version) =="
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy

echo "== Automatic security updates =="
systemctl enable --now unattended-upgrades || true

echo "== App user =="
id slam &>/dev/null || adduser --disabled-password --gecos "" slam
mkdir -p /home/slam/app /home/slam/backups
chown -R slam:slam /home/slam/app /home/slam/backups
# Let the deploy key log in as the app user too
mkdir -p /home/slam/.ssh
cp /root/.ssh/authorized_keys /home/slam/.ssh/authorized_keys
chown -R slam:slam /home/slam/.ssh && chmod 700 /home/slam/.ssh && chmod 600 /home/slam/.ssh/authorized_keys
# Allow the slam user to restart its own service without a password
echo 'slam ALL=(root) NOPASSWD: /usr/bin/systemctl restart slam, /usr/bin/systemctl status slam' > /etc/sudoers.d/slam-restart
chmod 440 /etc/sudoers.d/slam-restart

echo "== Firewall: SSH + web only =="
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo
echo "SERVER READY"
