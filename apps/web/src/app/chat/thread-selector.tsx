'use client';

import { ChevronDown, Plus } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui';
import type { Thread } from './api';
import { formatTimeAgo } from './format-time-ago';

interface ThreadSelectorProps {
  threads: Thread[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
}

export function ThreadSelector({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
}: ThreadSelectorProps) {
  const activeThread = threads.find((t) => t.id === activeThreadId);
  const displayTitle = activeThread?.title ?? 'New conversation';

  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="thread-selector">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="min-w-0 max-w-[280px] gap-1.5"
            data-testid="thread-selector-trigger"
          >
            <span className="truncate">{displayTitle}</span>
            <ChevronDown className="size-3.5 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Threads</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {threads.length === 0 ? (
              <DropdownMenuItem disabled>
                <span className="text-muted-foreground">No threads yet</span>
              </DropdownMenuItem>
            ) : (
              threads.map((thread) => (
                <DropdownMenuItem
                  key={thread.id}
                  className={
                    thread.id === activeThreadId
                      ? 'bg-accent/50'
                      : undefined
                  }
                  onSelect={() => onSelectThread(thread.id)}
                  data-testid={`thread-item-${thread.id}`}
                >
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <span className="truncate">{thread.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatTimeAgo(thread.updatedAt)}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onNewThread} data-testid="new-thread-button">
            <Plus className="size-4" />
            <span>New thread</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
