# ch07 Blind Targets, Boss Events, and History

## Select the Ante-target column

Use the snapshot's base targets through Ante 8. White/Red use Base; Green/Black/Blue use Green+; Purple/Orange/Gold use Purple+. Source: [Blinds and Antes](https://balatrowiki.org/w/Blinds_and_Antes).

| Ante | Base | Green+ | Purple+ |
| --- | ---: | ---: | ---: |
| 0 or below | 100 | 100 | 100 |
| 1 | 300 | 300 | 300 |
| 2 | 800 | 900 | 1000 |
| 3 | 2000 | 2600 | 3200 |
| 4 | 5000 | 8000 | 9000 |
| 5 | 11000 | 20000 | 25000 |
| 6 | 20000 | 36000 | 60000 |
| 7 | 35000 | 60000 | 110000 |
| 8 | 50000 | 100000 | 200000 |

Multiply by X1 for Small, X1.5 for Big, and normally X2 for Boss. Exceptions: The Wall X4, The Needle X1, Violet Vessel X6. Plasma adds another X2. Direct rewards are $3 Small, $4 Big, $5 ordinary Boss, and $8 Showdown, subject to Stake, Challenge, and Mr. Bones overrides.

## Apply the 28 Boss constraints

Check ordinary eligibility for entries marked Any. Showdowns occur at multiples of Ante 8, rather than every Ante at or above 8.

| Boss | Minimum Ante | Main rule |
| --- | ---: | --- |
| The Hook | Any | Randomly discard two held cards after each play |
| The Ox | 6 | Set money to 0 when the specified most-used hand type is played |
| The House | 2 | Deal the initial hand face-down |
| The Wall | 2 | X4 target |
| The Wheel | 2 | 1/7 chance for each drawn card to be face-down |
| The Arm | 2 | Reduce the played hand's level, minimum 1 |
| The Club | Any | Debuff Clubs |
| The Fish | 2 | Cards drawn after playing are face-down |
| The Psychic | Any | Require five played cards |
| The Goad | Any | Debuff Spades |
| The Water | 2 | Set starting discards to 0 |
| The Window | Any | Debuff Diamonds |
| The Manacle | Any | -1 hand size |
| The Eye | 3 | No repeated hand type within this round |
| The Mouth | 2 | Only one hand type within this round |
| The Plant | 4 | Debuff face cards |
| The Serpent | 5 | Draw exactly 3 after playing or actively discarding |
| The Pillar | Any | Debuff cards previously played during this Ante |
| The Needle | 2 | One hand; X1 target |
| The Head | Any | Debuff Hearts |
| The Tooth | 3 | -$1 for each played card |
| The Flint | 2 | Halve base hand Chips and Mult |
| The Mark | 2 | Draw face cards face-down |
| Amber Acorn | Showdown | Turn Jokers face-down and shuffle their order |
| Verdant Leaf | Showdown | Debuff all cards until a Joker is sold |
| Violet Vessel | Showdown | X6 target |
| Crimson Heart | Showdown | Randomly disable one Joker each hand |
| Cerulean Bell | Showdown | Force selection of one card |

Load individual articles through [objects.md](../references/objects.md) for timing, rounding, candidate filtering, and recovery actions.

## Keep action legality separate from scoring validity

Hands that violate The Psychic, Eye, or Mouth can still be played and spend resources, but do not score/trigger normally. An action mask that forbids every such play changes the game. Define executable actions separately from normally scoring hands. Source: [Blinds and Antes](https://balatrowiki.org/w/Blinds_and_Antes).

Eye's history is round-local; Mouth's fixed hand type follows the current round's rule. Count Royal Flush as Straight Flush. Arm reduces the level before this hand resolves, without crossing level 1. Sources: [The Eye](https://balatrowiki.org/w/The_Eye), [The Mouth](https://balatrowiki.org/w/The_Mouth), [The Arm](https://balatrowiki.org/w/The_Arm).

## Preserve Pillar's gameplay history

Track individual-card Ante history, rather than debuffing every card of a previously played rank. The Wiki reports that changing Enhancement can clear Pillar debuff; changing only rank/suit, Edition, or Seal cannot. Retain physical `card_id` separately from the gameplay played-this-Ante marker. Sources: [The Pillar](https://balatrowiki.org/w/The_Pillar), [Negative Effects](https://balatrowiki.org/w/Negative_Effects).

Death/Cryptid can copy the history marker, so physical identity alone is insufficient. Death from a debuffed source can transfer the state; copying in the reverse direction can clear it. Hieroglyph/Petroglyph changing the displayed Ante integer does not clear the history. Reset on actual progression events rather than every integer change.

## Handle rounding and draws

The Flint halves base hand Chips/Mult and **rounds up**, before added card/Joker contributions. Level-1 High Card 5/1 becomes 3/1; Straight 30/4 becomes 15/2. Source: [The Flint](https://balatrowiki.org/w/The_Flint).

The Serpent's fixed draw of 3 can exceed ordinary hand size. Do not clamp every draw path to hand size. Source: [The Serpent](https://balatrowiki.org/w/The_Serpent).

## Resolve disabling and Boss selection

Selling Luchador or holding Chicot can disable Boss abilities. Wall/Vessel targets revert to ordinary X2; disabling Needle does not raise its X1 target. Check individual rules and live behavior for restoring already-modified resources such as Water's discards. Removing one flag cannot necessarily undo every applied effect.

Filter Boss selection by minimum Ante, ordinary/Showdown class, Challenge bans, and appearance history. The Wiki describes selecting from the least-used eligible group, including rerolls. Do not draw independently from all 28 each Ante. Check precise history/RNG updates separately. Director's Cut/Retcon rerolls retain the current Ante's Boss class.

## Use Matador's supported trigger set

Supported: Ox, Arm, Club, Psychic, Goad, Window, Eye, Mouth, Plant, Pillar, Head, Flint, Verdant Leaf. Other Boss effects involving hidden cards, money loss, discarded cards, resource changes, or larger targets do not automatically trigger Matador. Emit an explicit supported Boss-hand-trigger event instead of testing `score < target`. Source: [Matador](https://balatrowiki.org/w/Matador).

## Reconstructed cases and checks

**Gold Ante 3:** Big target=`3200*1.5=4800`; Wall target=12800. Plasma doubles each. Test the Stake column, Blind multiplier, and Deck factor separately.

**Serpent:** begin with 8 cards, discard one, and retain 7. With enough draw-pile cards, draw 3 and reach 10. Refilling to 8 incorrectly removes two available cards.

Organize regressions around select, draw, before score, score, after action, disable, and round exit. Check stacked debuff causes and restoration of temporary hand-size changes.

Related: [ch01 Actions](ch01-run-lifecycle.md), [ch04 Debuffs](ch04-card-modifiers.md), [ch12 Traces](ch12-validation.md).
