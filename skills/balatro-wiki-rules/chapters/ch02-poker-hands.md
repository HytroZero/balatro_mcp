# ch02 Poker Hands, Levels, and Scoring Sets

## Use the hand-value table

All hands start at level 1. The table lists level-1 Chips/Mult and per-level increments, ordered from lowest to highest canonical priority. Royal Flush is a display variant of Straight Flush. Sources: [Poker hands](https://balatrowiki.org/w/Poker_hands), [Planet cards](https://balatrowiki.org/w/Planet_cards).

| Hand key | Chips | Mult | +Chips per level | +Mult per level | Planet |
| --- | ---: | ---: | ---: | ---: | --- |
| High Card | 5 | 1 | 10 | 1 | Pluto |
| Pair | 10 | 2 | 15 | 1 | Mercury |
| Two Pair | 20 | 2 | 20 | 1 | Uranus |
| Three of a Kind | 30 | 3 | 20 | 2 | Venus |
| Straight | 30 | 4 | 30 | 3 | Saturn |
| Flush | 35 | 4 | 15 | 2 | Jupiter |
| Full House | 40 | 4 | 25 | 2 | Earth |
| Four of a Kind | 60 | 7 | 30 | 3 | Mars |
| Straight Flush | 100 | 8 | 40 | 4 | Neptune |
| Five of a Kind | 120 | 12 | 35 | 3 | Planet X |
| Flush House | 140 | 14 | 40 | 4 | Ceres |
| Flush Five | 160 | 16 | 50 | 3 | Eris |

At level L, initialize `C1 + (L-1)*dC` and `M1 + (L-1)*dM`, then resolve cards and Jokers. The Arm cannot reduce a level below 1. Black Hole upgrades undiscovered hidden hands too; ordinary eligibility for their Planets requires playing the corresponding hand during the run.

## Compute three independent results

1. **`hand_type`:** choose the highest-priority valid candidate regardless of current level or potential score.
2. **`contains`:** evaluate structures required by Joker text. Three of a Kind contains Pair. Four of a Kind does not contain Two Pair, which requires two different ranks.
3. **`scoring_cards`:** retain identities and order of contributing cards, then apply Stone, Splash, and Four Fingers rules.

Keep `is Straight Flush` distinct from `contains Straight`: Séance and Crazy Joker use different conditions. Five of a Kind and Flush Five do not contain Full House or Two Pair. Source: [Jokers](https://balatrowiki.org/w/Jokers).

## Preserve rank, suit, and identity

Ace can be high or low: `A K Q J 10` and `A 2 3 4 5` are valid Straights; `K A 2 3 4` is invalid. Rank is separate from chip value. Numbered cards contribute their number, J/Q/K contribute 10, and Ace contributes 11. Do not classify all 10-chip cards as the same rank. Source: [Chips](https://balatrowiki.org/w/Chips).

Give each card an ID independent of `(rank, suit)`. Copies can share properties while remaining distinct entities. Stone has no effective rank/suit for ordinary matching but can score. Debuffed ordinary cards retain hand structure but contribute no card chips or disabled abilities. Face-down cards use true properties for resolution while limiting observation. See [ch04](ch04-card-modifiers.md).

## Handle Four Fingers and Shortcut

Four Fingers reduces the Straight/Flush minimum to 4. Straight Flush can use different subsets for its Straight and Flush conditions. For example, `9♠ 8♠ 7♥ 6♠ 3♠` has four consecutive ranks and four Spades, so it can form Straight Flush. Do not require one subset to satisfy both. Source: [Four Fingers](https://balatrowiki.org/w/Four_Fingers).

Four Fingers also affects the Flush condition in Flush House/Flush Five. Verify matching and final scoring subsets separately. Shortcut permits adjacent Straight rank gaps of 1 or 2; it does not permit arbitrary gaps or Ace wrapping. Source: [Shortcut](https://balatrowiki.org/w/Shortcut).

## Evaluate suit predicates per ability

Wild matches any suit, but Flower Pot requires at least four distinct scoring cards assignable to the four suits. One Wild fills one assignment; retriggers do not add distinct cards. Smeared Joker changes suit equivalence. Seeing Double's non-debuffed scoring requirements differ from Flower Pot's treatment of debuffed ordinary cards. Use each ability's predicate instead of a universal suit-union test. See [ch05](ch05-jokers.md), [Flower Pot](https://balatrowiki.org/w/Flower_Pot), and [Seeing Double](https://balatrowiki.org/w/Seeing_Double).

## Reconstructed cases

**`9♦ 9♦ 9♦ 9♦ 2♦`:** canonical Four of a Kind even if Flush has a higher level. Contains Pair, Three of a Kind, Four of a Kind, and Flush; does not contain Two Pair. Ordinary scoring uses the four 9s. With no other effects, `Chips=60+4*9=96`, `Mult=7`, `score=672`. Duplicate cards require a modified or nonstandard deck.

**`A♠ K♥ 9♣ 7♦ 3♠`:** level-1 High Card gives `Chips=5+11=16`, `Mult=1`, `score=16`. Splash makes all played cards score without changing the hand type.

## Verify recognition and resolution separately

Cover permutations, both Ace endpoints, invalid wrapping, distinct-rank Two Pair, hidden-hand priority, duplicate entities, Stone, Splash, Four Fingers with different subsets, debuffed Wild, and shared Royal Flush levels. Classification should be invariant to order; final score need not be.

Related: [ch03 Ordering](ch03-scoring-sequence.md), [ch04 Properties](ch04-card-modifiers.md), [ch09 Levels and mutations](ch09-consumables.md).
