/**
 * MCP Server — Exposes One Shot operations (timers, docs) as Claude tools.
 *
 * Runs as a stdio MCP server inside the Docker sandbox. Calls the host's
 * REST API over HTTP via host.docker.internal.
 *
 * Bundled into a single .mjs file by esbuild (scripts/build-mcp-server.mjs).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { api, resolveOrError, textResult, errorResult, apiError } from './mcp-helpers.js';

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({ name: 'oneshot', version: '1.0.0' });

// -- get_timer_status -------------------------------------------------------

server.tool(
  'get_timer_status',
  "Get today's timer status — all active buckets with elapsed time, goals, and running state.",
  {},
  async () => {
    try {
      const res = await api('GET', '/timers/today');
      if (!res.ok) return apiError(res);
      return textResult(res.data);
    } catch (e) {
      return errorResult(`Timer server not reachable. Is the host app running? ${(e as Error).message}`);
    }
  },
);

// -- list_buckets -----------------------------------------------------------

server.tool(
  'list_buckets',
  'List all timer bucket configurations, including deactivated ones.',
  {},
  async () => {
    try {
      const res = await api('GET', '/timers/buckets');
      if (!res.ok) return apiError(res);
      return textResult(res.data);
    } catch (e) {
      return errorResult(`Timer server not reachable. ${(e as Error).message}`);
    }
  },
);

// -- start_timer ------------------------------------------------------------

server.tool(
  'start_timer',
  'Start a timer for a bucket. Automatically stops any other running timer. Accepts bucket name or ID.',
  { bucket: z.string().describe('Bucket name or ID') },
  async ({ bucket }) => {
    try {
      const resolved = await resolveOrError(bucket);
      if (resolved.error) return resolved.error;
      const res = await api('POST', `/timers/buckets/${resolved.id}/start`);
      if (!res.ok) return apiError(res);
      return textResult(res.data);
    } catch (e) {
      return errorResult(`Failed to start timer. ${(e as Error).message}`);
    }
  },
);

// -- stop_timer -------------------------------------------------------------

server.tool(
  'stop_timer',
  'Stop a running timer. Accepts bucket name or ID.',
  { bucket: z.string().describe('Bucket name or ID') },
  async ({ bucket }) => {
    try {
      const resolved = await resolveOrError(bucket);
      if (resolved.error) return resolved.error;
      const res = await api('POST', `/timers/buckets/${resolved.id}/stop`);
      if (!res.ok) return apiError(res);
      return textResult(res.data);
    } catch (e) {
      return errorResult(`Failed to stop timer. ${(e as Error).message}`);
    }
  },
);

// -- reset_timer ------------------------------------------------------------

server.tool(
  'reset_timer',
  "Reset a bucket's elapsed time to zero for today. Accepts bucket name or ID.",
  { bucket: z.string().describe('Bucket name or ID') },
  async ({ bucket }) => {
    try {
      const resolved = await resolveOrError(bucket);
      if (resolved.error) return resolved.error;
      const res = await api('POST', `/timers/buckets/${resolved.id}/reset`);
      if (!res.ok) return apiError(res);
      return textResult(res.data);
    } catch (e) {
      return errorResult(`Failed to reset timer. ${(e as Error).message}`);
    }
  },
);

// -- create_bucket ----------------------------------------------------------

server.tool(
  'create_bucket',
  'Create a new timer bucket with a name and daily goal.',
  {
    name: z.string().describe('Bucket display name'),
    totalMinutes: z.number().describe('Daily goal in minutes'),
    colorIndex: z.number().min(0).max(9).optional().describe('Color index 0-9'),
    daysOfWeek: z.array(z.number().min(0).max(6)).optional()
      .describe('Active days (0=Sun, 6=Sat). Defaults to weekdays [1,2,3,4,5].'),
    weeklySchedule: z.record(z.string(), z.number()).optional()
      .describe('Per-day minutes, e.g. {"1": 120, "3": 60}. Keys are day numbers 0-6.'),
  },
  async ({ name, totalMinutes, colorIndex, daysOfWeek, weeklySchedule }) => {
    try {
      const body: Record<string, unknown> = {
        name,
        totalMinutes,
        colorIndex: colorIndex ?? 0,
        daysOfWeek: daysOfWeek ?? [1, 2, 3, 4, 5],
      };
      if (weeklySchedule) body.weeklySchedule = weeklySchedule;
      const res = await api('POST', '/timers/buckets', body);
      if (!res.ok) return apiError(res);
      return textResult(res.data);
    } catch (e) {
      return errorResult(`Failed to create bucket. ${(e as Error).message}`);
    }
  },
);

// -- update_bucket ----------------------------------------------------------

server.tool(
  'update_bucket',
  "Update a bucket's settings. Accepts bucket name or ID. All fields optional.",
  {
    bucket: z.string().describe('Bucket name or ID'),
    name: z.string().optional().describe('New name'),
    totalMinutes: z.number().optional().describe('New daily goal in minutes'),
    colorIndex: z.number().min(0).max(9).optional().describe('New color index 0-9'),
    daysOfWeek: z.array(z.number().min(0).max(6)).optional()
      .describe('New active days (0=Sun, 6=Sat)'),
    weeklySchedule: z.record(z.string(), z.number()).optional()
      .describe('New per-day minutes schedule'),
  },
  async ({ bucket, ...updates }) => {
    try {
      const resolved = await resolveOrError(bucket);
      if (resolved.error) return resolved.error;
      const res = await api('PATCH', `/timers/buckets/${resolved.id}`, updates);
      if (!res.ok) return apiError(res);
      return textResult(res.data);
    } catch (e) {
      return errorResult(`Failed to update bucket. ${(e as Error).message}`);
    }
  },
);

// -- delete_bucket ----------------------------------------------------------

server.tool(
  'delete_bucket',
  'Permanently delete a bucket and all its history. Accepts bucket name or ID.',
  { bucket: z.string().describe('Bucket name or ID') },
  async ({ bucket }) => {
    try {
      const resolved = await resolveOrError(bucket);
      if (resolved.error) return resolved.error;
      const res = await api('DELETE', `/timers/buckets/${resolved.id}`);
      if (!res.ok) return apiError(res);
      return textResult(res.data);
    } catch (e) {
      return errorResult(`Failed to delete bucket. ${(e as Error).message}`);
    }
  },
);

// -- set_timer_time ---------------------------------------------------------

server.tool(
  'set_timer_time',
  "Manually set elapsed time for a bucket today. Accepts bucket name or ID.",
  {
    bucket: z.string().describe('Bucket name or ID'),
    elapsedSeconds: z.number().min(0).describe('New elapsed time in seconds'),
  },
  async ({ bucket, elapsedSeconds }) => {
    try {
      const resolved = await resolveOrError(bucket);
      if (resolved.error) return resolved.error;
      const res = await api('POST', `/timers/buckets/${resolved.id}/set-time`, { elapsedSeconds });
      if (!res.ok) return apiError(res);
      return textResult(res.data);
    } catch (e) {
      return errorResult(`Failed to set timer time. ${(e as Error).message}`);
    }
  },
);

// -- set_daily_goal ---------------------------------------------------------

server.tool(
  'set_daily_goal',
  "Override today's goal for a bucket (doesn't change the bucket's default). Accepts bucket name or ID.",
  {
    bucket: z.string().describe('Bucket name or ID'),
    targetMinutes: z.number().min(0).describe("Today's goal in minutes"),
  },
  async ({ bucket, targetMinutes }) => {
    try {
      const resolved = await resolveOrError(bucket);
      if (resolved.error) return resolved.error;
      const res = await api('POST', `/timers/buckets/${resolved.id}/set-daily-goal`, { targetMinutes });
      if (!res.ok) return apiError(res);
      return textResult(res.data);
    } catch (e) {
      return errorResult(`Failed to set daily goal. ${(e as Error).message}`);
    }
  },
);

// -- dismiss_bucket ---------------------------------------------------------

server.tool(
  'dismiss_bucket',
  'Dismiss a bucket for today — hides it until the next 3 AM reset. Stops the timer if running. Accepts bucket name or ID.',
  { bucket: z.string().describe('Bucket name or ID') },
  async ({ bucket }) => {
    try {
      const resolved = await resolveOrError(bucket);
      if (resolved.error) return resolved.error;
      const res = await api('POST', `/timers/buckets/${resolved.id}/dismiss`);
      if (!res.ok) return apiError(res);
      return textResult(res.data);
    } catch (e) {
      return errorResult(`Failed to dismiss bucket. ${(e as Error).message}`);
    }
  },
);

// ===========================================================================
// Doc Tools
// ===========================================================================

// -- get_current_doc --------------------------------------------------------

server.tool(
  'get_current_doc',
  "Get the doc the user is currently viewing — returns title and full markdown content.",
  {},
  async () => {
    try {
      const res = await api('GET', '/docs/active');
      if (!res.ok) {
        return textResult(
          'No doc is currently open. Use list_docs to see available docs.',
        );
      }
      const { title, markdown } = res.data as { title: string; markdown: string };
      return { content: [{ type: 'text' as const, text: `# ${title}\n\n${markdown}` }] };
    } catch (e) {
      return errorResult(`Failed to get current doc. ${(e as Error).message}`);
    }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
