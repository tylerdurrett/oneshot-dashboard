# Shared constants for launchd scripts. Source this file, don't run it.
# Usage: source "$(dirname "${BASH_SOURCE[0]}")/launchd-common.sh"

LAUNCHD_LABEL="com.tdogmini.oneshot-dashboard"
LAUNCHD_DOMAIN="gui/$(id -u)"
LAUNCHD_SERVICE="${LAUNCHD_DOMAIN}/${LAUNCHD_LABEL}"
LAUNCHD_PLIST_DIR="${HOME}/Library/LaunchAgents"
LAUNCHD_PLIST_PATH="${LAUNCHD_PLIST_DIR}/${LAUNCHD_LABEL}.plist"
LAUNCHD_LOG_DIR="${HOME}/.local/share/oneshot-dashboard/logs"
