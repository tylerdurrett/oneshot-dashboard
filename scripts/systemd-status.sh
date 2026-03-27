#!/usr/bin/env bash
set -euo pipefail

# Show status and recent logs for the oneshot-dashboard systemd user service.
# Usage:
#   ./scripts/systemd-status.sh

source "$(dirname "${BASH_SOURCE[0]}")/systemd-common.sh"

echo ""
echo "── Service status ──"
systemctl --user status "${SYSTEMD_SERVICE_NAME}" --no-pager 2>&1 || true

echo ""
echo "── Recent stdout (${SYSTEMD_LOG_DIR}/dashboard.log) ──"
if [ -f "${SYSTEMD_LOG_DIR}/dashboard.log" ]; then
  tail -15 "${SYSTEMD_LOG_DIR}/dashboard.log"
else
  echo "(no log file yet)"
fi

echo ""
echo "── Recent stderr (${SYSTEMD_LOG_DIR}/dashboard.err.log) ──"
if [ -f "${SYSTEMD_LOG_DIR}/dashboard.err.log" ]; then
  tail -10 "${SYSTEMD_LOG_DIR}/dashboard.err.log"
else
  echo "(no log file yet)"
fi
echo ""
