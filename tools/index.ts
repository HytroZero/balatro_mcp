import { fromJsonSchema, type CallToolResult, type McpServer } from '@modelcontextprotocol/server';
import { Type, type Static, type TSchema } from 'typebox';
import { ActionSchema, StartGameSchema, BackendError, errorEnvelope, record, type Action, type Backend, type Observation, type RequestContext } from '../env/contract.ts';
import { Analyzer, DiscardsSchema, NextSchema, validateDiscards, playKey } from '../env/analysis/index.ts';
import { compactActionObservation, compactDeckObservation, compactObservation, shortRevision, ObservationResultSchema, FullObservationResultSchema } from '../env/compact.ts';
import type { Trace } from '../model/trace.ts';

type ToolValue = { value: unknown; observation?: Observation };
type Sequential = <T>(operation: () => Promise<T>) => Promise<T>;
/** `read` and `mutation` run on the game queue; `analysis` has its own queue and is aborted by any mutation. */
type ToolKind = 'read' | 'mutation' | 'analysis';

/** Register MCP tools directly; raw observations stay in trace records, outside the tool result. */
export function registerGameTools(server: McpServer, backend: Backend, trace: Trace, sequential: Sequential, timeoutMs = 30000, analyzer = new Analyzer()): { close(): Promise<void> } {
  let delivered: Observation | undefined;
  // The full revision last shown to the caller. Unlike the delta baseline it survives failed actions.
  let issued: string | undefined;
  let activeAnalysis: AbortController | undefined;
  let analyses: Promise<unknown> = Promise.resolve();
  /** The model sees only the revision counter; restore the bridge revision it was issued from. */
  function resolveRevision(revision: string): string {
    if (issued && shortRevision(issued) === revision) return issued;
    throw new BackendError('stale_state','Revision was not issued by this connection; call game_observe before choosing another action.');
  }
  // Exact scores of the latest hand analysis, checked against a play made at the same revision.
  let predicted: { revision: string; runId: string; chips: number; scores: Map<string, number> } | undefined;
  const audit = { runId: '', matched: 0, mismatched: 0, last: '' };
  async function auditPlay(expected: NonNullable<typeof predicted>, cards: number[], after: Observation): Promise<void> {
    const score = expected.scores.get(playKey(cards)), chips = record(after.state.round).chips;
    if (score === undefined || after.runId !== expected.runId || typeof chips !== 'number' || chips < expected.chips) return;
    const gain = chips - expected.chips, matched = gain === score;
    if (matched) audit.matched++;
    else { audit.mismatched++; audit.last = `at rev ${shortRevision(expected.revision)} predicted ${score}, scored ${gain}`; }
    try { await trace.write('score_audit', { revision: expected.revision, cards, predicted: score, scored: gain, matched }); }
    catch { /* The audit counters above stay authoritative for this connection. */ }
  }
  function auditLine(): string | undefined {
    const total = audit.matched + audit.mismatched;
    if (!total) return undefined;
    return audit.mismatched ? `MISMATCH ${audit.last}; ${audit.matched}/${total} predictions matched this run, exact labels are suspended` : `exact ${total}/${total} matched this run`;
  }
  function observed(observation: Observation, action?: Action, before?: Observation): ToolValue {
    return { observation, value: action ? compactActionObservation(observation, action, before) : compactObservation(observation) };
  }
  function tool<S extends TSchema>(name: string, kind: ToolKind, description: string, parameters: S, execute: (params: Static<S>, context: RequestContext) => Promise<ToolValue>): void {
    const outputSchema = name === 'game_action' ? ObservationResultSchema : ['game_observe','game_start'].includes(name) ? FullObservationResultSchema :
      Type.Object({ ...ObservationResultSchema.properties, value: Type.Optional(Type.Unknown()) }, { additionalProperties: false });
    const readOnly = kind !== 'mutation';
    server.registerTool(name, {
      title: name.replaceAll('_', ' '), description,
      // Preserve TypeBox's exact strict unions and uniqueItems in the MCP schema.
      inputSchema: fromJsonSchema<Static<S>>(parameters),
      outputSchema: fromJsonSchema<Record<string, unknown>>(JSON.parse(JSON.stringify(outputSchema))),
      annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, idempotentHint: readOnly, openWorldHint: false },
    }, (params, context) => {
      if (kind === 'mutation') activeAnalysis?.abort(new BackendError('stale_state','State changed during analysis; observe again.'));
      const run = async () => {
        const signal = context.mcpReq.signal;
        let details: unknown, compact: unknown, observation: Observation | undefined;
        let isError = false;
        try {
          if (signal?.aborted) throw new BackendError('cancelled','Call cancelled before execution; no action dispatched.');
          const value = await execute(params,{ signal,deadline:performance.now() + timeoutMs });
          observation = value.observation;
          compact = { ok: true, value: value.value };
          details = { ok: true, value: observation ?? value.value };
        }
        catch (error) {
          isError = true;
          if (kind === 'mutation') delivered = undefined;
          compact = details = errorEnvelope(error);
        }
        const encoded = trace.encode(compact);
        const result: CallToolResult = { content: [{ type: 'text', text: encoded }], isError, structuredContent: JSON.parse(encoded) };
        // Internal preflight reads never establish the caller's baseline.
        if (observation) { delivered = structuredClone(observation); issued = observation.revision; }
        try { await trace.write('mcp_tool', { name, arguments: params, result, details }); }
        catch { console.error('Balatro MCP: trace append failed; the tool result is still authoritative.'); }
        return result;
      };
      // Analysis owns the worker, but yields the game queue during computation.
      if (kind === 'analysis') {
        const result = analyses.then(run); analyses = result.catch(() => {}); return result;
      }
      return sequential(run);
    });
  }
  const empty = Type.Object({}, { additionalProperties: false });
  tool('game_observe','read',"Read a full v3 snapshot with rev, phase, actions and optional notReady/outcome. State fields and delta merge: balatro://guide. Recovery: balatro://protocol.",empty,async (_params,context) => observed(await backend.observe(context)));
  tool('deck_observe','read',"Read grouped remaining-deck counts without draw order or action indices. Preview can include unknown held cards; interpretation and revision handling: balatro://guide.",empty,async (_params,context) => {
    return { value: compactDeckObservation(await backend.observeDeck(context)) };
  });
  tool('game_start','mutation',"Start from the menu or a completed run; fails during an ongoing run. Deck/stake must be unlocked (profiles); seed is optional and no revision is needed. Returns a full snapshot.",StartGameSchema,async (params,context) => {
    const current = await backend.observe(context);
    if (current.ready === false || !current.availableMethods.includes('start')) throw new BackendError('illegal_action','A run is ongoing or the game is not ready to start. Observe and continue the existing run.');
    return observed(await backend.act({ method: 'start',...params },current.revision,context), { method: 'start',...params });
  });
  tool('game_action','mutation',"Execute one mutation with the latest issued revision. Returns rev, phase, actions, result and changed state keys, or full:true. Merge per balatro://guide; recover errors per balatro://protocol.",
    Type.Object({ revision: Type.String(), action: ActionSchema },{ additionalProperties: false }),async (params,context) => {
      const revision = resolveRevision(params.revision);
      const expected = predicted?.revision === revision ? predicted : undefined;
      const after = await backend.act(params.action,revision,context);
      predicted = undefined;
      if (expected && params.action.method === 'play') await auditPlay(expected,params.action.cards,after);
      return observed(after, params.action, delivered?.revision === revision ? delivered : undefined);
    });
  tool('game_analyze','analysis',"Read-only hand scores or build comparisons. With discards (1-4 arrays of hand indices) and next (target poker hand), return only rates after 64 public-deck samples per strategy. Read balatro://analysis once; follow balatro://protocol.",
    Type.Object({ revision: Type.String(), focus: Type.Optional(Type.Union([Type.Literal('auto'), Type.Literal('boss')])), discards: Type.Optional(DiscardsSchema), next: Type.Optional(NextSchema) },{ additionalProperties: false }),async (params,context) => {
      validateDiscards(params.discards, params.next);
      const controller = new AbortController();
      activeAnalysis = controller;
      const signal = context.signal ? AbortSignal.any([context.signal, controller.signal]) : controller.signal;
      try {
        const revision = resolveRevision(params.revision);
        if (!backend.analysisSnapshot) throw new BackendError('incompatible_backend','This backend does not support game_analyze.');
        const first = await sequential(() => backend.analysisSnapshot!({ ...context, signal }));
        signal.throwIfAborted();
        if (first.observation.revision !== revision) throw new BackendError('stale_state','State changed; observe again before analysing.');
        const head = { rev: shortRevision(revision), phase: String(first.observation.state.state) };
        if (!first.observation.ready) {
          if (params.discards) throw new BackendError('illegal_action', first.observation.notReadyReason ?? 'The game is not at a decision point.');
          return { value: { ...head, status: 'unavailable', notes: [first.observation.notReadyReason ?? 'the game is not at a decision point'] } };
        }
        if (audit.runId !== first.observation.runId) Object.assign(audit,{ runId: first.observation.runId, matched: 0, mismatched: 0, last: '' });
        // Leave time for the closing read inside the same tool deadline.
        const analysis = await analyzer.analyze(first,{ discards: params.discards, next: params.next, focus: params.focus, signal, deadline: (context.deadline ?? performance.now() + timeoutMs) - 2000, trusted: audit.mismatched === 0 });
        // Analysis inputs are outside the revision fingerprint, so compare them directly.
        return await sequential(async () => {
          signal.throwIfAborted();
          const second = await backend.analysisSnapshot!({ ...context, signal });
          signal.throwIfAborted();
          if (second.observation.revision !== revision || JSON.stringify(second.analysis) !== JSON.stringify(first.analysis)) throw new BackendError('stale_state','State changed during analysis; observe again.');
          if ('rates' in analysis.brief) return { value: analysis.brief };
          const chips = record(first.observation.state.round).chips;
          predicted = analysis.predictions.size && typeof chips === 'number' ? { revision, runId: first.observation.runId, chips, scores: analysis.predictions } : undefined;
          const line = auditLine();
          return { value: { ...head, ...analysis.brief, ...(line ? { audit: line } : {}) } };
        });
      } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason;
        if (context.signal?.aborted) throw new BackendError('cancelled','Analysis cancelled; no action dispatched.');
        throw error;
      } finally { if (activeAnalysis === controller) activeAnalysis = undefined; }
    });
  return { close: async () => { activeAnalysis?.abort(new BackendError('cancelled','Analysis closed.')); await analyses; await analyzer.close(); } };
}
