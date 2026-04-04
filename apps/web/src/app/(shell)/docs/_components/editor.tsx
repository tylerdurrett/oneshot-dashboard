import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import './editor.css';

import type { Block } from '@blocknote/core';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCallback, useEffect, useRef } from 'react';

interface DocEditorProps {
  initialContent: Block[];
  onSave: (content: Block[]) => void;
}

const DEBOUNCE_MS = 1500;

export function DocEditor({ initialContent, onSave }: DocEditorProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useCreateBlockNote({
    initialContent: initialContent.length > 0 ? initialContent : undefined,
  });

  // Ref keeps unmount/beforeunload from closing over a stale callback
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  // Flush pending save on unmount (in-app navigation) instead of discarding it
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        onSaveRef.current(editor.document);
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
