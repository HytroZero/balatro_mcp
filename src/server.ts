import { resolve } from 'node:path';
import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { errorEnvelope, record, type Backend } from '../env/contract.ts';
import { ForgeBridgeBackend } from '../play/client.ts';
import { Trace } from '../model/trace.ts';
import { registerGameTools } from '../tools/index.ts';
import type { Options } from './config.ts';
import { loadGameplayContext, registerGameplayResources } from './context.ts';
import { nextId } from './ids.ts';

const envelopeSchema = z.object({
  ok: z.boolean(), value: z.unknown().optional(), code: z.string().optional(),
  applied: z.union([z.boolean(), z.literal('unknown')]).optional(), message: z.string().optional(),
}).strict();

function failure(error: unknown): CallToolResult {
  const structuredContent = errorEnvelope(error);
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
}

/** A process owns one tool context; serialize game access, with analysis computing outside it. */
export async function createBalatroServer(options: Options, backend: Backend = new ForgeBridgeBackend(options.endpoint, options.timeoutMs)) {
  const context = await loadGameplayContext();
  const trace = new Trace(resolve(options.dataDir, 'traces', nextId('trace') + '.jsonl'));
  await trace.init();
  const server = new McpServer({ name: 'balatro-mcp-server', version: '0.1.0' }, {
    instructions: context.instructions,
  });
  let pending: Promise<unknown> = Promise.resolve();
  function sequential<T>(operation: () => Promise<T>): Promise<T> {
    const next = pending.then(operation);
    pending = next.catch(() => {});
    return next;
  }
  const tools = registerGameTools(server, backend, trace, sequential, options.timeoutMs);
  if (backend instanceof ForgeBridgeBackend) {
    server.registerTool('game_health', {
      title: 'Game bridge health', description: 'Read bridge identity, version, capabilities and readiness. Does not start a run.',
      inputSchema: z.object({}).strict(), outputSchema: envelopeSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async (_params,context) => sequential(async () => {
      try {
        const value = await backend.diagnose({signal:context.mcpReq.signal,deadline:performance.now() + options.timeoutMs});
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, value }) }], structuredContent: { ok: true, value } };
      } catch (error) { return failure(error); }
    }));
    server.registerTool('game_operation', {
      title: 'Inspect game operation', description: 'Inspect a pending/completed/failed action; omit actionId for this connection\'s last action. Never replays an action or clears its mutation lock. Recovery: balatro://protocol.',
      inputSchema: z.object({ actionId: z.string().min(1).optional() }).strict(), outputSchema: envelopeSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ actionId },context) => sequential(async () => {
      try {
        const value = await backend.inspectOperation(actionId,{signal:context.mcpReq.signal,deadline:performance.now() + options.timeoutMs});
        // Completed operations carry a raw snapshot, including seeds from older mods.
        const observation = record(value.observation);
        if (observation.terminal !== true && observation.outcome !== 'won' && observation.outcome !== 'lost' && observation.state) {
          const state = { ...record(observation.state) };
          delete state.seed;
          value.observation = { ...observation, state };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, value }) }], structuredContent: { ok: true, value } };
      } catch (error) { return failure(error); }
    }));
  }
  registerGameplayResources(server, context);
  return { server, async close() { await pending; await server.close(); await tools.close(); await backend.close(); await trace.flush().catch(() => {}); } };
}
