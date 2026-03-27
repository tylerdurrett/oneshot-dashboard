# Shared constants for systemd scripts. Source this file, don't run it.
# Usage: source "$(dirname "${BASH_SOURCE[0]}")/systemd-common.sh"

SYSTEMD_SERVICE_NAME="oneshot-dashboard"
SYSTEMD_UNIT_DIR="${HOME}/.config/systemd/user"
SYSTEMD_UNIT_PATH="${SYSTEMD_UNIT_DIR}/${SYSTEMD_SERVICE_NAME}.service"
SYSTEMD_LOG_DIR="${HOME}/.local/share/oneshot-dashboard/logs"
