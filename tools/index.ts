import { fromJsonSchema, type CallToolResult, type McpServer } from '@modelcontextprotocol/server';
import { Type, type Static, type TSchema } from 'typebox';
import { ActionSchema, StartGameSchema, BackendError, errorEnvelope, record, type Action, type Backend, type Observation, type RequestContext } from '../env/contract.ts';
import { Analyzer, LinesSchema, playKey } from '../env/analysis/index.ts';
import { compactActionObservation, compactDeckObservation, compactObservation, shortRevision, ObservationResultSchema, FullObservationResultSchema } from '../env/compact.ts';
import type { Trace } from '../model/trace.ts';
import { phaseViewSentence } from './guide.ts';

type ToolValue = { value: unknown; observation?: Observation };
type Sequential = <T>(operation: () => Promise<T>) => Promise<T>;

/** Register MCP tools directly; raw observations stay in trace records, outside the tool result. */
export function registerGameTools(server: McpServer, backend: Backend, trace: Trace, sequential: Sequential, timeoutMs = 30000, analyzer = new Analyzer()): { close(): Promise<void> } {
  let delivered: Observation | undefined;
  // The full revision last shown to the caller. Unlike the delta baseline it survives failed actions.
  let issued: string | undefined;
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
  function tool<S extends TSchema>(name: string, description: string, parameters: S, execute: (params: Static<S>, context: RequestContext) => Promise<ToolValue>): void {
    const outputSchema = name === 'game_action' ? ObservationResultSchema : ['game_observe','game_start'].includes(name) ? FullObservationResultSchema :
      Type.Object({ ...ObservationResultSchema.properties, value: Type.Optional(Type.Unknown()) }, { additionalProperties: false });
    const readOnly = name === 'game_observe' || name === 'deck_observe' || name === 'game_analyze';
    server.registerTool(name, {
      title: name.replaceAll('_', ' '), description,
      // Preserve TypeBox's exact strict unions and uniqueItems in the MCP schema.
      inputSchema: fromJsonSchema<Static<S>>(parameters),
      outputSchema: fromJsonSchema<Record<string, unknown>>(JSON.parse(JSON.stringify(outputSchema))),
      annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, idempotentHint: readOnly, openWorldHint: false },
    }, (params, context) => sequential(async () => {
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
        if (name === 'game_action' || name === 'game_start') delivered = undefined;
        compact = details = errorEnvelope(error);
      }
      const encoded = trace.encode(compact);
      const result: CallToolResult = { content: [{ type: 'text', text: encoded }], isError, structuredContent: JSON.parse(encoded) };
      // Internal preflight reads never establish the caller's baseline.
      if (observation) { delivered = structuredClone(observation); issued = observation.revision; }
      try { await trace.write('mcp_tool', { name, arguments: params, result, details }); }
      catch { console.error('Balatro MCP: trace append failed; the tool result is still authoritative.'); }
      return result;
    }));
  }
  const empty = Type.Object({}, { additionalProperties: false });
  tool('game_observe','Read the whole current state (full:true) with rev, phase and actions. state is flat. Run keys: setup, ante (the Ante that owns blinds), roundNo, money, credit (only when non-zero), handSize, jokerSlots, consumableSlots, hands ("<chips>x<mult>[ LvN][ played N]"), jokers, consumables, vouchers, tags (held), blind (current or next role: Small, Big or Boss) and blinds (role -> target, Boss rules and "skip: <Tag> (<effect>)"). Phase views exist only in their phases: ' + phaseViewSentence() + '. Items read "<i>: <Name> [tags]: <effect>", where <i> is the zero-based index actions take. "?" means unknown. In PACK, actions includes pack to choose and skip to leave when available; use action {"method":"skip"} to skip any booster. actions lists the phase methods with limits such as "play 1-5" or "reroll $5"; use, sell and rearrange are not listed but work whenever their area is non-empty. The game only rejects illegal actions, so check prices against money and slots yourself. Details: balatro://guide.',empty,async (_params,context) => observed(await backend.observe(context)));
  tool('deck_observe','Read the cards left to draw as "<count>x <card> [attributes]" lines. There is no draw order and no index, so these lines cannot target actions. remainingCards is the draw-pile size. previewCards counts the in-game deck view, which also includes face-down cards held in hand; uncertainCards is how many of those there are, without saying which. Actions do not update this view; call it again when needed. If its rev differs from your latest game result, call game_observe before acting.',empty,async (_params,context) => {
    return { value: compactDeckObservation(await backend.observeDeck(context)) };
  });
  tool('game_start','Start a new run from the main menu or after a run has ended; no revision is needed. The deck and stake (difficulty) must be unlocked for that deck in this profile (profiles in the MENU snapshot); seed is optional. Fails while a run is in progress: continue that run instead. Returns a full snapshot like game_observe.',StartGameSchema,async (params,context) => {
    const current = await backend.observe(context);
    if (current.ready === false || !current.availableMethods.includes('start')) throw new BackendError('illegal_action','A run is ongoing or the game is not ready to start. Observe and continue the existing run.');
    return observed(await backend.act({ method: 'start',...params },current.revision,context), { method: 'start',...params });
  });
  tool('game_action','Perform one game action. Pass the rev of your latest result as revision; indices are zero-based. Returns rev, phase, actions, result (one English sentence on what happened) and state holding only the keys that changed. A result with full:true replaces your whole state. Otherwise merge it: a present key replaces the old value and an absent key keeps it, except that an object on an object key (such as hands or blinds) updates only the listed members, null deleting one, and an object such as {"2":"…"} on consumables or hand replaces only those elements. jokers is always a complete ordered array when present. Phase views the new phase does not use are dropped (see game_observe). After stale_state or lost context, call game_observe. After uncertain_outcome, stop and inspect it with game_operation; never resend the action.',
    Type.Object({ revision: Type.String(), action: ActionSchema },{ additionalProperties: false }),async (params,context) => {
      const revision = resolveRevision(params.revision);
      const expected = predicted?.revision === revision ? predicted : undefined;
      const after = await backend.act(params.action,revision,context);
      predicted = undefined;
      if (expected && params.action.method === 'play') await auditPlay(expected,params.action.cards,after);
      return observed(after, params.action, delivered?.revision === revision ? delivered : undefined);
    });
  tool('game_analyze','Read-only numbers for the current decision; it never acts and its rows are candidates to compare, not an allowlist or a recommendation. Pass the latest rev as revision. While selecting a hand it scores every legal play with the original game scoring code and returns need (chips still missing, hands, discards), plays ("<hand indices>: <poker hand> <score> <exact|conditional|expected>; <facts>": the best play of each poker hand, plus plays that keep a Blue Seal or Gold card or avoid resetting a Joker), use (a held Planet, or a held Tarot on its best hand targets, that raises the best play if used first), order (a Joker or hand rearrange that raises the best play; execute it, observe, then decide) and lines when given. lines holds up to 4 hypothetical lines of up to 3 steps (use a Planet, use a Tarot with cards targets, rearrange jokers or hand, play) to price your own idea; every index refers to the current observation and nothing is executed. exact is the deterministic score of the visible state; conditional depends on an assumption stated in notes (face-down cards, ignored Hook discards or an audit mismatch). expected replaces random effects with their public-probability means in one evaluation (Misprint adds 11.5 by default; a chance p of Xk becomes X(1+p*(k-1))). It retains fractional scores before final rounding. Nonlinear or correlated combinations carry interaction approximation with reasons in notes. Expected scores never promise a clear or enter exact play audits; no seed is returned. In SHOP, PACK and BLIND_SELECT it samples the whole public deck against each blind still to play this Ante and returns pace (target, need per hand, median and p75 best hand, clear estimate), jokers (the share of the score each Joker carries), offers (each priceable shop, pack, voucher or held Planet change: per-hand change and the clear proxy from expected scores of the last open blind before and after, the Joker it would replace when slots are full, interest change), horizon (the targets of the next Ante against this build), economy, rewards and skip. focus boss adds bosses: every Boss the next Ante can bring, weakest first. Sampled numbers compare options on identical shuffles; trust changes more than levels. audit reports how earlier predictions matched the plays actually made this run. Read notes first. Details: balatro://guide.',
    Type.Object({ revision: Type.String(), focus: Type.Optional(Type.Union([Type.Literal('auto'), Type.Literal('boss')])), lines: Type.Optional(LinesSchema) },{ additionalProperties: false }),async (params,context) => {
      const revision = resolveRevision(params.revision);
      if (!backend.analysisSnapshot) throw new BackendError('incompatible_backend','This backend does not support game_analyze.');
      const first = await backend.analysisSnapshot(context);
      if (first.observation.revision !== revision) throw new BackendError('stale_state','State changed; observe again before analysing.');
      const head = { rev: shortRevision(revision), phase: String(first.observation.state.state) };
      if (!first.observation.ready) return { value: { ...head, status: 'unavailable', notes: [first.observation.notReadyReason ?? 'the game is not at a decision point'] } };
      if (audit.runId !== first.observation.runId) Object.assign(audit,{ runId: first.observation.runId, matched: 0, mismatched: 0, last: '' });
      // Leave time for the closing read inside the same tool deadline.
      const analysis = await analyzer.analyze(first,{ lines: params.lines, focus: params.focus, deadline: (context.deadline ?? performance.now() + timeoutMs) - 2000, trusted: audit.mismatched === 0 });
      // Analysis inputs are outside the revision fingerprint, so compare them directly.
      const second = await backend.analysisSnapshot(context);
      if (second.observation.revision !== revision || JSON.stringify(second.analysis) !== JSON.stringify(first.analysis)) throw new BackendError('stale_state','State changed during analysis; observe again.');
      const chips = record(first.observation.state.round).chips;
      predicted = analysis.predictions.size && typeof chips === 'number' ? { revision, runId: first.observation.runId, chips, scores: analysis.predictions } : undefined;
      const line = auditLine();
      return { value: { ...head, ...analysis.brief, ...(line ? { audit: line } : {}) } };
    });
  return { close: () => analyzer.close() };
}
