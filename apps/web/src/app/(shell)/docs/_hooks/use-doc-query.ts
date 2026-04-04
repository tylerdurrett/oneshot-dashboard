import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchDefaultDocument, saveDocumentContent } from '../_lib/docs-api';

export const docKeys = {
  default: ['docs', 'default'] as const,
};

export function useDefaultDocument() {
  return useQuery({
    queryKey: docKeys.default,
    queryFn: fetchDefaultDocument,
  });
}

export function useSaveDocument() {
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
