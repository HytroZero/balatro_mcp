# ch03 Scoring Sequence and Retriggers

## Resolve phases in order

Use the community [Guide: Activation Sequence](https://balatrowiki.org/w/Guide:_Activation_Sequence) and check individual hooks in [Activation Type](https://balatrowiki.org/w/Activation_Type). Resolve conflicts against the actual target game version.

| Order | Resolution |
| --- | --- |
| 1 | Boss changes to this hand's base values or level, such as The Flint and The Arm |
| 2 | On played: DNA, Green Joker's play growth, and related hooks |
| 3 | Scoring cards left to right: base chips → Enhancement → scoring Seal such as Gold → Edition → on-scored Jokers left to right → card retriggers |
| 4 | Held cards left to right: held Enhancement such as Steel → on-held Jokers → held retriggers |
| 5 | Jokers left to right: Foil/Holographic → independent ability → dependent effects such as Baseball Card → Polychrome |
| 6 | Observatory: each held Planet matching the current hand type gives X1.5 Mult |
| 7 | Plasma Deck: average final Chips and Mult, then multiply |

Assign each effect to its actual hook. A Joker's growth, money, and scoring contribution can occur in different phases. The catalog's single `Act` field cannot represent its entire lifecycle. Wee Joker grows on each scored 2 and contributes accumulated chips in the independent phase.

## Bound retriggers

For an eligible card, total activations are normally `1 + red_seal + applicable_retrigger_contributions`. Red Seal, Hack, Sock and Buskin, Dusk, Seltzer, and Hanging Chad have their own predicates. Dusk applies on the round's final hand; Hanging Chad applies to the first scoring played card. Sources: [Card modifiers](https://balatrowiki.org/w/Card_modifiers), [Hanging Chad](https://balatrowiki.org/w/Hanging_Chad).

Repeat that card's base contribution, modifiers, and on-scored abilities for each activation. Do not recursively derive more Red Seal/Hack activations or rerun independent whole-hand effects. Roll random card abilities again on each activation; do not cache Lucky's first result.

Mime adds an activation to held abilities, including Steel/Baron and end-of-round Gold/Blue Seal. Red Seal also adds an activation to eligible held cards. Held retriggers do not make a card played. Sources: [Mime](https://balatrowiki.org/w/Mime), [Blue Seal](https://balatrowiki.org/w/Blue_Seal).

## Preserve ordering and dependencies

Within the same phase, +Mult before XMult usually yields more score. Moving a Joker cannot move its ability across phases. Joker Polychrome follows its independent ability; playing-card Polychrome precedes that card's on-scored Jokers.

Photograph gives X2 for the first scoring face card. Hanging Chad adds two activations to the first scoring card. Preserve card order and evaluate both targets separately. Positioning a valuable face card to satisfy both is a strategy derived from those rules. Source: [Photograph](https://balatrowiki.org/w/Photograph).

Raised Fist selects the lowest-rank held card, breaking ties toward the rightmost card. Face cards give +20 Mult, Ace +22; exclude Stone. A debuffed selected card gives 0. Permanent chips from Hiker do not affect the value. That card's Steel resolves before Raised Fist, and other held-card positions affect later multiplications. Source: [Raised Fist](https://balatrowiki.org/w/Raised_Fist).

Resolve Blueprint/Brainstorm at the copier's position for the current phase. Copy eligible abilities, not Editions, Stickers, or the target's own growth. Use a consistent ordering snapshot for the event; define animation-time rearrangement explicitly rather than introducing implicit race actions. See [ch05](ch05-jokers.md).

## Reconstructed calculations

**Independent ordering.** Start with Chips=40 and Mult=4. Joker +4 followed by Ramen X2 gives `40*(4+4)*2=640`. Reversing them gives `40*(4*2+4)=480`. This compares abilities within one phase.

**Held retriggers.** Hold an uneditioned Steel King with Red Seal, Mime, and Baron. Activations=`1+1+1=3`. Each resolves Steel X1.5 then Baron X1.5, so the multiplier is `(1.5*1.5)^3=11.390625`. Independent +Mult is added later.

**Plasma.** Compute `((C+M)/2)^2` once, after all scoring. For `C=100, M=10000`, Plasma yields `25,502,500`; an ordinary deck yields `1,000,000`. Do not rebalance after each Joker operation. Source: [Plasma Deck](https://balatrowiki.org/w/Plasma_Deck).

## Emit an event trace

Engineering guidance: record `phase, source_id, target_id, trigger_index, C_before/after, M_before/after, money_delta, mutation, rng_domain`. Assert event count and order before total score. A Red Seal 2 with Hack has three card activations; an independent Joker still resolves once in its independent phase.

Related: [ch02 Scoring sets](ch02-poker-hands.md), [ch04 Modifiers](ch04-card-modifiers.md), [ch05 Copying](ch05-jokers.md), [ch11 Sampling](ch11-rng-reproducibility.md).
