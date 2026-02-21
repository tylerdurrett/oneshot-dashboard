import { describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';

describe('GET /health', () => {
  it('returns status ok', async () => {
    const server = buildServer({ logger: false });

    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });

    await server.close();
  });
});
