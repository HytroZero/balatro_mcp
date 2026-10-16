# Scoring order and retriggers

Notation: C=Chips, M=Mult; +M adds Mult and Xn multiplies Mult by n.

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

Adapted from Balatro Wiki contributors, snapshot 2026-10-02, version 1.0.1o-FULL. [Sources and CC BY-NC-SA 3.0 license](balatro://rules/sources).
