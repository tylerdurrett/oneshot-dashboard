import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => 30,
    useVideoConfig: () => ({
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: 90,
      id: 'HelloWorld',
      defaultProps: {},
      props: {},
      defaultCodec: 'h264',
    }),
    AbsoluteFill: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div data-testid="absolute-fill" {...props}>
        {children}
      </div>
    ),
  };
});

import { HelloWorld } from '../compositions/HelloWorld';

afterEach(cleanup);

describe('HelloWorld composition', () => {
  it('renders without crashing', () => {
    render(<HelloWorld />);
    expect(screen.getByText('Hello, Remotion!')).toBeDefined();
  });

  it('displays video config info', () => {
    render(<HelloWorld />);
    expect(screen.getByText(/1920x1080/)).toBeDefined();
    expect(screen.getByText(/30fps/)).toBeDefined();
  });

  it('displays the current frame', () => {
    render(<HelloWorld />);
    expect(screen.getByText(/Frame 30/)).toBeDefined();
  });
});
