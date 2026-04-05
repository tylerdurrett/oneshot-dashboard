#!/usr/bin/env bash
set -euo pipefail

# Install/update a per-user launchd agent for oneshot-dashboard.
# Usage:
#   ./scripts/install-launchd.sh
#
# The service runs `pnpm go` at the repo root, which starts both the
# Vite web app and the Fastify server with hot reload via Turbo.
# Pre-go hooks (migrations, sandbox, setup checks) run automatically on each start.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/launchd-common.sh"

PNPM_BIN="$(command -v pnpm)" || { echo "Error: pnpm not found on PATH."; exit 1; }

mkdir -p "${LAUNCHD_LOG_DIR}" "${LAUNCHD_PLIST_DIR}"

OUT_LOG="${LAUNCHD_LOG_DIR}/dashboard.log"
ERR_LOG="${LAUNCHD_LOG_DIR}/dashboard.err.log"

# Preflight: verify project.config.json exists (ports are configured)
if [ ! -f "${REPO_ROOT}/project.config.json" ]; then
  echo "Error: project.config.json not found."
  echo "Run 'pnpm hello' first to configure ports."
  exit 1
fi

# Reuse the project's port-reading script
PORT=$(node "${SCRIPT_DIR}/get-port.mjs")

# Capture the current shell's PATH so version-manager-installed Node works
RUNTIME_PATH="${HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
# Prepend the directory containing pnpm and node if not already covered
PNPM_DIR="$(dirname "${PNPM_BIN}")"
NODE_DIR="$(dirname "$(command -v node)")"
for DIR in "${PNPM_DIR}" "${NODE_DIR}"; do
  case ":${RUNTIME_PATH}:" in
    *":${DIR}:"*) ;;
    *) RUNTIME_PATH="${DIR}:${RUNTIME_PATH}" ;;
  esac
done

cat >"${LAUNCHD_PLIST_PATH}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${PNPM_BIN}</string>
    <string>go</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${REPO_ROOT}</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${OUT_LOG}</string>

  <key>StandardErrorPath</key>
  <string>${ERR_LOG}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${RUNTIME_PATH}</string>
    <key>HOME</key>
    <string>${HOME}</string>
    <key>NODE_ENV</key>
    <string>development</string>
    <key>ONESHOT_SERVICE</key>
    <string>1</string>
  </dict>
</dict>
</plist>
PLIST

chmod 0644 "${LAUNCHD_PLIST_PATH}"

# Unload any existing service, then load the new one
launchctl bootout "${LAUNCHD_SERVICE}" >/dev/null 2>&1 || true
launchctl bootstrap "${LAUNCHD_DOMAIN}" "${LAUNCHD_PLIST_PATH}"
launchctl enable "${LAUNCHD_SERVICE}" >/dev/null 2>&1 || true

echo ""
echo "oneshot-dashboard LaunchAgent installed and started."
echo "  Label:   ${LAUNCHD_LABEL}"
echo "  Plist:   ${LAUNCHD_PLIST_PATH}"
echo "  URL:     http://localhost:${PORT}"
echo "  Logs:    ${OUT_LOG}"
echo "  Status:  pnpm launchd:status"
echo ""
