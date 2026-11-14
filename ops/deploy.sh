#!/usr/bin/env bash
set -Eeuo pipefail
archive=$1
revision=$2
[[ "$revision" =~ ^[a-f0-9]{7,40}$ ]]
release="/var/www/new.ladyzenko.ru-releases/$revision"
backup="/var/backups/new-ladyzenko/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup" "$release" /etc/systemd/system/new.ladyzenko.ru.service.d
chmod 700 "$backup"
cp -a /etc/nginx/sites-available/new.ladyzenko.ru.conf "$backup/nginx.conf"
cp -a /etc/systemd/system/new.ladyzenko.ru.service "$backup/service"
if [[ -e /etc/systemd/system/new.ladyzenko.ru.service.d/commerce.conf ]]; then
  cp -a /etc/systemd/system/new.ladyzenko.ru.service.d/commerce.conf "$backup/commerce.conf"
fi
readlink /var/www/new.ladyzenko.ru-current > "$backup/previous-release" || true
activated=false
rollback() {
  trap - ERR
  cp -a "$backup/nginx.conf" /etc/nginx/sites-available/new.ladyzenko.ru.conf
  if [[ "$activated" == true ]]; then
    previous=$(cat "$backup/previous-release")
    if [[ -n "$previous" ]]; then ln -sfn "$previous" /var/www/new.ladyzenko.ru-current; fi
    if [[ -e "$backup/commerce.conf" ]]; then
      cp -a "$backup/commerce.conf" /etc/systemd/system/new.ladyzenko.ru.service.d/commerce.conf
    else
      rm -f /etc/systemd/system/new.ladyzenko.ru.service.d/commerce.conf
    fi
    systemctl daemon-reload
    systemctl restart new.ladyzenko.ru
  fi
  nginx -t && systemctl reload nginx
  printf 'Deployment failed; previous service configuration restored. Backup: %s\n' "$backup" >&2
  exit 1
}
trap rollback ERR
tar -xzf "$archive" -C "$release"
if [[ -n "${3:-}" ]]; then tar -xzf "$3" -C "$release"; fi
cd "$release"
npm ci --no-audit --no-fund > "$backup/install.log" 2>&1
node --import tsx --test tests/commerce.test.ts > "$backup/tests.log" 2>&1
npm run build > "$backup/build.log" 2>&1
install -d -m 710 -g www-data /var/lib/new-ladyzenko-commerce
install -d -m 750 -g www-data /var/lib/new-ladyzenko-commerce/media
python3 - <<'PY'
import json, os
from pathlib import Path
state=Path('/var/lib/new-ladyzenko-commerce')
config=state/'config.json'
if not config.exists():
    c=json.loads(Path('ops/config.example.json').read_text())
    c.update(contactEmail='ladyzenko@mail.ru')
    c['smtp']['password']=Path('/root/.config/ladyzenko-mail/video-password').read_text().strip()
    config.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
    config.chmod(0o600)
nginx=Path('/etc/nginx/sites-available/new.ladyzenko.ru.conf')
text=nginx.read_text()
if 'location ^~ /commerce-private/' not in text:
    text=text.replace('    location / {', '''    location ^~ /commerce-private/ {
        internal;
        alias /var/lib/new-ladyzenko-commerce/media/;
        add_header Cache-Control "private, no-store" always;
    }

    location / {''',1)
    nginx.write_text(text)
PY
nginx -t
ln -sfn "$release" /var/www/new.ladyzenko.ru-current
activated=true
cat > /etc/systemd/system/new.ladyzenko.ru.service.d/commerce.conf <<'CONF'
[Service]
WorkingDirectory=/var/www/new.ladyzenko.ru-current
Environment=COMMERCE_STATE=/var/lib/new-ladyzenko-commerce
UMask=0077
CONF
install -m 644 ops/commerce-worker.service ops/commerce-worker.timer /etc/systemd/system/
systemctl daemon-reload
systemctl restart new.ladyzenko.ru
systemctl reload nginx
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3007/payment-info > /dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:3007/payment-info > /dev/null
systemctl enable --now commerce-worker.timer
printf 'RELEASE=%s\nBACKUP=%s\n' "$release" "$backup"
