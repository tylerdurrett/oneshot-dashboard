import { useCallback } from 'react';
import type { Block } from '@blocknote/core';
import { Spinner } from '@repo/ui';
import { useDefaultDocument, useSaveDocument } from './_hooks/use-doc-query';
import { DocEditor } from './_components/editor';

export default function DocsPage() {
  const { data: doc, isLoading, error } = useDefaultDocument();
  const saveMutation = useSaveDocument();

  const handleSave = useCallback(
    (content: Block[]) => {
      saveMutation.mutate(content as unknown[]);
    },
    [saveMutation],
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-destructive">Failed to load document.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <DocEditor
        initialContent={doc.content as Block[]}
        onSave={handleSave}
      />
    </div>
  );
}
