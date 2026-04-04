import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchDefaultDocument,
  saveDocumentContent,
  fetchDocuments,
  fetchRecentDocument,
  fetchDocument,
  createDocument,
  saveDocument,
  deleteDocument,
  pinDocument,
  unpinDocument,
} from '../_lib/docs-api';
import type { DocumentResponse } from '../_lib/docs-api';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const docKeys = {
  /** Legacy key — remove when Phase 3.2 migrates callers. */
  default: ['docs', 'default'] as const,
  list: ['docs', 'list'] as const,
  detail: (id: string) => ['docs', 'detail', id] as const,
  recent: ['docs', 'recent'] as const,
};

// ---------------------------------------------------------------------------
// Legacy hooks (backward compat — remove when Phase 3.2 migrates callers)
// ---------------------------------------------------------------------------

export function useDefaultDocument() {
  return useQuery({
    queryKey: docKeys.default,
    queryFn: fetchDefaultDocument,
  });
}

export function useSaveDefaultDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: unknown[]) => saveDocumentContent(content),
    onSuccess: (data) => {
      // Update cache directly — avoids a redundant GET and prevents
      // the editor from re-rendering with fetched data mid-typing.
      queryClient.setQueryData(docKeys.default, data);
    },
  });
}

// ---------------------------------------------------------------------------
// Multi-doc query hooks
// ---------------------------------------------------------------------------

export function useDocuments() {
  return useQuery({
    queryKey: docKeys.list,
    queryFn: fetchDocuments,
  });
}

export function useRecentDocument() {
  return useQuery({
    queryKey: docKeys.recent,
    queryFn: fetchRecentDocument,
  });
}

export function useDocument(id: string | null) {
  return useQuery({
    queryKey: docKeys.detail(id!),
    queryFn: () => fetchDocument(id!),
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Multi-doc mutation hooks
// ---------------------------------------------------------------------------

export function useSaveDocument(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fields: { content?: unknown[]; title?: string }) =>
      saveDocument(id, fields),
    onSuccess: (data) => {
      // Update detail cache directly — avoids a redundant GET and prevents
      // the editor from re-rendering with fetched data mid-typing.
      queryClient.setQueryData(docKeys.detail(id), data);
      queryClient.invalidateQueries({ queryKey: docKeys.list });
    },
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (title?: string) => createDocument(title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: docKeys.list });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: docKeys.list });
      queryClient.removeQueries({ queryKey: docKeys.detail(id) });
    },
  });
}

export function usePinDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => pinDocument(id),
    onSuccess: (data, id) => {
      queryClient.setQueryData(docKeys.detail(id), data);
      queryClient.invalidateQueries({ queryKey: docKeys.list });
    },
  });
}

export function useUnpinDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => unpinDocument(id),
    onSuccess: (data, id) => {
      queryClient.setQueryData(docKeys.detail(id), data);
      queryClient.invalidateQueries({ queryKey: docKeys.list });
    },
  });
}

// Re-export types for convenience
export type { DocumentResponse };
