import { useCallback, useEffect, useRef } from 'react';
import type { Block } from '@blocknote/core';
import type { DocumentResponse } from '../_lib/docs-api';
import { useGenerateTitle } from './use-doc-query';

const DEBOUNCE_MS = 12_000;

// ---------------------------------------------------------------------------
// Text extraction (typed frontend version — operates on Block[], not unknown[])
// ---------------------------------------------------------------------------

/** Extract plain text from typed BlockNote Block objects. */
export function extractTextFromBlocks(blocks: Block[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    if (Array.isArray(block.content)) {
      for (const inline of block.content) {
        if (inline.type === 'text') {
          parts.push(inline.text);
        } else if (inline.type === 'link') {
          for (const span of inline.content) {
            parts.push(span.text);
          }
        }
      }
    }

    if (block.children.length > 0) {
      const childText = extractTextFromBlocks(block.children);
      if (childText) parts.push(childText);
    }
  }

  return parts.join(' ');
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseAutoTitleOptions {
  docId: string;
  doc: DocumentResponse | undefined;
  enabled: boolean;
}

export function useAutoTitle({ docId, doc, enabled }: UseAutoTitleOptions) {
  const generateMutation = useGenerateTitle(docId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blocksRef = useRef<Block[]>([]);

  // Refs keep the timer callback reading fresh values without causing
  // notifyContentChange identity churn on every render.
  const docRef = useRef(doc);
  docRef.current = doc;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const mutateRef = useRef(generateMutation.mutate);
  mutateRef.current = generateMutation.mutate;

  // Clean up timer on unmount or docId change
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [docId]);

  const notifyContentChange = useCallback(
    (blocks: Block[]) => {
      blocksRef.current = blocks;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (!enabledRef.current || !docRef.current) return;

      timerRef.current = setTimeout(() => {
        timerRef.current = null;

        const latestDoc = docRef.current;
        if (!latestDoc) return;

        // Guard: never auto-title manually titled docs
        if (latestDoc.isTitleManual) return;

        const latestBlocks = blocksRef.current;
        const text = extractTextFromBlocks(latestBlocks);
        const wordCount = countWords(text);
        const blockCount = latestBlocks.length;

        // Guard: content below threshold (fewer than 50 words AND fewer than 3 blocks)
        if (wordCount < 50 && blockCount < 3) return;

        // Re-title check: if we already generated a title, only regenerate on
        // significant changes (>50% blocks changed or 2x+ block count).
        if (latestDoc.titleGeneratedFromBlockIds) {
          const storedIds = latestDoc.titleGeneratedFromBlockIds;
          const currentIds = latestBlocks.map((b) => b.id);

          const storedSet = new Set(storedIds);
          const overlapCount = currentIds.filter((id) => storedSet.has(id)).length;
          const overlapRatio = storedIds.length > 0 ? overlapCount / storedIds.length : 0;
          const sizeRatio = storedIds.length > 0 ? currentIds.length / storedIds.length : Infinity;

          if (overlapRatio >= 0.5 && sizeRatio < 2) return;
        }

        mutateRef.current();
      }, DEBOUNCE_MS);
    },
    // Stable — all changing values read from refs
    [],
  );

  return { notifyContentChange };
}
