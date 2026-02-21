export { HelloWorld } from './compositions/HelloWorld';

export const compositions = {
  HelloWorld: {
    id: 'HelloWorld',
    durationInFrames: 90,
    fps: 30,
    width: 1920,
    height: 1080,
  },
} as const;
