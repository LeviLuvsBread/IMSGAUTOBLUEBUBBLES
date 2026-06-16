#!/usr/bin/env bash
# Installs a launchd agent on the (always-on) Mac that "pings" the Vercel pump
# route every 60 seconds, draining the throttled send queue without paying for
# Vercel Pro cron. Run this ON THE MAC that runs BlueBubbles.
#
#   ./install-pinger.sh <app-host> <PUMP_SECRET>
#   e.g. ./install-pinger.sh imsgautobluebubbles.vercel.app s3cr3t...
set -euo pipefail

APP_HOST="${1:-}"
PUMP_SECRET="${2:-}"

if [ -z "$APP_HOST" ] || [ -z "$PUMP_SECRET" ]; then
  echo "Usage: $0 <app-host e.g. your-app.vercel.app> <PUMP_SECRET>"
  exit 1
fi

SRC="$(cd "$(dirname "$0")" && pwd)/com.imsgauto.pump.plist"
DEST="$HOME/Library/LaunchAgents/com.imsgauto.pump.plist"

mkdir -p "$HOME/Library/LaunchAgents"
sed -e "s|__PUMP_SECRET__|${PUMP_SECRET}|g" \
    -e "s|__APP_HOST__|${APP_HOST}|g" \
    "$SRC" > "$DEST"

launchctl unload "$DEST" 2>/dev/null || true
launchctl load "$DEST"

echo "Installed and loaded launchd agent: $DEST"
echo "It pings https://${APP_HOST}/api/cron/pump every 60s."
echo "Logs: /tmp/imsgauto-pump.log  (errors: /tmp/imsgauto-pump.err)"
echo "To stop:  launchctl unload \"$DEST\""
