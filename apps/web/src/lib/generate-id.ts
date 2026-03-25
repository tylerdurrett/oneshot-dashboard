/**
 * Generate a unique ID string. Uses crypto.randomUUID() when available
 * (secure contexts: HTTPS / localhost), falls back to Math.random() for
 * plain-HTTP LAN/Tailscale access where crypto.randomUUID is undefined.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
