# Persistent Service (macOS)

The dashboard can run as a persistent macOS service that starts on boot, auto-restarts on crash, and hot-reloads when you change files.

## Quick Start

```bash
pnpm launchd:install
```

That's it. The app is now running at `http://localhost:4900` and will survive reboots.

## Commands

| Command | What it does |
|---|---|
| `pnpm launchd:install` | Install and start the persistent service |
| `pnpm launchd:uninstall` | Stop and remove the service |
| `pnpm launchd:status` | Check if the service is running + recent logs |
| `pnpm launchd:logs` | Tail live logs (Ctrl+C to stop) |

## How It Works

- A macOS **launchd user agent** runs `pnpm dev` at the repo root
- This starts both the **Vite web app** and the **Fastify server** via Turbo
- **Hot reload** works exactly like normal dev — edit a file, see it update
- If the process crashes, launchd **automatically restarts** it
- Pre-dev hooks (database migrations, setup checks) run on each start

## Important Notes

- `pnpm stop` will **not** permanently stop the service — launchd restarts it. Use `pnpm launchd:uninstall` instead.
- Re-running `pnpm launchd:install` updates and restarts the service (safe to run multiple times).
- Logs are stored at `~/.local/share/oneshot-dashboard/logs/`. They are preserved when you uninstall.
