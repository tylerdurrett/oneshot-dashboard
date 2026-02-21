# Video

The `packages/video/` package lets you create videos programmatically using [Remotion](https://www.remotion.dev/). Write React components, and Remotion turns them into real videos — frame by frame. It comes with a starter composition and tooling to quickly create new ones.

## How It Works

A Remotion video is just a React component that knows which frame it's rendering. You use the frame number to animate things — move elements, fade them in, change colors. Remotion renders each frame and stitches them into a video.

The key building blocks:

- **`useCurrentFrame()`** — returns the current frame number (0, 1, 2, ...)
- **`useVideoConfig()`** — returns fps, width, height, and duration
- **`interpolate()`** — maps a frame range to a value range (e.g., frames 0-30 → opacity 0-1)
- **`spring()`** — physics-based easing for natural-feeling motion
- **`<AbsoluteFill>`** — a full-screen container for your content
- **`<Sequence>`** — delays when a child element appears on the timeline

A composition that's 90 frames at 30fps = a 3-second video. Frame 0 is the first frame, frame 89 is the last.

## Quick Start

Create a new video composition:

```bash
pnpm new-video MyAnimation
```

This creates `packages/video/src/compositions/MyAnimation.tsx` with a working template, registers it in Studio, and adds it to the barrel exports. Open the file and start editing.

Preview it in Remotion Studio:

```bash
pnpm studio
```

Studio opens in your browser with a sidebar listing all compositions. Pick yours to see a live preview with a timeline, frame-by-frame scrubbing, and playback controls. It hot-reloads when you save.

> **Using Claude Code?** Just say "create a video that does X" or use the `/new-video` skill. It'll scaffold the composition, write the animation code, and tell you how to preview it.

## Writing Compositions

Here's the starter `HelloWorld` composition to learn from:

```tsx
import type React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export const HelloWorld: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Spring animation for the title entrance
  const titleSpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  // Fade in the subtitle after the title
  const subtitleOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const scale = interpolate(titleSpring, [0, 1], [0.5, 1]);

  return (
    <AbsoluteFill className="flex flex-col items-center justify-center bg-black">
      <div
        style={{ transform: `scale(${scale})` }}
        className="text-6xl font-bold text-white"
      >
        Hello, Remotion!
      </div>
      <div
        style={{ opacity: subtitleOpacity }}
        className="mt-4 text-2xl text-neutral-400"
      >
        {width}x{height} @ {fps}fps — Frame {frame}
      </div>
    </AbsoluteFill>
  );
};
```

Tailwind classes work in compositions — they render in both Studio and the web Player.

## Common Animation Patterns

**Fade in:**
```tsx
const opacity = interpolate(frame, [0, 30], [0, 1], {
  extrapolateRight: 'clamp',
});
```

**Spring physics (bouncy entrance):**
```tsx
const scale = spring({ frame, fps, config: { damping: 12 } });
```

**Delayed element (appears at frame 30):**
```tsx
import { Sequence } from 'remotion';
<Sequence from={30}>
  <MyElement />
</Sequence>
```

**Staggered animations:**
```tsx
const item1 = spring({ frame, fps });
const item2 = spring({ frame: frame - 10, fps });
const item3 = spring({ frame: frame - 20, fps });
```

**Slide in from left:**
```tsx
const x = interpolate(frame, [0, 30], [-200, 0], {
  extrapolateRight: 'clamp',
});
<div style={{ transform: `translateX(${x}px)` }}>Content</div>
```

## Embedding Videos in Your App

Compositions can be embedded in the Next.js app using the Remotion Player. There's a working example at `/video` in the web app.

The pattern is:

1. Create a `'use client'` component that imports the `Player` from `@remotion/player` and your composition from `@repo/video`
2. Pass the composition component and its metadata to the Player

```tsx
'use client';

import { Player } from '@remotion/player';
import { HelloWorld, compositions } from '@repo/video';

const meta = compositions.HelloWorld;

export function VideoPlayer() {
  return (
    <Player
      component={HelloWorld}
      durationInFrames={meta.durationInFrames}
      fps={meta.fps}
      compositionWidth={meta.width}
      compositionHeight={meta.height}
      controls
      acknowledgeRemotionLicense
      style={{ width: '100%' }}
    />
  );
}
```

The `compositions` export from `@repo/video` includes all the metadata (dimensions, fps, duration) so you don't have to hardcode it.

## Package Structure

```
packages/video/
├── src/
│   ├── compositions/        ← Your video components (one per file)
│   │   └── HelloWorld.tsx
│   ├── Root.tsx             ← Registers compositions for Studio
│   ├── entry.ts             ← Studio entry point
│   ├── index.ts             ← Barrel exports for Player consumers
│   └── styles.css           ← Tailwind entry for Studio
├── remotion.config.ts       ← Studio config (port, Tailwind)
└── package.json
```

## Port Configuration

Remotion Studio runs on your dev server port + 1. If your dev server is on port 3100 (set via `pnpm hello`), Studio runs on 3101. This is automatic — no extra configuration needed.

## Testing

```bash
pnpm --filter @repo/video test
```

Tests mock Remotion's hooks so they run without the Remotion runtime.

## Learn More

- [Remotion Docs](https://www.remotion.dev/docs/) — full API reference
- [Remotion Player](https://www.remotion.dev/docs/player/player) — embedding videos in React apps
- [Animation Recipes](https://www.remotion.dev/docs/animating-properties) — more animation techniques
