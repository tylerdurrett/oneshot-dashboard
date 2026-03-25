#!/usr/bin/env bash
set -euo pipefail

# Tail live logs from the oneshot-dashboard launchd agent.
# Usage:
#   ./scripts/launchd-logs.sh
#
# Press Ctrl+C to stop.

source "$(dirname "${BASH_SOURCE[0]}")/launchd-common.sh"

OUT_LOG="${LAUNCHD_LOG_DIR}/dashboard.log"
ERR_LOG="${LAUNCHD_LOG_DIR}/dashboard.err.log"

if [ ! -f "${OUT_LOG}" ] && [ ! -f "${ERR_LOG}" ]; then
  echo "No log files found at ${LAUNCHD_LOG_DIR}"
  echo "Has the service been started? Run 'pnpm launchd:install' first."
  exit 1
fi

echo "Tailing logs from ${LAUNCHD_LOG_DIR} (Ctrl+C to stop)..."
echo ""

LOGS=()
[ -f "${OUT_LOG}" ] && LOGS+=("${OUT_LOG}")
[ -f "${ERR_LOG}" ] && LOGS+=("${ERR_LOG}")

tail -f "${LOGS[@]}"
