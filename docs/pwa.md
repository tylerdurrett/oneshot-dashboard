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

## iPhone safe area

On iPhone home-screen mode, iOS reserves space for the home indicator at the bottom. The dashboard handles that by making the mobile bottom nav include the safe-area inset as part of its own height, instead of adding extra space below the whole app shell.

The app also uses a standalone-only mobile workaround: when launched from the home screen, the bottom nav is pinned to the viewport bottom and the main content reserves the bar's base height above it. On some iPhone PWA layouts, Safari already offsets a fixed bottom bar for the home indicator, so adding extra bottom safe-area padding can create a second dead strip.

The app shell also adds one small shared gutter above the fixed standalone bottom nav. That keeps bottom-aligned content, like timer grids and the chat composer, from sitting flush against the nav. Because that spacing lives in the shell, future shell pages inherit it automatically instead of needing page-specific PWA fixes.

Navigation bars and timer buckets also avoid text selection on touch devices, so pressing and long-pressing feels like using controls instead of highlighting labels.

The main Timers and Chat tabs also keep the chat connection alive while you switch between them. On mobile, that makes the app feel more like a native tabbed app instead of reconnecting every time you bounce between screens.

Floating timer editors also keep their number inputs at a 16px mobile font size. On iPhone Safari, smaller focused inputs can trigger automatic page zoom, which is especially disruptive for long-press menus anchored to a specific spot on the screen.

Those editors also stay open if iPhone Safari nudges the page while bringing up the keyboard. That focus-time scroll is a normal mobile browser behavior and should not kick you back to the timers grid.

The iPhone home-screen app uses the `black` status bar style instead of `black-translucent`, so content stays below the system status area instead of rendering underneath the clock and indicators.
