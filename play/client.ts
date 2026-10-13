import { nextId } from '../src/ids.ts';
import { setTimeout as delay } from 'node:timers/promises';
import { Type } from 'typebox';
import { Check } from 'typebox/value';
import { ActionSchema, BackendError, playerState, record, type Action, type Backend, type Data, type DeckObservation, type ErrorCode, type Observation, type RequestContext } from '../env/contract.ts';

const ObservationSchema = Type.Object({ contract: Type.Literal(1),backend: Type.Literal('balatro_mcp_mod'),revision: Type.String({minLength:1}),runId: Type.String({minLength:1}),
  gameVersion: Type.String(),terminal: Type.Boolean(),outcome: Type.Enum(['won','lost','ongoing']),ready: Type.Boolean(),notReadyReason: Type.Optional(Type.String()),state: Type.Record(Type.String(),Type.Unknown()),
  availableMethods: Type.Array(Type.String()),legality: Type.Literal('backend-authoritative') },{ additionalProperties:false });
const errorCodes: ErrorCode[] = ['invalid_arguments','illegal_action','stale_state','cancelled','timeout','backend_failure','uncertain_outcome','incompatible_backend'];
const count = Type.Integer({minimum:0});
const DeckObservationSchema = Type.Object({ revision:Type.String({minLength:1}),runId:Type.String({minLength:1}),remainingCards:count,previewCards:count,uncertainCards:count,
  cards:Type.Array(Type.Object({rank:Type.String(),suit:Type.String(),enhancement:Type.String(),count:Type.Integer({minimum:1}),
    edition:Type.Optional(Type.String()),seal:Type.Optional(Type.String()),bonus:Type.Optional(Type.Number()),permanentBonus:Type.Optional(Type.Number()),debuff:Type.Optional(Type.Boolean())},{additionalProperties:false})) },{additionalProperties:false});

export class ForgeBridgeBackend implements Backend {
  readonly name = 'balatro_mcp_mod';
  private requestId = 0;
  private instanceId?: string;
  private deckObserveSupported = false;
  private uncertain = false;
  private busy = false;
  private endpoint: URL;
  private timeoutMs: number;
  private gameVersion: string;
  lastActionId?: string;
  constructor(endpoint = 'http://127.0.0.1:12347',timeoutMs = 30000,gameVersion = '1.0.1o') {
    this.endpoint = new URL(endpoint); this.timeoutMs = timeoutMs; this.gameVersion = gameVersion;
    if (this.endpoint.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(this.endpoint.hostname) || this.endpoint.pathname !== '/' || this.endpoint.username || this.endpoint.password || this.endpoint.search || this.endpoint.hash) {
      throw new Error('Game bridge endpoint must be loopback HTTP at / without credentials or query parameters.');
    }
  }
  private context(context: RequestContext = {}): RequestContext {
    return { ...context,deadline:Math.min(context.deadline ?? Infinity,performance.now() + this.timeoutMs) };
  }
  /** Check before dispatch: an expired/cancelled preflight never changes the game. */
  private remaining(context: RequestContext): number {
    if (context.signal?.aborted) throw new BackendError('cancelled','Call cancelled before dispatch; no action dispatched.');
    const remaining = (context.deadline ?? Infinity) - performance.now();
    if (remaining <= 0) throw new BackendError('timeout','Overall request deadline exceeded before dispatch; no action dispatched.');
    return remaining;
  }
  private async rpc(method: string,params: Data = {},mutation = false,context: RequestContext = this.context()): Promise<unknown> {
    const remaining = this.remaining(context);
    const timeoutSignal = AbortSignal.timeout(Math.max(1,Math.ceil(remaining)));
    const signal = context.signal ? AbortSignal.any([context.signal,timeoutSignal]) : timeoutSignal;
    const id = ++this.requestId;
    try {
      const response = await fetch(this.endpoint,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},
        body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal});
      if (!response.ok) throw new Error('Bridge HTTP failure');
      const message = record(await response.json());
      if (message.jsonrpc !== '2.0' || message.id !== id || ('result' in message) === ('error' in message)) throw new Error('Invalid JSON-RPC response');
      if (message.error) {
        const error = record(message.error), data = record(error.data);
        if (!errorCodes.includes(data.code as ErrorCode) || ![true,false,'unknown'].includes(data.applied as boolean | string)) throw new Error('Invalid bridge error envelope');
        throw new BackendError(data.code as ErrorCode,String(error.message ?? 'Bridge operation failed'),data.applied as boolean | 'unknown');
      }
      return message.result;
    } catch (error) {
      if (error instanceof BackendError) throw error;
      const cancelled = context.signal?.aborted === true;
      const timeout = timeoutSignal.aborted || error instanceof Error && error.name === 'TimeoutError';
      throw new BackendError(mutation ? 'uncertain_outcome' : cancelled ? 'cancelled' : timeout ? 'timeout' : 'backend_failure',
        mutation ? 'Action may have been dispatched. Inspect operation ' + this.lastActionId + '; do not resubmit.' : cancelled ? 'Call cancelled; no action dispatched by this request.' : timeout ? 'Overall request deadline exceeded.' : 'balatro_mcp_mod bridge unavailable or returned an invalid response.',mutation ? 'unknown' : false);
    }
  }
  async diagnose(context?: RequestContext): Promise<Data> { return record(await this.rpc('sf.health',{},false,this.context(context))); }
  private async identity(context: RequestContext): Promise<void> {
    const health = await this.diagnose(context);
    if (health.status !== 'ok' || health.bridge !== 'balatro_mcp_mod' || health.protocol !== 1 || typeof health.instanceId !== 'string' ||
        typeof health.gameVersion !== 'string' || health.gameVersion.replace(/-FULL$/,'') !== this.gameVersion || health.preservesTiming !== true) {
      throw new BackendError('incompatible_backend','Load the standalone balatro_mcp_mod mod and verify its protocol and target game version.');
    }
    if (this.instanceId && this.instanceId !== health.instanceId) {
      if (this.busy) throw new BackendError('stale_state','Bridge restarted during an action; observe again before continuing.');
      this.uncertain = false; this.lastActionId = undefined;
    }
    this.instanceId = health.instanceId;
    this.deckObserveSupported = Array.isArray(health.capabilities) && health.capabilities.includes('deck_observe');
  }
  /** Health runs once per bridge instance; a revision from another instance means the mod restarted. */
  private async ensureIdentity(context: RequestContext,revision?: unknown): Promise<void> {
    if (!this.instanceId || typeof revision === 'string' && !revision.startsWith(this.instanceId + ':')) await this.identity(context);
  }
  private observation(value: unknown): Observation {
    if (!Check(ObservationSchema,value) || value.gameVersion !== this.gameVersion || !value.revision.startsWith(this.instanceId + ':') || typeof value.state.state !== 'string') throw new BackendError('backend_failure','Invalid bridge observation contract.');
    const state = playerState(value.state);
    return {...value,state};
  }
  async observe(request?: RequestContext): Promise<Observation> {
    const context = this.context(request);
    return this.observation(await this.readObservation(context));
  }
  /** Preflight and version checks only read the game; they never run a worker. */
  private async readObservation(context: RequestContext): Promise<unknown> {
    await this.ensureIdentity(context);
    const raw = await this.rpc('sf.observe',{},false,context);
    await this.ensureIdentity(context,record(raw).revision);
    this.observation(raw);
    if (this.uncertain && !this.busy && this.lastActionId) {
      try {
        const operation = await this.inspectOperation(undefined,context);
        if (operation.actionId === this.lastActionId && operation.status === 'completed' && operation.applied === true) {
          this.observation(operation.observation); // Validate the correlated completion before releasing the client lock.
          this.uncertain = false;
        }
      } catch { /* Observation remains usable; an unverified operation keeps mutations locked. */ }
    }
    this.remaining(context);
    return raw;
  }
  async observeDeck(request?: RequestContext): Promise<DeckObservation> {
    const context = this.context(request);
    await this.ensureIdentity(context);
    if (!this.deckObserveSupported) throw new BackendError('incompatible_backend','The installed mod does not support deck_observe. Update the balatro_mcp_mod mod and restart Balatro.');
    const value = await this.rpc('sf.deck_observe',{},false,context);
    await this.ensureIdentity(context,record(value).revision);
    if (!Check(DeckObservationSchema,value) || !value.revision.startsWith(this.instanceId + ':') || value.cards.reduce((sum,card) => sum + card.count,0) !== value.previewCards ||
      value.uncertainCards > value.previewCards || value.remainingCards > value.previewCards) throw new BackendError('backend_failure','Invalid bridge deck observation contract.');
    return value;
  }
  /** Read-only inspection remains available after a timeout; it never clears the action lock. */
  async inspectOperation(actionId = this.lastActionId,request?: RequestContext): Promise<Data> {
    if (!actionId) throw new BackendError('invalid_arguments','No action identifier to inspect.');
    const context = this.context(request);
    await this.identity(context);
    const value = record(await this.rpc('sf.operation',{actionId,instanceId:this.instanceId},false,context));
    if (value.observation) value.observation = this.observation(value.observation);
    return value;
  }
  async act(action: Action,revision: string,request?: RequestContext): Promise<Observation> {
    const context = this.context(request);
    this.remaining(context);
    if (!Check(ActionSchema,action)) throw new BackendError('invalid_arguments','Action does not match its schema.');
    if (this.busy) throw new BackendError('illegal_action','Another action is in progress.');
    const before = this.observation(await this.readObservation(context));
    if (this.busy) throw new BackendError('illegal_action','Another action is in progress.');
    if (this.uncertain) throw new BackendError('uncertain_outcome','Previous outcome is unresolved; inspect the game/operation or restart the bridge, then continue this session.','unknown');
    this.busy = true;
    let dispatched = false;
    let applied: boolean | 'unknown' = 'unknown';
    try {
      if (before.revision !== revision) throw new BackendError('stale_state','State changed; observe again.');
      if (before.ready === false || !before.availableMethods.includes(action.method)) throw new BackendError('illegal_action','Game is not ready for this action.');
      this.remaining(context);
      this.lastActionId = nextId('action');
      let result = record(await this.rpc('sf.act',{action,revision,instanceId:this.instanceId,actionId:this.lastActionId},true,context));
      dispatched = true;
      while (true) {
        if (result.actionId !== this.lastActionId || !['pending','completed','failed','retired'].includes(String(result.status))) throw new BackendError('uncertain_outcome','Invalid operation response.','unknown');
        if (result.applied === true) applied = true;
        if (result.status === 'completed') {
          const outcome = this.observation(result.observation);
          if (result.applied !== true || !outcome.revision.startsWith(this.instanceId + ':')) throw new BackendError('uncertain_outcome','Invalid completed operation identity.','unknown');
          return {...outcome,actionId:this.lastActionId};
        }
        if (result.status !== 'pending') throw new BackendError('uncertain_outcome',String(result.message ?? 'Operation requires manual inspection.'),result.applied === true ? true : 'unknown');
        await delay(Math.min(40,this.remaining(context)),undefined,{signal:context.signal});
        result = record(await this.rpc('sf.operation',{actionId:this.lastActionId,instanceId:this.instanceId},false,context));
      }
    } catch (error) {
      if (dispatched || error instanceof BackendError && error.applied !== false) {
        this.uncertain = true;
        throw error instanceof BackendError && error.code === 'uncertain_outcome' ? error : new BackendError('uncertain_outcome','Action dispatched, but completion could not be verified; inspect ' + this.lastActionId,applied);
      }
      throw error;
    } finally { this.busy = false; }
  }
  async close(): Promise<void> {}
}
