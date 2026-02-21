/**
 * Re-export @fastify/websocket for centralized configuration.
 * Register directly via `server.register(websocket)` in buildServer()
 * to avoid encapsulation issues with Fastify's plugin system.
 */
export { default as websocket } from '@fastify/websocket';
