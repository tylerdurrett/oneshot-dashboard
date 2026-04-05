import { getServerHttpUrl } from '@/lib/server-url';

export interface DocumentResponse {
  id: string;
  title: string;
  content: unknown[];
  workspaceId: string | null;
  folderId: string | null;
  pinnedAt: string | null;
  pipelineEnabled: boolean;
  processedAt: string | null;
  isTitleManual: boolean;
  titleGeneratedFromBlockIds: string[] | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Legacy endpoints (backward compat — remove when Phase 3.2 migrates callers)
// ---------------------------------------------------------------------------

export async function fetchDefaultDocument(): Promise<DocumentResponse> {
  const res = await fetch(`${getServerHttpUrl()}/docs/default`);
  if (!res.ok) throw new Error(`Failed to fetch document: ${res.status}`);
  const data: { document: DocumentResponse } = await res.json();
  return data.document;
}

export async function saveDocumentContent(
  content: unknown[],
): Promise<DocumentResponse> {
  const res = await fetch(`${getServerHttpUrl()}/docs/default`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Failed to save document: ${res.status}`);
  const data: { document: DocumentResponse } = await res.json();
  return data.document;
}

// ---------------------------------------------------------------------------
// Multi-doc endpoints
// ---------------------------------------------------------------------------

export async function fetchDocuments(): Promise<DocumentResponse[]> {
  const res = await fetch(`${getServerHttpUrl()}/docs`);
  if (!res.ok) throw new Error(`Failed to fetch documents: ${res.status}`);
  const data: { documents: DocumentResponse[] } = await res.json();
  return data.documents;
}

export async function fetchRecentDocument(): Promise<DocumentResponse> {
  const res = await fetch(`${getServerHttpUrl()}/docs/recent`);
  if (!res.ok) throw new Error(`Failed to fetch recent document: ${res.status}`);
  const data: { document: DocumentResponse } = await res.json();
  return data.document;
}

export async function fetchDocument(id: string): Promise<DocumentResponse> {
  const res = await fetch(`${getServerHttpUrl()}/docs/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch document: ${res.status}`);
  const data: { document: DocumentResponse } = await res.json();
  return data.document;
}

export async function createDocument(title?: string): Promise<DocumentResponse> {
  const res = await fetch(`${getServerHttpUrl()}/docs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to create document: ${res.status}`);
  const data: { document: DocumentResponse } = await res.json();
  return data.document;
}

export async function generateTitle(id: string): Promise<DocumentResponse> {
  const res = await fetch(`${getServerHttpUrl()}/docs/${id}/generate-title`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to generate title: ${res.status}`);
  const data: { document: DocumentResponse } = await res.json();
  return data.document;
}

export async function saveDocument(
  id: string,
  fields: { content?: unknown[]; title?: string; isTitleManual?: boolean },
): Promise<DocumentResponse> {
  const res = await fetch(`${getServerHttpUrl()}/docs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Failed to save document: ${res.status}`);
  const data: { document: DocumentResponse } = await res.json();
  return data.document;
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${getServerHttpUrl()}/docs/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete document: ${res.status}`);
}

export async function pinDocument(id: string): Promise<DocumentResponse> {
  const res = await fetch(`${getServerHttpUrl()}/docs/${id}/pin`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to pin document: ${res.status}`);
  const data: { document: DocumentResponse } = await res.json();
  return data.document;
}

export async function unpinDocument(id: string): Promise<DocumentResponse> {
  const res = await fetch(`${getServerHttpUrl()}/docs/${id}/pin`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to unpin document: ${res.status}`);
  const data: { document: DocumentResponse } = await res.json();
  return data.document;
}

// ---------------------------------------------------------------------------
// Active doc tracking
// ---------------------------------------------------------------------------

/** Fire-and-forget — tells the server which doc the user is viewing. */
export async function reportActiveDoc(
  docId: string,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${getServerHttpUrl()}/docs/active`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId }),
    signal,
  });
  if (!res.ok) throw new Error(`Failed to report active doc: ${res.status}`);
}
