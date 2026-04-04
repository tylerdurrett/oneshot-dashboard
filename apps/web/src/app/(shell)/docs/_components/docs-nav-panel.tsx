import { useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { Button } from '@repo/ui';
import { useCreateDocument } from '../_hooks/use-doc-query';
import { DocList } from './doc-list';

/**
 * Left sidebar panel for the docs area on desktop. Shows a header bar with
 * a "+" button to create new documents and the doc list below.
 */
export function DocsNavPanel() {
  const createDoc = useCreateDocument();
  const navigate = useNavigate();

  function handleCreate() {
    createDoc.mutate(undefined, {
      onSuccess: (doc) => {
        navigate(`/docs/${doc.id}`);
      },
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold text-muted-foreground">
          Documents
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={handleCreate}
          disabled={createDoc.isPending}
          aria-label="New document"
          data-testid="docs-nav-new-btn"
        >
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        <DocList />
      </div>
    </div>
  );
}
