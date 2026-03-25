#!/usr/bin/env bash
set -euo pipefail

# Show status of the oneshot-dashboard launchd agent.
# Usage:
#   ./scripts/launchd-status.sh

source "$(dirname "${BASH_SOURCE[0]}")/launchd-common.sh"

echo "=== Service Status ==="
if launchctl print "${LAUNCHD_SERVICE}" 2>/dev/null; then
  echo ""
else
  echo "Service is not loaded. Run 'pnpm launchd:install' to start it."
  exit 0
fi

echo "=== Recent Logs (last 15 lines) ==="
if [ -f "${LAUNCHD_LOG_DIR}/dashboard.log" ]; then
  tail -15 "${LAUNCHD_LOG_DIR}/dashboard.log"
else
  echo "(no stdout log found)"
fi

echo ""
echo "=== Recent Errors (last 10 lines) ==="
if [ -f "${LAUNCHD_LOG_DIR}/dashboard.err.log" ]; then
  tail -10 "${LAUNCHD_LOG_DIR}/dashboard.err.log"
else
  echo "(no stderr log found)"
fi
