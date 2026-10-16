# Deploying Slam to the VPS — runbook

Prereqs: a Hetzner/DO server (Ubuntu 24.04) created with the `slam_deploy` public key, and the domain.

## 1. One-time server setup (~5 min)
```bash
scp -i ~/.ssh/slam_deploy deploy/setup-server.sh root@SERVER_IP:/root/
ssh -i ~/.ssh/slam_deploy root@SERVER_IP 'bash setup-server.sh'
```

## 2. First deploy (~3 min)
```bash
bash deploy/deploy.sh SERVER_IP
```

## 3. Services (one time)
```bash
ssh -i ~/.ssh/slam_deploy root@SERVER_IP
cp /home/slam/app/deploy/slam.service /home/slam/app/deploy/slam-backup.* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now slam slam-backup.timer
```

## 4. Domain + HTTPS (one time)
At the domain registrar, add a DNS record: type **A**, name **@**, value **SERVER_IP**
(optional: type **A**, name **www**, value **SERVER_IP**).

On the server: edit `/home/slam/app/deploy/Caddyfile`, replace `YOUR_DOMAIN` with the real
domain, then:
```bash
cp /home/slam/app/deploy/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
```
HTTPS certificates are automatic. The site is live at `https://YOUR_DOMAIN` a minute later.

## Day-to-day
- **Ship a code change:** `bash deploy/deploy.sh SERVER_IP`
- **Logs:** `ssh -i ~/.ssh/slam_deploy slam@SERVER_IP 'journalctl -u slam -n 100 --no-pager'`
- **Backups:** nightly at 04:30 into `/home/slam/app/backups/` (30 kept). Copy one off-server sometimes.
- **Opening-day data wipe:** `ssh ... 'cd /home/slam/app && node server/reset-season.js --yes'`
