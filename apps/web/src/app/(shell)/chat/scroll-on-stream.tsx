import { useEffect, useRef } from 'react';
import { useStickToBottomContext } from '@repo/ui';

/**
 * Triggers scrollToBottom when streaming starts. Placed inside a
 * <Conversation> so it has access to the StickToBottom context.
 */
export function ScrollOnStream({ isStreaming }: { isStreaming: boolean }) {
  const { scrollToBottom } = useStickToBottomContext();
  const prevRef = useRef(false);

  useEffect(() => {
    if (isStreaming && !prevRef.current) {
      scrollToBottom();
    }
    prevRef.current = isStreaming;
  }, [isStreaming, scrollToBottom]);

  return null;
}
