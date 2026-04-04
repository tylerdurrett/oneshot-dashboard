import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';

import { features } from '@/lib/features';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { DocsChatPanel } from './docs-chat-panel';
import { DocsNavPanel } from './docs-nav-panel';

const SEPARATOR_CLASS =
  'w-px bg-border outline-none hover:bg-primary/20 transition-colors data-[separator-active]:bg-primary/30';

interface DocsLayoutProps {
  children: React.ReactNode;
}

/**
 * Wraps the docs editor in a resizable panel layout. On desktop, renders a
 * three-zone layout: doc list sidebar (left) | editor (center) | chat (right).
 * When chat is disabled the right panel is omitted. Falls back to editor-only
 * on mobile (where chat is a separate swipeable page and the doc list uses
 * the mobile doc selector instead).
 */
export function DocsLayout({ children }: DocsLayoutProps) {
  const isMobile = useIsMobile();

  const outerLayout = useDefaultLayout({
    id: 'docs-outer-layout',
    panelIds: ['docs-nav', 'docs-main'],
  });

  const innerLayout = useDefaultLayout({
    id: 'docs-inner-layout',
    panelIds: ['docs-editor', 'docs-chat'],
  });

  if (isMobile) {
    return <>{children}</>;
  }

  return (
    <Group
      orientation="horizontal"
      defaultLayout={outerLayout.defaultLayout}
      onLayoutChanged={outerLayout.onLayoutChanged}
    >
      <Panel
        id="docs-nav"
        defaultSize="240px"
        minSize="180px"
        collapsible
        collapsedSize={0}
        groupResizeBehavior="preserve-pixel-size"
      >
        <DocsNavPanel />
      </Panel>
      <Separator className={SEPARATOR_CLASS} />
      <Panel id="docs-main" defaultSize="100%" minSize="50%">
        {features.chat ? (
          <Group
            orientation="horizontal"
            defaultLayout={innerLayout.defaultLayout}
            onLayoutChanged={innerLayout.onLayoutChanged}
          >
            <Panel id="docs-editor" defaultSize="60%" minSize="30%">
              {children}
            </Panel>
            <Separator className={SEPARATOR_CLASS} />
            <Panel id="docs-chat" defaultSize="40%" minSize="25%">
              <DocsChatPanel />
            </Panel>
          </Group>
        ) : (
          children
        )}
      </Panel>
    </Group>
  );
}
