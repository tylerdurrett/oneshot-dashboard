import { getServerHttpUrl } from '@/lib/server-url';

export interface DocumentResponse {
  id: string;
  content: unknown[];
  createdAt: string;
  updatedAt: string;
}

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
