import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import './editor.css';

import type { Block } from '@blocknote/core';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { saveDocument } from '../_lib/docs-api';
import { docKeys } from '../_hooks/use-doc-query';

interface DocEditorProps {
  docId: string;
  initialContent: Block[];
  onSave: (content: Block[]) => void;
}

const DEBOUNCE_MS = 1500;

export function DocEditor({ docId, initialContent, onSave }: DocEditorProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Capture docId at mount so the unmount cleanup always targets the correct doc
  const docIdRef = useRef(docId);
  const queryClient = useQueryClient();

  const editor = useCreateBlockNote({
    initialContent: initialContent.length > 0 ? initialContent : undefined,
  });

  // Ref keeps beforeunload from closing over a stale callback
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  // Flush pending save on unmount (in-app navigation) instead of discarding it.
  // IMPORTANT: We call saveDocument() directly instead of going through
  // onSave/mutation. When switching docs, React unmounts the old editor AFTER
  // the parent re-renders with the new docId. TanStack Query's mutate() is
  // referentially stable but calls the latest mutationFn, which would save
  // old content to the NEW document — causing data corruption. The direct
  // API call with the captured docId avoids this entirely.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        saveDocument(docIdRef.current, {
          content: editor.document as unknown[],
        }).then(() => {
          queryClient.invalidateQueries({
            queryKey: docKeys.detail(docIdRef.current),
          });
        }).catch(() => {
          // Fire-and-forget — component is unmounting so we can't retry,
          // but log so the failed save isn't completely silent.
          console.error(`Failed to flush pending save for doc ${docIdRef.current}`);
        });
      }
    };
  }, []);

  // Block refresh/tab close when the debounce hasn't fired yet —
  // we can't flush here because the save is async
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (timerRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const handleChange = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSaveRef.current(editor.document);
      timerRef.current = null;
    }, DEBOUNCE_MS);
  }, [editor]);

  return (
    <div className="docs-editor flex-1 overflow-auto pl-0 pr-4 py-4">
      <BlockNoteView
        editor={editor}
        theme="dark"
        onChange={handleChange}
      />
    </div>
  );
}
