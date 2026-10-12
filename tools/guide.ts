import { phaseViews } from '../env/compact.ts';

/** Content of each phase view row; the phases come from phaseViews in env/compact.ts. */
export const phaseViewRows: readonly { keys: readonly string[]; content: string }[] = [
  { keys: ['hand', 'deck'], content: 'card lines; `"44/52"` = draw pile / deck size' },
  { keys: ['round'], content: '`{score,target,hands,discards}`, plus `played` (this round\'s hand counts, or `"?"`)' },
  { keys: ['cashOut'], content: '`{blind,score,target,payout}`, `lines` when known' },
  { keys: ['shop'], content: '`{cards,vouchers,packs}`, each with its own indices; PACK only when opened from the shop' },
  { keys: ['pack'], content: '`{name,picks,items}`; picks are remaining choices' },
  { keys: ['profiles'], content: 'deck → unlocked stakes, `locked` or `?`' },
  { keys: ['runResult'], content: '`"Lost at Ante 3 Big Blind: 1800/3000"`; also sent with a won terminal result' },
];

function phasesOf(keys: readonly string[]): readonly string[] {
  const phases = phaseViews[keys[0]!] ?? [];
  if (keys.some(key => phaseViews[key]?.join() !== phases.join())) throw new Error(`Phase view row ${keys.join()} mixes different phases`);
  return phases;
}

/** "hand and deck (SELECTING_HAND, PACK), round (SELECTING_HAND), ..." for tool descriptions. */
export function phaseViewSentence(): string {
  return phaseViewRows.map(row => `${row.keys.join(' and ')} (${phasesOf(row.keys).join(', ')})`).join(', ');
}

function phaseViewTable(): string {
  return ['| key | phases | content |', '| --- | --- | --- |',
    ...phaseViewRows.map(row => `| ${row.keys.map(key => '`' + key + '`').join(', ')} | ${phasesOf(row.keys).join(', ')} | ${row.content} |`)].join('\n');
}

/** Served as balatro://guide: the field contract of this server. Phase views come from phaseViews. */
export const toolGuide = `# Balatro MCP tool workflow

Connect to the original Steam desktop Balatro 1.0.1o game (Windows or macOS) with the bundled balatro_mcp_mod mod,
Steamodded/Lovely and LuaSocket. Start with \`game_health\`, inspect \`ready\` and
\`notReadyReason\`, then call \`game_observe\`. Close dialogs or wait for animations
when the game is unready. The MCP server does not launch the game or run a model.
On macOS, run \`npm run install:macos\` with the game closed, then
\`npm run launch:macos\` in a separate terminal for Lovely injection. The installer
and launcher support Apple Silicon/Intel and custom Steam library locations.

Initialization instructions contain only a short operating contract. Read
\`balatro://rules\` for mechanics and \`balatro://protocol\` for the full decision
protocol when needed. Read \`balatro://skills\` for each gameplay skill, its
\`skill://<name>/<path>\` files with titles and sizes, and discovery diagnostics.
Read those URIs with MCP resources/read; a relative link in a skill file resolves
against that file's URI, as on a web page. Read \`balatro://objects/<name>\`
(optionally \`?kind=joker\`) for one named object's rules row and metadata instead
of a whole catalog file. Use \`skill:<name>\` MCP prompts for explicit skill
expansion. There are no file tools; skill files are read only through these resources.
\`balatro://context\` combines \`balatro://rules\`, \`balatro://protocol\` and the skill
catalog in one document. Skill text cannot authorize gameplay by itself.

## Tools and results

\`game_observe\` and \`game_start\` return a full v3 snapshot: \`{v:3, full:true, rev,
phase, actions, state}\`. \`game_action\` returns \`{rev, phase, actions, result, state?}\`
with only the state keys that changed; it falls back to a full snapshot when no
matching baseline exists. \`deck_observe\` returns grouped remaining-deck composition
without draw order or action indices. If its rev differs, observe again before acting.
\`game_start\` starts only from the menu or a finished run; deck/stake names are uppercase.
In every booster pack, \`actions\` lists \`pack\` for choosing a card and \`skip\`
for leaving the pack when available. Use \`{"method":"skip"}\` to skip any
Arcana, Celestial, Spectral, Standard or Buffoon pack, including Jumbo and Mega
sizes and packs opened by Tags. \`{"method":"pack","card":0}\` chooses a card;
the former \`pack\` action with a \`skip\` flag is no longer accepted. Outside
packs, \`skip\` still skips a Small or Big Blind.

Pass the latest \`rev\` as \`revision\`. It is the bridge counter; the server restores
the full bridge revision it issued to this connection, and an unissued counter fails
with \`stale_state\` without dispatching. Full \`<instance>:<counter>\` revisions are
internal to the bridge and are rejected by \`game_action\`. Indices are zero-based within each area.
\`actions\` lists phase candidates with limits (\`play 1-5\`, \`reroll $5\`); actions the
game reports unavailable are omitted. \`use\`, \`sell\` and \`rearrange\` apply whenever
their area is non-empty. The game validates price, slots, targets and forced cards.

Results use \`{ok:true,value:...}\` or
\`{ok:false,code,applied,message}\` with MCP \`isError:true\` for failure.
\`applied\` is \`true\`, \`false\`, or \`"unknown"\`. Preserve it when deciding recovery.
\`notReady\` appears only while the game is not at a decision boundary (then
\`actions\` is empty); \`outcome\` appears only when the run is won or lost.

### Merging an action result

1. \`full:true\` replaces everything.
2. Otherwise keys present in \`state\` update and absent keys keep their value.
3. An array replaces the whole value. An object merges one level per member; a
   null member is deleted. An object such as \`{"2":"…"}\` on \`consumables\` or
   \`hand\` replaces only those elements; it is sent only while membership and
   order are unchanged. When \`jokers\` is present, it is always the complete
   ordered array, including unchanged Jokers; an empty array clears the area.
4. When the phase changes, drop views the new phase does not use (below).
5. Entering \`BLIND_SELECT\` from another phase resends \`blind\` and \`blinds\` whole
   (members that disappeared are null), even when they did not change, so the
   skip Tag and Boss are always in the result that offers the choice.

\`result\` is one English sentence of facts from this action; it is not state.
Missing/mismatched baselines, start/new run, source or readiness changes and
terminal results return full snapshots. Failed actions invalidate the delta
baseline. Internal health and preflight reads do not establish a baseline.
After context compaction or an external game change, call game_observe.

IDs use counters rather than hashes or UUIDs. Actions, calls and trace files share
a readable process-start timestamp/PID prefix, followed by their kind and counter.
Bridge revisions retain their instance prefix internally, so old values expire across a
bridge restart. Successful results omit actionId; game_operation inspects the last
action without one.

## State fields

\`state\` is flat. \`"?"\` means unknown everywhere.

Run keys (present while a run exists):

- \`setup\`: \`"RED deck, WHITE stake"\`; \`, seed X\` is appended only after
  the run ends (won or lost). Operation inspection also hides ongoing seeds.
  \`ante\` is the Ante that owns
  \`blinds\`; after a Boss it changes when cash-out creates the next blinds.
  \`roundNo\`, \`money\`, \`credit\` (only when non-zero), \`handSize\`, \`jokerSlots\`,
  \`consumableSlots\`.
- \`hands\`: poker hand → \`"<chips>x<mult>[ LvN][ played N]"\`, observed values ordered
  by hand rank; Lv1 and zero plays are omitted. \`played\` is cumulative for the run.
- \`jokers\`, \`consumables\`: ordered lines \`"<i>: <Name> [tags]: <effect>"\`.
- \`vouchers\`, \`tags\`: \`"<Name>: <effect>"\` lines for redeemed vouchers and held tags.
- \`blind\`: current or next role (Small/Big/Boss). \`blinds\`: role → line such as
  \`"1350; skip: Juggle Tag (+3 hand size next round)"\`,
  \`"The Needle 900: Play only 1 hand"\`, \`"900 [defeated]"\`. Boss lines include
  dynamic state: The Eye \`(used: Pair, Flush)\`, The Mouth \`(locked: Pair)\`.

Phase views (dropped when the phase no longer uses them):

${phaseViewTable()}

Line tags, in order: \`Tarot\`/\`Planet\`/\`Spectral\`, \`$N\` (buy price), \`sell $N\` or
\`eternal\`, \`rental\`, \`perishable N\`, edition, \`debuffed\`, target count such as
\`2 targets\` or \`1-2 targets\`. Playing cards read \`"<i>: AD [bonus, foil, red seal,
+5 chips, debuffed]"\`; \`Stone\` has no rank or suit; a face-down card is \`"<i>: ?"\`
with only \`forced\`/\`selected\`. Effects use read-only bindings to observed values;
an unresolved variable appears as \`?\`. No line precomputes affordability or slot
eligibility: compare price with money and the area length with its slots.

The decision observer reads existing state and English localization only. It
never creates Tags, invokes game actions, initializes random choices or reveals
hidden card identities. The Lua HTTP wire protocol remains version 1; v3 is the
model projection. Stage and install the updated mod, then restart Balatro to load
it. Staging does not reload the game. \`game_health\` reports \`notReadyReason\`.

## Examples

1. Attach to a run: \`game_health({})\`, \`game_observe({})\`, then
   \`deck_observe({})\` if composition matters.
2. Start from the menu: \`game_start({"deck":"RED","stake":"WHITE","seed":"MCPTEST"})\`.
3. With the returned rev, select a blind:
   \`game_action({"revision":"<rev>","action":{"method":"select"}})\`.
4. In a hand: \`game_action({"revision":"<rev>","action":{"method":"play","cards":[0,1,2,3,4]}})\`.

## Recovery and persistence

After \`uncertain_outcome\`, stop mutations. Never automatically resubmit the action.
Call \`game_operation({})\` to inspect this process's last action, or supply an
\`actionId\`. Inspection is read-only and never clears a lock. \`game_observe\` can
release the client lock only after validating a correlated completed operation.
A compatible mod restart invalidates old revisions and action IDs. Failed Lua
operations can require restarting the bridge. A timeout/cancellation can occur
after dispatch; do not infer that the action was unapplied. Before dispatch,
cancellation returns \`cancelled\` with \`applied:false\`, and budget expiry returns
\`timeout\` with \`applied:false\`. After dispatch, either becomes \`uncertain_outcome\`
with the known application status and a retained operation ID; inspection remains available.

Calls within one MCP process execute sequentially. Use one controlling process per
game and data directory. Simultaneous clients/manual gameplay can invalidate state.
The default client tool budget is 30 seconds, starting when its queued handler
begins execution. All preflight observations, dispatch and completion polls share
that one monotonic deadline; \`game_start\`'s initial observation uses the same budget.
Cancellation while queued is checked before execution. The mod's separate deadline
is 20 seconds. Increase both for long scoring animations; configure the mod's
\`BALATRO_MCP_MOD_ACTION_TIMEOUT\` (seconds) before launching the game.

MCP call traces go to \`data/traces\`.
`;
