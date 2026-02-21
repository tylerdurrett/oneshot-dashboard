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
      style={{ width: '100%', borderRadius: '0.5rem' }}
    />
  );
}
