'use client';

import { useState } from 'react';
import { ChevronDown, MoreVertical, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  ConfirmationDialog,
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
  onDeleteThread: (threadId: string) => void;
}

export function ThreadSelector({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onDeleteThread,
}: ThreadSelectorProps) {
  const activeThread = threads.find((t) => t.id === activeThreadId);
  const displayTitle = activeThread?.title ?? 'New conversation';

  const [threadToDelete, setThreadToDelete] = useState<Thread | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleMenuClick = (e: React.MouseEvent, thread: Thread) => {
    // Prevent DropdownMenuItem onSelect from firing (which would select the thread)
    e.stopPropagation();
    e.preventDefault();
    setThreadToDelete(thread);
    setDropdownOpen(false);
  };

  const handleConfirmDelete = () => {
    if (threadToDelete) {
      onDeleteThread(threadToDelete.id);
      setThreadToDelete(null);
    }
  };

  return (
    <>
      <div className="flex min-w-0 items-center gap-2" data-testid="thread-selector">
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
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
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(thread.updatedAt)}
                        </span>
                        <button
                          type="button"
                          className="rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 [div[role=menuitem]:hover_&]:opacity-100 [div[role=menuitem][data-highlighted]_&]:opacity-100"
                          onClick={(e) => handleMenuClick(e, thread)}
                          aria-label={`Thread options for ${thread.title}`}
                          data-testid={`thread-menu-${thread.id}`}
                        >
                          <MoreVertical className="size-3.5" />
                        </button>
                      </div>
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

      <ConfirmationDialog
        open={threadToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setThreadToDelete(null);
        }}
        title="Delete thread?"
        description={`"${threadToDelete?.title ?? ''}" and all its messages will be permanently deleted.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
