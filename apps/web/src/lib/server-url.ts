/** Shared helpers for constructing server URLs that work over localhost, Tailscale, and LAN. */

const port = process.env.NEXT_PUBLIC_SERVER_PORT ?? '4902';

function getHost(): string {
  return typeof window !== 'undefined' ? window.location.hostname : 'localhost';
}

export function getServerHttpUrl(): string {
  return `http://${getHost()}:${port}`;
}

export function getServerWsUrl(path: string): string {
  return `ws://${getHost()}:${port}${path}`;
}
