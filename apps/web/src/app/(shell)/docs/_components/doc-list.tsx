import { useParams, useNavigate } from 'react-router';
import { Spinner } from '@repo/ui';
import { useDocuments } from '../_hooks/use-doc-query';
import { DocListItem } from './doc-list-item';
import { DocItemContextMenu } from './doc-item-context-menu';

export function DocList() {
  const params = useParams() as { docId?: string };
  const navigate = useNavigate();
  const { data: docs, isLoading } = useDocuments();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="doc-list-loading">
        <Spinner />
      </div>
    );
  }

  const allDocs = docs ?? [];
  const pinned = allDocs.filter((d) => d.pinnedAt !== null);
  const recent = allDocs.filter((d) => d.pinnedAt === null);
  const isLastDoc = allDocs.length === 1;

  if (allDocs.length === 0) {
    return (
      <div className="px-2 py-4 text-center text-sm text-muted-foreground" data-testid="doc-list-empty">
        No documents yet
      </div>
    );
  }

  return (
    <div data-testid="doc-list">
      {pinned.length > 0 && (
        <>
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            Pinned
          </div>
          <div role="group" data-testid="doc-list-pinned">
            {pinned.map((doc) => (
              <DocItemContextMenu
                key={doc.id}
                doc={doc}
                isLastDoc={isLastDoc}
                isActiveDoc={doc.id === params.docId}
              >
                <DocListItem
                  doc={doc}
                  isActive={doc.id === params.docId}
                  onClick={() => navigate(`/docs/${doc.id}`)}
                />
              </DocItemContextMenu>
            ))}
          </div>
          <hr className="my-1 border-border" />
        </>
      )}
      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
        Recent
      </div>
      <div role="group" data-testid="doc-list-recent">
        {recent.map((doc) => (
          <DocItemContextMenu
            key={doc.id}
            doc={doc}
            isLastDoc={isLastDoc}
            isActiveDoc={doc.id === params.docId}
          >
            <DocListItem
              doc={doc}
              isActive={doc.id === params.docId}
              onClick={() => navigate(`/docs/${doc.id}`)}
            />
          </DocItemContextMenu>
        ))}
      </div>
    </div>
  );
}
