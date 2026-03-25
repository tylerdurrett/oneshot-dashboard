interface ChatErrorBannerProps {
  error: string;
  onDismiss: () => void;
}

/** Inline dismissible error banner for chat pages. */
export function ChatErrorBanner({ error, onDismiss }: ChatErrorBannerProps) {
  return (
    <div
      role="alert"
      className="mx-4 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <span className="flex-1">
        {/sandbox|offline/i.test(error)
          ? 'Agent is offline. Check the Docker sandbox.'
          : error}
      </span>
      <button
        onClick={onDismiss}
        className="shrink-0 text-destructive/70 hover:text-destructive"
        aria-label="Dismiss error"
      >
        &times;
      </button>
    </div>
  );
}
