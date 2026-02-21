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

  const titleSpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

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
