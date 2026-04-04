/**
 * Converts a timestamp to a relative time string.
 * Accepts an ISO 8601 string or a Unix timestamp in seconds.
 * Examples: "just now", "2m ago", "3h ago", "5d ago", "2w ago"
 */
export function formatTimeAgo(timestamp: string | number): string {
  const now = Date.now();
  const ms = typeof timestamp === 'string'
    ? new Date(timestamp).getTime()
    : timestamp * 1000;

  if (Number.isNaN(ms)) return '';

  const diffMs = now - ms;

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(days / 365);
  return `${years}y ago`;
}
