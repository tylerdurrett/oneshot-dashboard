import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';

import { features } from '@/lib/features';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { DocsChatPanel } from './docs-chat-panel';

interface DocsLayoutProps {
  children: React.ReactNode;
}

/**
 * Wraps the docs editor in a resizable panel layout with a chat panel on
 * the right. Falls back to editor-only when chat is disabled or on mobile
 * (where chat is a separate swipeable page instead).
 */
export function DocsLayout({ children }: DocsLayoutProps) {
  const isMobile = useIsMobile();

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'docs-layout',
    panelIds: ['docs-editor', 'docs-chat'],
  });

  if (!features.chat || isMobile) {
    return <>{children}</>;
  }

  return (
    <Group
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <Panel id="docs-editor" defaultSize="60%" minSize="30%">
        {children}
      </Panel>
      <Separator className="w-px bg-border outline-none hover:bg-primary/20 transition-colors data-[separator-active]:bg-primary/30" />
      <Panel id="docs-chat" defaultSize="40%" minSize="25%">
        <DocsChatPanel />
      </Panel>
    </Group>
  );
}
