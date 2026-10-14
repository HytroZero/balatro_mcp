# Balatro game context

Target: original PC **1.0.1o-FULL**, `PROD_PC_Console`. Static source/Wiki review, 2026-10-07. Run observations supply current values, profile, modifiers and supported actions. A protocol fixture does not implement these mechanics.

Notation: C=Chips, M=Mult, +M adds Mult, Xn multiplies Mult by n. A hand is one play; a round is one attempted Blind; an Ante normally contains Small Blind, Big Blind and Boss Blind. Playing cards, Jokers and consumables are distinct types. Names/keys below identify objects independently of translation.

## 1. Objective, state and full run lifecycle

Balatro is a single-player poker-based roguelike deck builder: reach Blind score targets with limited hands while building a deck and effects. There is no opposing poker hand or wagering pot. Win by clearing the Ante-8 Boss, then stop or choose Endless; an Endless loss does not undo that win. Challenges/mods may change the configured win Ante.

Standard start: 52 cards (2-A in four suits), $4, hand size 8, 4 hands/3 discards per round, 5 Joker slots, 2 consumable slots. Apply Deck, cumulative Stake, Challenge and owned effects. Profile unlocks/discoveries affect pools.

1. Select the current Blind or skip Small/Big for its Tag; Boss cannot normally be skipped. A skip advances selection with no round, Cash Out or ordinary shop. Immediate-pack Tags temporarily interrupt selection.
2. Selecting resets round score/resources/history and fires start effects (Burglar, Marble, Riff-Raff, Certificate). Shuffle/deal the surviving deck. Money, cards, levels and owned growth persist.
3. Select 1-5 cards to play or actively discard; honor forced cards and resources. Reorder cards/Jokers when supported. One play spends one hand, resolves scoring and adds score. All played cards leave the hand, even non-scoring cards. One active discard spends one discard for its batch, fires discard effects and draws without scoring/spending a hand.
4. Normally draw toward current hand size. No automatic in-round reshuffle of played/discarded cards. Serpent draws exactly three after actions and can exceed hand size. An empty hand/draw pile can end an attempt even with a counter left.
5. Reaching target ends the round immediately; running out of usable hands below target loses unless Mr. Bones rescues at >=25%. Resolve round-end effects, Rental, Perishable, held rewards and Cash Out. Accept settlement, shop, then leave for next selection; Perkeo triggers on shop exit. Boss defeat advances Ante, resets actual Ante history and refreshes the ordinary Voucher. At the win point, handle the backend's terminal state/overlay rather than starting another round automatically.

Distinguish full surviving deck, current draw pile, held, all played, scoring subset, actively discarded and destroyed cards. Full-deck counts include drawn/played cards. Copies have distinct identities. Forced Boss discard/removal is not automatically an active-discard reward. Card order affects scoring; sorting changes positions, not identity.

Round-local: Eye/Mouth/Card Sharp. Run-wide: hand-type usage, skips, Tarot history. Entity-local: most Joker growth. Pillar's Ante marker clears on actual Boss progression, not merely Hieroglyph lowering the displayed Ante. Copies can transfer that marker. Face-down hides identity/order; it does not change the engine's true card.

## 2. Poker hands and recognition

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

## 3. Scoring order and retriggers

Add `floor(final C*final M)` per hand. The source's `evaluate_play` resolves:

1. Classify, increment run/round hand-type usage, set last played/reveal hidden types, build scoring set ordered left to right.
2. Boss `debuff_hand` gate (Arm/Ox/history included). Eye/Mouth/Psychic violations can still spend a hand and count usage, but score zero and skip normal scoring hooks; scoring validity is distinct from executable action legality.
3. Ordered Joker `before` effects: levels, growth and Midas/Vampire mutations. Refresh base C/M, then Blind `modify_hand`. Flint halves base values with ceiling after Space Joker; High Card 5/1 becomes 3/1.
4. Scoring cards left to right. For each activation, evaluate the card first then on-scored Jokers left to right. Apply its own chips/+M/money/extra/XM/Edition before the following Joker effects. Card Polychrome precedes those Jokers. Debuffed scoring cards give no effects.
5. Held cards left to right: card held effect then on-held Jokers, including retriggers. Steel precedes Baron/Raised Fist on that card; held playing-card Editions normally give no scoring bonus.
6. Jokers left to right: Foil/Holographic, independent ability, Joker-on-Joker effects such as Baseball, then Polychrome. Moving a Joker does not change its event phase.
7. Stored consumables follow Jokers: Observatory gives X1.5 per matching Planet. Plasma's final Deck step sets both C/M to `(C+M)/2`, then score is `floor(((C+M)/2)^2)`.
8. Glass/Sixth Sense destruction checks/removal notifications, after-hand hooks, then score/transition. Ice Cream/Seltzer decay afterward.

Activations normally equal `1 + Red Seal + eligible Joker contributions`: Hack, Sock and Buskin, Dusk, Seltzer add one; Hanging Chad adds two to the first scoring card. Add contributions; no recursive retriggers or repeated independent hand effects. Each activation rolls Lucky/on-scored randomness afresh. Glass repeats X2 but gets one break roll after scoring the full hand, regardless of retriggers; debuffed Glass neither multiplies nor breaks.

Mime/Red Seal repeat eligible held abilities, including round-end Gold/Blue Seal; generated items need room per activation including pending reservations. Repetition creates neither distinct cards nor played status.

Wee grows on each scored 2 then contributes its total independently. Hiker adds +5 permanent C after that activation's chips were evaluated, so later activations benefit. Before-scoring growth contributes immediately; after-hand decay later. Copying contribution does not duplicate target growth ownership.

For C=40,M=4, independent +4 then X2 gives 640; X2 then +4 gives 480. Steel King+Red Seal+Mime+Baron has three held activations, factor `(1.5*1.5)^3`. Photograph targets first scoring face; Chad targets first scoring card. Align targets when useful; hidden/random effects make previews uncertain.

## 4. Card modifiers and information

One Enhancement, Edition and Seal can coexist; Hiker bonus is additional state. Replacing one layer preserves others. Jokers have Editions/Stickers; Perkeo creates Negative consumables. Playing cards cannot be Negative; packs/Vouchers have no such layers.

| Enhancement | Key | Effect |
| --- | --- | --- |
| Bonus Card | m_bonus | +30 C when scoring |
| Mult Card | m_mult | +4 M when scoring |
| Wild Card | m_wild | Counts as any suit while active; can be debuffed by any suit Boss |
| Glass Card | m_glass | X2 when scoring; listed 1/4 destruction chance after scoring the hand |
| Steel Card | m_steel | X1.5 while held during hand resolution |
| Stone Card | m_stone | 50 C in place of rank chips; always joins the scoring set; no effective rank/suit |
| Gold Card | m_gold | $3 per held round-end activation |
| Lucky Card | m_lucky | Independent listed 1/5 for +20 M and 1/15 for $20 per scoring activation |

| Edition | Effect | Base price surcharge |
| --- | --- | --- |
| Base | No extra effect | 0 |
| Foil | +50 C | $2 |
| Holographic | +10 M | $3 |
| Polychrome | X1.5 | $5 |
| Negative | +1 slot in its Joker/consumable area while owned | $5 |

| Seal | Effect |
| --- | --- |
| Gold | $3 per scoring activation |
| Red | One additional activation of applicable scored/held abilities |
| Blue | At round end, create the Planet for the last played hand; require room |
| Purple | On active discard, create a Tarot; require room |

Eternal prevents sale/destruction. Perishable debuffs after five completed rounds; it excludes Eternal. Timer decrements after round-end Joker hooks, before Cash Out, so Golden pays only its first four settlements. Skips do not consume lifetime. Rental costs $1 to buy and $3 each round even when debuffed; it stacks with either and can create debt. Collection Stake Stickers are win-history markers only.

Debuffed cards preserve ordinary poker structure but lose chips/modifiers/normal on-scored rewards. Debuffed Jokers lose abilities/scoring Editions but remain countable by Abstract, Swashbuckler, Temperance and Baseball. Existing Negative capacity normally remains; adding Negative while debuffed has a version-era anomaly. Debuff, face-down and forced selection are independent. Do not use hidden diagnostic identities as player knowledge.

## 5. All Decks and cumulative Stakes

| Deck | Key | Changes |
| --- | --- | --- |
| Red Deck | b_red | +1 discard per round |
| Blue Deck | b_blue | +1 hand per round |
| Yellow Deck | b_yellow | +$10 start, total $14 |
| Green Deck | b_green | No interest; settlement $2 per unused hand and $1 per unused discard |
| Black Deck | b_black | +1 Joker slot, -1 hand per round |
| Magic Deck | b_magic | Crystal Ball already redeemed; two The Fool cards; capacity includes that Voucher |
| Nebula Deck | b_nebula | Telescope already redeemed; -1 consumable slot |
| Ghost Deck | b_ghost | Spectral shop weight 2; start with Hex |
| Abandoned Deck | b_abandoned | Remove J/Q/K, leaving 40 cards |
| Checkered Deck | b_checkered | 26 Spades and 26 Hearts, two of each rank in each suit |
| Zodiac Deck | b_zodiac | Tarot Merchant, Planet Merchant and Overstock already redeemed |
| Painted Deck | b_painted | +2 hand size, -1 Joker slot |
| Anaglyph Deck | b_anaglyph | Gain a Double Tag after each Boss defeat |
| Plasma Deck | b_plasma | X2 all Blind targets; balance final C/M before scoring |
| Erratic Deck | b_erratic | Randomize rank and suit independently for each of 52 starting cards |

| Stake order | Added rule; all previous rows also apply |
| --- | --- |
| 1 White Stake | Standard rules |
| 2 Red Stake | Small Blind has no direct Blind reward; other income remains |
| 3 Green Stake | Faster target scaling column |
| 4 Black Stake | Eligible shop/pack Jokers can be Eternal |
| 5 Blue Stake | -1 discard per round |
| 6 Purple Stake | Fastest target scaling column |
| 7 Orange Stake | Eligible shop/pack Jokers can be Perishable |
| 8 Gold Stake | Eligible shop/pack Jokers can be Rental |

Gold includes every previous row. Green/Purple select target columns, not stacked percentages. Current Orange does not raise pack prices; Gold does not reduce hand size. Black+Gold defaults: 6 Joker slots, 3 hands, 2 discards.

Shop/pack Joker Sticker draw: Eternal above .7, Perishable in (.4,.7] when enabled/compatible; they are exclusive 30% categories. Rental is independently 30%. Fully compatible Gold Jokers are 40% neither and 28% fully clean. Incompatible categories are not redistributed. Other creation/copy channels differ. Starting Vouchers apply effects, not labels. Stake unlocks are Deck-specific; seeded wins do not give normal unlock progression.

## 6. Blind targets and every Boss

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

## 7. Economy and shop

Cash Out pays Blind reward, $1 per unused hand, applicable Joker/Tag payouts and interest. Green instead pays `2*unused hands+unused discards`, no interest. Red+ removes only Small's direct reward; skips have no settlement. Bones rescue has no direct Blind reward but can pay Investment on Boss.

Interest uses already-held settlement balance: scoring/held Gold income and earlier Rental charges count; later Blind/unused-hand/Golden/Rocket payouts do not. For balance>=5, formula is `interest_amount*min(floor(balance/5),interest_cap/5)` unless disabled. Defaults amount=1, cap=25 ($5 income). Seed/Money Tree caps=50/100 ($10/$20); each To the Moon adds 1 to amount, including at cap. Passive fees can create debt without Credit Card; Credit permits purchases to -$20. Debt alone does not lose. Ox/Wraith clear to zero; Hermit/Economy do not enlarge debt.

Default shop: two ordinary cards, two packs, one Ante Voucher; first shop's first pack normally Normal Buffoon unless banned. Category weights Joker/Tarot/Planet=20/4/4; Magic Trick adds playing card 4, Ghost Spectral 2; Merchant weight=9.6, Tycoon=32. Normalize. Conditional Joker rarity 70/25/5%; no ordinary Legendary.

Reroll replaces ordinary stock only. Paid cost starts $5, +$1 per paid reroll, resets per shop; Surplus/Glut start $3/$1. Chaos grants one free reroll per copy/shop; D6 sets next shop's starting price zero. Packs refresh per shop, ordinary Voucher per Ante; extra Tag Vouchers separate. Overstock can refill added slots.

Base costs: playing $1, Tarot/Planet $3, Spectral $4, Voucher $10, pack $4/$6/$8; Jokers below. Price=`max(1,floor((base+Edition+inflation+.5)*(100-discount)/100))`; Clearance/Liquidation set 25/50% discounts. Then Astronomer cost=0 and Rental=1. Sell=`max(1,floor(current cost/2))+Egg/Gift bonus`. Coupon makes eligible shop purchases free after sell calculation, so free acquisition does not imply zero sell value; use actual prices for collisions.

Buying equips Joker/adds playing card/stores consumable/redeems Voucher/opens pack by type. Buy-and-use immediately resolves a valid consumable. Room, money/credit, targets and phase constrain legality. Sale differs from destruction for Luchador, Diet Cola, Invisible, Campfire and Leaf.

## 8. All consumables

Default storage two slots; Crystal Ball +1, Nebula -1. Generation needs room including reservations; using a stored item can release its slot. Targeting uses current hand, not an arbitrary full-deck card. Arcana/Spectral offers are used immediately on a supplied hand; stored consumables may also be usable.

| Tarot (22) | Action |
| --- | --- |
| The Fool | Create the last used Tarot/Planet type other than Fool; require room; does not copy its Edition |
| The Magician | Make 1-2 selected cards Lucky |
| The High Priestess | Create up to two random Planets within capacity |
| The Empress | Make 1-2 selected cards Mult |
| The Emperor | Create up to two random Tarots within capacity |
| The Hierophant | Make 1-2 selected cards Bonus |
| The Lovers | Make one selected card Wild |
| The Chariot | Make one selected card Steel |
| Justice | Make one selected card Glass |
| The Hermit | Gain the positive current balance, capped at $20 gained |
| The Wheel of Fortune | Listed 1/4 chance to Edition one eligible Base Joker; outcomes Foil/Holographic/Polychrome |
| Strength | Raise rank of 1-2 selected cards; K->A and A->2 |
| The Hanged Man | Destroy 1-2 selected cards |
| Death | Exactly two selected cards; left becomes a property copy of right |
| Temperance | Gain sum of current Joker sell values, capped at $50 |
| The Devil | Make one selected card Gold |
| The Tower | Make one selected card Stone |
| The Star | Change 1-3 selected cards to Diamonds |
| The Moon | Change 1-3 selected cards to Clubs |
| The Sun | Change 1-3 selected cards to Hearts |
| Judgement | Create an eligible random Joker; require room |
| The World | Change 1-3 selected cards to Spades |

| Spectral (18) | Action |
| --- | --- |
| Familiar | Destroy one random hand card, add three random Enhanced face cards |
| Grim | Destroy one random hand card, add two random Enhanced Aces |
| Incantation | Destroy one random hand card, add four random Enhanced 2-10 cards |
| Talisman | Gold Seal on one selected card |
| Aura | Foil/Holographic/Polychrome on one selected card |
| Wraith | Create a Rare Joker with room, then set money to 0 |
| Sigil | Convert all hand cards to one random suit |
| Ouija | Convert all hand cards to one random rank; -1 hand size |
| Ectoplasm | Give a random eligible Base Joker Negative; nth use costs n hand size |
| Immolate | Destroy five random hand cards, or all if fewer; gain $20; requires more than one held card |
| Ankh | Copy a random owned Joker, strip Negative from copy, destroy other non-Eternal Jokers |
| Deja Vu | Red Seal on one selected card |
| Hex | Give a random eligible Joker Polychrome; destroy other non-Eternal Jokers |
| Trance | Blue Seal on one selected card |
| Medium | Purple Seal on one selected card |
| Cryptid | Add two complete copies of one selected playing card |
| The Soul | Create a Legendary Joker; require room |
| Black Hole | Raise all 12 hand levels, including hidden ones, by one |

Fool remembers latest Tarot/Planet (including Fool); Spectral does not overwrite it. After Fool, another relevant use is needed. Death copies rank/suit/Enhancement/Edition/Seal/permanent bonuses/history while retaining separate physical entities, adding no card. Planets map to all 12 hands above and raise one level on use; use grows Constellation/records Satellite, holding does not. Hidden Planets need the corresponding hand played.

Aura requires an uneditioned target. Hex/Ectoplasm require an eligible uneditioned Joker. Ankh needs room under its original UI precondition; Ankh/Hex preserve other Eternal Jokers. Copy keeps growth/Stickers, strips Negative. Ectoplasm costs 1,2,3,... hand size. Familiar/Grim/Incantation add Enhanced non-Stone rank cards; those, Immolate, Sigil and Ouija require more than one held card. Immolate destroys all if fewer than five.

DNA/Cryptid copy full playing-card properties. Soul special replacement .3% in Arcana/Spectral, Black Hole .3% in Celestial/Spectral; both excluded from ordinary Spectral/Ghost pools. In Spectral, Black Hole's later check can override Soul. These rates are not Oops-modified; pool bans/deduplication/profile rules still apply.

## 9. All packs

Buying opens immediately. Skip forfeits remaining picks; parent shop/selection resumes. Mega picks are sequential; first changes targets/capacity for second. Picking once then skipping still grows Red Card.

| Category | Normal offers/picks | Jumbo offers/picks | Mega offers/picks | Total size weights N/J/M | Selection effect |
| --- | --- | --- | --- | --- | --- |
| Arcana | 3/1 | 5/1 | 5/2 | 4/2/.5 | Use Tarot immediately on pack hand |
| Celestial | 3/1 | 5/1 | 5/2 | 4/2/.5 | Use Planet immediately |
| Standard | 3/1 | 5/1 | 5/2 | 4/2/.5 | Add playing card to full deck |
| Buffoon | 2/1 | 4/1 | 4/2 | 1.2/.6/.15 | Equip Joker with capacity |
| Spectral | 2/1 | 4/1 | 4/2 | .6/.3/.07 | Use Spectral immediately on pack hand |

Costs $4/$6/$8 before modifiers. Weights shown sum cosmetic variants: 32 keys represent 15 category/size combinations. Standard: 40% Enhancement, Edition poll modifier 2/no Negative, 20% Seal with four equal colors. Telescope guarantees first Planet for most-played visible hand, ties toward higher priority even if already held. Omen Globe has 20% ordinary Spectral replacement per Arcana offer. Arcana/Spectral supplies a temporary hand at current size.

## 10. All Tags

Skipping Small/Big grants its displayed Tag. Resolve immediate/next-round/next-shop/Boss rewards at their own events, in acquisition order. Double copies next obtained non-Double and is consumed; multiple waiting Doubles each copy, never copy Double or all future rewards. Speed includes its acquiring skip.

| Tag (24) | Effect |
| --- | --- |
| Uncommon Tag | Create a free Uncommon Joker in a subsequent shop |
| Rare Tag | Create a free Rare Joker in a subsequent shop |
| Negative Tag | Next eligible Base shop Joker becomes Negative and free |
| Foil Tag | Next eligible Base shop Joker becomes Foil and free |
| Holographic Tag | Next eligible Base shop Joker becomes Holographic and free |
| Polychrome Tag | Next eligible Base shop Joker becomes Polychrome and free |
| Investment Tag | $25 at Boss settlement |
| Voucher Tag | Add an extra Voucher in the next shop |
| Boss Tag | Reroll the current Boss |
| Standard Tag | Open free Mega Standard |
| Charm Tag | Open free Mega Arcana |
| Meteor Tag | Open free Mega Celestial |
| Buffoon Tag | Open free Mega Buffoon |
| Ethereal Tag | Open free Normal Spectral, not Mega |
| Handy Tag | $1 per hand played this run |
| Garbage Tag | $1 per unused discard accumulated from earlier rounds |
| Coupon Tag | Initial ordinary stock and packs in next shop free; Vouchers excluded |
| Double Tag | Copy the next obtained non-Double Tag |
| Juggle Tag | +3 hand size next round |
| D6 Tag | Next shop starts with reroll price zero |
| Top-up Tag | Create up to two Common Jokers with room |
| Speed Tag | $5 per Blind skipped this run |
| Orbital Tag | +3 levels to its specified hand type |
| Economy Tag | Gain positive current balance, capped at $40 gained |

Ante 1 excludes Negative, Standard, Meteor, Buffoon, Handy, Garbage, Ethereal, Top-up, Orbital. Some Tags require profile discoveries. Free shop effects are consumed on qualifying stock, not automatically renewed each reroll.

## 11. All Vouchers

Normally $10 each; upgrade requires profile unlock plus base redeemed this run. Redeemed Vouchers do not normally recur, unbought ones can; empty pool falls back to Blank.

| Base -> Upgrade (32 Vouchers) | Effects |
| --- | --- |
| Overstock -> Overstock Plus | Ordinary stock capacity 2->3->4 |
| Clearance Sale -> Liquidation | Final discount 25%->50% |
| Hone -> Glow Up | Set Edition rate parameter 2->4; Negative uses its own threshold |
| Reroll Surplus -> Reroll Glut | Base reroll $5->$3->$1 |
| Crystal Ball -> Omen Globe | +1 consumable slot; 20% Arcana Spectral replacement |
| Telescope -> Observatory | Guarantee most-played Planet; held matching Planet gives X1.5 each |
| Grabber -> Nacho Tong | Each adds one hand per round |
| Wasteful -> Recyclomancy | Each adds one discard per round |
| Tarot Merchant -> Tarot Tycoon | Tarot shop weight 4->9.6->32 |
| Planet Merchant -> Planet Tycoon | Planet shop weight 4->9.6->32 |
| Seed Money -> Money Tree | Interest threshold cap $25->$50->$100; base payout $5->$10->$20 |
| Blank -> Antimatter | Blank no run effect; Antimatter +1 Joker slot |
| Magic Trick -> Illusion | Shop playing-card weight 4; shop card modifier distribution changes |
| Hieroglyph -> Petroglyph | Each -1 Ante; base -1 hand per round, upgrade -1 discard per round |
| Director's Cut -> Retcon | Boss reroll once per Ante -> unlimited; each costs $10 |
| Paint Brush -> Palette | Each adds one hand size |

Edition poll thresholds in order: Negative >`1-.003*mod`; Polychrome >`1-.006*edition_rate*mod`; Holo >`1-.02*edition_rate*mod`; Foil >`1-.04*edition_rate*mod`. Defaults: .3% Negative, .3% Poly, 1.4% Holo, 2% Foil, 96% Base; disabling Negative leaves its interval to Poly. Hone/Glow do not multiply all final probabilities. Guaranteed Aura/Wheel polling is a separate no-Negative distribution.

Illusion shop cards: 40% Enhanced, Edition 3% Poly/7% Holo/10% Foil/80% Base; no Seals, ignoring Hone/Glow. This source behavior differs from nominal wording.

## 12. All Jokers, events and copying

150 Jokers: 61 Common, 64 Uncommon, 20 Rare, five Legendary. Events include selection, before/after play, scored/held cards, independent scoring, discard, card creation/removal, pack open/skip, reroll, use, sale, round end, Cash Out and shop exit. Current counters/targets override catalog defaults. Additive owned growth starts at zero; growing X effects normally start at X1.

Blueprint copies adjacent right, Brainstorm leftmost, at copier's position per event. Copy supported contribution/events, not Editions/Stickers/passives or target growth ownership. Burglar/Mime are copyable. Source aborts chains when copy depth exceeds owned Joker count+1.

Blue Joker counts draw pile; Steel/Stone/Cloud/License full deck; Erosion initial Deck size. Fortune/Throwback read prior run history; Constellation/Hologram do not retroactively gain it. Flower Pot requires four distinct assignable scoring cards; one Wild/retrigger cannot fill four suits. Debuffed ordinary suits count, debuffed Wild excluded. Seeing Double differs and has a Smeared single-black-card exception. Raised Fist: rightmost tied lowest-rank non-Stone held card, twice nominal chips (face 20/Ace 22), ignoring Hiker; debuffed target gives zero. Photograph's first scoring face can be debuffed and block later faces.

Midas/Vampire run before scoring in Joker order; Vampire removes each eligible Enhancement once, not per retrigger. Madness grows Small/Big even with no victim, not Boss. Dagger requires destroyable right neighbor. Glass Joker has channel-specific missed Spectral destruction hooks.

Generation excludes locked/banned/currently present objects where applicable; Showman relaxes duplicates. Steel/Stone/Lucky Cat/Glass have current-deck Enhancement gates. Cavendish requires Gros Michel's own extinction flag. Starting duplicates, copies and forced offers differ from ordinary generation. Soul Gold results can depend on Legendary win Stickers in unseeded runs. Empty-pool fallbacks: Joker/Strength/Pluto/Incantation/Blank/Handy by category.

### All 150 Jokers

Columns: displayed name, rarity/base price, ability. C/U/R/L mean Common/Uncommon/Rare/Legendary; C/M/X inside abilities mean Chips/Mult/Mult factor.

| Joker | R/$ | Ability |
| --- | --- | --- |
| Joker | C/2 | +4 M |
| Greedy Joker | C/5 | +3 M per scoring Diamond |
| Lusty Joker | C/5 | +3 M per scoring Heart |
| Wrathful Joker | C/5 | +3 M per scoring Spade |
| Gluttonous Joker | C/5 | +3 M per scoring Club |
| Jolly Joker | C/3 | +8 M if the hand contains Pair |
| Zany Joker | C/4 | +12 M if the hand contains Three of a Kind |
| Mad Joker | C/4 | +10 M if the hand contains Two Pair |
| Crazy Joker | C/4 | +12 M if the hand contains Straight |
| Droll Joker | C/4 | +10 M if the hand contains Flush |
| Sly Joker | C/3 | +50 C if the hand contains Pair |
| Wily Joker | C/4 | +100 C if the hand contains Three of a Kind |
| Clever Joker | C/4 | +80 C if the hand contains Two Pair |
| Devious Joker | C/4 | +100 C if the hand contains Straight |
| Crafty Joker | C/4 | +80 C if the hand contains Flush |
| Half Joker | C/5 | +20 M when at most three cards are played |
| Joker Stencil | U/8 | Xmax(1, Joker capacity - owned non-Stencil Jokers); all Stencils count as empty. |
| Four Fingers | U/7 | Straights/Flushes require at least four cards |
| Mime | U/5 | Add one activation to held-card abilities |
| Credit Card | C/1 | Allow purchases down to -$20 |
| Ceremonial Dagger | U/6 | On Blind selection, destroy the Joker to the right; permanently add twice its sell value as M |
| Banner | C/5 | +30 C per remaining discard |
| Mystic Summit | C/5 | +15 M with zero discards remaining |
| Marble Joker | U/6 | Add a Stone card to the deck on Blind selection |
| Loyalty Card | U/5 | X4 every sixth hand; retain the counter across rounds |
| 8 Ball | C/5 | Each scoring 8 has a 1/4 chance to create a Tarot; require room |
| Misprint | C/4 | Random +0–23 M |
| Dusk | U/5 | Retrigger each scoring card once on the round's final hand |
| Raised Fist | C/5 | Add twice the lowest held card's rank value as M; choose the rightmost tie |
| Chaos the Clown | C/4 | One free reroll per shop |
| Fibonacci | U/8 | +8 M per scoring A/2/3/5/8 |
| Steel Joker | U/7 | Start at X1; +0.2 X per Steel card in the full deck |
| Scary Face | C/4 | +30 C per scoring face card |
| Abstract Joker | C/4 | +3 M per held Joker |
| Delayed Gratification | C/4 | If no active discard was used this round, gain $2 per remaining discard |
| Hack | U/6 | Retrigger scoring 2/3/4/5 once |
| Pareidolia | U/5 | Treat all cards as face cards |
| Gros Michel | C/5 | +15 M; 1/6 self-destruction chance at round end |
| Even Steven | C/4 | +4 M per scoring 2/4/6/8/10 |
| Odd Todd | C/4 | +31 C per scoring A/3/5/7/9 |
| Scholar | C/4 | +20 C and +4 M per scoring Ace |
| Business Card | C/4 | Each scoring face card has a 1/2 chance to give $2 |
| Supernova | C/5 | Add the current hand type's run-wide play count as M |
| Ride the Bus | C/6 | Gain +1 M per consecutive hand without scoring face cards; reset on failure |
| Space Joker | U/5 | 1/4 chance to raise the played hand's level by one |
| Egg | C/4 | Add $3 to its sell-value bonus at round end |
| Burglar | U/6 | On Blind selection, add three hands and remove all discards |
| Blackboard | U/6 | X3 if every held card is black; empty hand qualifies, Stone does not. |
| Runner | C/5 | Grow by +15 C when the hand contains Straight |
| Ice Cream | C/5 | Start at +100 C; lose 5 per hand |
| DNA | R/8 | If the round's first hand plays one card, create a permanent copy and draw it into hand |
| Splash | C/3 | Make every played card score |
| Blue Joker | C/5 | +2 C per card remaining in the draw pile |
| Sixth Sense | U/6 | If the first hand plays only one 6, destroy it and create a Spectral; require room |
| Constellation | U/6 | Start at X1; gain +0.1 X per Planet used |
| Hiker | U/5 | Permanently add +5 bonus C to each card on each scoring activation |
| Faceless Joker | C/4 | Gain $5 for at least three face cards in one active discard |
| Green Joker | C/4 | Accumulate +1 M before each scoring hand; -1 per active discard, minimum 0. |
| Superposition | C/4 | Create a Tarot if the hand contains Straight and an Ace; require room |
| To Do List | C/4 | Gain $4 for the specified hand type; change the target at round end |
| Cavendish | C/4 | X3; 1/1000 self-destruction chance at round end; check acquisition eligibility |
| Card Sharp | U/6 | X3 if the same hand type was already played this round |
| Red Card | C/5 | Gain +3 M per pack skipped, including after one Mega pick |
| Madness | U/7 | +0.5 X on Small/Big selection; destroy another random non-Eternal Joker if possible; growth does not require successful destruction |
| Square Joker | C/4 | Grow by +4 C when exactly four cards are played |
| Séance | U/6 | Create a Spectral if canonical hand type is Straight Flush; require room |
| Riff-Raff | C/6 | Create up to two Common Jokers on Blind selection, subject to room |
| Vampire | U/7 | Before scoring, +.1 X per eligible Enhanced scoring card; remove those Enhancements. |
| Shortcut | U/7 | Permit adjacent Straight rank gaps of two |
| Hologram | U/7 | Gain +0.25 X per playing card added |
| Vagabond | R/8 | Create a Tarot when playing with money at most $4; require room |
| Baron | R/8 | X1.5 per held King |
| Cloud 9 | U/7 | Gain $1 per 9 in the full deck at round end |
| Rocket | U/6 | Start with $1 round payout; each Boss win increases future payout by $2 |
| Obelisk | R/8 | Gain +0.2 X per consecutive hand other than the most-played type; reset on failure |
| Midas Mask | U/7 | Before scoring, convert scoring face cards to Gold; ordered with Vampire. |
| Luchador | U/5 | Selling disables the current Boss |
| Photograph | C/5 | X2 on each eligible activation of the first scoring face card |
| Gift Card | U/6 | Add $1 sell-value bonus to each Joker/consumable at round end |
| Turtle Bean | U/6 | +5 hand size, decreasing by one each round |
| Erosion | U/6 | +4 M per card below this Deck's initial size |
| Reserved Parking | C/6 | Each held face-card activation has a 1/2 chance to give $1 |
| Mail-In Rebate | C/4 | $5 per actively discarded card of the specified rank; change rank each round |
| To the Moon | U/5 | Add $1 interest per $5 of balance |
| Hallucination | C/4 | 1/2 chance to create a Tarot when opening any pack; require room |
| Fortune Teller | C/6 | +1 M per Tarot used this run; includes earlier history |
| Juggler | C/4 | +1 hand size |
| Drunkard | C/4 | +1 discard per round |
| Stone Joker | U/6 | +25 C per Stone card in the full deck |
| Golden Joker | C/6 | +$4 at Cash Out |
| Lucky Cat | U/6 | Gain +.25 X per Lucky activation with either success (both count once); requires Lucky in deck. |
| Baseball Card | R/8 | X1.5 per Uncommon Joker at the corresponding position in the Joker phase |
| Bull | U/6 | +2 C per $1 of current money |
| Diet Cola | U/6 | Selling creates a Double Tag |
| Trading Card | U/6 | On the first discard, selecting one card destroys it and gives $3 |
| Flash Card | U/5 | Gain +2 M per shop reroll |
| Popcorn | C/5 | Start at +20 M; lose 4 per round |
| Spare Trousers | U/6 | Gain +2 M when the hand contains Two Pair |
| Ancient Joker | R/8 | X1.5 per scoring card of the target suit; change suit at round end |
| Ramen | U/6 | Start at X2; lose .01 X per actively discarded card |
| Walkie Talkie | C/4 | +10 C and +4 M per scoring 10/4 |
| Seltzer | U/6 | Retrigger scoring cards once for the next ten hands |
| Castle | U/6 | Gain +3 C per actively discarded target-suit card; change suit each round |
| Smiley Face | C/4 | +5 M per scoring face card |
| Campfire | R/9 | Gain +.25 X per card sold; reset after Boss defeat |
| Golden Ticket | C/5 | $4 per scoring Gold-card activation |
| Mr. Bones | U/5 | Consume itself to rescue failure when accumulated score reaches 25% of the target |
| Acrobat | U/6 | X3 on the round's final hand |
| Sock and Buskin | U/6 | Retrigger scoring face cards once |
| Swashbuckler | C/4 | Add the other Jokers' total current sell value as M |
| Troubadour | U/6 | +2 hand size; -1 hand per round |
| Certificate | U/6 | Add a random sealed playing card to hand/deck at round start |
| Smeared Joker | U/7 | Treat Hearts/Diamonds as equivalent and Spades/Clubs as equivalent |
| Throwback | U/6 | Start at X1; +.25 X per run skip, including earlier history |
| Hanging Chad | C/4 | Retrigger the first scoring card twice |
| Rough Gem | U/7 | $1 per scoring Diamond activation |
| Bloodstone | U/7 | Each scoring Heart has a 1/2 chance for X1.5 |
| Arrowhead | U/7 | +50 C per scoring Spade |
| Onyx Agate | U/7 | +7 M per scoring Club |
| Glass Joker | U/6 | Gain +.75 X per Glass card destroyed through a supported removal hook; requires Glass in deck. |
| Showman | U/5 | Relax ordinary duplicate restrictions for Joker/Tarot/Planet/Spectral generation |
| Flower Pot | U/6 | X3 if four distinct scoring cards can be assigned to all four suits |
| Blueprint | R/10 | Copy supported ability of the adjacent Joker on the right at this position. |
| Wee Joker | R/8 | Gain +8 C per scoring 2 activation |
| Merry Andy | U/7 | +3 discards per round; -1 hand size |
| Oops! All 6s | U/4 | Double supported listed probabilities |
| The Idol | U/6 | X2 per scoring target rank+suit card; change target each round |
| Seeing Double | U/6 | X2 with non-debuffed scoring Club and non-Club; Smeared can let one black card satisfy both. |
| Matador | U/7 | $8 for supported Boss hand-trigger event; see Boss section. |
| Hit the Road | R/8 | +.5 X per Jack actively discarded this round; reset next round |
| The Duo | R/8 | X2 if the hand contains Pair |
| The Trio | R/8 | X3 if the hand contains Three of a Kind |
| The Family | R/8 | X4 if the hand contains Four of a Kind |
| The Order | R/8 | X3 if the hand contains Straight |
| The Tribe | R/8 | X2 if the hand contains Flush |
| Stuntman | R/7 | +250 C; -2 hand size |
| Invisible Joker | R/8 | After two rounds, selling copies a random Joker; remove Negative from the copy |
| Brainstorm | R/10 | Copy supported ability of the leftmost Joker at this position. |
| Satellite | U/6 | $1 at round end per distinct Planet type used |
| Shoot the Moon | C/5 | +13 M per held Queen |
| Driver's License | R/7 | X3 with at least 16 Enhanced cards in the full deck |
| Cartomancer | U/6 | Create a Tarot on Blind selection; require room |
| Astronomer | U/8 | Free Planets and Celestial packs |
| Burnt Joker | R/8 | Raise the canonical hand type of the first discard by one level |
| Bootstraps | U/7 | +2 M per $5 of current money |
| Canio | L/20 | Gain +1 X per face card destroyed |
| Triboulet | L/20 | X2 per scoring King/Queen |
| Yorick | L/20 | Gain +1 X per 23 actively discarded cards; accumulate across actions |
| Chicot | L/20 | Disable Boss abilities; target restoration details are in ch07 |
| Perkeo | L/20 | On leaving the shop, create a Negative copy of a random held consumable |

Not Blueprint/Brainstorm compatible: Four Fingers, Credit Card, Chaos the Clown, Delayed Gratification, Pareidolia, Egg, Splash, Sixth Sense, Shortcut, Cloud 9, Rocket, Midas Mask, Gift Card, Turtle Bean, To the Moon, Juggler, Drunkard, Golden Joker, Trading Card, Mr. Bones, Troubadour, Smeared Joker, Showman, Merry Andy, Oops! All 6s, Invisible Joker, Satellite, Astronomer, Chicot.

Eternal-incompatible: Gros Michel, Ice Cream, Cavendish, Luchador, Turtle Bean, Diet Cola, Popcorn, Ramen, Seltzer, Mr. Bones, Invisible Joker.

Perishable-incompatible: Ceremonial Dagger, Ride the Bus, Runner, Constellation, Green Joker, Red Card, Madness, Square Joker, Vampire, Hologram, Rocket, Obelisk, Lucky Cat, Flash Card, Spare Trousers, Castle, Glass Joker, Wee Joker.


## 13. All 20 Challenges

Challenges use White Stake with these overrides; unspecified parameters are standard. Bans below are original source IDs; pack families include all their variants. Starting objects/forced copies are distinct from ordinary pools.

| Challenge | Initial state and custom rules | Bans |
| --- | --- | --- |
| The Omelette | Five Eggs; no Blind reward, unused-hand money or interest. | v_seed_money, v_money_tree, j_to_the_moon, j_rocket, j_golden, j_satellite |
| 15 Minute City | Eternal Ride the Bus/Shortcut. 52 cards: each suit 4-10 once, J/Q/K twice, no A/2/3. | - |
| Rich get Richer | Start $100 with Seed Money/Money Tree; C cannot exceed max(current money,0). | - |
| On a Knife's Edge | Eternal pinned-left Ceremonial Dagger. | - |
| X-ray Vision | Each drawn card independently has 1/4 chance face-down (not Oops-modified). | - |
| Mad World | 32 cards, 2-9 per suit. Eternal Negative Pareidolia/Eternal Business Card; no unused-hand money/interest. | bl_plant |
| Luxury Tax | Hand size 10 minus floor(money/5), updated with balance. | - |
| Non-Perishable | All eligible Jokers Eternal. | j_gros_michel, j_ice_cream, j_cavendish, j_turtle_bean, j_ramen, j_diet_cola, j_selzer, j_popcorn, j_mr_bones, j_invisible, j_luchador, bl_final_leaf |
| Medusa | Eternal Marble Joker; all 12 initial face cards Stone. | - |
| Double or Nothing | All 52 initial cards Red Seal; played cards remain debuffed through the run. | - |
| Typecast | After Ante-4 Boss, held compatible Jokers Eternal and Joker capacity set to 0; owned Jokers remain. | bl_final_leaf |
| Inflation | Credit Card; each purchase raises subsequent prices by $1. | v_clearance_sale, v_liquidation |
| Bram Poker | Eternal Vampire, Empress/Emperor, Magic Trick/Illusion; no ordinary shop Jokers. | - |
| Fragile | All 52 cards Glass; two Eternal Negative Oops, so Glass break is guaranteed. | c_magician, c_empress, c_heirophant, c_chariot, c_devil, c_tower, c_lovers, c_incantation, c_grim, c_familiar, all Standard packs, j_marble, j_vampire, j_midas_mask, j_certificate, v_magic_trick, v_illusion, tag_standard |
| Monolith | Eternal Obelisk and Eternal Negative Marble Joker. | - |
| Blast Off | 2 hands, 2 discards, 4 Joker slots; Eternal Constellation/Rocket, Planet Merchant/Tycoon. | v_grabber, v_nacho_tong, j_burglar |
| Five-Card Draw | Hand size 5, 6 discards, 7 Joker slots; Card Sharp/Joker. | j_juggler, j_troubadour, j_turtle_bean |
| Golden Needle | 1 hand, 6 discards, $10, Credit Card; each active discard costs $1. | v_grabber, v_nacho_tong, j_burglar |
| Cruelty | 3 Joker slots; no direct Small/Big Blind reward. | - |
| Jokerless | 0 Joker slots; no ordinary shop Jokers. | c_judgement, c_wraith, c_soul, v_antimatter, all Buffoon packs, tag_rare, tag_uncommon, tag_holo, tag_polychrome, tag_negative, tag_foil, tag_buffoon, tag_top_up, bl_final_acorn, bl_final_heart, bl_final_leaf |

Challenge setup can pin Joker positions, force Eternal/Negative, substitute the starting deck and ban ordinary items/Tags/Bosses. Typecast zeroes capacity rather than destroying held Jokers. Inflation applies on pack/Voucher/ordinary purchases. Removing every target card inside Arcana/Spectral can expose an original-game softlock; inspect the resulting state.

## 14. Randomness and decision boundaries

Oops doubles supported listed probability numerators, compounding across copies; numerator>=denominator guarantees the check. Covers Lucky, Glass, Bloodstone, Business/Reserved Parking, Hallucination, 8 Ball, Space, Gros/Cavendish, Wheel Tarot/Boss. Not shop rarity, Stickers, Editions, Soul/Black Hole or X-ray Vision. Lucky rolls M/money independently each activation; Cat grows once if either succeeds. Expected Lucky cash=$20/15 and +M=20/5, not guaranteed income (Wiki rounded cash prose differs).

Original RNG uses keyed state, seed/Ante and call order. Seed parity also requires Deck, Stake, profile, version, mods and action history. Manual input uppercases up to eight alphanumerics, 0->O. A reproducible fixture/other simulator is not original RNG parity.

## 15. Sources and attribution

Target-build authority: original `env/balatro/`, unchanged per `env/balatro-source.json`. Static source review, not live-game validation. Source roles: game.lua (objects/constants), back.lua (Decks), blind.lua (Bosses), card.lua (abilities/prices/copy/timers), tag.lua/challenges.lua; functions/state_events.lua (scoring/rounds/settlement), common_events.lua (pools/Editions/creation), misc_functions.lua (hands/targets/RNG), button_callbacks.lua (actions), localization/en-us.lua (display names). Paths relative to project root.

Adapted from **Balatro Wiki contributors**, local `skills/balatro-wiki-rules/`, snapshot 2026-10-02, 1.0.1o-FULL / Friends of Jimbo 4. Revisions in references/sources.md. Wiki-derived material retains [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/); original game code remains separate. Changes: condensed English organization, source metadata and execution-order clarifications. References: [Wiki](https://balatrowiki.org/), [Jokers](https://balatrowiki.org/w/Jokers), [Activation Sequence](https://balatrowiki.org/w/Guide:_Activation_Sequence), [Challenges](https://balatrowiki.org/w/Challenge_Decks).
