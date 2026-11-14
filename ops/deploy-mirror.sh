#!/usr/bin/env bash
set -Eeuo pipefail
archive=$1
revision=$2
[[ "$revision" =~ ^[a-f0-9]{7,40}$ ]]
base=/var/www/new.ladyzenko.ru-releases
release="$base/$revision"
previous=$(readlink -f /var/www/new.ladyzenko.ru-current)
[[ "$previous" == "$base/"* ]]
[[ ! -e "$release" ]]
backup="/var/backups/new-ladyzenko/$(date -u +%Y%m%dT%H%M%SZ)-mirror"
mkdir -m 700 -p "$backup"
cp -a /etc/nginx/sites-available/new.ladyzenko.ru.conf "$backup/nginx.conf"
printf '%s\n' "$previous" > "$backup/previous-release"
# The state is private and is never copied into a release or a public archive.
python3 - "$backup" <<'PY'
import pathlib,sqlite3,sys,shutil
src=pathlib.Path('/var/lib/new-ladyzenko-commerce'); dest=pathlib.Path(sys.argv[1])/'state'; dest.mkdir(mode=0o700)
for f in src.glob('*'):
    if f.is_file() and not f.name.startswith('orders.sqlite'):
        shutil.copy2(f,dest/f.name)
if (src/'orders.sqlite').exists():
    a=sqlite3.connect(src/'orders.sqlite'); b=sqlite3.connect(dest/'orders.sqlite'); a.backup(b); b.close(); a.close()
PY
activated=false
rollback(){
  trap - ERR
  cp -a "$backup/nginx.conf" /etc/nginx/sites-available/new.ladyzenko.ru.conf
  if [[ "$activated" == true ]]; then
    ln -sfn "$previous" /var/www/new.ladyzenko.ru-current
    systemctl restart new.ladyzenko.ru
  fi
  nginx -t && systemctl reload nginx
  printf 'Deployment rolled back. Backup: %s\n' "$backup" >&2
  exit 1
}
trap rollback ERR
mkdir "$release"
tar -xzf "$archive" -C "$release"
cmp "$release/package-lock.json" "$previous/package-lock.json"
# Immutable dependencies are identical; share their files without another npm install.
cp -al "$previous/node_modules" "$release/node_modules"
cd "$release"
node --import tsx --test tests/*.test.ts > "$backup/tests.log" 2>&1
python3 - <<'PY'
from pathlib import Path
p=Path('/etc/nginx/sites-available/new.ladyzenko.ru.conf'); text=p.read_text()
if 'client_max_body_size' not in text:
    text=text.replace('server {','server {\n    client_max_body_size 9m;',1)
p.write_text(text)
PY
nginx -t
ln -sfn "$release" /var/www/new.ladyzenko.ru-current
activated=true
systemctl restart new.ladyzenko.ru
systemctl reload nginx
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3007/api/site/page?slug=index > /dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:3007/ -o "$backup/home.html"
grep -q 'mirror-runtime.js' "$backup/home.html"
curl -fsS http://127.0.0.1:3007/payment-info > /dev/null
curl -fsS http://127.0.0.1:3007/admin > /dev/null
printf 'RELEASE=%s\nBACKUP=%s\n' "$release" "$backup"
