import { useEffect } from 'react';
import { APP_TITLE } from '@/app/route-metadata';

/**
 * Sets the browser tab title. Appends the app name as a suffix.
 * Example: useDocumentTitle('Timers') → "Timers — Tdog Dashboard"
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} — ${APP_TITLE}`;
    // Restore base title when the page unmounts so un-hooked routes don't show stale titles.
    return () => { document.title = APP_TITLE; };
  }, [title]);
}
