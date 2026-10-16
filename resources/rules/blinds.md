# Blind targets and every Boss

| Ante | White/Red | Green/Black/Blue | Purple/Orange/Gold |
| --- | --- | --- | --- |
| 0 or below | 100 | 100 | 100 |
| 1 | 300 | 300 | 300 |
| 2 | 800 | 900 | 1000 |
| 3 | 2000 | 2600 | 3200 |
| 4 | 5000 | 8000 | 9000 |
| 5 | 11000 | 20000 | 25000 |
| 6 | 20000 | 36000 | 60000 |
| 7 | 35000 | 60000 | 110000 |
| 8 | 50000 | 100000 | 200000 |

| Boss | Earliest ordinary Ante | Effect |
| --- | --- | --- |
| The Hook | 1 | Randomly discard two held cards after playing |
| The Ox | 6 | Set money to zero on playing the Boss's specified most-played hand type |
| The House | 2 | Initial hand face-down |
| The Wall | 2 | X4 target |
| The Wheel | 2 | Listed 1/7 chance per drawn card to be face-down |
| The Arm | 2 | Reduce the played hand's level by one, minimum 1 |
| The Club | 1 | Debuff Clubs |
| The Fish | 2 | Cards drawn after a play are face-down |
| The Psychic | 1 | Hands with fewer than five played cards do not score |
| The Goad | 1 | Debuff Spades |
| The Water | 2 | Remove starting discards |
| The Window | 1 | Debuff Diamonds |
| The Manacle | 1 | -1 temporary hand size |
| The Eye | 3 | A hand type already played this round does not score |
| The Mouth | 2 | Only the first played hand type can score this round |
| The Plant | 4 | Debuff face cards |
| The Serpent | 5 | Draw exactly three after plays/discards, possibly beyond hand size |
| The Pillar | 1 | Debuff cards played earlier in the same Ante |
| The Needle | 2 | Set hands to one; X1 target |
| The Head | 1 | Debuff Hearts |
| The Tooth | 3 | Lose $1 per played card |
| The Flint | 2 | Halve base hand C/M with ceiling after before-scoring hooks |
| The Mark | 2 | Deal face cards face-down |
| Amber Acorn | Showdown | Flip and shuffle Jokers; abilities still execute in actual order |
| Verdant Leaf | Showdown | Debuff all playing cards until a Joker is sold |
| Violet Vessel | Showdown | X6 target |
| Crimson Heart | Showdown | Disable one eligible Joker; select again on subsequent hand/draw transitions |
| Cerulean Bell | Showdown | Force selection of one hand card |

Target factors: Small X1, Big X1.5, Boss normally X2; Wall X4, Needle X1, Vessel X6. Plasma adds X2. Direct rewards: $3/$4/$5, Showdown $8, subject to Stake/Challenge/rescue. Gold Ante-8 Vessel=1,200,000; Plasma=2,400,000.

For Ante>8: c=Ante-8, d=1+.2*c, raw=`floor(A8*(1.6+(.75*c)^d)^c)`; base=`raw-raw%(10^floor(log10(raw)-1))`, A8 from the chosen column. Then apply factors; use observed target at floating-point extremes.

Boss pool uses Ante, ordinary/Showdown class, bans and least-used history. Showdowns occur on multiples of eight; rerolls preserve class. Ox fixes its target for the Boss. Eye/Mouth reset per round; Royal=Straight Flush. Crimson Heart resamples after plays/draws, respecting intrinsic debuffs. Pillar uses individual/copyable history; Enhancement changes can clear its source-era debuff, rank/suit/Edition/Seal changes alone cannot.

Chicot/Luchador disabling restores Wall/Vessel to X2 but Needle stays X1; resource recovery is effect-specific. Verdant Leaf requires a Joker sale, not destruction; Eternal blocks sale. Matador supports Ox, Arm, Club, Psychic, Goad, Window, Eye, Mouth, Plant, Pillar, Head, Flint, Leaf; low score or other Boss activity alone does not qualify.

Adapted from Balatro Wiki contributors, snapshot 2026-10-02, version 1.0.1o-FULL. [Sources and CC BY-NC-SA 3.0 license](balatro://rules/sources).
