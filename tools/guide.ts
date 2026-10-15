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

/** Served as balatro://guide: the field contract; phase views come from the projection. */
export const toolGuide = `# Balatro state and action guide

This is the field contract. Execution and recovery are in \`balatro://protocol\`; scoring output is in \`balatro://analysis\`.

## Envelopes and indices

Success is \`{ok:true,value}\`; failure is \`{ok:false,code,applied,message}\` with MCP \`isError:true\`. Preserve \`applied\` (\`true\`, \`false\` or \`"unknown"\`) for recovery.

\`game_observe\` and \`game_start\` return \`{v:3,full:true,rev,phase,actions,state}\`. \`game_action\` normally returns \`{rev,phase,actions,result,state?}\` with changed keys only. \`notReady\` means no decision boundary and empty \`actions\`; \`outcome\` is \`won\` or \`lost\`. Handle these flags per the protocol, including \`uncertain_outcome\`.

Pass the latest issued short \`rev\` as \`revision\`; internal instance-prefixed revisions are not action inputs. Indices are zero-based within each area. Item lines begin with the action index; take it from the latest state.

\`actions\` lists candidates and limits, not eligibility. \`use\`, \`sell\` and \`rearrange\` may be omitted from that list; compare the area's contents with the item's requirements. Use \`{"method":"skip"}\` to leave any booster pack, and \`{"method":"pack","card":i,"targets":[...]}\` to choose an item when targets are required. Outside packs, \`skip\` skips Small/Big.

\`rearrange\` requires a full permutation of one area. Ordering a \`play\` or Tarot target list does not reorder cards physically. After rearranging, use the returned state's indices.

## Delta merge

1. \`full:true\` replaces the entire snapshot.
2. Otherwise absent state keys keep their values; arrays replace their entire value.
3. Objects merge one level per member; \`null\` deletes a member. A patch such as \`{"2":"…"}\` on \`hand\` or \`consumables\` replaces only those elements, while membership/order remain unchanged.
4. \`jokers\` always replaces the complete ordered array when present; \`[]\` clears it.
5. On a phase change, drop views not used by the new phase (table below). Entering \`BLIND_SELECT\` resends \`blind\` and \`blinds\`, with vanished members null.

PACK responses always include the full \`state.consumables\` array, even when unchanged or empty, so held items remain visible while choosing from a pack.

\`result\` summarizes the action. \`effects\` lists which cards triggered effects during this play, in order. Its card indices refer to the cards before the play; \`?\` marks a face-down card.

Missing baselines, start, source/readiness changes and terminal results may return full snapshots. Failed actions invalidate the delta baseline.

## State fields

\`state\` is flat; \`"?"\` means unknown.

- \`setup\`: deck/stake; seed is appended only after the run ends.
- \`ante\` owns the displayed \`blinds\`; \`roundNo\` counts played rounds.
- \`money\`, optional nonzero \`credit\`, \`handSize\`, \`jokerSlots\` and \`consumableSlots\` are current resources/capacities.
- \`hands\` maps poker hands to \`"<chips>x<mult>[ LvN][ played N]"\`. Lv1/zero plays are omitted; \`played\` here is cumulative for the run.
- \`jokers\` and \`consumables\` are ordered item lines; \`vouchers\` and \`tags\` describe owned effects.
- \`blind\` is the current/next role (Small/Big/Boss). \`blinds\` maps roles to target, defeated status, skip Tag and Boss restrictions, including dynamic Eye/Mouth history.

Phase views exist only in these phases:

${phaseViewTable()}

An item reads \`"<i>: <Name> [tags]: <effect>"\`. Tags identify type, purchase/sell price, Eternal/Rental/Perishable timer, edition, debuff and target range. Compare price to money and contents to capacity; lines do not precompute eligibility.

A playing card reads \`"0: AD [bonus, foil, red seal, +5 chips]"\`. Stone has no rank/suit. Face-down cards read \`"0: ?"\` with only forced/selected tags. Unresolved effect values are \`?\`.

## Remaining deck and references

\`deck_observe\` returns \`remainingCards\`, \`previewCards\`, \`uncertainCards\` and grouped \`"<count>x <card> [attributes]"\` lines. These have no draw order or action indices. The preview can include face-down held cards, without identifying them; do not treat uncertain membership as an exact draw distribution. Actions do not refresh this preview. If its \`rev\` differs, observe before acting.

Read skill files through their \`skill://\` URIs. Relative references resolve against the containing file's URI as on a web page. Use \`balatro://objects/<name>\` for one mechanic; follow its chapter link for broader context.
`;
