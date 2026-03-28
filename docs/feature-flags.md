# Feature Flags

You can enable or disable features by editing `project.config.json` in the project root.

## Configuration

Open `project.config.json` and add or modify the `features` section:

```json
{
  "port": 4900,
  "serverPort": 4902,
  "features": {
    "timers": true,
    "chat": true,
    "video": true
  }
}
```

Set any feature to `false` to disable it. If you leave a feature out (or omit `features` entirely), it defaults to enabled — so existing repos work without changes.

## What happens when a feature is disabled

- **Navigation** — the feature disappears from the sidebar and bottom nav
- **Pages** — visiting the feature's URL returns a "not found" page
- **Server API** — the feature's endpoints stop responding (404)
- **Background jobs** — timer scheduler, chat sandbox probes, credential sweeps are all skipped
- **Database** — nothing changes, all data is preserved for when you re-enable
- **Health endpoint** — `GET /health` reports which features are on so you can confirm

## Available features

| Feature  | What it controls |
|----------|-----------------|
| `timers` | Timer buckets, daily progress tracking, scheduler, and daily reset |
| `chat`   | Chat threads, streaming responses, sandbox integration, credential injection |
| `video`  | Video player page (Remotion compositions) |

## After changing

Restart your dev servers for changes to take effect:

```bash
pnpm stop && pnpm go
```

Feature flags are baked in at build time (web app) and read at startup (server), so a restart is required after any change.
