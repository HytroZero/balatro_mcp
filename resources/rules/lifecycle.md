# Objective, state and full run lifecycle

Balatro is a single-player poker-based roguelike deck builder: reach Blind score targets with limited hands while building a deck and effects. There is no opposing poker hand or wagering pot. Win by clearing the Ante-8 Boss, then stop or choose Endless; an Endless loss does not undo that win. Challenges/mods may change the configured win Ante.

Standard start: 52 cards (2-A in four suits), $4, hand size 8, 4 hands/3 discards per round, 5 Joker slots, 2 consumable slots. Apply Deck, cumulative Stake, Challenge and owned effects. Profile unlocks/discoveries affect pools.

1. Select the current Blind or skip Small/Big for its Tag; Boss cannot normally be skipped. A skip advances selection with no round, Cash Out or ordinary shop. Immediate-pack Tags temporarily interrupt selection.
2. Selecting resets round score/resources/history and fires start effects (Burglar, Marble, Riff-Raff, Certificate). Shuffle/deal the surviving deck. Money, cards, levels and owned growth persist.
3. Select 1-5 cards to play or actively discard; honor forced cards and resources. Reorder cards/Jokers when supported. One play spends one hand, resolves scoring and adds score. All played cards leave the hand, even non-scoring cards. One active discard spends one discard for its batch, fires discard effects and draws without scoring/spending a hand.
4. Normally draw toward current hand size. No automatic in-round reshuffle of played/discarded cards. Serpent draws exactly three after actions and can exceed hand size. An empty hand/draw pile can end an attempt even with a counter left.
5. Reaching target ends the round immediately; running out of usable hands below target loses unless Mr. Bones rescues at >=25%. Resolve round-end effects, Rental, Perishable, held rewards and Cash Out. Accept settlement, shop, then leave for next selection; Perkeo triggers on shop exit. Boss defeat advances Ante, resets actual Ante history and refreshes the ordinary Voucher. At the win point, handle the backend's terminal state/overlay rather than starting another round automatically.

Distinguish full surviving deck, current draw pile, held, all played, scoring subset, actively discarded and destroyed cards. Full-deck counts include drawn/played cards. Copies have distinct identities. Forced Boss discard/removal is not automatically an active-discard reward. Card order affects scoring; sorting changes positions, not identity.

Round-local: Eye/Mouth/Card Sharp. Run-wide: hand-type usage, skips, Tarot history. Entity-local: most Joker growth. Pillar's Ante marker clears on actual Boss progression, not merely Hieroglyph lowering the displayed Ante. Copies can transfer that marker. Face-down hides identity/order; it does not change the engine's true card.

Adapted from Balatro Wiki contributors, snapshot 2026-10-02, version 1.0.1o-FULL. [Sources and CC BY-NC-SA 3.0 license](balatro://rules/sources).
