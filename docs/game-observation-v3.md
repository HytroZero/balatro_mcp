# 游戏观察字段设计 v3（精简版）

状态：已实施（`env/compact.ts`、`tools/index.ts`、Lua 观察修正）。日期：2026-10-11。实现与最初提案的差异已在正文中更新：`ante` 直接取 `blinds` 所属底注，不再冻结 ROUND_EVAL；盲注状态写成 `[defeated]`；未知值统一写 `?`；完整桥接 revision 仍被接受。

适用范围：`game_observe`、`game_start`、`game_action` 成功时返回的模型可见投影（`env/compact.ts`）。Lua HTTP 协议 1、动作参数、零基索引、revision 校验、错误 envelope 和 `uncertain_outcome` 恢复流程都不变。

[game-observation-design.md](game-observation-design.md) 里的这些原则继续有效：只返回玩家可见信息、观察不推进 RNG、在稳定边界投递结果、未知不能伪装成已知、`card_observe` 单独提供。本文替换的是它的**字段形状和合并规则**（第 2–6、9、11 节）。

## 1. 现状问题（实测）

样本取自 [agent_conversation/codex_exec.md](../agent_conversation/codex_exec.md)：第二底注的 1 次 `game_observe` 和 11 次 `game_action`。统计对象是 content 中的紧凑 JSON 文本。

| 返回 | 当前字符数 | 其中最大的块 |
| --- | --- | --- |
| observe，SELECTING_HAND | 4113 | jokers 1260，route 938，consumables 392，handValues 376 |
| play → ROUND_EVAL（×3） | 2826–2986 | jokers 1260，route 624–773 |
| cash_out → SHOP（×3） | 2766–3180 | shop 1372–1462，route 625–1010 |
| next_round → BLIND_SELECT（×2） | 1330–1467 | route 624–772 |
| select（×2） | 1711–1841 | route 625–773 |
| discard | 980 | envelope 447 |
| **合计** | **28963** | |

冗余来自以下几处：

1. **每次回合结束都重发全部 5 张小丑（1260 字符）**，其实只有 Popcorn 的 +16→+12 一个数字变了。区域只能整体替换，没有元素级更新。
2. **每次阶段切换都重发整条 route（620–1010 字符）**，里面多数是固定值：`targetKnown:true`、`rulesKnown:true`、`disabled:false`、`ruleState:{active:true}`、`displayName` 与 `name` 重复、`values:{}`、`triggered:false`。
3. **envelope 每次约 420 字符**：`contract`、`partial`、`notReadyReason:null`、`terminal:false`、`outcome:"ongoing"`、`runId`、`baseRevision`、`actionId`，以及 `"table: 0x012f88b8:1791719807:31"` 这种长 revision。正常情况下这些都是默认值，或者是请求里已经有的值。
4. **物品对象的元数据多于内容**。每张小丑都带 `key`、`kind`、`rulesKnown`、`modifiers.enhancement`、`sell.available/value/reason`；一个 effect 字符串外面包着大约 200 字符的结构。
5. **同一个事实出现多次**：`shop.reroll` 和 `controls.reroll` 重复；`availableMethods` 列出了 `reroll_boss`/`skip`，`controls` 却说不可用；`round.target` 和 `route` 目标重复；阶段之外反复发送空手牌 `{count:0,capacity:8,selectionLimit:5,cards:[]}`；`shop:null`/`round:null` 这类清空标记也一直在发。
6. **`summary` 没有信息量**，例如 "Played cards. Phase: ROUND_EVAL."。真正需要的打出牌型和得分，只能从 roundResult 和 handValuesPatch 里拼出来。

另外，样本里还有几处投影缺陷，与字段设计无关，但应一起修复：

- `play/mod/game.lua:280` 写入 `enhancement=center.key`，导致小丑、消耗牌和商品都输出 `"enhancement":"j_smiley"` 这类重复 key。`env/compact.ts:71` 只过滤了 `c_base`。
- `route.blinds` 按字母序输出 Big/Boss/Small，没有按游戏顺序。
- `status` 出现了文档没有定义的值 `"select"`。
- `rules`/`skipReward.rules` 是 UI 换行碎片，例如 `["Gives a free","Mega Standard Pack"]`。
- Bull、Crafty Joker、To Do List、Satellite 的当前值显示为 `?`，但这些值都可以从 `card.ability` 或当前资金只读得到。
- Codex 记录中，同一结果同时显示了 content 文本和 structuredContent。需要确认模型是否会读到两份；如果会，实际 token 消耗还要翻倍。

## 2. 设计原则

1. **读者是 LLM，不是合并程序。** 每次返回都应该能直接读懂，规则要能用 5 句话写进工具描述。
2. **默认值不发送。** 正常状态（ready、ongoing、已知规则、未禁用）不出现字段，只有异常状态才出现。
3. **一个事实只出现一处。** 价格只在商品行里，限制只在盲注行里，动作候选只在 `actions` 里。
4. **数据短行优先于对象。** 每个物品写成一行英文文本，模型直接阅读，不需要二次解释结构。只有需要按成员合并的地方才用对象。
5. **视图跟随阶段，不需要显式清空。** 阶段决定哪些视图键有效；离开阶段时，视图自然失效。
6. **可推导的资格不预先计算。** 资金和槽位都在 state 里，买不起或满槽时由模型判断，后端兜底校验。只有不可推导的限制才标出来。

## 3. 返回 envelope

成功仍为 `{ok:true,value:{...}}`，失败 envelope 不变。`value` 的字段如下。

| 字段 | 出现条件 | 说明 |
| --- | --- | --- |
| `v` | 仅完整快照 | 投影版本，固定为 `3` |
| `full` | 仅完整快照 | 固定为 `true`；没有该字段即为增量 |
| `rev` | 总是 | 下一次 `game_action` 使用的 revision。取桥接计数器的短形式（如 `"31"`），格式不透明 |
| `phase` | 总是 | MENU / BLIND_SELECT / SELECTING_HAND / ROUND_EVAL / SHOP / PACK / GAME_OVER；未就绪且无法识别时为 null |
| `actions` | 总是 | 当前阶段的动作候选，见第 7 节；未就绪时为 [] |
| `result` | 仅动作成功 | 一句英文，说明本次动作的已验证事实，见第 8 节 |
| `notReady` | 仅未就绪 | 原因字符串；缺失表示 ready |
| `outcome` | 仅整局结束 | `won` / `lost`；缺失表示 ongoing |
| `state` | 有内容时 | 完整状态，或本次变化的键；无变化时省略 |

删除的字段及去向：

| 当前字段 | 去向 |
| --- | --- |
| `contract`、`partial` | 由 `v`、`full` 替代，只在完整快照中出现 |
| `baseRevision` | 删除。增量的基线就是请求中的 revision，服务端已校验两者相等 |
| `runId` | 删除。换局必定返回完整快照，由服务端检测 |
| `source` | 移到 `game_health` |
| `ready`、`notReadyReason` | 合并为可选的 `notReady` |
| `terminal`、`outcome:"ongoing"` | 合并为可选的 `outcome` |
| `availableMethods`、`controls` | 合并为 `actions` |
| `actionId` | 成功时不返回，trace 中保留。`game_operation` 可省略 actionId 查看最后一次动作；`uncertain_outcome` 失败 envelope 可携带它 |
| `summary` | 由有事实内容的 `result` 替代 |

**短 revision 的安全性。** 工具层记住最后一次交给调用方的完整桥接 revision，把与之计数器相同的短 rev 还原成完整值，由桥接按原规则校验；桥接实例改变后，旧值同样过期。本连接没有发出过的短 rev（包括 MCP 进程重启后、尚未投递观察时）直接返回 `stale_state`，不会派发动作。完整的 `<instance>:<counter>` revision 原样交给桥接校验，用于兼容和内部测试。

## 4. state 键

`state` 是**扁平**的一层键，分为两类。

### 4.1 牌局键（换局前一直有效）

| 键 | 类型 | 例子 | 说明 |
| --- | --- | --- | --- |
| `setup` | string | `"BLUE deck, BLUE stake, seed EI6GVY7S"` | 只在完整快照中出现 |
| `ante` | number | `2` | **当前 `blinds` 所属的底注**，见 4.3 |
| `roundNo` | number | `4` | |
| `money` | number | `2` | |
| `credit` | number | `20` | 只在信用额度非 0 时出现 |
| `handSize` | number | `8` | 手牌上限 |
| `jokerSlots`、`consumableSlots` | number | `5`、`2` | 槽位数；已占用数量就是数组长度 |
| `hands` | object | `{"Pair":"10x2 played 1"}` | 牌型数值，见 6.3 |
| `jokers`、`consumables` | string[] | | 有序区域，行格式见 6.2 |
| `vouchers`、`tags` | string[] | `["Crystal Ball: +1 consumable slot"]` | 已兑换凭证、已持有标签 |
| `blind` | string | `"Big"` | 正在面对或下一个要面对的盲注：Small/Big/Boss |
| `blinds` | object | `{"Small":"…","Big":"…","Boss":"…"}` | 本底注三个盲注，见 6.4；键按 Small、Big、Boss 输出 |

### 4.2 阶段视图键（只在指定阶段有效）

| 键 | 有效阶段 | 内容 |
| --- | --- | --- |
| `hand` | SELECTING_HAND，以及显示手牌的 PACK | string[]，见 6.1 |
| `deck` | 同 `hand` | `"44/52"`，即剩余抽牌数/牌组总数 |
| `round` | SELECTING_HAND | `{score,target,hands,discards}`；本回合打过牌型后增加 `played:{"Pair":1}`；历史未知时为 `played:"?"` |
| `cashOut` | ROUND_EVAL | `{blind,score,target,payout}`；未知成员为 `"?"`；能读到明细时增加 `lines` |
| `shop` | SHOP，以及从商店打开的 PACK | `{cards,vouchers,packs}`，三个 string[]，各自零基编号 |
| `pack` | PACK | `{name,picks,items}`，其中 picks 是剩余选择次数 |
| `profiles` | MENU、GAME_OVER | `{"RED":"WHITE RED GREEN", ...}`，即可用牌组和已解锁赌注 |
| `runResult` | GAME_OVER | 一句话，例如 `"Lost at Ante 3 Big Blind: 1800/3000"` |

**阶段切换时，客户端丢弃不属于新阶段的视图键。** 服务端在每次进入新阶段时完整发送该阶段新生效的视图键。两个阶段都有效的键（例如 SHOP→PACK 时的 `shop`）继续保留，只在变化时发送。

因此不再需要 `round:null`、`shop:null`、空手牌这类清空标记。

### 4.3 底注归属

原设计中 `run.ante`、`route.ante`、`roundResult.ante` 三者可能不一致：击败 Boss 后，引擎底注已经推进，但路线还是旧的。v3 只有一个 `ante`，定义为 `blinds` 所属的底注，读取引擎的 `round_resets.blind_ante`。

- 击败 Boss 后的 ROUND_EVAL 中，引擎的盲注表仍属于旧底注，`ante` 也保持旧值；被击败的盲注照常标成 `[defeated]`。
- `cash_out` 生成新底注的盲注后，同一个增量里同时出现新的 `ante`、`blind` 和三个盲注成员。

模型因此不会看到“ante 已经是 3，路线还是第二底注”的中间状态。中途接入且旧模组没有 `blind_ante` 时，ROUND_EVAL 的 `ante` 为 `"?"`。

## 5. 合并规则

完整快照（`full:true`）替换全部状态。增量按下面四条处理：

1. `state` 中出现的键会更新；未出现的键保持原值，前提是该键仍属于当前阶段。
2. **值为数组时整体替换。** 值为对象时**逐成员替换**：成员为 null 表示删除该成员；对象只合并一层。
3. 有序区域（`jokers`、`consumables`、`hand`）在完整快照中是数组。如果增量中是 `{"2":"…"}` 形式的对象，就只替换对应下标的元素。服务端只在区域成员和顺序都没变时使用这种形式；有增删或重排时，一律发送完整数组。
4. 阶段改变时，按 4.2 丢弃失效的视图键。

这四条覆盖了原设计中的 handValuesPatch、区域整体替换、null 清空和阶段清空规则。具体效果：

- 出牌：`hands:{"Straight":"30x4 played 1"}`，只合并这一个牌型。
- Popcorn 衰减：`jokers:{"2":"2: Popcorn [sell $2]: +12 Mult, -4 Mult per round played"}`。
- 弃牌：`round:{"discards":1}`。
- 购买补充包：`shop:{"packs":[…]}`，`cards` 和 `vouchers` 保持不变。
- 击败小盲注：`blinds:{"Small":"900 [defeated]"}`。

以下情况返回完整快照：没有匹配的已投递基线、新牌局、桥接重连、整局结束、未就绪转为就绪。这些条件与原设计相同。

## 6. 行文本格式

所有行都是英文。未知数值写成 `?`。因此不再需要 `rulesKnown`；读到 `?` 就说明这部分规则未知。

### 6.1 扑克牌

格式：`"<i>: <face>"` 或 `"<i>: <face> [<attrs>]"`。

```text
"0: AD"
"1: QH [debuffed]"
"2: 7S [bonus, foil, red seal, +5 chips]"
"3: Stone"
"4: ?"                 ← 背面朝上，不附带任何身份
"5: ? [forced]"
```

attrs 只写非默认状态，取值包括 enhancement 名（去掉 `m_`）、edition、`<color> seal`、`+N chips`（永久加成）、`debuffed`、`forced`、`selected`。原来的 `; debuffed` 统一改为方括号写法，与物品行保持一致。

### 6.2 小丑、消耗牌、商品、卡包选项

格式：`"<i>: <Name> [<tags>]: <effect>"`。没有 tag 时省略方括号。

tags 按以下顺序排列，只写适用项：

| tag | 用于 | 含义 |
| --- | --- | --- |
| `Tarot` / `Planet` / `Spectral` | 非小丑物品 | 类别；小丑不标，商店里出现的扑克牌按 6.1 书写 |
| `$4` | 商品、卡包 | 购买价格 |
| `sell $2` | 持有物 | 出售价值。永恒小丑不写售价，只写 `eternal` |
| `eternal` / `rental` / `perishable 3` | 小丑 | 贴纸；perishable 后面是剩余回合数，0 也要写 |
| `foil` / `holo` / `polychrome` / `negative` | 任意 | 版本 |
| `debuffed` | 任意 | 被削弱 |
| `2 targets` / `1-2 targets` | 需要手牌目标的消耗牌和卡包选项 | 目标数量；目标范围未知时写 `? targets` |
| `blocked: <reason>` | 任意 | **只用于不能从 money/slots 推导出来的限制**，例如 `blocked: no hand to target` |

例子：

```text
"2: Popcorn [sell $2]: +16 Mult, -4 Mult per round played"
"0: Smiley Face [eternal]: Played face cards give +5 Mult when scored"
"0: Death [Tarot, sell $1, 2 targets]: Convert the left selected card into the right one"
"1: Satellite [$6, eternal]: Earn $1 at end of round per unique Planet card used this run (currently $3)"
"0: Jumbo Arcana Pack [$6]: pick 1 of 5 Tarot"
```

effect 只描述效果，不写名称、价格、贴纸或 UI 提示（例如 "(Drag to rearrange)"）。卡包的 effect 由卡包配置生成，格式为 `pick <choose> of <extra> <kind>`，不使用本地化长句。

**资格不再逐项预先计算。** 原设计中的 `buy.available`、`reason:"capacity_full"`、`"insufficient_funds"`、`"backend_validation_required"` 都删除。模型可以用 `money`、价格、`jokerSlots` 和数组长度自己判断（Negative 版本不占槽位，tag 中能看到）。判断错时，后端返回 `applied:false`，不会造成状态损失。

这样做还有一个好处：资金变化不再导致整个商店重发。在原设计里，每件商品的 available 都依赖资金，买一件东西就可能让所有商品的资格一起变化。

### 6.3 牌型数值

格式：`"<chips>x<mult>"`，按需追加 ` Lv<n>`（仅 n>1）和 ` played <n>`（仅 n>0）。

```json
{"High Card":"5x1","Pair":"25x3 Lv2 played 4","Two Pair":"20x2 played 2"}
```

完整快照包含全部可见牌型，未升级的也要列出。增量只发送变化的牌型，按第 5 节第 2 条逐成员合并。原来的字符串是 `"chips=10; mult=2; played=0"`，每条约 26 字符；新格式约 4–16 字符。

### 6.4 盲注

`blinds` 的每个成员是一行：`"<target>"`，或 `"<Boss name> <target>"`，后面可以接方括号状态（`[defeated]`、`[skipped]`、`[disabled]`）、`: <rules>` 和 `; skip: <Tag> (<tag effect>)`。

```text
"Small": "900; skip: Standard Tag (free Mega Standard Pack)"
"Big":   "1350 [defeated]"
"Boss":  "The Needle 900: Play only 1 hand"
"Boss":  "The Eye 2700: No repeat hand types this round (used: Pair, Flush)"
"Boss":  "The Mouth 2700: Only Pair this round"
"Boss":  "The Head 600 [disabled]: Hearts are debuffed"
"Small": "2600 [skipped]"
```

- 规则 UI 碎片在这里拼成一句。
- Eye、Mouth、Ox 的动态状态直接写进 Boss 行，状态变化时发送 `blinds:{"Boss":"…"}`。
- 目标分数未知时写 `?`。
- 当前盲注由 `blind` 指出；行内只标注 `defeated`、`skipped`、`disabled` 这类异常状态。

标签行：`"Juggle Tag: +3 hand size next round"`、`"Orbital Tag: upgrade Pair by 3 levels"`。

## 7. actions

`actions` 是当前阶段的动作候选，参数约束写在同一个字符串里：

| 阶段 | 例子 |
| --- | --- |
| SELECTING_HAND | `["play 1-5", "discard 1-5"]`；弃牌次数为 0 时不列 `discard` |
| BLIND_SELECT | `["select", "skip", "reroll_boss $10"]`；Boss 不能跳过，所以只有 `["select"]` |
| ROUND_EVAL | `["cash_out"]` |
| SHOP | `["buy", "buy_and_use", "reroll $5", "next_round"]`；重掷免费时写 `reroll $0` |
| PACK | `["pack"]`，即选择或跳过 |
| MENU / GAME_OVER | `["start"]` |

- 已知不可用的动作不列出，这样避免了当前 `availableMethods` 和 `controls` 互相矛盾。
- 能力不确定的动作照常列出，由后端校验。
- `use`、`sell`、`rearrange` 是持有物通用动作；只要对应区域非空就是候选，不在每次返回中列出，规则写进工具描述即可。
- The Psychic 这类“能出但不计分”的限制，只写在 Boss 行里，不写进 actions。

## 8. result

`result` 是一句英文，只写本次动作前后已经验证的事实。它替代原来的 `summary` 和尚未实现的结构化 result 对象：

```text
"Played Three of a Kind (+2440). Blind defeated."
"Played Pair (+360)."
"Discarded 4, drew 4."
"Cashed out $8."
"Bought Red Card."
"Opened Arcana Pack."
"Picked The Hierophant; 1 pick left."
"Used Mercury: Pair is now Lv2."
"Sold Popcorn."
"Left the shop."
"Selected The Needle."
"Skipped Small Blind; got Juggle Tag."
"Rerolled the shop."
```

约束沿用原设计第 8 节：

- 得分来自回合分数差或 cashOut。
- 不能把资金差称为花费或收入，cashOut 的金额除外。
- 动作前的索引不出现在 result 里，避免和动作后的新索引混淆。

需要机器可读的动作事实时，放在 trace 的 details 里，不放进模型投影。

## 9. 示例：样本对局改写

以下内容与第 1 节的 12 次返回一一对应，数据来自样本对局。按同样口径统计，**合计 5160 字符，约为原来的 18%。**

| 返回 | 当前 | v3 |
| --- | --- | --- |
| observe，SELECTING_HAND | 4113 | 1287 |
| play → ROUND_EVAL | 2986 / 2826 / 2911 | 333 / 318 / 318 |
| cash_out → SHOP | 2852 / 2766 / 3180 | 511 / 561 / 789 |
| next_round → BLIND_SELECT | 1467 / 1330 | 109 / 102 |
| select | 1841 / 1711 | 292 / 293 |
| discard | 980 | 247 |

表中数字按设计初稿的改写统计，示例在实现时有细微调整（例如盲注状态加了方括号）。Bull、Crafty Joker、To Do List、Satellite 行保留了样本中的 `?`；实现已修正这些读取，实际返回会给出当前数值，长度基本不变。

### 9.1 game_observe：完整快照

```json
{"ok":true,"value":{
  "v":3,"full":true,"rev":"1","phase":"SELECTING_HAND",
  "actions":["play 1-5","discard 1-5"],
  "state":{
    "setup":"BLUE deck, BLUE stake, seed EI6GVY7S",
    "ante":2,"roundNo":4,"money":2,
    "handSize":8,"jokerSlots":5,"consumableSlots":2,
    "hands":{"High Card":"5x1","Pair":"10x2","Two Pair":"20x2 played 2","Three of a Kind":"30x3","Straight":"30x4","Flush":"35x4","Full House":"40x4 played 1","Four of a Kind":"60x7","Straight Flush":"100x8"},
    "jokers":[
      "0: Smiley Face [eternal]: Played face cards give +5 Mult when scored",
      "1: Raised Fist [eternal]: Adds double the rank of lowest ranked card held in hand to Mult",
      "2: Popcorn [sell $2]: +16 Mult, -4 Mult per round played",
      "3: Bull [eternal]: +2 Chips for each $1 you have (currently +? Chips)",
      "4: Shoot the Moon [sell $2]: Each Queen held in hand gives +13 Mult"
    ],
    "consumables":["0: Death [Tarot, sell $1, 2 targets]: Convert the left selected card into the right one"],
    "vouchers":[],"tags":[],
    "blind":"Small",
    "blinds":{
      "Small":"900; skip: Standard Tag (free Mega Standard Pack)",
      "Big":"1350; skip: Juggle Tag (+3 hand size next round)",
      "Boss":"The Needle 900: Play only 1 hand"
    },
    "round":{"score":0,"target":900,"hands":5,"discards":2},
    "deck":"44/52",
    "hand":["0: AD","1: QS","2: QH","3: 9D","4: 8H","5: 2H","6: 2C","7: 2D"]
  }
}}
```

### 9.2 play → ROUND_EVAL（打出 `[5,6,7]`）

```json
{"ok":true,"value":{"rev":"4","phase":"ROUND_EVAL","actions":["cash_out"],
  "result":"Played Three of a Kind (+2440). Blind defeated.",
  "state":{
    "hands":{"Three of a Kind":"30x3 played 1"},
    "jokers":{"2":"2: Popcorn [sell $2]: +12 Mult, -4 Mult per round played"},
    "blinds":{"Small":"900 [defeated]"},
    "cashOut":{"blind":"Small Blind","score":2440,"target":900,"payout":4}
  }}}
```

`hand`、`deck`、`round` 因阶段切换自动失效。被击败的盲注在结算时就标成 `[defeated]`（见 4.3）。

### 9.3 cash_out → SHOP

```json
{"ok":true,"value":{"rev":"7","phase":"SHOP","actions":["buy","buy_and_use","reroll $5","next_round"],
  "result":"Cashed out $4.",
  "state":{
    "money":6,"blind":"Big",
    "shop":{
      "cards":["0: Crafty Joker [$4]: +? Chips if played hand contains a Flush","1: Red Card [$5]: Gains +3 Mult when any Booster Pack is skipped (currently +0 Mult)"],
      "vouchers":["0: Blank [$10]: Does nothing?"],
      "packs":["0: Jumbo Arcana Pack [$6]: pick 1 of 5 Tarot","1: Arcana Pack [$4]: pick 1 of 3 Tarot"]
    }
  }}}
```

小丑槽已满（5 个元素 / `jokerSlots:5`），模型可以自己看出两张小丑买不了，不需要逐项写 `capacity_full`。

### 9.4 next_round → BLIND_SELECT

```json
{"ok":true,"value":{"rev":"10","phase":"BLIND_SELECT","actions":["select","skip"],"result":"Left the shop."}}
```

状态没有变化，所以不发送 `state`。原来这次返回有 1467 字符，其中 route 占 772。

### 9.5 discard（弃 `[1,5,6,7]`）

```json
{"ok":true,"value":{"rev":"16","phase":"SELECTING_HAND","actions":["play 1-5","discard 1-5"],
  "result":"Discarded 4, drew 4.",
  "state":{"round":{"discards":1},"deck":"40/52","hand":["0: AD","1: KC","2: QD","3: 7H","4: 6H","5: 6D","6: 3H","7: 3D"]}}}
```

### 9.6 击败 Boss 后 cash_out → SHOP（底注推进）

```json
{"ok":true,"value":{"rev":"34","phase":"SHOP","actions":["buy","buy_and_use","reroll $5","next_round"],
  "result":"Cashed out $8.",
  "state":{
    "money":23,"ante":3,"blind":"Small",
    "blinds":{
      "Small":"2600; skip: Investment Tag (gain $25 after defeating the Boss Blind)",
      "Big":"3900; skip: Foil Tag (next base-edition shop Joker is free and becomes Foil)",
      "Boss":"The Fish 5200: Cards drawn face down after each hand played"
    },
    "shop":{
      "cards":["0: To Do List [$4]: Earn $? if poker hand is a ?, poker hand changes at end of round","1: Satellite [$6, eternal]: Earn $1 at end of round per unique Planet card used this run (currently $?)"],
      "vouchers":["0: Crystal Ball [$10]: +1 consumable slot"],
      "packs":["0: Standard Pack [$4]: pick 1 of 3 Playing","1: Celestial Pack [$4]: pick 1 of 3 Planet"]
    }
  }}}
```

新底注的三个盲注成员全部发送，效果等同于整体替换。

### 9.7 示意：买卡包 → PACK → 选择 → 返回商店

以下是示意数据。

```json
{"rev":"41","phase":"PACK","actions":["pack"],"result":"Opened Arcana Pack.",
 "state":{"money":4,
  "shop":{"packs":["0: Celestial Pack [$4]: pick 1 of 3 Planet"]},
  "pack":{"name":"Arcana Pack","picks":1,"items":[
    "0: The Hierophant [Tarot, 1-2 targets]: Enhance up to 2 selected cards into Bonus Cards",
    "1: Death [Tarot, 2 targets]: Convert the left selected card into the right one",
    "2: The Empress [Tarot, 1-2 targets]: Enhance up to 2 selected cards into Mult Cards"]},
  "deck":"44/52",
  "hand":["0: AS","1: KD","2: QC","3: JS","4: 9D","5: 7C","6: 4H","7: 2S"]}}
```

```json
{"rev":"44","phase":"SHOP","actions":["buy","buy_and_use","reroll $5","next_round"],
 "result":"Picked The Hierophant on 2 cards; pack closed."}
```

`shop` 在 PACK 期间仍然有效，所以返回商店时不必重发。`pack`、`hand`、`deck` 因阶段切换自动失效。被修改的两张牌不在当前可见区域里，详细牌组内容按需调用 `card_observe` 查看。

### 9.8 示意：出售小丑（区域成员变化）

```json
{"rev":"52","phase":"SHOP","actions":["buy","buy_and_use","reroll $5","next_round"],
 "result":"Sold Popcorn.",
 "state":{"money":25,"jokers":[
   "0: Smiley Face [eternal]: Played face cards give +5 Mult when scored",
   "1: Raised Fist [eternal]: Adds double the rank of lowest ranked card held in hand to Mult",
   "2: Bull [eternal]: +2 Chips for each $1 you have (currently +50 Chips)",
   "3: Shoot the Moon [sell $2]: Each Queen held in hand gives +13 Mult"]}}
```

区域成员发生变化，所以发送完整数组，所有下标重新编号。

### 9.9 未就绪与终局

```json
{"ok":true,"value":{"rev":"60","phase":"SHOP","notReady":"animation in progress","actions":[]}}
```

```json
{"ok":true,"value":{"v":3,"full":true,"rev":"88","phase":"GAME_OVER","outcome":"lost","actions":["start"],
  "state":{"setup":"…","ante":3,"roundNo":8,"money":4,"…":"…其余牌局键…",
    "runResult":"Lost at Ante 3 Big Blind: 1800/3000",
    "profiles":{"RED":"WHITE RED","BLUE":"WHITE RED GREEN BLACK BLUE"}}}}
```

## 10. 工具描述（模型侧说明）

规则应短到可以直接写进 `game_action` 的描述或 `balatro://protocol`：

```text
Results: full:true replaces everything. Otherwise state holds only changed keys:
arrays replace; objects merge per member (null deletes); {"2":"…"} on jokers/
consumables/hand replaces that element only. Phase views (hand, deck, round,
cashOut, shop, pack) are dropped when the phase no longer uses them. Lines read
"<i>: <Name> [tags]: <effect>"; "?" means unknown. Check price vs money and slots
yourself; the game validates. use/sell/rearrange are available whenever the area
is non-empty. Use rev for the next action.
```

## 11. 取舍与风险

| 决定 | 收益 | 风险及缓解 |
| --- | --- | --- |
| 删除 `key` | 每个物品省约 25 字符 | 名称在原版内容中唯一。key 保留在 trace 中；技能文档如果引用 key，需要改用名称 |
| 删除逐项资格 | 资金变化不再触发商店重发 | 模型可能尝试买不起的东西，后端返回 `applied:false`，不改变状态 |
| 物品写成行文本 | 体积降到约 1/3，模型直接可读 | 程序端解析能力变弱；需要解析的话使用 trace details |
| 下标补丁 `{"2":…}` | 回合结束只发一行 | 只在成员和顺序不变时使用，由服务端保证，测试覆盖 |
| 隐式清空视图 | 不需要 null 标记 | 模型需要知道阶段与视图的对应关系；规则只有一句，并写进工具描述 |
| 短 rev | 每次省约 60 字符 | 实例校验移到服务端；MCP 重启后必须先 observe |
| `ante` 跟随盲注表 | 不会出现底注错位 | Boss 结算期间 `ante` 仍是旧底注；这一阶段只有 cash_out 一个决策 |

## 12. 实施记录

- `env/compact.ts`：单一投影 `compactObservation` 生成完整快照；`compactActionObservation` 对前后两次完整投影做差分，比较粒度到对象成员和数组元素。下标补丁要求原始卡牌的桥接 ID 序列完全相同。仍然有效的键消失时（例如信用额度归零），改发完整快照。`applyDelta` 是参考合并实现，测试和本地冒烟都用它重建状态。
- `tools/index.ts`：短 rev 的还原见第 3 节；工具描述改为 v3。`src/context.ts` 的启动说明和上游字段映射同步更新。
- `play/mod/game.lua`：`modifier.enhancement` 只对扑克牌（`Default`/`Enhanced`）输出；从商店打开的卡包期间继续读取商店区域（`G.shop` 存在时）。
- `play/mod/decision.lua`：Jolly/Sly 一类小丑改读顶层 `t_mult`/`t_chips`；To Do List 读卡牌自身的 `to_do_poker_hand`；Bull 读当前资金；Satellite 统计已使用的星球牌。都是只读。
- 仍未解决：部分效果变量缺少绑定（例如 Troubadour、Misprint、The Sun/The Moon 的花色、Temperance 的当前值），继续显示 `?`。无 Steamodded 的环境中卡包名为 `?`。content 与 structuredContent 是否被客户端同时交给模型，仍待确认。
