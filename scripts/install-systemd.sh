#!/usr/bin/env bash
set -euo pipefail

# Install/update a systemd user service for oneshot-dashboard.
# Usage:
#   ./scripts/install-systemd.sh
#
# The service runs `pnpm go` at the repo root, which starts both the
# Vite web app and the Fastify server with hot reload via Turbo.
# Pre-go hooks (migrations, sandbox, setup checks) run automatically on each start.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/systemd-common.sh"

# Preflight: verify systemd user session is available.
# On WSL2 this requires systemd=true in /etc/wsl.conf.
# "running" and "degraded" are both acceptable — degraded means systemd is
# active but some non-critical units failed (common on WSL2).
SYSTEMD_STATUS=$(systemctl --user is-system-running 2>&1 || true)
if [ "$SYSTEMD_STATUS" != "running" ] && [ "$SYSTEMD_STATUS" != "degraded" ]; then
  echo "Error: systemd user session is not available (status: ${SYSTEMD_STATUS})."
  echo ""
  echo "On WSL2, ensure /etc/wsl.conf contains:"
  echo "  [boot]"
  echo "  systemd=true"
  echo ""
  echo "Then restart WSL from PowerShell: wsl --shutdown"
  exit 1
fi

PNPM_BIN="$(command -v pnpm)" || { echo "Error: pnpm not found on PATH."; exit 1; }

# Preflight: verify project.config.json exists (ports are configured)
if [ ! -f "${REPO_ROOT}/project.config.json" ]; then
  echo "Error: project.config.json not found."
  echo "Run 'pnpm hello' first to configure ports."
  exit 1
fi

# Reuse the project's port-reading script
PORT=$(node "${SCRIPT_DIR}/get-port.mjs")

mkdir -p "${SYSTEMD_UNIT_DIR}" "${SYSTEMD_LOG_DIR}"

OUT_LOG="${SYSTEMD_LOG_DIR}/dashboard.log"
ERR_LOG="${SYSTEMD_LOG_DIR}/dashboard.err.log"

# Capture the current shell's PATH so version-manager-installed Node works
PNPM_DIR="$(dirname "${PNPM_BIN}")"
NODE_DIR="$(dirname "$(command -v node)")"
RUNTIME_PATH="${HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
for DIR in "${PNPM_DIR}" "${NODE_DIR}"; do
  case ":${RUNTIME_PATH}:" in
    *":${DIR}:"*) ;;
    *) RUNTIME_PATH="${DIR}:${RUNTIME_PATH}" ;;
  esac
done

cat >"${SYSTEMD_UNIT_PATH}" <<UNIT
[Unit]
Description=One Shot Dashboard (dev server)
After=network.target

[Service]
Type=simple
WorkingDirectory=${REPO_ROOT}
ExecStart=${PNPM_BIN} go
Restart=always
RestartSec=3
Environment=NODE_ENV=development
Environment=PATH=${RUNTIME_PATH}
Environment=HOME=${HOME}
StandardOutput=append:${OUT_LOG}
StandardError=append:${ERR_LOG}

[Install]
WantedBy=default.target
UNIT

chmod 0644 "${SYSTEMD_UNIT_PATH}"

# Reload, enable, and start the service
systemctl --user daemon-reload
systemctl --user enable --now "${SYSTEMD_SERVICE_NAME}"

echo ""
echo "oneshot-dashboard systemd user service installed and started."
echo "  Service: ${SYSTEMD_SERVICE_NAME}"
echo "  Unit:    ${SYSTEMD_UNIT_PATH}"
echo "  URL:     http://localhost:${PORT}"
echo "  Logs:    ${OUT_LOG}"
echo "  Status:  pnpm service:status"
echo ""
echo "Note: On WSL2, this service is persistent while the WSL environment"
echo "is running. It does not survive a full WSL shutdown."
echo ""
