#!/usr/bin/env bash
set -euo pipefail

# Tail live logs for the oneshot-dashboard systemd user service.
# Usage:
#   ./scripts/systemd-logs.sh

source "$(dirname "${BASH_SOURCE[0]}")/systemd-common.sh"

echo ""
echo "Tailing logs from ${SYSTEMD_LOG_DIR}/"
echo "Press Ctrl+C to stop."
echo ""

LOG_FILES=()
for F in "${SYSTEMD_LOG_DIR}/dashboard.log" "${SYSTEMD_LOG_DIR}/dashboard.err.log"; do
  [ -f "$F" ] && LOG_FILES+=("$F")
done

if [ ${#LOG_FILES[@]} -eq 0 ]; then
  echo "(no log files found yet — is the service running?)"
  exit 0
fi

tail -f "${LOG_FILES[@]}"
