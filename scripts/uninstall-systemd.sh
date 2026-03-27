#!/usr/bin/env bash
set -euo pipefail

# Remove the oneshot-dashboard systemd user service.
# Usage:
#   ./scripts/uninstall-systemd.sh

source "$(dirname "${BASH_SOURCE[0]}")/systemd-common.sh"

# Stop and disable the service
systemctl --user disable --now "${SYSTEMD_SERVICE_NAME}" >/dev/null 2>&1 || true

# Remove the unit file
if [ -f "${SYSTEMD_UNIT_PATH}" ]; then
  rm "${SYSTEMD_UNIT_PATH}"
  echo "Removed unit file: ${SYSTEMD_UNIT_PATH}"
else
  echo "Unit file not found (already removed): ${SYSTEMD_UNIT_PATH}"
fi

# Reload daemon so systemd forgets the removed unit
systemctl --user daemon-reload >/dev/null 2>&1 || true

echo ""
echo "oneshot-dashboard systemd user service uninstalled."
echo "  Log files preserved at: ${SYSTEMD_LOG_DIR}"
echo ""
