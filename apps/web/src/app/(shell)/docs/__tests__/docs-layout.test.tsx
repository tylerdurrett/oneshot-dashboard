import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockIsMobile = false;
let mockChatEnabled = true;

vi.mock('@/hooks/use-is-mobile', () => ({
  useIsMobile: () => mockIsMobile,
}));

vi.mock('@/lib/features', () => ({
  get features() {
    return { chat: mockChatEnabled, timers: true, video: true };
  },
}));

vi.mock('react-resizable-panels', () => ({
  Group: ({ children, ...props }: { children: React.ReactNode; orientation: string }) => (
    <div data-testid="panel-group" data-orientation={props.orientation}>
      {children}
    </div>
  ),
  Panel: ({ children, id }: { children: React.ReactNode; id: string }) => (
    <div data-testid={`panel-${id}`}>{children}</div>
  ),
  Separator: () => <div data-testid="resize-handle" />,
  useDefaultLayout: () => ({
    defaultLayout: undefined,
    onLayoutChanged: vi.fn(),
  }),
}));

vi.mock('../_components/docs-chat-panel', () => ({
  DocsChatPanel: () => <div data-testid="docs-chat-panel" />,
}));

import { DocsLayout } from '../_components/docs-layout';

describe('DocsLayout', () => {
  beforeEach(() => {
    mockIsMobile = false;
    mockChatEnabled = true;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders Group with editor and chat panels on desktop when chat is enabled', () => {
    render(
      <DocsLayout>
        <div data-testid="editor">Editor content</div>
      </DocsLayout>,
    );

    expect(screen.getByTestId('panel-group')).toBeDefined();
    expect(screen.getByTestId('panel-docs-editor')).toBeDefined();
    expect(screen.getByTestId('panel-docs-chat')).toBeDefined();
    expect(screen.getByTestId('resize-handle')).toBeDefined();
    expect(screen.getByTestId('docs-chat-panel')).toBeDefined();
    expect(screen.getByTestId('editor')).toBeDefined();
  });

  it('renders children only when chat feature is disabled', () => {
    mockChatEnabled = false;

    render(
      <DocsLayout>
        <div data-testid="editor">Editor content</div>
      </DocsLayout>,
    );

    expect(screen.getByTestId('editor')).toBeDefined();
    expect(screen.queryByTestId('panel-group')).toBeNull();
    expect(screen.queryByTestId('docs-chat-panel')).toBeNull();
  });

  it('renders children only on mobile even when chat is enabled', () => {
    mockIsMobile = true;

    render(
      <DocsLayout>
        <div data-testid="editor">Editor content</div>
      </DocsLayout>,
    );

    expect(screen.getByTestId('editor')).toBeDefined();
    expect(screen.queryByTestId('panel-group')).toBeNull();
    expect(screen.queryByTestId('docs-chat-panel')).toBeNull();
  });
});
