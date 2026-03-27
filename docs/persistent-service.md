# Persistent Service

The dashboard can run as a persistent service that auto-restarts on crash and hot-reloads when you change files. This works on both macOS and Linux/WSL2.

## Quick Start

```bash
pnpm service:install
```

That's it. The app is now running at `http://localhost:4900` and will survive crashes.

## Commands

| Command | What it does |
|---|---|
| `pnpm service:install` | Install and start the persistent service |
| `pnpm service:uninstall` | Stop and remove the service |
| `pnpm service:status` | Check if the service is running + recent logs |
| `pnpm service:logs` | Tail live logs (Ctrl+C to stop) |

These commands automatically detect your platform and use the right backend (launchd on macOS, systemd on Linux).

## How It Works

The service runs `pnpm go` at the repo root, which starts both the **Vite web app** and the **Fastify server** via Turbo. **Hot reload** works exactly like normal dev — edit a file, see it update. Pre-go hooks (database migrations, sandbox, setup checks) run on each start.

### macOS (launchd)

A **launchd user agent** runs the service. It starts on login and auto-restarts on crash. The service persists across reboots.

### Linux / WSL2 (systemd)

A **systemd user service** runs the service. It auto-restarts on crash and stays running as long as the Linux environment is active.

**Important for WSL2 users:** The service is persistent while your WSL environment is running, but does not survive a full `wsl --shutdown`. This is different from macOS, where launchd survives reboots. If WSL is restarted, run `pnpm service:install` again (it's safe to re-run).

**WSL2 prerequisite:** systemd must be enabled. If `pnpm service:install` fails with a "systemd user session is not available" error, add this to `/etc/wsl.conf`:

```ini
[boot]
systemd=true
```

Then restart WSL from PowerShell: `wsl --shutdown`

## Important Notes

- `pnpm stop` will **not** permanently stop the service — it restarts automatically. Use `pnpm service:uninstall` instead.
- Re-running `pnpm service:install` updates and restarts the service (safe to run multiple times).
- Logs are stored at `~/.local/share/oneshot-dashboard/logs/`. They are preserved when you uninstall.
