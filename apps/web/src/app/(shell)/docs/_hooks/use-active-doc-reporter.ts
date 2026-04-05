import { useEffect } from 'react';
import { reportActiveDoc } from '../_lib/docs-api';

/**
 * Reports the currently viewed doc to the server so the chat agent can
 * answer questions about "this doc". Fire-and-forget — failures are silent.
 */
export function useActiveDocReporter(docId: string) {
  useEffect(() => {
    const controller = new AbortController();
    reportActiveDoc(docId, controller.signal).catch(() => {});
    return () => controller.abort();
  }, [docId]);
}
