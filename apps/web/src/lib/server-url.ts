/** Shared helpers for constructing server URLs that work over localhost, Tailscale, and LAN.
 *  Protocol is derived from the current page so HTTPS pages use wss:// and https://
 *  automatically (e.g. when accessed via Tailscale HTTPS or a reverse proxy). */

function getPort(): string {
  return import.meta.env.VITE_SERVER_PORT ?? '4902';
}

function getHost(): string {
  return typeof window !== 'undefined' ? window.location.hostname : 'localhost';
}

/** true when the page was loaded over HTTPS */
function isSecure(): boolean {
  return typeof window !== 'undefined' && window.location.protocol === 'https:';
}

export function getServerHttpUrl(): string {
  const scheme = isSecure() ? 'https' : 'http';
  return `${scheme}://${getHost()}:${getPort()}`;
}

export function getServerWsUrl(path: string): string {
  const scheme = isSecure() ? 'wss' : 'ws';
  return `${scheme}://${getHost()}:${getPort()}${path}`;
}
