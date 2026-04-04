import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronDown, Plus } from 'lucide-react';
import {
  Button,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
} from '@repo/ui';
import { useDocuments, useCreateDocument } from '../_hooks/use-doc-query';
import { DocListItem, ITEM_CLASS } from './doc-list-item';

interface MobileDocSelectorProps {
  activeDocId: string;
  activeDocTitle: string;
}

export function MobileDocSelector({
  activeDocId,
  activeDocTitle,
}: MobileDocSelectorProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: docs, isLoading } = useDocuments();
  const createDoc = useCreateDocument();

  const displayTitle = activeDocTitle || 'Untitled';

  const allDocs = docs ?? [];
  const pinned = allDocs.filter((d) => d.pinnedAt !== null);
  const recent = allDocs.filter((d) => d.pinnedAt === null);

  function handleSelect(id: string) {
    navigate(`/docs/${id}`);
    setOpen(false);
  }

  function handleCreate() {
    createDoc.mutate(undefined, {
      onSuccess: (doc) => {
        navigate(`/docs/${doc.id}`);
        setOpen(false);
      },
    });
  }

  return (
    <div
      className="flex min-w-0 items-center gap-1"
      data-testid="mobile-doc-selector"
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-[44px] min-w-0 max-w-[280px] gap-1.5"
            data-testid="mobile-doc-selector-trigger"
          >
            <span className="truncate">{displayTitle}</span>
            <ChevronDown className="size-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner />
            </div>
          ) : (
            <>
              {pinned.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    Pinned
                  </div>
                  <div role="group" data-testid="mobile-doc-selector-pinned">
                    {pinned.map((doc) => (
                      <DocListItem
                        key={doc.id}
                        doc={doc}
                        isActive={doc.id === activeDocId}
                        onClick={() => handleSelect(doc.id)}
                      />
                    ))}
                  </div>
                  <hr className="my-1 border-border" />
                </>
              )}
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                Recent
              </div>
              <div role="group" data-testid="mobile-doc-selector-recent">
                {recent.length === 0 && pinned.length === 0 ? (
                  <div
                    className={cn(ITEM_CLASS, 'pointer-events-none opacity-50')}
                  >
                    <span className="text-muted-foreground">
                      No documents yet
                    </span>
                  </div>
                ) : (
                  recent.map((doc) => (
                    <DocListItem
                      key={doc.id}
                      doc={doc}
                      isActive={doc.id === activeDocId}
                      onClick={() => handleSelect(doc.id)}
                    />
                  ))
                )}
              </div>
              <hr className="my-1 border-border" />
              <button
                type="button"
                className={ITEM_CLASS}
                onClick={handleCreate}
                disabled={createDoc.isPending}
                data-testid="mobile-doc-selector-new"
              >
                <div className="flex items-center gap-2">
                  <Plus className="size-4" />
                  <span>New document</span>
                </div>
              </button>
            </>
          )}
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="icon"
        className="size-11 shrink-0"
        onClick={handleCreate}
        disabled={createDoc.isPending}
        aria-label="New document"
        data-testid="mobile-doc-selector-new-btn"
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}
