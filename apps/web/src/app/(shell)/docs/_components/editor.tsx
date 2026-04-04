import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

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

  // Clear pending save on unmount to avoid firing on a stale component
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSave(editor.document);
    }, DEBOUNCE_MS);
  }, [editor, onSave]);

  return (
    <BlockNoteView
      editor={editor}
      theme="dark"
      onChange={handleChange}
    />
  );
}
