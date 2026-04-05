import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { saveDocument } from '../_lib/docs-api';
import { docKeys } from '../_hooks/use-doc-query';

interface DocTitleProps {
  docId: string;
  title: string;
  onSave: (title: string) => void;
}

const DEBOUNCE_MS = 1500;

/**
 * Inline editable document title — renders as a large heading-style input
 * above the editor. Debounced save on change (same 1500ms as the editor).
 * Blurs on Enter so the user can quickly dismiss and start typing content.
 */
export function DocTitle({ docId, title, onSave }: DocTitleProps) {
  const [value, setValue] = useState(title);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  const valueRef = useRef(value);
  // Capture docId at mount so the unmount cleanup always targets the correct doc
  const docIdRef = useRef(docId);
  const queryClient = useQueryClient();

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Keep a ref to the latest value so the unmount cleanup can flush it
  valueRef.current = value;

  // Sync from prop when the doc changes (e.g. navigating to a different doc)
  useEffect(() => {
    setValue(title);
  }, [title]);

  // Flush pending save on unmount (in-app navigation).
  // IMPORTANT: We call saveDocument() directly instead of going through
  // onSave/mutation. When switching docs, React unmounts the old title AFTER
  // the parent re-renders with the new docId. TanStack Query's mutate() is
  // referentially stable but calls the latest mutationFn, which would save
  // the old title to the NEW document — causing data corruption. The direct
  // API call with the captured docId avoids this entirely.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        saveDocument(docIdRef.current, { title: valueRef.current, isTitleManual: true }).then(() => {
          queryClient.invalidateQueries({
            queryKey: docKeys.detail(docIdRef.current),
          });
        }).catch(() => {
          // Fire-and-forget — component is unmounting so we can't retry,
          // but log so the failed save isn't completely silent.
          console.error(`Failed to flush pending title save for doc ${docIdRef.current}`);
        });
      }
    };
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setValue(next);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onSaveRef.current(next);
        timerRef.current = null;
      }, DEBOUNCE_MS);
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.currentTarget.blur();
      }
    },
    [],
  );

  return (
    <input
      type="text"
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder="Untitled"
      className="w-full bg-transparent text-2xl font-bold text-foreground outline-none placeholder:text-muted-foreground/50 px-[54px] pt-4 pb-1"
      spellCheck={false}
    />
  );
}
