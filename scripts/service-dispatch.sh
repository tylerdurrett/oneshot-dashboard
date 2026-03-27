#!/usr/bin/env bash
set -euo pipefail

# Platform dispatcher for persistent service management.
# Routes to launchd scripts on macOS or systemd scripts on Linux/WSL2.
# Usage:
#   ./scripts/service-dispatch.sh <install|uninstall|status|logs>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION="${1:?Usage: service-dispatch.sh <install|uninstall|status|logs>}"

case "$(uname -s)" in
  Darwin)
    case "${ACTION}" in
      install)   exec bash "${SCRIPT_DIR}/install-launchd.sh" ;;
      uninstall) exec bash "${SCRIPT_DIR}/uninstall-launchd.sh" ;;
      status)    exec bash "${SCRIPT_DIR}/launchd-status.sh" ;;
      logs)      exec bash "${SCRIPT_DIR}/launchd-logs.sh" ;;
      *)         echo "Error: Unknown action '${ACTION}'. Use install, uninstall, status, or logs." >&2; exit 1 ;;
    esac
    ;;
  Linux)
    case "${ACTION}" in
      install)   exec bash "${SCRIPT_DIR}/install-systemd.sh" ;;
      uninstall) exec bash "${SCRIPT_DIR}/uninstall-systemd.sh" ;;
      status)    exec bash "${SCRIPT_DIR}/systemd-status.sh" ;;
      logs)      exec bash "${SCRIPT_DIR}/systemd-logs.sh" ;;
      *)         echo "Error: Unknown action '${ACTION}'. Use install, uninstall, status, or logs." >&2; exit 1 ;;
    esac
    ;;
  *)
    echo "Error: Unsupported platform $(uname -s). Service management requires macOS or Linux." >&2
    exit 1
    ;;
esac
