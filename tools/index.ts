import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import type { JsonValue } from '@earendil-works/pi-ai';
import { Type, type Static, type TSchema } from 'typebox';
import { ActionSchema, StartGameSchema, BackendError, record, type Backend, type Observation, type RequestContext } from '../env/contract.ts';
import { compactActionObservation, compactDeckObservation, compactObservation, shortRevision, ObservationResultSchema, FullObservationResultSchema } from '../env/compact.ts';
import type { Trace } from '../model/trace.ts';

/** An action result is an observation plus the identifier needed to inspect an uncertain outcome. */
function isObservation(value: unknown): value is Observation {
  const candidate = record(value);
  return typeof candidate.revision === 'string' && typeof candidate.outcome === 'string' && record(candidate.state).state !== undefined;
}

export function createTools(backend: Backend, trace: Trace, onObservation: (observation: Observation) => void, timeoutMs = 30000): AgentTool[] {
  let delivered: Observation | undefined;
  // The full revision last shown to the caller. Unlike the delta baseline it survives failed actions.
  let issued: string | undefined;
  /** The model sees only the revision counter; restore the bridge revision it was issued from. */
  function resolveRevision(revision: string): string {
    if (issued && shortRevision(issued) === revision) return issued;
    if (revision.includes(':')) return revision; // A complete bridge revision is still validated by the backend.
    throw new BackendError('stale_state','Revision was not issued by this connection; call game_observe before choosing another action.');
  }
  function tool<S extends TSchema>(name: string, description: string, parameters: S, execute: (params: Static<S>, context: RequestContext) => Promise<unknown>, format?: (value: Observation, params: Static<S>, before?: Observation) => unknown): AgentTool<S> {
    const outputSchema = name === 'game_action' ? ObservationResultSchema : ['game_observe','game_start'].includes(name) ? FullObservationResultSchema : Type.Union([
      Type.Object({ ok: Type.Literal(true),value: Type.Unknown() },{ additionalProperties: false }),
      Type.Object({ ok: Type.Literal(false),code: Type.String(),applied: Type.Union([Type.Boolean(),Type.Literal('unknown')]),message: Type.String() },{ additionalProperties: false }),
    ]);
    return { name, label: name, description, parameters, outputSchema, executionMode: 'sequential', execute: async (_id, params, signal) => {
      let result: unknown, compact: unknown, observed: Observation | undefined;
      try {
        if (signal?.aborted) throw new BackendError('cancelled','Call cancelled before execution; no action dispatched.');
        const value = await execute(params,{ signal,deadline:performance.now() + timeoutMs });
        // Observations reach the model in compact form; the full one stays in details for the TUI and runtime.
        // Both branches keep the same envelope, so tool consumers read `value` exactly as before.
        observed = isObservation(value) ? value : undefined;
        compact = { ok: true, value: observed ? format ? format(observed,params,delivered) : compactObservation(observed) : value };
        result = { ok: true, value };
      }
      catch (error) {
        observed = undefined;
        if (name === 'game_action' || name === 'game_start') delivered = undefined;
        const structured = error instanceof BackendError ? error : new BackendError('backend_failure',error instanceof Error ? error.message : 'Operation failed.');
        compact = result = { ok: false, code: structured.code, applied: structured.applied, message: structured.message };
      }
      const safe = trace.sanitize(result), shown = trace.sanitize(compact);
      const encoded = JSON.stringify(shown);
      const output = { content: [{ type: 'text' as const, text: encoded }], details: safe,isError: (safe as { ok: boolean }).ok === false,
        structuredContent: JSON.parse(encoded) as JsonValue } satisfies AgentToolResult<unknown>;
      // Internal preflight reads never establish the caller's baseline.
      if (observed) { delivered = structuredClone(observed); issued = observed.revision; }
      return output;
    } };
  }
  async function observe(context?: RequestContext): Promise<Observation> { const observation = await backend.observe(context); onObservation(observation); return observation; }
  const empty = Type.Object({}, { additionalProperties: false });
  return [
    tool('game_observe','Read the whole current state (full:true) with rev, phase and actions. state is flat. Run keys: setup, ante (the Ante that owns blinds), roundNo, money, credit (only when non-zero), handSize, jokerSlots, consumableSlots, hands ("<chips>x<mult>[ LvN][ played N]"), jokers, consumables, vouchers, tags (held), blind (current or next role: Small, Big or Boss) and blinds (role -> target, Boss rules and "skip: <Tag> (<effect>)"). Phase views exist only in their phases: hand and deck (SELECTING_HAND, PACK), round (SELECTING_HAND), cashOut (ROUND_EVAL), shop (SHOP, PACK), pack (PACK), profiles (MENU, GAME_OVER), runResult (GAME_OVER). Items read "<i>: <Name> [tags]: <effect>", where <i> is the zero-based index actions take. "?" means unknown. actions lists the phase methods with limits such as "play 1-5" or "reroll $5"; use, sell and rearrange are not listed but work whenever their area is non-empty. The game only rejects illegal actions, so check prices against money and slots yourself. Details: balatro://guide.',empty,(_params,context) => observe(context)),
    tool('deck_observe','Read the cards left to draw as "<count>x <card> [attributes]" lines. There is no draw order and no index, so these lines cannot target actions. remainingCards is the draw-pile size. previewCards counts the in-game deck view, which also includes face-down cards held in hand; uncertainCards is how many of those there are, without saying which. Actions do not update this view; call it again when needed. If its rev differs from your latest game result, call game_observe before acting.',empty,async (_params,context) => {
      if (!backend.observeDeck) throw new BackendError('incompatible_backend','This backend does not support deck_observe. Update the balatro_mcp_mod game mod.');
      return compactDeckObservation(await backend.observeDeck(context));
    }),
    tool('game_start','Start a new run from the main menu or after a run has ended; no revision is needed. The deck and stake (difficulty) must be unlocked for that deck in this profile (profiles in the MENU snapshot); seed is optional. Fails while a run is in progress: continue that run instead. Returns a full snapshot like game_observe.',StartGameSchema,async (params,context) => {
      const current = await observe(context);
      if (current.ready === false || !current.availableMethods.includes('start')) throw new BackendError('illegal_action','A run is ongoing or the game is not ready to start. Observe and continue the existing run.');
      const observation = await backend.act({ method: 'start',...params },current.revision,context); onObservation(observation); return observation;
    },(value,params) => compactActionObservation(value,{method:'start',...params})),
    tool('game_action','Perform one game action. Pass the rev of your latest result as revision; indices are zero-based. Returns rev, phase, actions, result (one English sentence on what happened) and state holding only the keys that changed. A result with full:true replaces your whole state. Otherwise merge it: a present key replaces the old value and an absent key keeps it, except that an object on an object key (such as hands or blinds) updates only the listed members, null deleting one, and an object such as {"2":"…"} on jokers, consumables or hand replaces only those elements. Phase views the new phase does not use are dropped (see game_observe). After stale_state or lost context, call game_observe. After uncertain_outcome, stop and inspect it with game_operation; never resend the action.',
      Type.Object({ revision: Type.String(), action: ActionSchema },{ additionalProperties: false }),async (params,context) => {
        const observation = await backend.act(params.action,resolveRevision(params.revision),context); onObservation(observation); return observation;
      },(value,params,before) => compactActionObservation(value,params.action,before?.revision === resolveRevision(params.revision) ? before : undefined)),
  ];
}
