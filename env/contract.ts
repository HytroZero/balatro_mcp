import { Type, type Static, type TSchema } from 'typebox';

const index = Type.Integer({ minimum: 0 });
const indices = Type.Array(index, { minItems: 1, maxItems: 64, uniqueItems: true });
const object = <T extends Record<string, TSchema>>(properties: T) => Type.Object(properties, { additionalProperties: false });
const method = <const T extends string>(name: T) => object({ method: Type.Literal(name) });
export const StartGameSchema = object({
  deck: Type.Enum(['RED','BLUE','YELLOW','GREEN','BLACK','MAGIC','NEBULA','GHOST','ABANDONED','CHECKERED','ZODIAC','PAINTED','ANAGLYPH','PLASMA','ERRATIC']),
  stake: Type.Enum(['WHITE','RED','GREEN','BLACK','BLUE','PURPLE','ORANGE','GOLD']),
  seed: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
});
export const ActionSchema = Type.Union([
  object({ method: Type.Literal('start'), ...StartGameSchema.properties }),
  method('select'),method('skip'),method('reroll'),method('reroll_boss'),method('cash_out'),method('next_round'),
  object({ method: Type.Literal('play'), cards: Type.Array(index, { minItems: 1, maxItems: 5, uniqueItems: true }) }),
  object({ method: Type.Literal('discard'), cards: Type.Array(index, { minItems: 1, maxItems: 5, uniqueItems: true }) }),
  object({ method: Type.Literal('buy'),card: index }),
  object({ method: Type.Literal('buy'),voucher: index }),
  object({ method: Type.Literal('buy'),pack: index }),
  object({ method: Type.Literal('buy_and_use'),card:index,cards:Type.Optional(indices) }),
  object({ method: Type.Literal('pack'), card: index, targets: Type.Optional(indices) }),
  object({ method: Type.Literal('sell'),joker: index }),
  object({ method: Type.Literal('sell'),consumable: index }),
  object({ method: Type.Literal('use'), consumable: index, cards: Type.Optional(indices) }),
  object({ method: Type.Literal('rearrange'),hand: indices }),
  object({ method: Type.Literal('rearrange'),jokers: indices }),
  object({ method: Type.Literal('rearrange'),consumables: indices }),
]);
export type Action = Static<typeof ActionSchema>;
export type Data = Record<string, unknown>;
export interface Observation {
  contract: 1;
  backend: string;
  revision: string;
  runId: string;
  gameVersion: string;
  terminal: boolean;
  ready: boolean;
  notReadyReason?: string;
  actionId?: string;
  outcome: 'won' | 'lost' | 'ongoing';
  state: Data;
  availableMethods: string[];
  legality: 'backend-authoritative';
}
export type ErrorCode = 'invalid_arguments' | 'illegal_action' | 'stale_state' | 'cancelled' | 'timeout' | 'backend_failure' | 'uncertain_outcome' | 'incompatible_backend';
export class BackendError extends Error {
  readonly code: ErrorCode;
  readonly applied: boolean | 'unknown';
  constructor(code: ErrorCode, message: string, applied: boolean | 'unknown' = false) {
    super(message); this.code = code; this.applied = applied;
  }
}
/** The `{ok:false,...}` tool result for any thrown value; unknown errors become backend_failure. */
export function errorEnvelope(error: unknown): { ok: false; code: ErrorCode; applied: boolean | 'unknown'; message: string } {
  const problem = error instanceof BackendError ? error : new BackendError('backend_failure', error instanceof Error ? error.message : 'Operation failed.');
  return { ok: false, code: problem.code, applied: problem.applied, message: problem.message };
}
/** A monotonic deadline shared by every RPC in one tool invocation. */
export interface RequestContext { signal?: AbortSignal; deadline?: number; }
/** One same-frame read for game_analyze: the public observation and the mod's analysis input. */
export interface AnalysisRead { observation: Observation; analysis: Data; }
export interface Backend {
  readonly name: string;
  observe(context?: RequestContext): Promise<Observation>;
  observeDeck(context?: RequestContext): Promise<DeckObservation>;
  act(action: Action, revision: string, context?: RequestContext): Promise<Observation>;
  /** Read-only; never issues a revision baseline and never releases an action lock. */
  analysisSnapshot?(context?: RequestContext): Promise<AnalysisRead>;
  close(): Promise<void>;
}
export function record(value: unknown): Data {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : {};
}
export interface DeckCard {
  rank: string; suit: string; enhancement: string; count: number;
  edition?: string; seal?: string; bonus?: number; permanentBonus?: number; debuff?: boolean;
}
export interface DeckObservation {
  revision: string; runId: string; remainingCards: number; previewCards: number; uncertainCards: number; cards: DeckCard[];
}

// Only information shown in the game may cross into the model transcript.
export function playerState(raw: Data): Data {
  const state: Data = {};
  for (const key of ['state','round_num','ante_num','money','won','deck','stake','seed','used_vouchers','hands','round','blinds','blind','currentBlind','creditLimit','remainingCards','packChoices','tags','profileOptions',
    'totalCards','routeAnte','completedRound','cashOut','controls','redeemedVouchers','packKey','packName','packReturnPhase']) {
    if (raw[key] !== undefined) state[key] = structuredClone(raw[key]);
  }
  for (const name of ['hand','jokers','consumables','shop','vouchers','packs','pack']) {
    const area = record(raw[name]);
    if (!raw[name]) continue;
    const cards = Array.isArray(area.cards) ? area.cards : [];
    state[name] = { count: area.count, limit: area.limit, highlighted_limit: area.highlighted_limit,
      cards: cards.map((value, index) => {
        const card = record(value);
        const cardState = record(card.state);
        if (cardState.hidden === true) return { index,id:card.id,state:{hidden:true,highlight:cardState.highlight === true,forced:cardState.forced === true} };
        return { index, ...Object.fromEntries(['id','key','set','label','value','modifier','state','cost','canSell','target'].filter(k => card[k] !== undefined).map(k => [k, structuredClone(card[k])])) };
      }) };
  }
  return state;
}
