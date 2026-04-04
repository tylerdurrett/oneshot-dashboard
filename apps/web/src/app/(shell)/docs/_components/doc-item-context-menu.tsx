import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Pin, PinOff, Trash2 } from 'lucide-react';
import {
  ConfirmationDialog,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@repo/ui';
import type { DocumentResponse } from '../_lib/docs-api';
import {
  usePinDocument,
  useUnpinDocument,
  useDeleteDocument,
} from '../_hooks/use-doc-query';

interface DocItemContextMenuProps {
  doc: DocumentResponse;
  isLastDoc: boolean;
  isActiveDoc: boolean;
  children: React.ReactNode;
}

/**
 * Wraps a doc list item with a right-click (desktop) / long-press (mobile)
 * context menu providing Pin/Unpin and Delete actions.
 */
export function DocItemContextMenu({
  doc,
  isLastDoc,
  isActiveDoc,
  children,
}: DocItemContextMenuProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const navigate = useNavigate();
  const pinMutation = usePinDocument();
  const unpinMutation = useUnpinDocument();
  const deleteMutation = useDeleteDocument();

  const isPinned = doc.pinnedAt !== null;

  function handleTogglePin() {
    if (isPinned) {
      unpinMutation.mutate(doc.id);
    } else {
      pinMutation.mutate(doc.id);
    }
  }

  function handleDeleteConfirm() {
    deleteMutation.mutate(doc.id, {
      onSuccess: () => {
        setShowDeleteConfirm(false);
        // If the deleted doc was the one currently being viewed,
        // redirect to /docs which auto-navigates to the most recent doc.
        if (isActiveDoc) {
          navigate('/docs', { replace: true });
        }
      },
    });
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={handleTogglePin}>
            {isPinned ? (
              <>
                <PinOff className="size-4" />
                Unpin
              </>
            ) : (
              <>
                <Pin className="size-4" />
                Pin
              </>
            )}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            disabled={isLastDoc}
            onSelect={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="size-4" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <ConfirmationDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete document?"
        description={`"${doc.title || 'Untitled'}" will be permanently deleted. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}
