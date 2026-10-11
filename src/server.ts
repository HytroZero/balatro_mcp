import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { McpServer, fromJsonSchema, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { BackendError, record, type Backend } from '../env/contract.ts';
import { ForgeBridgeBackend } from '../play/client.ts';
import { MemoryStore } from '../memory/store.ts';
import { Trace } from '../model/trace.ts';
import { createTools } from '../tools/index.ts';
import { projectRoot, type Options } from './config.ts';
import { loadGameplayContext, registerGameplayResources } from './context.ts';

const envelopeSchema = z.object({
  ok: z.boolean(), value: z.unknown().optional(), code: z.string().optional(),
  applied: z.union([z.boolean(), z.literal('unknown')]).optional(), message: z.string().optional(),
}).strict();

function failure(error: unknown): CallToolResult {
  const problem = error instanceof BackendError ? error : new BackendError('backend_failure', error instanceof Error ? error.message : 'Operation failed.');
  const structuredContent = { ok: false, code: problem.code, applied: problem.applied, message: problem.message };
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
}

/** A process owns one tool context; serialize calls to preserve compact observation baselines. */
export async function createBalatroServer(options: Options, backend: Backend = new ForgeBridgeBackend(options.endpoint, options.timeoutMs)) {
  const context = await loadGameplayContext();
  const memory = new MemoryStore(resolve(options.dataDir, 'memory'), options.readOnlyMemory, options.onlineMemory);
  const trace = new Trace(resolve(options.dataDir, 'traces', randomUUID() + '.jsonl'));
  await Promise.all([memory.init(), trace.init()]);
  const server = new McpServer({ name: 'balatro-mcp-server', version: '0.1.0' }, {
    instructions: context.instructions,
  });
  let pending: Promise<unknown> = Promise.resolve();
  function sequential<T>(operation: () => Promise<T>): Promise<T> {
    const next = pending.then(operation);
    pending = next.catch(() => {});
    return next;
  }
  async function log(data: unknown): Promise<void> {
    try { await trace.write('mcp_tool', data); }
    catch { console.error('Balatro MCP: trace append failed; the tool result is still authoritative.'); }
  }
  const tools = createTools(backend, memory, trace, () => {}, options.timeoutMs);
  for (const tool of tools) {
    const readOnly = ['game_observe', 'card_observe', 'memory_query'].includes(tool.name);
    server.registerTool(tool.name, {
      title: tool.name.replaceAll('_', ' '), description: tool.description,
      // SDK v2 accepts Standard Schema: preserve TypeBox's exact JSON Schema,
      // including uniqueItems and strict action unions, without a lossy Zod conversion.
      inputSchema: fromJsonSchema<Record<string, unknown>>({ ...tool.parameters, additionalProperties: false }),
      outputSchema: envelopeSchema,
      annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, idempotentHint: readOnly, openWorldHint: false },
    }, async (params, context) => sequential(async () => {
      if (context.mcpReq.signal.aborted) return failure(new BackendError('cancelled', 'Call cancelled before execution; no action dispatched.'));
      let result: CallToolResult;
      try {
        const native = await tool.execute(randomUUID(), params, context.mcpReq.signal);
        result = { content: native.content, structuredContent: record(native.structuredContent), isError: native.isError ?? false };
      } catch (error) { result = failure(error); }
      await log({ name: tool.name, arguments: params, result });
      return result;
    }));
  }
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
    title: 'Balatro tool workflow', mimeType: 'text/markdown', description: 'Setup, compact result semantics and safe action/recovery workflow.',
  }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: await readFile(resolve(projectRoot, 'docs/tool-guide.md'), 'utf8') }] }));
  registerGameplayResources(server, context);
  return { server, async close() { await pending; await server.close(); await backend.close(); await trace.flush().catch(() => {}); } };
}
