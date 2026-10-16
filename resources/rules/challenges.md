# All 20 Challenges

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

Adapted from Balatro Wiki contributors, snapshot 2026-10-02, version 1.0.1o-FULL. [Sources and CC BY-NC-SA 3.0 license](balatro://rules/sources).
