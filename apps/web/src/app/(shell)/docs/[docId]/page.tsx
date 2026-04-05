import { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import type { Block } from '@blocknote/core';
import { Button, Spinner } from '@repo/ui';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useDocument, useSaveDocument } from '../_hooks/use-doc-query';
import { useAutoTitle } from '../_hooks/use-auto-title';
import { DocEditor } from '../_components/editor';
import { DocTitle } from '../_components/doc-title';
import { DocsLayout } from '../_components/docs-layout';
import { MobileDocSelector } from '../_components/mobile-doc-selector';

/**
 * Single-doc view — loads a document by ID from the URL param (desktop) or
 * a passed prop (mobile, where the SwipeView mounts DocsPage which extracts
 * the docId from the URL and renders this component inline).
 */
export default function DocViewPage({ docId: docIdProp }: { docId?: string }) {
  const params = useParams() as { docId?: string };
  const docId = docIdProp ?? params.docId!;
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const { data: doc, isLoading, isError, error } = useDocument(docId);
  const saveMutation = useSaveDocument(docId);
  const { notifyContentChange } = useAutoTitle({ docId, doc, enabled: !!doc });

  const handleSave = useCallback(
    (content: Block[]) => {
      saveMutation.mutate({ content: content as unknown[] });
    },
    [saveMutation.mutate],
  );

  const handleSaveTitle = useCallback(
    (title: string) => {
      saveMutation.mutate({ title, isTitleManual: true });
    },
    [saveMutation.mutate],
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // 404 or other fetch error
  const is404 = isError && /404/.test(error?.message ?? '');
  if (is404) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <h2 className="text-lg font-semibold">Document not found</h2>
        <p className="text-sm text-muted-foreground">
          This document doesn&apos;t exist or may have been deleted.
        </p>
        <Button onClick={() => navigate('/docs', { replace: true })}>
          Go to recent doc
        </Button>
      </div>
    );
  }

  if (isError || !doc) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-destructive">Failed to load document.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {isMobile && (
        <div className="flex items-center border-b border-border px-2 py-1">
          <MobileDocSelector activeDocId={docId} activeDocTitle={doc.title} />
        </div>
      )}
      <DocsLayout>
        <div className="flex flex-1 flex-col overflow-hidden pt-6">
          <DocTitle key={`title-${docId}`} docId={docId} title={doc.title} onSave={handleSaveTitle} />
          {/* key forces editor remount when switching docs so BlockNote
              reinitializes with the new document's content */}
          <DocEditor
            key={docId}
            docId={docId}
            initialContent={doc.content as Block[]}
            onSave={handleSave}
            onContentChange={notifyContentChange}
          />
        </div>
      </DocsLayout>
    </div>
  );
}
