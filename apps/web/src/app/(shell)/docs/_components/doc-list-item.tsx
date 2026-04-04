import { cn } from '@repo/ui';
import type { DocumentResponse } from '../_lib/docs-api';
import { formatTimeAgo } from '@/lib/format-time-ago';

interface DocListItemProps {
  doc: DocumentResponse;
  isActive: boolean;
  onClick: () => void;
}

const ITEM_CLASS =
  'flex min-h-[44px] w-full cursor-default items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden hover:bg-accent hover:text-accent-foreground';

export function DocListItem({ doc, isActive, onClick }: DocListItemProps) {
  const displayTitle = doc.title || 'Untitled';

  return (
    <button
      type="button"
      className={cn(ITEM_CLASS, isActive && 'bg-accent/50')}
      onClick={onClick}
      data-testid={`doc-item-${doc.id}`}
    >
      <span className="min-w-0 truncate">{displayTitle}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatTimeAgo(doc.updatedAt)}
      </span>
    </button>
  );
}
