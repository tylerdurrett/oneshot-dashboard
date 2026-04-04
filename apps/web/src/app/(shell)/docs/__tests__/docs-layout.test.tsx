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

vi.mock('../_components/docs-nav-panel', () => ({
  DocsNavPanel: () => <div data-testid="docs-nav-panel" />,
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

  it('renders nested Groups with nav, editor, and chat panels on desktop when chat is enabled', () => {
    render(
      <DocsLayout>
        <div data-testid="editor">Editor content</div>
      </DocsLayout>,
    );

    // Outer group: docs-nav + docs-main
    expect(screen.getByTestId('panel-docs-nav')).toBeDefined();
    expect(screen.getByTestId('panel-docs-main')).toBeDefined();
    expect(screen.getByTestId('docs-nav-panel')).toBeDefined();

    // Inner group: docs-editor + docs-chat
    expect(screen.getByTestId('panel-docs-editor')).toBeDefined();
    expect(screen.getByTestId('panel-docs-chat')).toBeDefined();
    expect(screen.getByTestId('docs-chat-panel')).toBeDefined();
    expect(screen.getByTestId('editor')).toBeDefined();

    // Two Groups (outer + inner), two separators
    const groups = screen.getAllByTestId('panel-group');
    expect(groups).toHaveLength(2);
    const handles = screen.getAllByTestId('resize-handle');
    expect(handles).toHaveLength(2);
  });

  it('renders nav panel and editor without chat panel when chat is disabled', () => {
    mockChatEnabled = false;

    render(
      <DocsLayout>
        <div data-testid="editor">Editor content</div>
      </DocsLayout>,
    );

    // Outer group still present with nav + main
    expect(screen.getByTestId('panel-docs-nav')).toBeDefined();
    expect(screen.getByTestId('panel-docs-main')).toBeDefined();
    expect(screen.getByTestId('docs-nav-panel')).toBeDefined();
    expect(screen.getByTestId('editor')).toBeDefined();

    // No inner group or chat panel
    expect(screen.queryByTestId('panel-docs-editor')).toBeNull();
    expect(screen.queryByTestId('panel-docs-chat')).toBeNull();
    expect(screen.queryByTestId('docs-chat-panel')).toBeNull();

    // One Group, one separator
    const groups = screen.getAllByTestId('panel-group');
    expect(groups).toHaveLength(1);
    const handles = screen.getAllByTestId('resize-handle');
    expect(handles).toHaveLength(1);
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
    expect(screen.queryByTestId('docs-nav-panel')).toBeNull();
  });
});
