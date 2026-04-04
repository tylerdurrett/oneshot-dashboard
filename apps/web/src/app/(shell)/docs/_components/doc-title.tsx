import { useCallback, useEffect, useRef, useState } from 'react';

interface DocTitleProps {
  title: string;
  onSave: (title: string) => void;
}

const DEBOUNCE_MS = 1500;

/**
 * Inline editable document title — renders as a large heading-style input
 * above the editor. Debounced save on change (same 1500ms as the editor).
 * Blurs on Enter so the user can quickly dismiss and start typing content.
 */
export function DocTitle({ title, onSave }: DocTitleProps) {
  const [value, setValue] = useState(title);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  const valueRef = useRef(value);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Keep a ref to the latest value so the unmount cleanup can flush it
  valueRef.current = value;

  // Sync from prop when the doc changes (e.g. navigating to a different doc)
  useEffect(() => {
    setValue(title);
  }, [title]);

  // Flush pending save on unmount (in-app navigation)
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        onSaveRef.current(valueRef.current);
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
