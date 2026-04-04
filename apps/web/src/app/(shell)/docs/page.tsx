import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Spinner } from '@repo/ui';
import { useRecentDocument } from './_hooks/use-doc-query';
import DocViewPage from './[docId]/page';

/** Matches /docs/:docId but not /docs/chat */
const DOC_ID_RE = /^\/docs\/([^/]+)$/;

/**
 * Extract a document ID from a /docs/:docId pathname.
 * Returns null for /docs, /docs/chat, or any non-matching path.
 */
export function extractDocId(pathname: string): string | null {
  const match = DOC_ID_RE.exec(pathname);
  if (!match) return null;
  // "chat" is a sibling route, not a doc ID
  if (match[1] === 'chat') return null;
  return match[1] ?? null;
}

/**
 * Docs entry page — serves two roles:
 *
 * 1. **Desktop (React Router):** Fetches the most recently edited document
 *    and redirects to `/docs/:id`. Only runs when the URL is exactly `/docs`.
 *
 * 2. **Mobile (SwipeView):** The SwipeView always mounts this component for
 *    the docs page slot. When the URL is `/docs/:docId`, it renders
 *    DocViewPage inline (same pattern as MobileChatView rendering ThreadPage).
 *    When the URL is `/docs`, it redirects to the most recent doc.
 */
export default function DocsPage() {
  const { pathname } = useLocation();
  const docId = extractDocId(pathname);

  // If URL already contains a docId, render the doc view directly.
  // This path is only hit on mobile — on desktop, React Router renders
  // DocViewPage via the /docs/:docId route instead.
  if (docId) {
    return <DocViewPage docId={docId} />;
  }

  // No docId in URL — redirect to most recent doc
  return <DocsRedirect />;
}

/**
 * Fetches the most recently edited document and navigates to its URL.
 * Shows a spinner during the fetch. The server auto-creates a document
 * if none exist, so this always resolves to a valid doc.
 */
function DocsRedirect() {
  const navigate = useNavigate();
  const { data: doc, isLoading, isError } = useRecentDocument();

  useEffect(() => {
    if (doc) {
      navigate(`/docs/${doc.id}`, { replace: true });
    }
  }, [doc, navigate]);

  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-destructive">Failed to load documents.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <Spinner />
    </div>
  );
}
