# 出牌计分预估设计

状态：实验性功能。第一版已实现（`play/mod/scoring.lua`），尚未在 Steamodded 实机上验证。日期：2026-10-12。

## 1. 目标

在 `SELECTING_HAND` 阶段给模型一组出牌候选，每个候选附带游戏实际会算出的分数，免得模型自己心算 chips × mult。

本版只算当前这一手。弃牌概率、商店估值、多手规划都不做。

## 2. 做法

在 mod 里用游戏自己的计分函数做一次试算：

1. 把选中的牌临时放进一个假的 `G.play`；
2. 调用当前环境里的 `G.FUNCS.evaluate_play()`，也就是包含 Steamodded 和其他 mod 改动的那一份；
3. 读取分数；
4. 把被改动的状态恢复原样。

计分规则沿用游戏实现，但只有能安全恢复的效果才提供预估。DNA 的首手复制按不存在处理（Blueprint/Brainstorm 复制 DNA 时同样不生效）；其他造牌效果在创建入口被拦截，整组候选返回 `unavailable`。The Tooth 与 The Ox 在 Joker 计分前造成的扣款会被模拟。

## 3. 试算一手

```
scoreSelection(selected):
  保存：涉及的卡（手牌、Joker、消耗品）的 ability/base/edition/seal/debuff，
        config 的字段（保留 center 等共享原型的引用）、G.playing_card，
        G.GAME 中的普通数据表，计分全局量（mult、hand_chips、SMODS.Scoring_Parameters 等）
  替换：表现层与档案函数为空操作，随机函数为固定值（见第 4 节）
        ease_dollars 只执行 instant 扣款（The Ox），排队的金额变化丢弃
        Card.calculate_joker 对 DNA 直接返回 nil（Blueprint/Brainstorm 也经由它调用 DNA）
        造牌入口为拒绝执行的函数；一旦尝试造牌，恢复状态并丢弃整组候选
  设置：G.play = {cards = selected}，G.hand = {cards = 其余手牌}
        G.GAME.current_round.hands_left -= 1     -- 游戏出牌前也会先减，"最后一手"类 Joker 依赖它
        激活的 The Tooth：G.GAME.dollars -= 出牌张数   -- press_play 排入的扣款先于 evaluate_play
        SMODS.last_hand = nil                    -- 否则 evaluate_play 会改上一手实际打出的牌
  执行：pcall(G.FUNCS.evaluate_play)
  读取：牌型名、SMODS.calculate_round_score()、是否被 Boss 禁止
  恢复：上面保存和替换的全部内容（无论执行是否出错）
```

需要替换为空操作的函数：

- 表现层：`card_eval_status_text`、`update_hand_text`、`juice_card`、`highlight_card`、`play_sound`、`delay`、`play_area_status_text`；`G.E_MANAGER:add_event` 改为丢弃事件；卡牌的 `juice_up` 也要替换。
- 档案与统计：`check_for_unlock`、`inc_career_stat`、`check_and_set_high_score`。
- 金钱：`ease_dollars` 替换为只处理 instant 的版本。计分中途赚到的钱由游戏同步记入 `dollar_buffer`，Bull/Bootstraps 会读取它。

具体清单在实现时对照 lovely dump 补全。

## 4. 三条规则

**随机**：`pseudorandom`、`pseudorandom_element`、`pseudoseed` 替换为固定返回“判定失败”的值。原版 `pseudorandom` 会调用 `math.randomseed`，所以必须替换，不能放着不管。试算中只要调用过随机函数，该候选就标 `random`，分数按全部失败计，也就是保守值。

**隐藏信息**：手牌或 Joker 中有任何背面朝上的牌时，不试算，观察中也不出现 `plays` 字段，避免真实身份进入计算。

**副作用检查**：试算前后各取一次 bridge 现有的 fingerprint（`game.state()` 加 `game.cards()`）。两者不同说明恢复不完整，此时：

- bridge 置为 poisoned，沿用现有的人工检查流程；
- 本会话停用计分预估。

## 5. 候选与输出

- 枚举可见手牌中 1–5 张的全部组合，必须包含强制选中的牌。8 张手牌是 218 种。
- 设总时间上限 100 ms，超时就停止，并标 `truncated`。原版 1.0.1o 无头环境实测 8 张手牌（218 种）约 26 ms。
- 按 fingerprint 缓存，同一状态只算一次。
- 每种牌型保留最高分的一行，同分时保留用牌更少的，最多 5 行，按分数降序。

```json
"plays": [
  "0 2 3 5 6: Flush 1240",
  "1 4 7: Three of a Kind 420",
  "0 1 2 3 4: Straight 480 random",
  "2 3: Pair 0 not allowed"
]
```

- 行首数字是当前手牌的零基索引，可以直接作为 `play` 的 `cards`。
- `not allowed` 表示这一手被 Boss 规则禁止，得分为 0。

不可用情况：DNA 以外的造牌效果触发时返回 `unavailable: card creation is not supported during shadow scoring`。

近似处理：DNA 的复制按不存在计算。复制出的牌在原版中会留在手里并影响同一手（保留牌效果、Hologram），所以 DNA 首手单张出牌的分数可能与实际不同。

已知不计入的情况：The Hook 出牌时会随机弃掉 2 张留手牌，这一步不模拟。

## 6. 改动清单

- `play/mod/scoring.lua`：新文件，包含试算、枚举和格式化。
- `play/mod/bridge.lua`：在 `snapshot()` 里于 fingerprint 计算之后附加 `state.plays`。这样 `plays` 不参与 revision 计算。
- `env/contract.ts`：`playerState` 白名单加 `plays`。
- `env/compact.ts`：`phaseViews` 把 `plays` 归入 `SELECTING_HAND`。
- `tools/guide.ts`、`skills/core.md`：说明 `plays` 的含义，以及 `random`、`not allowed` 等标记。

## 7. 验证

- **Lua 单测**：验证替换的函数在正常执行和出错时都能恢复，背面朝上的牌会导致不输出，fingerprint 不一致时 bridge 会 poisoned。
- **TS 单测**：验证 `plays` 的阶段归属和增量替换。
- **实机**：先打几局，对照每手的预测分和实际得分。原始观察已经写在 `data/traces`，事后可以对比。结果按惯例记入 `docs/validation.md`。

## 8. 以后再做

- `play_preview` 工具，用来给任意一组牌算分；
- 随机项的分数区间；
- 每手自动比对预测与实际；
- 弃牌概率；
- 商店估值。
