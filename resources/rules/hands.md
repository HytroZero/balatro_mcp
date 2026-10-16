# Poker hands and recognition

Choose the highest recognized canonical type regardless of level/possible score; ordinarily only its contributing cards score. Add Stone to that subset; Splash makes all played cards score. Incidental cards still affect played-count conditions.

| Hand, low to high priority | Structure | Level-1 C/M | Per-level +C/+M | Planet |
| --- | --- | --- | --- | --- |
| High Card | Highest eligible single card | 5/1 | 10/1 | Pluto |
| Pair | Two equal ranks | 10/2 | 15/1 | Mercury |
| Two Pair | Two pairs of different ranks | 20/2 | 20/1 | Uranus |
| Three of a Kind | Three equal ranks | 30/3 | 20/2 | Venus |
| Straight | Five consecutive ranks | 30/4 | 30/3 | Saturn |
| Flush | Five cards of one effective suit | 35/4 | 15/2 | Jupiter |
| Full House | Three of one rank plus two of another | 40/4 | 25/2 | Earth |
| Four of a Kind | Four equal ranks | 60/7 | 30/3 | Mars |
| Straight Flush | Straight and Flush predicates | 100/8 | 40/4 | Neptune |
| Five of a Kind | Five equal ranks | 120/12 | 35/3 | Planet X |
| Flush House | Full House plus Flush predicate | 140/14 | 40/4 | Ceres |
| Flush Five | Five of a Kind plus Flush predicate | 160/16 | 50/3 | Eris |

At level L, base C/M are `C1+(L-1)*dC`, `M1+(L-1)*dM`. Royal Flush is Ace-high Straight Flush and shares its level/counts/Planet. The last three hands start hidden; playing reveals them and enables their Planets. Black Hole upgrades hidden hands too; Arm's minimum is level 1.

Chip values: numbered rank, J/Q/K=10, A=11; poker rank IDs 2-14 remain distinct. J/Q/K are natural face cards, Ace is not; Pareidolia changes face predicates. Stone has no effective rank/suit. Debuffed ordinary cards still form hands but contribute no card effects; debuffed Wild loses any-suit behavior.

Ace is high or low, never wrapping: `10 J Q K A`, `A 2 3 4 5` valid; `K A 2 3 4` invalid. Four Fingers requires four for Straight/Flush, including hidden Flush predicates; Straight Flush uses the union of potentially different subsets (`9S 8S 7H 6S 3S` qualifies). Shortcut allows rank gaps 1 or 2, no arbitrary gaps/wrapping. Smeared equates red suits and black suits. One Wild is still one physical card.

Canonical type, contains predicates and scoring subset differ. Three/Four/Five of a Kind contain Pair; Four of a Kind is not Two Pair. Full House satisfies Two Pair in this source. A higher type can still contain Flush/Straight for relevant Jokers. Recognition is order-independent; resolution need not be.

Adapted from Balatro Wiki contributors, snapshot 2026-10-02, version 1.0.1o-FULL. [Sources and CC BY-NC-SA 3.0 license](balatro://rules/sources).
