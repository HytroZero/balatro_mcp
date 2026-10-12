import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { errorEnvelope, type Backend } from '../env/contract.ts';
import { ForgeBridgeBackend } from '../play/client.ts';
import { Trace } from '../model/trace.ts';
import { registerGameTools } from '../tools/index.ts';
import { projectRoot, type Options } from './config.ts';
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

/** A process owns one tool context; serialize calls and game mutations. */
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
  registerGameTools(server, backend, trace, sequential, options.timeoutMs);
  if (backend instanceof ForgeBridgeBackend) {
    server.registerTool('game_health', {
      title: 'Game bridge health', description: 'Read mod identity, game version, Lua runtime, capabilities and readiness/notReadyReason. decision_state capability indicates extended decision fields. Does not start a run. Returns {ok,value} or {ok:false,code,applied,message}.',
      inputSchema: z.object({}).strict(), outputSchema: envelopeSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async (_params,context) => sequential(async () => {
      try {
        const value = await backend.diagnose({signal:context.mcpReq.signal,deadline:performance.now() + options.timeoutMs});
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, value }) }], structuredContent: { ok: true, value } };
      } catch (error) { return failure(error); }
    }));
    server.registerTool('game_operation', {
      title: 'Inspect game operation', description: 'Read a pending/completed/failed action after an uncertain outcome. Omit actionId to inspect this connection\'s last action. Inspection never repeats an action or clears a mutation lock. Returns {ok,value} or a structured error.',
      inputSchema: z.object({ actionId: z.string().min(1).optional() }).strict(), outputSchema: envelopeSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ actionId },context) => sequential(async () => {
      try {
        const value = await backend.inspectOperation(actionId,{signal:context.mcpReq.signal,deadline:performance.now() + options.timeoutMs});
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, value }) }], structuredContent: { ok: true, value } };
      } catch (error) { return failure(error); }
    }));
  }
  server.registerResource('gameplay-guide', 'balatro://guide', {
    title: 'Tool and state guide', mimeType: 'text/markdown',
    description: 'The field contract of this server: every state key, how to merge game_action results, worked examples, and recovery after timeouts and uncertain outcomes. Starts with installation notes for people.',
  }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: await readFile(resolve(projectRoot, 'docs/tool-guide.md'), 'utf8') }] }));
  registerGameplayResources(server, context);
  return { server, async close() { await pending; await server.close(); await backend.close(); await trace.flush().catch(() => {}); } };
}
