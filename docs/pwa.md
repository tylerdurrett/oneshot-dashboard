# Install on iPhone Home Screen

Tdog Dashboard can be saved to your iPhone home screen so it opens like a regular app — fullscreen, no browser bar.

## How to install

1. Open the dashboard URL in **Safari** on your iPhone
2. Tap the **Share** button (the square with an arrow pointing up)
3. Scroll down and tap **Add to Home Screen**
4. Tap **Add**

The app will appear on your home screen with the "TD" icon.

## Customizing the app icon

Replace the icon files in `apps/web/public/`:

| File | Size | Purpose |
|------|------|---------|
| `apple-touch-icon.png` | 180x180 | iPhone home screen icon |
| `icon-192.png` | 192x192 | Standard web app icon |
| `icon-512.png` | 512x512 | Large web app icon |

Keep the same filenames and sizes. Rebuild and redeploy after replacing.

## Theme color

The app uses `#09090b` (near-black) as its theme color, matching the dark background. If you change the app's color scheme, update:

- `apps/web/public/manifest.json` — `background_color` and `theme_color`
- `apps/web/index.html` — the `theme-color` meta tag
