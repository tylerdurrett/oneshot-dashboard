#!/usr/bin/env bash
set -euo pipefail

# Remove the oneshot-dashboard launchd agent.
# Usage:
#   ./scripts/uninstall-launchd.sh

source "$(dirname "${BASH_SOURCE[0]}")/launchd-common.sh"

# Stop and unload the service
launchctl bootout "${LAUNCHD_SERVICE}" >/dev/null 2>&1 || true

# Remove the plist
if [ -f "${LAUNCHD_PLIST_PATH}" ]; then
  rm "${LAUNCHD_PLIST_PATH}"
  echo "Removed plist: ${LAUNCHD_PLIST_PATH}"
else
  echo "Plist not found (already removed): ${LAUNCHD_PLIST_PATH}"
fi

echo ""
echo "oneshot-dashboard LaunchAgent uninstalled."
echo "  Log files preserved at: ${LAUNCHD_LOG_DIR}"
echo ""
