#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  ca-certificates curl docker.io docker-compose-v2 git unattended-upgrades ufw
systemctl enable --now docker

if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
cat > /etc/sysctl.d/60-taste-memory.conf <<'EOF'
vm.swappiness=10
vm.vfs_cache_pressure=50
EOF
sysctl --system >/dev/null

install -d -o tasteops -g tasteops -m 0750 /opt/taste
usermod -aG docker tasteops

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

if [ -f /opt/taste/deploy/taste-update.service ] && [ -f /opt/taste/deploy/taste-watchdog.service ]; then
  install -m 0644 /opt/taste/deploy/taste-update.service /etc/systemd/system/taste-update.service
  install -m 0644 /opt/taste/deploy/taste-update.timer /etc/systemd/system/taste-update.timer
  install -m 0644 /opt/taste/deploy/taste-watchdog.service /etc/systemd/system/taste-watchdog.service
  install -m 0644 /opt/taste/deploy/taste-watchdog.timer /etc/systemd/system/taste-watchdog.timer
  systemctl daemon-reload
  systemctl enable --now taste-update.timer taste-watchdog.timer
else
  echo "Application files are not present yet; systemd timers will be installed after the repository is cloned."
fi
