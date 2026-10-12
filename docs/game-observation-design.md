# 游戏观察与动作返回字段设计

> 本文的字段形状（contract 2）已被 [game-observation-v3.md](game-observation-v3.md) 取代。可见性、无副作用观察、稳定边界、错误与未知结果处理等原则仍然有效。

状态：完整快照及第一版动作增量已实现；结构化 result 暂缓。日期：2026-10-11。

当前实施范围：`game_observe`、`game_start` 返回 contract 2 完整快照；`game_action` 在匹配已投递基线时，返回动作最低字段、阶段进入字段及全部实际变化，并使用 baseRevision、handValuesPatch。普通阶段切换不强制全量；旧阶段块明确清空。缺少匹配基线、start/新牌局、来源或 readiness 改变、未就绪及终局返回完整快照。动作失败后清除增量基线。动作参数、执行校验、revision 与未知结果处理保持原实现。

第 8 节结构化 result 尚未实现；动作继续使用 actionId 和原有英文 summary，不从资金差推断 spent/received。动作、调用、trace 使用顺序编号，进程启动时间和 PID 只作隔离前缀。未引入哈希。桥接端 revision/runId 已是实例前缀加顺序编号，保留其重启失效语义。完整后端观察保留在内部详情及 MCP trace 的 details。

部分动态描述变量、物品使用资格和卡包标识无法可靠提取时明确为未知，不调用 UI 构造器、游戏动作或 RNG 补全。结算 amount 与明细分别用 known、linesKnown 表示；尚不提取逐条收入。Lua HTTP 协议保持 1，模型可见投影为 2。详见 [当前工具指南](../tools/guide.ts)。文档文件名统一使用小写和连字符。

适用范围：本仓库的 MCP `game_observe`、`game_start` 和 `game_action`，以及它们共用的观察投影。完整及增量使用 `contract: 2`；示例中的 result 字段仍属于后续设计，其他示意数据也不代表真实执行结果。

## 1. 目标与范围

约定两种返回方式：

- **`game_observe` 返回完整结果。** 不依赖此前调用，包含当前可知、玩家可见的全部受支持决策信息。完整不等于重复原始引擎字段；无关阶段的内部残留值必须清理。
- **`game_action` 按需返回。** 根据动作执行后的实际阶段，返回本动作必需的信息、下一步决策需要的新信息，以及所有实际变化。不能只按动作名写一份固定白名单。

本次设计不增加自动出牌、策略推荐、模拟器或精确分数预测。观察读取不能推进 RNG、触发游戏动作、修改选牌或改变 revision。游戏规则和最终合法性仍由原版 Lua 执行。

`game_start` 和 `game_action({action:{method:"start",...}})` 成功时采用相同的完整快照规则。当前动作参数名称及零基索引暂不修改。

## 2. 基础协议

### 2.1 成功与失败

成功沿用 `{ok:true,value:...}`。失败沿用 `{ok:false,code,applied,message}`，同时保留 MCP `isError:true`。

`content` 的 JSON 文本与 `structuredContent` 表达同一个结果；不能分别包含不同的观察或不同的错误标记。完整的原始后端观察继续保留在内部详情和跟踪记录中。

成功观察公共字段如下。

| 字段 | 类型 | 约定 |
| --- | --- | --- |
| `contract` | `2` | 完整和增量都携带，便于独立识别协议版本 |
| `revision` | string | 此次完成观察的版本；客户端当作不透明字符串 |
| `baseRevision` | string，仅增量 | 必须等于客户端当前完整重建状态的 revision |
| `runId` | string 或 null | 运行标识；尚无牌局时为 null |
| `partial` | boolean | false 表示整个快照替换；true 表示按第 3 节合并 |
| `phase` | enum | 当前实际阶段，见第 5 节；不再放在 `state.state` |
| `ready` | boolean | 当前能否进入受支持的操作边界 |
| `notReadyReason` | string 或 null | ready=true 时必须为 null，不能残留旧原因 |
| `terminal` | boolean | 本局是否结束；通关某个普通底注不等于整局结束 |
| `outcome` | `ongoing` / `won` / `lost` | 沿用当前含义；尚未开局时使用 ongoing |
| `availableMethods` | string[] | 当前阶段的候选方法，不代表每组参数都合法；未就绪时为 [] |
| `actionId` | string，仅动作成功 | 本次操作标识；用于关联操作记录 |
| `result` | object，仅动作成功 | 本次实际操作事实，见第 8 节；不属于持久状态 |
| `summary` | string，仅动作成功 | 从实际结果生成的简短英文摘要，不调用另一个模型 |
| `state` | object | 完整状态或增量字段集合 |

`backend`、`gameVersion` 和桥接能力放在完整快照的 `source` 中；增量不重复发送。`source` 包含 `backend`、`gameVersion`，可选 `capabilities`。Lua 运行时和传输诊断仍可通过 `game_health` 获取。

固定的 `legality:"backend-authoritative"` 移至工具契约说明。`state.won` 被公共 `outcome` 替代，不重复发送。

### 2.2 字段取值与信息边界

- 数字使用 JSON number；牌型字符串中的数字例外，见 4.4。
- 字段名使用 camelCase，枚举和 key 稳定；规则、效果和摘要采用英文。不能直接拼接本机 UI 的所有文字节点作为最终说明。
- `name` 只保留一个可读名称；`key` 是稳定的类型标识，不能作为某张隐藏实体的身份映射。
- 只返回玩家可见的信息。隐藏牌只保留当前区域索引及可见的 forced/highlight 标记。
- 未知不能伪装成零、false、空限制或可执行。规则用 `rulesKnown`，回合历史用 `known`，目标分数用 `targetKnown`，操作判断用 `available:null` 明确表达未知。
- `null` 的含义由字段类型约定；在增量的一级状态键上，始终表示清空该状态块。不能用省略表达“现在没有了”。
- 全量快照包含所有一级状态键。集合为空用 [] 或 {}；不适用的状态块用 null。
- 增量可省略未变化的一级状态键。对象内部不存在“省略即继承”的规则。

## 3. 完整与增量的合并规则

### 3.1 完整快照

`partial:false` 的结果替换此前全部观察状态，不需要 `baseRevision`。

`game_observe` 始终返回完整快照，不提供 fields/filter 参数，不让调用者通过省略字段建立不完整基线。完整快照恢复以下全部受支持信息：运行配置、资源、持有物、可见牌型数值、盲注路线及规则、标签、凭证，以及当前阶段数据。

“完整”仍受玩家可见性限制；`deck_observe` 的详细剩余牌组预览保持独立，不塞进每次 game_observe。

### 3.2 增量

客户端先检查 contract、runId、baseRevision，再合并：

1. 公共字段使用本次值更新；不沿用旧 readiness、phase 或候选方法。source 只在完整快照中提供，在正常增量中继承；来源变化必须返回完整快照。
2. `state` 中省略的一级键保持不变。
3. 提供的一级状态块整体替换；例如 `economy`、`round`、`shop` 都不是递归 merge。
4. 提供 null 清空该状态块。
5. 区域的 cards 数组完整替换，不按 index 合并，不发送 JSON Patch 数组操作。
6. 唯一例外是 `handValuesPatch`：按牌型名称合并，字符串替换整项，null 删除项。
7. 若提供 `handValues`，替换整张牌型表；同一结果不能同时提供 handValues 和 handValuesPatch。
8. `result` 和 summary 仅记录本次操作，不参与状态重建。

缺少匹配基线、上下文压缩后丢失基线，或者 revision 过期时，重新调用 `game_observe`。不能猜测漏掉的字段。

### 3.3 生成规则

服务端维护此前**已经完整投递给本连接**的观察基线。每次动作完成后，从新的完整规范化观察生成增量：

```text
返回字段 = 动作必带字段
         ∪ 阶段进入/退出字段
         ∪ 所有实际变化的规范化字段
```

不能只比较手牌和资源。小丑成长、标签消费、牌型变化、Boss 状态、价格、容量、凭证效果等连带变化都必须纳入比较。

以下情况返回完整快照：

- 没有匹配的已投递基线。
- 新牌局、runId 改变、桥接重连或 contract/source 改变。
- 本次进入整局终局。
- readiness 改变且无法形成可靠、完整的阶段增量。

**普通阶段切换不强制返回完整快照。** 它需要第 5 节约定的完整新阶段数据及旧阶段清空标记，其他数据按实际变化返回。这与当前“阶段一变就全量返回”的实现不同。

## 4. 完整状态字段

### 4.1 一级状态块

以下 17 个键构成完整 `state`。其中 handValuesPatch 只属于增量，不属于完整 state。

| 键 | 完整结果中的内容 | 无牌局/不适用时 |
| --- | --- | --- |
| `run` | deck、stake、seed、ante、roundNumber | null |
| `economy` | money、creditLimit | null |
| `deck` | drawRemaining；可可靠观察时增加 totalCards | null |
| `handValues` | 全部可见牌型的实际等级、筹码、倍率、累计使用次数 | {} |
| `hand` | 手牌区域 | null，仅无可见手牌区域时；合法空区域使用 cards:[] |
| `jokers` | 有序小丑区域 | null，仅无牌局时 |
| `consumables` | 有序消耗牌区域 | null，仅无牌局时 |
| `tags` | 所有已持有标签及其玩家可见动态参数 | [] |
| `vouchers` | 已兑换凭证的 key、name、effect | [] |
| `route` | 当前可观察盲注路线及归属底注 | null，仅无可用路线时 |
| `round` | 正在操作的回合资源与当前得分 | null，出牌阶段外 |
| `roundResult` | 刚结束回合与结算信息 | null，结算阶段外 |
| `shop` | 商店商品、凭证商品、补充包、重掷费用 | null，商店阶段外 |
| `pack` | 卡包种类、候选项、剩余选择次数、返回阶段 | null，卡包阶段外 |
| `controls` | 当前阶段的操作条件与选择限制 | {}，无可用条件时 |
| `profileOptions` | 解锁的牌组/赌注及已知性 | null，菜单或整局终局之外 |
| `runResult` | 已结束牌局的 outcome、终止底注/回合等 | null，整局结束前 |

`run.ante` 表示游戏当前底注指针。`round.ante`、`roundResult.ante`、`route.ante` 分别表示各自数据的归属，不能用当前 run.ante 替代。

刚击败第一底注 Boss 时，可以同时存在 `run.ante:2` 和 `roundResult.ante:1`。这是明确标注的两个时间范围。

路线在引擎尚未产生新底注选择时，可以保留归属第一底注、全部已完成的 route；必须带 route.ante=1，不能把这些盲注冒充第二底注路线。

### 4.2 手牌与区域

手牌区域格式：

```json
{
  "count": 3,
  "capacity": 8,
  "selectionLimit": 5,
  "cards": [
    "0: JD",
    "1: 8H; debuffed",
    "2: hidden; forced"
  ]
}
```

字符串以显式零基 index 开头，保留 A/K/Q/J 和 S/H/C/D。非默认修饰使用有名称的属性，例如 `enhancement=bonus`、`edition=foil`、`seal=blue`、`permanentChips=5`、`forced`、`highlight`。修饰不能只输出一个不明来源的数字。

Stone 牌直接写 `Stone`，不暴露无意义的印刷点数/花色。隐藏牌不附带 rank、suit、enhancement、seal、edition、永久加成或稳定实体 ID。

count 必须等于 cards.length；capacity 是当前实际容量。选择限制仅放在需要选择的区域或 controls，不给小丑区域重复发送无意义的 highlighted_limit。

小丑、消耗牌和商品使用对象数组。它们的 effect 和动态参数需要独立于索引、价格与操作资格。

### 4.3 小丑、消耗牌、商品

对象公共字段：`index`、`key`、`name`、`kind`、`effect`、`rulesKnown`、`modifiers`。kind 为 Joker/Tarot/Planet/Spectral/PlayingCard/Voucher/Booster。

- effect 是包含实际当前数值的简短英文效果说明。未知效果使用 effect:null、rulesKnown:false。
- modifiers 仅包含已知非默认状态，例如 eternal、debuffed、edition、rental、perishableRoundsLeft。
- 不能把 perishableRoundsLeft=0 当作没有易腐状态而省略。
- 效果说明不重复名称、价格、永恒提示或类型；这些已由对应字段表示。
- 持有物按适用性带 sell/use；商品按适用性带 buy/buyAndUse/choose。
- 价格属于操作：`buy.price`、`sell.value`。永恒小丑可以有可见的售价值，但 sell.available=false 必须明确。
- 商品里出现游戏牌时，使用 face 与可见 modifiers；不要求通用 effect 字符串解释其全部基础牌义。

持有小丑例子：

```json
{
  "index": 2,
  "key": "j_popcorn",
  "name": "Popcorn",
  "kind": "Joker",
  "effect": "+16 Mult; loses 4 Mult after each round",
  "rulesKnown": true,
  "modifiers": {},
  "sell": {"available": true, "value": 2, "reason": null}
}
```

需要目标的消耗牌例子：

```json
{
  "index": 0,
  "key": "c_heirophant",
  "name": "The Hierophant",
  "kind": "Tarot",
  "effect": "Enhance up to 2 selected cards into Bonus Cards",
  "rulesKnown": true,
  "modifiers": {},
  "sell": {"available": true, "value": 1, "reason": null},
  "use": {
    "available": true,
    "reason": null,
    "target": {"area": "hand", "min": 1, "max": 2, "eligibleIndices": [0, 1, 2]}
  }
}
```

操作 available=true 表示当前存在满足条件的参数，不表示可以忽略 target。false 必须有 reason；null 表示无法可靠判断，不能作为允许操作的依据。eligibleIndices 只给出已知单牌资格，不保证任意组合都合法；复杂组合约束用 conditions 补充，最终仍由后端校验。

不需要目标时 target=null；需要目标但范围未知时 target={"known":false}，不能默认为 0..0。商店没有可选手牌时，依赖手牌目标的买入即用操作应不可用。

### 4.4 牌型数值

保留直接可读的紧凑字符串：

```json
{
  "Pair": "Lv1; chips=10; mult=2; played=0",
  "Flush": "Lv2; chips=50; mult=6; played=3"
}
```

chips、mult、played 使用实际观察值。played 是本局累计次数，不是本回合历史。未升级的牌型也必须出现在完整观察中，不能要求模型根据基础公式补算。

增量示例：`handValuesPatch:{"Pair":"chips=10; mult=2; played=1"}`。删除可见项用 null；出现更高牌型时增加新项。

### 4.5 盲注路线、当前限制与历史

route 包含 `ante`、`current`（Small/Big/Boss 或 null）及 blinds。每个盲注包含：

- key、name、status（upcoming/current/defeated/skipped）。
- target、targetKnown；选盲注界面可见的目标分数直接读取。无法可靠观察则 target=null、targetKnown=false，不能只靠 mult 和通用公式猜测。
- rules、rulesKnown、disabled，以及动态 ruleState。
- Small/Big 的 skipReward；已完成或不可跳过的盲注使用 null。

当前盲注描述只在 route.blinds 中保存一份；round 用 blindRole 引用。回合中的动态限制更新 route，不能另建一份容易失配的 activeBlind。

round 使用 score、target、targetKnown、handsLeft、discardsLeft、ante、number、blindRole。target 为操作阶段便于决策而保留，与对应 route 目标必须一致；若观察不到路线目标，则以实际当前回合目标为准并同步已知值。

round.history 使用 `{known,handTypeCounts,lastHandType}`。空的、已知完整历史为 `{known:true,handTypeCounts:{},lastHandType:null}`；未知历史不能冒充空历史。handsPlayed 可由完整计数计算，不重复发送；若历史不完整但总次数可见，可以额外提供 handsPlayed。

The Eye 的本回合已使用牌型、The Mouth 的已承诺牌型、The Ox 的触发牌型等必须来自可见状态。不能用 handValues.played 推断本回合历史。

### 4.6 操作条件 controls

保留 availableMethods 的阶段候选含义；controls 给出可观察的参数限制。例如：

```json
{
  "play": {"minCards": 1, "maxCards": 5, "forcedIndices": []},
  "discard": {"available": true, "minCards": 1, "maxCards": 5},
  "scoringRequirements": ["Exactly 5 played cards are required by The Psychic"]
}
```

Boss 的“执行后不计分”限制与“操作不允许”分别表达。不能把 The Psychic 的计分要求误报成游戏按钮必然不可点击。

商店 controls 至少提供 reroll 的 available、price、reason；选盲注至少提供 select、skip、rerollBoss 的资格，含实际费用。物品级 buy/sell/use/choose 资格放在各物品上。

每次动作成功都重新发送完整 controls，即使相应动作名没变。这样资金、目标牌和容量变化不会留下旧操作资格。

### 4.7 结算数据

roundResult 至少包含：ante、number、blindRole、blindKey、blindName、score、target、handsPlayed、handsLeft、discardsLeft、defeated、cashOut。

cashOut 包含 amount、lines、known。收入条目从原版结算界面/已形成的结算数据读取，不能依据通用奖励公式重算。无法完整读取时 known=false，未知金额为 null，不能编造结算明细。

例如：`cashOut:{"amount":8,"known":true,"lines":[{"label":"Blind reward","amount":4},{"label":"Unused hands","amount":4}]}`。

归属底注、回合和刚打出的牌型/得分应从原版可见数据或此前已验证的回合记录中保留。若中途接入时无法可靠确认，未知项标记 null 并带相应 known=false；不能无条件用当前 ante 减 1。

## 5. 阶段约定

phase 的规范值是 MENU、BLIND_SELECT、SELECTING_HAND、ROUND_EVAL、SHOP、PACK、GAME_OVER。SMODS_BOOSTER_OPENED 在投影层归一化成 PACK。胜利由 terminal/outcome 表示，不凭空增加当前后端没有的 WIN 阶段。

| 当前 phase | 完整观察中必须有效的阶段块 | 其他阶段块 |
| --- | --- | --- |
| MENU | profileOptions、controls | round/roundResult/shop/pack 为 null；若无牌局，运行相关块也为 null |
| BLIND_SELECT | route、controls | round/roundResult/shop/pack 为 null |
| SELECTING_HAND | round、hand、route、controls | roundResult/shop/pack 为 null |
| ROUND_EVAL | roundResult、controls；保留带正确 ante 的 route | round/shop/pack 为 null |
| SHOP | shop、controls；route 表示实际已知路线 | round/roundResult/pack 为 null |
| PACK | pack、controls；按卡包需要返回可见 hand | round、roundResult、shop 是否保留见下文 |
| GAME_OVER 或 terminal=true | runResult、profileOptions、controls | 使用完整快照；round/roundResult/shop/pack 为 null |

以下公共块在有牌局时，无论哪个阶段都完整保留：run、economy、deck、handValues、jokers、consumables、tags、vouchers。hand 若为空但仍存在合法区域，使用空 cards，不保留上一阶段的手牌。

**PACK 是独立决策阶段，同时有返回上下文。** pack.returnPhase 明确是 SHOP 或 BLIND_SELECT。进入 PACK 时清空 shop/round/roundResult；商店对象在卡包结束返回 SHOP 时重新完整发送。用于塔罗/幻灵目标的可见 hand 在 PACK 期间有效，结束后以实际新区域替换或清空。

标签可能打开卡包，选牌可能继续停留 PACK，也可能打开另一个卡包。必须以动作完成后的实际 phase、pack.key 和 choicesLeft 为准，不能预设 skip 一定进入 BLIND_SELECT、pack 一定进入 SHOP。

### 5.1 跨阶段字段规则

| 转移 | 必须发送的新数据 | 必须显式清空/替换 |
| --- | --- | --- |
| BLIND_SELECT → SELECTING_HAND | round、hand、route、deck、controls | 旧 roundResult/shop/pack 若存在则 null |
| SELECTING_HAND → ROUND_EVAL | roundResult、hand、deck、route、controls | round:null；结算后的 hand 使用实际空区域或 null |
| ROUND_EVAL → SHOP | economy、shop、hand、controls；run/route 变化时也发 | roundResult:null、round:null |
| SHOP → BLIND_SELECT | route、hand、controls | shop:null；卡包上下文若存在则 pack:null |
| SHOP/BLIND_SELECT → PACK | pack、hand、controls；标签/资金等实际变化 | shop:null、round:null、roundResult:null |
| PACK → SHOP | shop、hand、controls | pack:null |
| PACK → BLIND_SELECT | route、hand、controls | pack:null、shop:null |
| 任意 → terminal | 完整快照和 runResult | 旧阶段数据按完整快照替换，不合并 |

表内的“必须”是动作必带字段之外的下限。任何额外实际变化仍需发送。

## 6. 各动作返回矩阵

缩写：R=run，E=economy，D=deck，H=hand，J=jokers，C=consumables，V=handValues/handValuesPatch，T=tags，U=vouchers，B=route，Q=round，F=roundResult，S=shop，P=pack。

每行都默认包含第 2 节公共字段、actionId/result/summary，以及完整 controls。括号内是额外强调，不能替代“所有实际变化”。

| action | 通常起始阶段 | 通常结束阶段 | 最低返回状态块 | 必须覆盖的特殊变化 |
| --- | --- | --- | --- | --- |
| start / game_start | MENU/已结束牌局 | BLIND_SELECT | 完整快照 | 新 runId、初始消耗牌、牌组/赌注效果、初始凭证 |
| select | BLIND_SELECT | SELECTING_HAND | B、Q、H、D | 开局生成/销毁小丑、牌、消耗牌；资源变化 |
| skip | BLIND_SELECT | BLIND_SELECT 或 PACK | B、T；进入 PACK 时 P、H | 即时资金、标签触发/叠加、Orbital 参数、跳盲成长 |
| play，继续出牌 | SELECTING_HAND | SELECTING_HAND | Q、H、D；V 有变化时 patch | 小丑成长/衰减、金钱、牌修改/销毁、Boss 动态状态 |
| play，结束回合 | SELECTING_HAND | ROUND_EVAL 或终局 | F、H、D、B，Q:null；终局完整 | 蓝封蜡、金牌、租赁、易腐、爆米花、Ante 推进 |
| discard | SELECTING_HAND | SELECTING_HAND | Q、H、D | 紫封蜡、弃牌成长、金钱、Boss 动态状态 |
| cash_out | ROUND_EVAL | SHOP | E、S、H，F:null | 标签消耗、免费/折扣商品、新底注指针 |
| next_round | SHOP | BLIND_SELECT | B、H，S:null | 商店退出复制、标签、资金、库存/手牌恢复 |
| buy.card，买小丑 | SHOP | SHOP | E、S、J | 小丑/消耗牌容量、价格、其他持有物动态变化 |
| buy.card，买消耗牌 | SHOP | SHOP | E、S、C | Negative 容量与相关小丑效果 |
| buy.voucher | SHOP | SHOP | E、S、U | 容量、价格、重掷费用、资源上限、当前可见路线等 |
| buy.pack | SHOP | PACK | E、P、H，S:null | 卡包初始选择数、目标牌、相关标签/小丑效果 |
| buy_and_use | SHOP | 以实际阶段为准 | E、S（仍在 SHOP 时） | 按所用消耗牌效果补充 V/J/C/H/D/B/T/U |
| reroll | SHOP | SHOP | E、S | 重掷费用、小丑成长、免费重掷次数、价格变化 |
| reroll_boss | BLIND_SELECT | BLIND_SELECT | E、B | 新 Boss 完整规则/状态与重掷资格 |
| use，无需手牌目标 | 任意受支持持有物阶段 | 以实际阶段为准 | C | 金钱、牌型、小丑、Boss、牌组/容量变化 |
| use，有手牌目标 | SELECTING_HAND/PACK 等合法阶段 | 以实际阶段为准 | C、H、D | 牌修改、删除/复制、容量、小丑/消耗牌生成 |
| sell.joker | 任意受支持持有物阶段 | 以实际阶段为准 | E、J | Luchador 解除 Boss、Negative 容量、价格/库存变化 |
| sell.consumable | 任意受支持持有物阶段 | 以实际阶段为准 | E、C | 容量与相关小丑动态变化 |
| pack.card，小丑/游戏牌 | PACK | PACK/返回阶段 | P（未结束时）；J 或 D，H 若变化 | 选择次数、库存容量、包内其他候选资格 |
| pack.card，塔罗/星球/幻灵 | PACK | PACK/返回阶段 | P（未结束时）+ 对应效果块 | V/H/D/J/C/E/B 等实际变化 |
| skip | PACK | 返回阶段或下一个 PACK | 新阶段完整块 | 包内临时手牌清理、P:null 或下一包完整 P |
| rearrange.hand | SELECTING_HAND/PACK 等合法阶段 | 通常不变 | H | 强制索引与目标索引更新、牌序相关状态 |
| rearrange.jokers | 任意受支持持有物阶段 | 通常不变 | J | Blueprint/Brainstorm 可观察的复制目标/效果更新 |
| rearrange.consumables | 任意受支持持有物阶段 | 通常不变 | C | 新索引与可用目标条件 |

### 6.1 对消耗牌效果的补充约定

| 效果 | 必须重新比较/返回的块 |
| --- | --- |
| 星球/Black Hole | V；相关小丑变化时 J |
| 加钱、金钱上限/负债相关 | E；金额改变商品资格时 S/P |
| 增强、版本、封蜡 | H、D；可见小丑/目标效果变化时 J/C |
| Death/复制/销毁牌 | H、D；只返回可见牌面，不回传抽牌顺序 |
| 生成或销毁小丑 | J；同步全部容量及资格变化 |
| 生成消耗牌 | C；同步容量 |
| 解除 Boss 效果 | B、Q/H/J 中实际受影响的块 |
| 无法提前归类的效果 | 比较完整规范化观察，发送全部实际变化 |

D 只表示数量与受支持摘要。详细牌组变化仍通过 deck_observe 按需查看；game_action 不额外泄露牌组成员映射。

### 6.2 容量、价格与资格的连带变化

例如购买 Negative 小丑，不能只返回新增小丑；必须返回新 J.capacity。出售信用卡小丑可能改变 creditLimit；必须返回 E。购买折扣凭证后，shop 中未购买的商品价格也必须更新。

即使候选商品本身没变，资金或容量变化导致 buy/use/choose.available 改变，也算 S/P/C/J 的实际变化，不能保留旧资格。

## 7. 按需返回的边界

### 7.1 不反复发送未变化数据

同阶段弃牌不重复 deck/stake/seed、完整路线、全部牌型、未变化小丑说明和标签说明。只保留本动作必带字段以及真实变化。

同阶段出牌更新某个牌型的累计次数时，用 handValuesPatch 更新该牌型，不重发其余未变化牌型。

### 7.2 新阶段的必要信息不能省略

首次进入商店必须返回全部商品、凭证商品、补充包与费用。首次进入卡包必须返回全部可见选项与完整目标手牌。不能要求模型通过猜测商品生成规则补全。

阶段切换保留未变化的持有小丑、消耗牌、牌型、运行配置等基线。清理旧阶段块不是丢弃全局信息。

### 7.3 多选卡包

一张候选被选走后，必须返回完整剩余 pack.items、新零基索引、choicesLeft 和重新计算的 choose 资格。不能只返回被移除的旧 index。

### 7.4 单步动作的稳定完成边界

只有原版事件队列到达已验证的稳定边界后，才能把动作观察作为成功结果投递。不能把临时动画状态、未完成的收入或尚未插入的消耗牌当作最终增量。

未知结果不能包装为 ok:true 的普通 patch，详见第 10 节。

## 8. 动作事实 result

result 始终包含 method、fromPhase、toPhase。以下字段按动作提供，值必须来自本次动作前后已验证的状态或原版可见记录。

| 动作 | 事实字段 |
| --- | --- |
| start | deck、stake、seed |
| select / skip | blindRole、blindKey；skip 可包含获得的 tagKeys |
| play | handType、scoreAdded、roundEnded、blindDefeated |
| discard | discardedCount、drawnCount（可靠观察时） |
| cash_out | collected（可靠观察时） |
| buy / buy_and_use | sourceArea、sourceIndex、itemKey、spent（可靠确认时） |
| reroll / reroll_boss | spent；Boss 可包含 previousBossKey、bossKey |
| use | consumableKey、targetCount（已知时） |
| sell | area、itemKey、received（可靠确认时） |
| pack | skipped、chosenKey（选择时）、packFinished |
| rearrange | area |
| next_round | 无额外必需事实；变化由 state 表达 |

scoreAdded 包含本次实际总得分，不是未来分数预测；不能用前后缺少完整证据的数值臆造。行动前索引用 sourceIndex，不能把它当作行动后索引。

资金前后差可能包含购买以外的触发效果，不能把 moneyBefore-moneyAfter 无条件命名为 spent。无法区分时只返回 state.economy 的实际结果，省略 spent。

## 9. 详细示例

以下是**设计用示意数据**，不是当前 MCP 可执行返回。revision/actionId 使用简写，生产环境仍使用真实不透明标识。各小节独立，除明确给出基线的情况外，不构成一条连续轨迹。

示例 9.1 改写自本次第一底注 Boss 前的可见状态；示例 9.2 使用实际观察到的 1950 分。其余例子用于解释协议，不代表已执行对应动作。

### 9.1 game_observe：完整出牌快照

请求：`game_observe({})`。

```json
{
  "ok": true,
  "value": {
    "contract": 2,
    "revision": "r48",
    "runId": "run2",
    "partial": false,
    "source": {"backend": "balatro_mcp_mod", "gameVersion": "1.0.1o"},
    "phase": "SELECTING_HAND",
    "ready": true,
    "notReadyReason": null,
    "terminal": false,
    "outcome": "ongoing",
    "availableMethods": ["play", "discard", "use", "sell", "rearrange"],
    "state": {
      "run": {"deck": "BLUE", "stake": "BLUE", "seed": "EI6GVY7S", "ante": 1, "roundNumber": 3},
      "economy": {"money": 4, "creditLimit": 0},
      "deck": {"drawRemaining": 44, "totalCards": 52},
      "handValues": {
        "High Card": "chips=5; mult=1; played=0",
        "Pair": "chips=10; mult=2; played=0",
        "Two Pair": "chips=20; mult=2; played=1",
        "Three of a Kind": "chips=30; mult=3; played=0",
        "Straight": "chips=30; mult=4; played=0",
        "Flush": "chips=35; mult=4; played=0",
        "Full House": "chips=40; mult=4; played=1",
        "Four of a Kind": "chips=60; mult=7; played=0",
        "Straight Flush": "chips=100; mult=8; played=0"
      },
      "hand": {
        "count": 8, "capacity": 8, "selectionLimit": 5,
        "cards": ["0: AD", "1: QH; debuffed", "2: JH; debuffed", "3: JD", "4: 10C", "5: 10D", "6: 8H; debuffed", "7: 6D"]
      },
      "jokers": {
        "count": 3, "capacity": 5,
        "cards": [
          {"index": 0, "key": "j_smiley", "name": "Smiley Face", "kind": "Joker", "effect": "Scored face cards give +5 Mult", "rulesKnown": true, "modifiers": {"eternal": true}, "sell": {"available": false, "value": 2, "reason": "eternal"}},
          {"index": 1, "key": "j_raised_fist", "name": "Raised Fist", "kind": "Joker", "effect": "Adds twice the rank chip value of the lowest ranked held card to Mult; a debuffed trigger gives no Mult", "rulesKnown": true, "modifiers": {"eternal": true}, "sell": {"available": false, "value": 2, "reason": "eternal"}},
          {"index": 2, "key": "j_popcorn", "name": "Popcorn", "kind": "Joker", "effect": "+20 Mult; loses 4 Mult after each round", "rulesKnown": true, "modifiers": {}, "sell": {"available": true, "value": 2, "reason": null}}
        ]
      },
      "consumables": {"count": 0, "capacity": 2, "cards": []},
      "tags": [],
      "vouchers": [],
      "route": {
        "ante": 1,
        "current": "Boss",
        "blinds": {
          "Small": {"key": "bl_small", "name": "Small Blind", "status": "defeated", "target": 300, "targetKnown": true, "rules": [], "rulesKnown": true, "disabled": false, "ruleState": {"known": true}, "skipReward": null},
          "Big": {"key": "bl_big", "name": "Big Blind", "status": "defeated", "target": 450, "targetKnown": true, "rules": [], "rulesKnown": true, "disabled": false, "ruleState": {"known": true}, "skipReward": null},
          "Boss": {"key": "bl_head", "name": "The Head", "status": "current", "target": 600, "targetKnown": true, "rules": ["Hearts are debuffed"], "rulesKnown": true, "disabled": false, "ruleState": {"known": true}, "skipReward": null}
        }
      },
      "round": {
        "ante": 1, "number": 3, "blindRole": "Boss", "score": 0, "target": 600, "targetKnown": true,
        "handsLeft": 5, "discardsLeft": 2,
        "history": {"known": true, "handTypeCounts": {}, "lastHandType": null}
      },
      "roundResult": null,
      "shop": null,
      "pack": null,
      "controls": {"play": {"minCards": 1, "maxCards": 5, "forcedIndices": []}, "discard": {"available": true, "minCards": 1, "maxCards": 5}, "scoringRequirements": ["Hearts contribute no card effects while debuffed"]},
      "profileOptions": null,
      "runResult": null
    }
  }
}
```

这是一份独立可读的完整快照。不能为了更短省掉持有小丑、当前牌型或 Boss 规则；它们没有依赖更早的工具返回。

### 9.2 play：击败 Boss，跨阶段增量

请求：`game_action({revision:"r48",action:{method:"play",cards:[2,3,4,5]}})`。

```json
{
  "ok": true,
  "value": {
    "contract": 2, "revision": "r51", "baseRevision": "r48", "runId": "run2", "partial": true,
    "phase": "ROUND_EVAL", "ready": true, "notReadyReason": null, "terminal": false, "outcome": "ongoing",
    "availableMethods": ["cash_out", "use", "sell", "rearrange"], "actionId": "a-play-1",
    "result": {"method": "play", "fromPhase": "SELECTING_HAND", "toPhase": "ROUND_EVAL", "handType": "Two Pair", "scoreAdded": 1950, "roundEnded": true, "blindDefeated": true},
    "summary": "Scored 1950 with Two Pair. Defeated The Head; completed Ante 1.",
    "state": {
      "run": {"deck": "BLUE", "stake": "BLUE", "seed": "EI6GVY7S", "ante": 2, "roundNumber": 3},
      "deck": {"drawRemaining": 52, "totalCards": 52},
      "handValuesPatch": {"Two Pair": "chips=20; mult=2; played=2"},
      "hand": {"count": 0, "capacity": 8, "selectionLimit": 5, "cards": []},
      "jokers": {
        "count": 3, "capacity": 5,
        "cards": [
          {"index": 0, "key": "j_smiley", "name": "Smiley Face", "kind": "Joker", "effect": "Scored face cards give +5 Mult", "rulesKnown": true, "modifiers": {"eternal": true}, "sell": {"available": false, "value": 2, "reason": "eternal"}},
          {"index": 1, "key": "j_raised_fist", "name": "Raised Fist", "kind": "Joker", "effect": "Adds twice the rank chip value of the lowest ranked held card to Mult; a debuffed trigger gives no Mult", "rulesKnown": true, "modifiers": {"eternal": true}, "sell": {"available": false, "value": 2, "reason": "eternal"}},
          {"index": 2, "key": "j_popcorn", "name": "Popcorn", "kind": "Joker", "effect": "+16 Mult; loses 4 Mult after each round", "rulesKnown": true, "modifiers": {}, "sell": {"available": true, "value": 2, "reason": null}}
        ]
      },
      "route": {
        "ante": 1, "current": null,
        "blinds": {
          "Small": {"key": "bl_small", "name": "Small Blind", "status": "defeated", "target": 300, "targetKnown": true, "rules": [], "rulesKnown": true, "disabled": false, "ruleState": {"known": true}, "skipReward": null},
          "Big": {"key": "bl_big", "name": "Big Blind", "status": "defeated", "target": 450, "targetKnown": true, "rules": [], "rulesKnown": true, "disabled": false, "ruleState": {"known": true}, "skipReward": null},
          "Boss": {"key": "bl_head", "name": "The Head", "status": "defeated", "target": 600, "targetKnown": true, "rules": ["Hearts are debuffed"], "rulesKnown": true, "disabled": false, "ruleState": {"known": true}, "skipReward": null}
        }
      },
      "round": null,
      "roundResult": {"ante": 1, "number": 3, "blindRole": "Boss", "blindKey": "bl_head", "blindName": "The Head", "score": 1950, "target": 600, "handsPlayed": 1, "handsLeft": 4, "discardsLeft": 2, "defeated": true, "cashOut": {"amount": null, "known": false, "lines": []}},
      "controls": {"cashOut": {"available": true}}
    }
  }
}
```

这里未重新发送未变化的 economy、consumables、tags、vouchers 和其余牌型。Popcorn 衰减导致整个 jokers 区域重发；不是只发送第 2 张的局部对象。未知结算金额没有借用其他回合的奖励。

### 9.3 discard：同阶段最小增量

请求：`game_action({revision:"r27",action:{method:"discard",cards:[1,5,6,7]}})`。假设没有其他触发效果。

```json
{
  "ok": true,
  "value": {
    "contract": 2, "revision": "r30", "baseRevision": "r27", "runId": "run2", "partial": true,
    "phase": "SELECTING_HAND", "ready": true, "notReadyReason": null, "terminal": false, "outcome": "ongoing",
    "availableMethods": ["play", "discard", "use", "sell", "rearrange"], "actionId": "a-discard-1",
    "result": {"method": "discard", "fromPhase": "SELECTING_HAND", "toPhase": "SELECTING_HAND", "discardedCount": 4, "drawnCount": 4},
    "summary": "Discarded 4 cards. Score 0/450; 5 hands and 1 discard left.",
    "state": {
      "round": {"ante": 1, "number": 2, "blindRole": "Big", "score": 0, "target": 450, "targetKnown": true, "handsLeft": 5, "discardsLeft": 1, "history": {"known": true, "handTypeCounts": {}, "lastHandType": null}},
      "hand": {"count": 8, "capacity": 8, "selectionLimit": 5, "cards": ["0: AD", "1: 10H", "2: 10D", "3: 9D", "4: 8C", "5: 8D", "6: 7H", "7: 2C"]},
      "deck": {"drawRemaining": 40, "totalCards": 52},
      "controls": {"play": {"minCards": 1, "maxCards": 5, "forcedIndices": []}, "discard": {"available": true, "minCards": 1, "maxCards": 5}, "scoringRequirements": []}
    }
  }
}
```

如果此次弃掉紫封蜡并生成塔罗，则必须额外发送完整 consumables 区域；不能坚持“discard 只发 Q/H/D”。

### 9.4 play：未结束回合，包含牌型与动态限制变化

请求：`game_action({revision:"p10",action:{method:"play",cards:[0,1]}})`。这是独立示意场景：第二底注小盲注，打出一对 J，只有 Smiley Face 参与额外计分，实际得分 360；目标 1000，尚未结束。

```json
{
  "ok": true,
  "value": {
    "contract": 2, "revision": "p11", "baseRevision": "p10", "runId": "pair-run", "partial": true,
    "phase": "SELECTING_HAND", "ready": true, "notReadyReason": null, "terminal": false, "outcome": "ongoing",
    "availableMethods": ["play", "discard", "use", "sell", "rearrange"], "actionId": "a-play-2",
    "result": {"method": "play", "fromPhase": "SELECTING_HAND", "toPhase": "SELECTING_HAND", "handType": "Pair", "scoreAdded": 360, "roundEnded": false, "blindDefeated": false},
    "summary": "Scored 360 with Pair. Score 360/1000; 3 hands left.",
    "state": {
      "round": {"ante": 2, "number": 4, "blindRole": "Small", "score": 360, "target": 1000, "targetKnown": true, "handsLeft": 3, "discardsLeft": 3, "history": {"known": true, "handTypeCounts": {"Pair": 1}, "lastHandType": "Pair"}},
      "hand": {"count": 8, "capacity": 8, "selectionLimit": 5, "cards": ["0: AS", "1: QC", "2: 10D", "3: 9C", "4: 8C", "5: 7H", "6: 5D", "7: 2S"]},
      "deck": {"drawRemaining": 42, "totalCards": 52},
      "handValuesPatch": {"Pair": "chips=10; mult=2; played=1"},
      "controls": {"play": {"minCards": 1, "maxCards": 5, "forcedIndices": []}, "discard": {"available": true, "minCards": 1, "maxCards": 5}, "scoringRequirements": []}
    }
  }
}
```

如果此场景换成 The Eye，必须同时返回 route 中新增的 blockedHandTypes；换成 The Mouth，则返回新的 requiredHandType。不能只在 controls 或摘要里提一次，再丢失可重建状态。

### 9.5 buy.card：小丑购买与商品索引变化

请求：`game_action({revision:"s10",action:{method:"buy",card:1}})`。假设当前只有 $8，商店中有教皇和 Smiley Face；无其他商品与相关触发效果，原小丑区域为空。

```json
{
  "ok": true,
  "value": {
    "contract": 2, "revision": "s11", "baseRevision": "s10", "runId": "shop-run", "partial": true,
    "phase": "SHOP", "ready": true, "notReadyReason": null, "terminal": false, "outcome": "ongoing",
    "availableMethods": ["buy", "buy_and_use", "reroll", "next_round", "use", "sell", "rearrange"], "actionId": "a-buy-1",
    "result": {"method": "buy", "fromPhase": "SHOP", "toPhase": "SHOP", "sourceArea": "shop.cards", "sourceIndex": 1, "itemKey": "j_smiley", "spent": 4},
    "summary": "Bought Smiley Face for $4. Money $4.",
    "state": {
      "economy": {"money": 4, "creditLimit": 0},
      "jokers": {"count": 1, "capacity": 5, "cards": [{"index": 0, "key": "j_smiley", "name": "Smiley Face", "kind": "Joker", "effect": "Scored face cards give +5 Mult", "rulesKnown": true, "modifiers": {"eternal": true}, "sell": {"available": false, "value": 2, "reason": "eternal"}}]},
      "shop": {
        "cards": [{"index": 0, "key": "c_heirophant", "name": "The Hierophant", "kind": "Tarot", "effect": "Enhance up to 2 selected cards into Bonus Cards", "rulesKnown": true, "modifiers": {}, "buy": {"available": true, "price": 3, "reason": null}, "buyAndUse": {"available": false, "price": 3, "reason": "no_target_hand", "target": null}}],
        "vouchers": [], "packs": [], "reroll": {"available": false, "price": 5, "reason": "insufficient_funds"}
      },
      "controls": {"reroll": {"available": false, "price": 5, "reason": "insufficient_funds"}, "nextRound": {"available": true}}
    }
  }
}
```

sourceIndex=1 属于购买前；剩余教皇的 index=0 属于购买后。shop 内数组按各自区域独立索引，不能把 voucher 或 pack 索引接在 cards 后面。

### 9.6 buy.pack：进入卡包，清除商店，携带目标手牌

请求：`game_action({revision:"b10",action:{method:"buy",pack:0}})`。示意打开塔罗包，价格 $4，进入前资金 $8。

```json
{
  "ok": true,
  "value": {
    "contract": 2, "revision": "b11", "baseRevision": "b10", "runId": "pack-run", "partial": true,
    "phase": "PACK", "ready": true, "notReadyReason": null, "terminal": false, "outcome": "ongoing",
    "availableMethods": ["pack", "use", "sell", "rearrange"], "actionId": "a-open-1",
    "result": {"method": "buy", "fromPhase": "SHOP", "toPhase": "PACK", "sourceArea": "shop.packs", "sourceIndex": 0, "itemKey": "p_arcana_normal_1", "spent": 4},
    "summary": "Opened Arcana Pack. Choose 1 card.",
    "state": {
      "economy": {"money": 4, "creditLimit": 0},
      "deck": {"drawRemaining": 44, "totalCards": 52},
      "shop": null,
      "hand": {"count": 8, "capacity": 8, "selectionLimit": 5, "cards": ["0: AS", "1: KD", "2: QC", "3: JS", "4: 9D", "5: 7C", "6: 4H", "7: 2S"]},
      "pack": {
        "key": "p_arcana_normal_1", "name": "Arcana Pack", "returnPhase": "SHOP", "choicesLeft": 1,
        "items": [
          {"index": 0, "key": "c_heirophant", "name": "The Hierophant", "kind": "Tarot", "effect": "Enhance up to 2 selected cards into Bonus Cards", "rulesKnown": true, "modifiers": {}, "choose": {"available": true, "reason": null, "target": {"area": "hand", "min": 1, "max": 2, "eligibleIndices": [0, 1, 2, 3, 4, 5, 6, 7]}}},
          {"index": 1, "key": "c_death", "name": "Death", "kind": "Tarot", "effect": "Convert the left selected card into the right selected card", "rulesKnown": true, "modifiers": {}, "choose": {"available": true, "reason": null, "target": {"area": "hand", "min": 2, "max": 2, "eligibleIndices": [0, 1, 2, 3, 4, 5, 6, 7]}}},
          {"index": 2, "key": "c_empress", "name": "The Empress", "kind": "Tarot", "effect": "Enhance up to 2 selected cards into Mult Cards", "rulesKnown": true, "modifiers": {}, "choose": {"available": true, "reason": null, "target": {"area": "hand", "min": 1, "max": 2, "eligibleIndices": [0, 1, 2, 3, 4, 5, 6, 7]}}}
        ]
      },
      "controls": {"packSkip": {"available": true}}
    }
  }
}
```

Death 的左右由 hand 区域的实际排列决定，不是 targets 数组的书写顺序；需要时先 rearrange.hand，再使用新索引。

### 9.7 pack.card：多选包中选择后继续停留 PACK

请求：`game_action({revision:"m10",action:{method:"pack",card:0}})`。示意包原本允许选两张，选择第一张后还有一次选择；没有其他持有物触发。

```json
{
  "ok": true,
  "value": {
    "contract": 2, "revision": "m11", "baseRevision": "m10", "runId": "multi-pack-run", "partial": true,
    "phase": "PACK", "ready": true, "notReadyReason": null, "terminal": false, "outcome": "ongoing",
    "availableMethods": ["pack", "use", "sell", "rearrange"], "actionId": "a-choice-1",
    "result": {"method": "pack", "fromPhase": "PACK", "toPhase": "PACK", "skipped": false, "chosenKey": "j_popcorn", "packFinished": false},
    "summary": "Selected Popcorn. 1 choice remains.",
    "state": {
      "jokers": {"count": 1, "capacity": 5, "cards": [{"index": 0, "key": "j_popcorn", "name": "Popcorn", "kind": "Joker", "effect": "+20 Mult; loses 4 Mult after each round", "rulesKnown": true, "modifiers": {}, "sell": {"available": true, "value": 2, "reason": null}}]},
      "pack": {
        "key": "p_buffoon_mega_1", "name": "Mega Buffoon Pack", "returnPhase": "SHOP", "choicesLeft": 1,
        "items": [
          {"index": 0, "key": "j_joker", "name": "Joker", "kind": "Joker", "effect": "+4 Mult", "rulesKnown": true, "modifiers": {}, "choose": {"available": true, "reason": null, "target": null}},
          {"index": 1, "key": "j_raised_fist", "name": "Raised Fist", "kind": "Joker", "effect": "Adds twice the rank chip value of the lowest ranked held card to Mult", "rulesKnown": true, "modifiers": {}, "choose": {"available": true, "reason": null, "target": null}},
          {"index": 2, "key": "j_to_the_moon", "name": "To the Moon", "kind": "Joker", "effect": "Earn an extra $1 of interest per $5 held at round end", "rulesKnown": true, "modifiers": {}, "choose": {"available": true, "reason": null, "target": null}}
        ]
      },
      "controls": {"packSkip": {"available": true}}
    }
  }
}
```

四个候选中选走一张，剩余三项被重新编号为 0、1、2，不能复用旧包中的位置。

### 9.8 skip：返回商店

请求：`game_action({revision:"m11",action:{method:"skip"}})`。示意返回一个已无剩余商品的商店。

```json
{
  "ok": true,
  "value": {
    "contract": 2, "revision": "m12", "baseRevision": "m11", "runId": "multi-pack-run", "partial": true,
    "phase": "SHOP", "ready": true, "notReadyReason": null, "terminal": false, "outcome": "ongoing",
    "availableMethods": ["buy", "buy_and_use", "reroll", "next_round", "use", "sell", "rearrange"], "actionId": "a-skip-pack-1",
    "result": {"method": "skip", "fromPhase": "PACK", "toPhase": "SHOP", "skipped": true, "packFinished": true},
    "summary": "Skipped remaining pack choice. Returned to shop.",
    "state": {
      "pack": null,
      "hand": {"count": 0, "capacity": 8, "selectionLimit": 5, "cards": []},
      "shop": {"cards": [], "vouchers": [], "packs": [], "reroll": {"available": false, "price": 5, "reason": "insufficient_funds"}},
      "controls": {"reroll": {"available": false, "price": 5, "reason": "insufficient_funds"}, "nextRound": {"available": true}}
    }
  }
}
```

有临时目标手牌时，还必须返回实际恢复后的 deck。示例 9.7–9.8 的小丑包没有临时发牌，deck 未变化。

### 9.9 use：星球升级

请求：`game_action({revision:"u10",action:{method:"use",consumable:0}})`。示意在商店使用最后一张 Mercury，没有 Constellation 或其他触发效果，剩余商品资格未改变。

```json
{
  "ok": true,
  "value": {
    "contract": 2, "revision": "u11", "baseRevision": "u10", "runId": "planet-run", "partial": true,
    "phase": "SHOP", "ready": true, "notReadyReason": null, "terminal": false, "outcome": "ongoing",
    "availableMethods": ["buy", "buy_and_use", "reroll", "next_round", "use", "sell", "rearrange"], "actionId": "a-use-1",
    "result": {"method": "use", "fromPhase": "SHOP", "toPhase": "SHOP", "consumableKey": "c_mercury", "targetCount": 0},
    "summary": "Used Mercury. Pair is now level 2: 25 Chips x 3 Mult.",
    "state": {
      "consumables": {"count": 0, "capacity": 2, "cards": []},
      "handValuesPatch": {"Pair": "Lv2; chips=25; mult=3; played=2"},
      "controls": {"reroll": {"available": true, "price": 5, "reason": null}, "nextRound": {"available": true}}
    }
  }
}
```

若空出的消耗牌槽使商品从“容量不足”变为可买，必须另外重发完整 shop。升级数据读取实际结果，不通过基础等级公式填入。

### 9.10 rearrange：整个区域替换

请求：`game_action({revision:"h10",action:{method:"rearrange",hand:[2,0,1]}})`。独立示意场景：当前有效手牌区域有三张牌。

```json
{
  "ok": true,
  "value": {
    "contract": 2, "revision": "h11", "baseRevision": "h10", "runId": "order-run", "partial": true,
    "phase": "SELECTING_HAND", "ready": true, "notReadyReason": null, "terminal": false, "outcome": "ongoing",
    "availableMethods": ["play", "discard", "use", "sell", "rearrange"], "actionId": "a-order-1",
    "result": {"method": "rearrange", "fromPhase": "SELECTING_HAND", "toPhase": "SELECTING_HAND", "area": "hand"},
    "summary": "Reordered hand. Use the new card indices.",
    "state": {
      "hand": {"count": 3, "capacity": 8, "selectionLimit": 5, "cards": ["0: 2S", "1: AS", "2: KD; forced"]},
      "controls": {"play": {"minCards": 1, "maxCards": 5, "forcedIndices": [2]}, "discard": {"available": true, "minCards": 1, "maxCards": 5}, "scoringRequirements": []}
    }
  }
}
```

如果持有消耗牌的 eligibleIndices 随之改变，必须额外重发 consumables；不能留下旧目标位置。

### 9.11 其他动作的具体字段示例

本表给出请求及额外 state 内容。公共 envelope、完整 controls 和实际变化集合仍按前文发送；表格中的描述不是可以直接序列化的 JSON。

| 请求中的 action | 返回约定与具体例子 |
| --- | --- |
| `{"method":"start","deck":"RED","stake":"WHITE"}` | 完整 17 键 state；run.deck=RED、run.stake=WHITE、phase=BLIND_SELECT，新 runId。初始手牌为空、round=null；不能携带旧局小丑 |
| `{"method":"select"}` | Q.score=0、实际 target/handsLeft/discardsLeft、完整新 H/D/B；如果 Riff-Raff 生成两张小丑，再返回完整 J |
| `{"method":"skip"}` | B 中当前盲注变 skipped，下一个盲注变 current；完整 T。若获得 $15，则 E.money 更新；若标签开包，则同时 P/目标 H、phase=PACK |
| `{"method":"cash_out"}` | E 为到账后金额，完整 S，F:null；result.collected 只在实际可确认时提供。新商品不能沿用上一家商店 |
| `{"method":"next_round"}` | S:null、完整 B/H。Perkeo 在退出商店复制消耗牌时，同时返回完整 C；若生成 Negative，capacity 也同步 |
| `{"method":"buy","voucher":0}` | E、S、U。购买 Clearance Sale 后，所有剩余商品价格必须出现在新 S；不能只删除凭证商品 |
| `{"method":"buy_and_use","card":0}` | 示例即时使用星球：E、S、对应 handValuesPatch；不把该星球插入 C 后保留。若相关小丑成长，再返回 J |
| `{"method":"reroll"}` | E 和完整 S，包括最新 reroll.price；Flash Card 成长时 J.effect 的当前数值也更新 |
| `{"method":"reroll_boss"}` | E 与完整 B，其中 Boss.key/name/rules/ruleState/target 以新 Boss 为准；controls 更新剩余资格 |
| `{"method":"use","consumable":0,"cards":[1,3]}` | 示例教皇：完整 C/H/D；H 对应牌出现 enhancement=bonus。目标顺序不改变手牌排列 |
| `{"method":"sell","joker":0}` | E 和完整 J；Luchador 被卖后，B 的 Boss.disabled=true，受影响 H/Q 同步，不能只在 summary 说已解除 |
| `{"method":"sell","consumable":0}` | E 和完整 C，后续消耗牌重新编号；若商店购买资格变化，重发 S |
| `{"method":"pack","card":0,"targets":[1,3]}` | 示例塔罗包教皇：完整 H/D；还有选择则完整 P，否则 P:null 并完整返回实际目标阶段 S/B |
| `{"method":"rearrange","jokers":[1,0,2]}` | 完整 J，所有 index 按新顺序；复制型小丑可见效果变化要包含，不发送一串旧对象 ID |
| `{"method":"rearrange","consumables":[1,0]}` | 完整 C，后续 use/sell 必须使用新 index |

## 10. 未就绪、失败和终局

### 10.1 未就绪的完整观察

game_observe 仍返回完整 17 键 state，能可靠观察的块正常提供，未形成稳定决策数据的阶段块为 null。phase 使用最后可识别的当前阶段，ready=false、availableMethods=[]、controls={}。

不能返回陈旧手牌并暗示仍可按旧索引操作。当前阶段无法识别时允许 phase=null，仅限 ready=false；这是一个完整观察，需要停止动作并报告原因。

### 10.2 执行前失败

例如过期 revision：

```json
{
  "ok": false,
  "code": "stale_state",
  "applied": false,
  "message": "State changed; call game_observe before choosing another action."
}
```

这不是状态 patch，不能把 failed action 的参数当作已执行事实。调用者恢复完整观察后重新决策，不机械重放旧动作。

### 10.3 执行结果未知

```json
{
  "ok": false,
  "code": "uncertain_outcome",
  "applied": "unknown",
  "message": "Action completion was not confirmed. Stop mutations and inspect game_operation."
}
```

操作关联沿用已有机制：game_operation 可省略 actionId 查看本连接最后一次操作。若实施时决定把 actionId 加入失败 envelope，需要同步独立的错误 schema，不能只在示例中偷偷添加。

不返回自称可靠的成功增量，不自动重试购买、弃牌、出牌或消耗牌使用。观察可以用于恢复，但未确认的操作不能仅凭画面“看起来正常”被当作未执行。

### 10.4 整局终局

任意动作导致 terminal=true 时，返回 partial:false 的完整快照，无 baseRevision，包含 runResult。outcome=won/lost 按实际结果设置。

示例 runResult：

```json
{
  "outcome": "lost",
  "ante": 3,
  "roundNumber": 8,
  "blindKey": "bl_big",
  "score": 1800,
  "target": 3000,
  "reason": "No hands remaining below the target"
}
```

原因仅在可靠可观察时提供，否则为 null。完整快照的其余 16 个键仍按第 4、5 节填写，不能只返回 runResult 片段冒充完整结果。

普通 Boss 战胜利只设置 roundResult.defeated=true，outcome 仍是 ongoing，terminal=false。第一底注通过不能被描述为整局 won。

## 11. 与当前 contract 1 的迁移关系

| 当前字段/行为 | contract 2 |
| --- | --- |
| state.state | 公共 phase |
| state.deck/stake/seed/ante_num/round_num | state.run |
| state.money/creditLimit | state.economy |
| remainingCards | state.deck.drawRemaining |
| state.hands / handsPatch | handValues / handValuesPatch，字符串语义不变 |
| round.chips + blind.chips | round.score + round.target |
| blind + blinds + currentBlind | route + round.blindRole；减少重复描述 |
| round 字段跨商店/结算残留 | round 仅出牌阶段；结算独立 roundResult |
| shop/vouchers/packs 三个商品区域 | shop.cards/shop.vouchers/shop.packs |
| used_vouchers | vouchers；实际已兑换凭证 |
| packChoices | pack.choicesLeft，仅 PACK 有效 |
| 长卡牌字符串中的价格、资格、效果 | 普通手牌保持短字符串；物品改为对象 |
| phase 变化就返回完整结果 | 有基线时发送阶段必要数据、清空字段及实际变化 |
| summary 只写动作与 phase | result 提供事实，summary 简短描述实际结果 |
| state 的宽泛 Data / value:unknown | 各阶段完整快照、patch、物品与错误的显式 schema |

这是一次版本化字段重设计，不能无声替换现有输出。实施时同步工具描述、资源指南、输出 schema、跟踪查看器和回归用例。旧 contract 1 与新 contract 2 的转换边界要明确，不能混用名称或基线。

## 12. 实施与验收

1. 在 Lua 观察层建立可见、无副作用的规范化状态。确认结算归属、物品动态文本、操作资格和目标分数的来源；不使用隐藏状态补全。
2. 为完整模型与 patch 定义显式类型和 schema。基线状态不允许保留不适用阶段的内部残留字段。
3. 实现单一规范化投影；完整观察与动作差分使用同一投影，避免两套字段漂移。
4. 逐项实现动作最低字段矩阵，再并入全部实际变化。阶段进入/退出使用表驱动规则。
5. 保留原版后端详情；更新 MCP 面向模型的 compact 内容、工具说明和资源。
6. 优先用已有记录和原版 Lua 场景离线验证；运行中的真实牌局不是文档审阅的测试材料。

验收至少覆盖：

- 完整 game_observe 无需历史即可恢复全部受支持玩家信息；所有 17 个一级状态键都存在。
- 每种动作及参数变体，合并 patch 后与同 revision 的规范化完整观察一致。
- SHOP → PACK → SHOP、标签开包、连续包、多选包、SELECTING_HAND → ROUND_EVAL → SHOP 的阶段清理。
- Boss 结算时 run.ante 和 roundResult.ante 的不同归属，及中途接入的未知情况。
- 紫封蜡、蓝封蜡、租赁/易腐、Popcorn 衰减、Negative 容量、折扣与信用额度、小丑复制/成长等连带变化。
- forced/hidden/debuffed/Stone 信息、目标索引与重排后的新索引；不暴露隐藏身份或抽牌顺序。
- handValuesPatch 的替换、删除、可见牌型增加、Lv1 默认语义。
- 缺少基线、来源变化、stale_state、readiness 变化、uncertain_outcome、整局终局。
- 记录各阶段与动作的实际 token 数，并核对关键决策字段是否保留；不预先承诺固定压缩比例。

## 13. 设计依据与当前代码入口

本设计依据当前仓库代码和本次第一底注的工具返回；不表示新增字段已在真实游戏验证。

- [现有共享契约](../env/contract.ts)：动作参数、观察类型、可见状态边界。
- [现有紧凑投影与增量](../env/compact.ts)：compactObservation、compactActionObservation、handsPatch。
- [工具执行与投递基线](../tools/index.ts)：最后观察与已投递观察的关系。
- [MCP 服务与输出 envelope](../src/server.ts)：structuredContent、错误与顺序执行。
- [Lua 可见观察](../play/mod/game.lua)：阶段、区域、价格、动态文本及原版动作调用。
- [Lua 决策字段](../play/mod/decision.lua)：盲注规则、标签、历史完整性、解锁状态。
- [当前工具指南](../tools/guide.ts)（以 `balatro://guide` 提供）：已同步的 contract 2 完整与增量协议。

完整快照投影、动作增量、工具输出 schema 和只读 Lua 观察已实现；结构化 result 与更具体的动作摘要留待后续。代码构建/模组暂存不等于安装或重载，已安装配置不在本次修改范围内。
