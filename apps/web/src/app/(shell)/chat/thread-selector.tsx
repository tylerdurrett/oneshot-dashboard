import { useState } from 'react';
import { ChevronDown, Trash2, Plus } from 'lucide-react';
import {
  Button,
  cn,
  ConfirmationDialog,
  Popover,
  PopoverContent,
  PopoverTrigger,
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

const ITEM_CLASS =
  'flex min-h-[44px] w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden hover:bg-accent hover:text-accent-foreground';

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
  const [open, setOpen] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent, thread: Thread) => {
    e.stopPropagation();
    e.preventDefault();
    setThreadToDelete(thread);
    setOpen(false);
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
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px] min-w-0 max-w-[280px] gap-1.5"
              data-testid="thread-selector-trigger"
            >
              <span className="truncate">{displayTitle}</span>
              <ChevronDown className="size-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72">
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              Threads
            </div>
            <hr className="my-1 border-border" />
            <div role="group">
              {threads.length === 0 ? (
                <div className={cn(ITEM_CLASS, 'pointer-events-none opacity-50')}>
                  <span className="text-muted-foreground">No threads yet</span>
                </div>
              ) : (
                threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    className={cn(
                      ITEM_CLASS,
                      'justify-between pr-1',
                      thread.id === activeThreadId && 'bg-accent/50',
                    )}
                    onClick={() => {
                      onSelectThread(thread.id);
                      setOpen(false);
                    }}
                    data-testid={`thread-item-${thread.id}`}
                  >
                    <span className="min-w-0 truncate">{thread.title}</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(thread.updatedAt)}
                      </span>
                      <button
                        type="button"
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-foreground/7 hover:text-foreground"
                        onClick={(e) => handleDeleteClick(e, thread)}
                        aria-label={`Delete ${thread.title}`}
                        data-testid={`thread-menu-${thread.id}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </button>
                ))
              )}
            </div>
            <hr className="my-1 border-border" />
            <button
              type="button"
              className={ITEM_CLASS}
              onClick={() => {
                onNewThread();
                setOpen(false);
              }}
              data-testid="new-thread-button"
            >
              <Plus className="size-4" />
              <span>New thread</span>
            </button>
          </PopoverContent>
        </Popover>
      </div>

      <ConfirmationDialog
        open={threadToDelete !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setThreadToDelete(null);
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
