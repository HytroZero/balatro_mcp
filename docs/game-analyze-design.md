# game_analyze：给决策模型的数值简报

状态：阶段 1 的核心与阶段 2、4 的一部分已实现并通过离线测试，尚未在实机上验证；其余仍是提案。日期：2026-10-14。已实现范围和与本文的差异见 §10。当前随机评分已由 minimal 改为期望，见该节的最新说明。

## 1. 目标与依据

目标：调用方模型在公开信息下更可靠地通过 Ante 8。模型掌握全部策略和动作；程序提供模型算不准、又决定胜负的数字。是否达到目标只看一件事：同模型、同种子面板下，有工具比没工具走得更远（§9）。

设计参考是 `balatro-ai` 公开的实验记录（`docs/experiment-log.md`、`plan.md`）。它用“模型决策 + 数值工具”打通了 Black Deck / Gold Stake，记录里有几条直接决定本设计的结论：

| balatro-ai 的记录 | 对本设计的含义 |
| --- | --- |
| 强度只来自模型自己决策；把决策权交给规则、快速选择器或公平搜索的版本都变弱 | 工具只给信息，不排名、不接管、不替模型定策略 |
| 两局 Black/Gold 失利输在构筑：每手都选了最高分候选，核对过的评分也准确，但构筑够不到目标；钱和 Tarot 一直不足 | 商店侧数字（构筑节奏、报价增量、经济、跳过价值）是收益最大的部分 |
| 快速选择器的失误都是算得出来的：同一手顺子不用 Saturn 得 256，用了得 658，目标 600 | 回合内要给精确分数，并且包含“先用消耗品再出牌” |
| 本地分析每次决策约 0.01 秒，节奏预测中位 0.4 秒 | 数字必须便宜到每个决策点都能要 |
| 自写评分器在实机暴露过错误（Four Fingers 同花估 38,808，实得 24,716），Glass/Lucky 的随机、Vampire/Obelisk 的同手变化至今不完整 | 不自写评分规则 |
| 节奏预测冻结成长型 Joker，结果偏保守 | 回合内成长应进入模拟 |
| 单局结果不能衡量强度 | 用配对种子面板验收 |

在它的基础上，本设计有五处可以做得更好：

1. **原版引擎评分。** `env/sandbox` 直接运行 1.0.1o 的 `evaluate_play`，原版 Joker、Boss、牌背都由游戏自己的代码计算；随机计分效果采用明确标记的效果均值及联动近似；弃牌查询只采样公开补牌，不计算分数。
2. **可以追问。** balatro-ai 每次推送一个固定的数据包，模型不能提问。这里模型可以提交 1–4 个弃牌方案（`discards`）和目标牌型（`next`），由程序采样比较命中率。
3. **Boss 脆弱性。** 对下一 Ante 按规则可能出现的每个 Boss 评估构筑，而不是只用“典型 Boss = 2 倍底注”。
4. **本手成长事实。** 从原版计分中读取 Joker 成长和清零，帮助比较出牌方案；弃牌命中率只关注目标牌型。
5. **持续对账。** 每次真实出牌后比较预测分与实得分，`exact` 标签由本局对账记录支撑。

## 2. 分工

- `game_observe`：玩家现在看到了什么。
- `game_analyze`：当前局面的关键数字，以及几条路线各自的后果。
- `game_action`：模型选定后执行一步，游戏检查合法性。

分析只读、按需调用，不进入观察和动作结果。它不执行或排队动作，不输出统一 utility 或“推荐动作”，不预测重掷、未开包和未来商店。候选是值得比较的选择，不是动作白名单。

## 3. 接口

```ts
type AnalyzeInput = {
  revision: string;
  focus?: 'auto' | 'boss'; // 默认 auto
  discards?: number[][];   // 1..4 个方案；每个方案为 1..5 个不重复的当前手牌下标
  next?: PokerHand;        // 一个目标牌型，所有方案共用
};
type PokerHand = 'high_card' | 'pair' | 'two_pair' | 'three_of_a_kind'
  | 'straight' | 'flush' | 'full_house' | 'four_of_a_kind' | 'straight_flush'
  | 'five_of_a_kind' | 'flush_house' | 'flush_five';
```

不带 `discards` / `next` 时，`auto` 按阶段返回 hand 或 build 简报，`boss` 只用于 build 阶段。

`discards` 和 `next` 必须同时提供，只用于 `SELECTING_HAND` 且 `focus` 为 `auto`。每个方案独立地从当前手牌开始，仅模拟一次弃牌和补牌；下标均为当前观察中的零基手牌下标。采样数固定为每个方案 64 次，不接受动作步骤、先出牌、消耗品、重排、分数目标或样本数参数。方案由调用模型提出，工具负责评估。

结构错误返回 `invalid_arguments`；没有弃牌次数、信息不足、采样失败或预算不足返回一个错误，不输出逐方案 `unavailable` 或部分命中率。模拟只读；实际弃牌仍须另行调用 `game_action`。

## 4. 返回

沿用 `{ok:true,value}`。行文本的风格与 observation v3 一致：一项一行，行首是可直接用于动作的下标。hand 简报目标 1.5 KB 以内，build 简报 3 KB 以内。

普通 hand/build 简报的公共字段：`rev`、`phase`、`focus`、`status`（`complete` / `partial` / `unavailable`）、`notes`（未建模效果、隐藏信息、预算截断）、`audit`（本局对账结果）。

弃牌查询成功时仅返回 `{ok:true,value:{rates:number[]}}`，`rates` 按 `discards` 的输入顺序排列，不附加上述公共字段。命中率为命中数除以 64，详见 §5.5。

### 4.1 hand 简报

| 字段 | 内容 |
| --- | --- |
| `need` | 还差多少分、剩余出牌和弃牌次数 |
| `plays` | 每个牌型的最高分出牌，加上有差异的保留方案；每行带可信度和关键事实 |
| `use` | 持有的 Planet / Tarot 先用再出牌时，最佳出牌的前后变化 |
| `order` | Joker 或手牌重排能提高分数时的第一步及前后分数 |

`plays` 的保留方案固定来自这些差异：立即过线、留下蓝蜡封或钢铁牌、不重置成长型 Joker、少用牌。每行的事实只写与当前构筑有关的内容。

示例：小丑为 Joker（+4 Mult），手牌 `K♠ K♥ 9♠ 7♠[蓝蜡封] 5♠ 4♠ 3♦ 2♠`，持有 Jupiter，还差 500 分，剩 1 手。

```json
{
  "rev": "41", "phase": "SELECTING_HAND", "focus": "hand", "status": "complete",
  "need": "500 to clear; hands 1, discards 0",
  "plays": [
    "0 2 3 4 5: Flush 560 exact; clears; plays the Blue Seal 7",
    "0 2 4 5 7: Flush 520 exact; clears; holds the Blue Seal 7 -> Jupiter at round end (1 consumable slot free)",
    "0 1: Pair 180 exact; short 320"
  ],
  "use": ["consumable 0 Jupiter, then 0 2 3 4 5: Flush 850 exact (560 without)"],
  "audit": "exact 14/14 matched this run"
}
```

两手同花都过线，差别在蓝蜡封。只列分数看不出这个差别，这正是简报要展示的。

### 4.2 build 简报

| 字段 | 内容 |
| --- | --- |
| `pace` | 每个待打盲注：目标、每手所需、构筑每手分布、过关估计 |
| `jokers` | 每张 Joker 承担的分数份额，以及 Eternal / Perishable / Rental 状态 |
| `offers` | 每个可见报价（商店、已开包、凭证、持有的 Planet）：花费、每手变化、焦点盲注过关估计的前后值、需要先卖谁、利息影响 |
| `tarots` | 可见 Tarot 在牌组上的最佳目标和带来的变化 |
| `economy` | 当前利息、不损失利息可花的钱、下一档、本次商店已花费 |
| `skip` | 选盲注时：打这一盲的基础奖励、跳过得到的标签及其可计算的金额 |
| `horizon` | 下一 Ante 的目标、到期 Joker 移除后的构筑、需要的成长倍数、构筑能撑到的 Ante |

示例（格式示意，数值为虚构）：White Stake，Ante 4，打完 Small 后的商店。

```json
{
  "rev": "88", "phase": "SHOP", "focus": "build", "status": "complete",
  "pace": [
    "Big 7500: 4 hands, need 1875/hand; median 2100, p75 3300; clear 0.74",
    "Boss The Club 10000: need 2500/hand; median 1700, p75 2600; clear 0.21; clubs debuffed"
  ],
  "jokers": [
    "0 Joker: 9% of score",
    "1 Ice Cream [40 chips left]: 6%; decays",
    "2 Fibonacci: 41%"
  ],
  "offers": [
    "shop 0 Cavendish $4: +200%/hand; Boss clear 0.21 -> 0.96; interest -$1/round",
    "shop 1 Jupiter $3: +6%/hand; Boss clear 0.21 -> 0.24; interest -$1/round",
    "shop 2 Baron $8: -3%/hand today; Boss clear 0.21 -> 0.20; interest -$2/round"
  ],
  "economy": "$17: interest $3 at cash-out; spend up to $2 keeps it; next step $20",
  "horizon": "Ante 5 typical boss 22000: growth needed x2.62; holds through Ante 3 (this boss is under 50%)",
  "notes": ["32 fixed shuffles, 5-card plays, frozen growth: Ice Cream", "sampled figures: trust changes more than levels"]
}
```

## 5. 数字怎么算

所有计算在 `env/sandbox` 的独立 LuaJIT 进程里用原版代码完成，不在实机上试算。

### 5.1 当前这一手（exact）

枚举当前手牌所有合法选择（8 张手牌是 218 种），逐一评分。评分顺序取手牌和 Joker 的当前排列。重排搜索只在存在顺序敏感效果时运行（复制类 Joker、首张计分牌、加法与乘法的先后），返回一个区域的第一步。

`use` 和路线里的确定性消耗品先作用于局面副本再评分：Planet 调用原版升级逻辑，Tarot 改写目标牌。

背面朝上的手牌不参与选择，按“持有但不计其持牌效果”评分，结果标 `conditional`。

### 5.2 构筑节奏（sampled）

回答“这副牌组加这些 Joker，对着某个盲注，一手大概打多少”。

1. 取公开的完整牌组（手牌、抽牌堆、弃牌堆的全部成员，无顺序）。
2. 用服务端常量生成 32 个固定洗牌。每个洗牌取前 `手牌上限 + 补牌数` 张作为可选牌池；补牌数按该盲注的弃牌次数折算，上限 5。构筑或报价含持牌效果（Steel、Baron、Mime 等）时补牌数为 0，因为持牌效果只认真正留在手里的牌。
3. 对每个牌池求最佳出牌，记下总最佳和每个牌型的最佳。普通构筑只枚举满张数选择；有张数相关效果（Half Joker、Square Joker 等）或持牌效果时枚举全部张数。
4. 从 32 个每手分数里有放回地抽 `出牌次数` 个求和，重复 1000 次，得到回合总分分布和过关估计。

盲注的出牌次数、弃牌次数、手牌上限和目标分取公开值；Boss 的 debuff 和禁牌由原版 `Blind` 代码施加。随机计分效果使用 §10 的 `expectation` 策略与联动近似；所有变体共用公开牌组洗牌。

洗牌是实验常量，与实机种子、RNG 状态、抽牌顺序无关。

### 5.3 报价与路线（sampled，配对比较）

每个变体都在同一组洗牌上重新评分，所以差值来自构筑变化而不是抽牌运气。

- 变体是对局面副本的编辑：加入或移除 Joker（执行该牌的原版 `add_to_deck` / `remove_from_deck`）、升级牌型、改写或增删牌组里的牌、调整出牌次数 / 弃牌次数 / 手牌上限。
- 默认只重评每个样本已记下的各牌型最佳选择（每个样本至多 13 次评分）。会改变牌型判定或张数取舍的变体（Four Fingers、Shortcut、Smeared、Splash 等）重新完整枚举。
- Joker 槽位已满时，报价按“卖掉份额最低的可卖 Joker”定价，并写明卖的是谁。
- `jokers` 的份额是逐张移除后的分数下降比例。Eternal 且份额接近零，就是被永久占掉的槽位。
- 不直接计分的 Joker（经济、手牌上限、商店效果）标 `no direct score`，不给虚构的分数变化。

### 5.4 经济（exact，纯算术）

来自公开数值，不需要沙盒：当前利息与上限（含 Seed Money / Money Tree）、不损失利息可花的金额、每少 $5 每回合的损失、Rental 每回合扣款、盲注基础奖励（Red Stake 起 Small Blind 为 $0）、每手未用出牌 $1、本次商店已重掷次数和花费。

跳过价值只列能算的部分：放弃的基础奖励，以及 Economy、Investment、Handy、Garbage 这类标签按当前公开数值能拿到的金额。其他标签写效果，不估值。

### 5.5 弃牌后目标牌型命中率

模型提交 1–4 个弃牌方案及一个共同目标。工具仅计算补牌后的牌型命中率。

```json
{"revision":"<rev>","discards":[[0,1,3],[1,3]],"next":"straight"}
```

返回示例（数值为格式示意）：

```json
{"ok":true,"value":{"rates":[0.375,0.5]}}
```

**命中定义。** 每个方案移走指定牌，保留其余手牌，按实际手牌上限补牌；Serpent 在弃牌后补三张，牌堆不足时以剩余张数为限。每次补牌后枚举 1..selectionLimit 张的合法出牌选择，只要存在被游戏判定为目标牌型的一组，就记一次命中并停止该样本搜索。一次补牌无论有多少组满足条件都只算一次，不要求目标是最高分选择。按牌型名称精确匹配：仅有同花顺不自动计入顺子。

**采样。** 每个方案固定完成 64 次采样，补零张或一张也使用这一规则；命中率 = 命中次数 / 64。抽牌池只取当前公开的剩余抽牌组成，排除当前手牌和弃牌堆，保留重复牌的实际份数。每个样本内不放回抽取，跨样本可以重复。牌池规范化后用独立于游戏 RNG 的固定算法生成样本；所有方案共用同一样本排列，按各自实际补牌张数取前缀。重复调用和方案/牌堆顺序变化不改变结果，连接内缓存最多保存 64 组查询，不落盘。零命中不意味着真实概率为零。

**计算路径。** `env/analysis/discards.ts` 独立处理方案和采样，每个方案只向 worker 发送一次 `discard_hits` 请求，携带全部 64 组抽牌；worker 只加载一次留牌和公共牌池，每个样本直接取用抽到的牌对象并检测目标牌型，不再逐样本重新加载局面。缓存只保存完整的 64 个样本结果。worker 仅保留影响牌型或判型所需 debuff 的 Joker，复用原版牌型识别与 Boss 禁牌判断。Four Fingers、Shortcut、Smeared、Wild/Stone、Eye/Mouth 历史和 Psychic 的张数限制仍生效。Joker 成长、金钱变化、Purple Seal 生成消耗牌、出牌计分和分数对账不影响本次命中事件，也不作为拒绝查询的理由。

**错误与一致性。** 暗牌、没有弃牌次数、Cerulean Bell 补牌后的强制选择，以及 Crimson Heart 可能改变牌型 Joker 的状态仍需明确规则，当前返回简短错误；各错误码的含义见 `tools/analysis-guide.ts`（`balatro://analysis`）。取消、worker 失败或预算不足时不返回部分命中率，不把未完成样本当成失败。发布结果前复核 revision 与分析快照；局面变化返回 `stale_state`。全程不执行或排队真实动作。

### 5.6 boss 与 engine（显式调用）

`boss`：对下一 Ante 按规则可能出现的 Boss（最低 Ante、本局已出现记录）逐类重做 §5.2，列出过关估计最低的几个及原因，例如“The Club：计分牌里梅花占 46%”。不改变每手计分的 Boss 共用普通基线。

`engine`：把引擎型 Joker 放到为它改造过的牌组上定价（例如 6 次、12 次 Steel 或 Glass 改造），与当前构筑在同一副改造牌组上比较，并写明所需的 Tarot 和次数。尚未出现的搭档标 `hypothetical`。

## 6. 可信度

| 标签 | 含义 | 判定 |
| --- | --- | --- |
| `exact` | 当前公开局面下这一手的确定分数 | 沙盒返回 `ok`，未触发随机调用，没有背面牌，本局对账无失配 |
| `conditional` | 指定假设下的分数，行内写明假设 | 背面牌持有不计、Hook 忽略随机弃牌，或本局评分对账已失配 |
| `sampled` | 固定样本上的估计，写明样本量 | §5.2、§5.3、§5.6 的全部结果（§5.5 的弃牌命中率不带标签） |
| `unavailable` | 没有数字，写明原因 | 沙盒返回 `unsupported`（The Hook、计分中造牌等）、隐藏的 Joker、第三方 Mod 的规则 |

只有 `exact` 才能写“过线”。过关估计是在“各手独立、构筑冻结、每手打最佳单手”假设下的比例，用于比较方案，不是胜率；简报固定提示“看变化，不看绝对值”。没有数字不等于零，没有提示不等于安全。

弃牌查询不返回可信度标签；采样量由固定 64 次的接口约定给出，失败时返回错误。

**对账。** hand 简报评过当前手牌的全部选择。模型随后在同一 revision 出牌时，工具层用动作结果里的得分变化核对预测，写入 trace，并在后续简报的 `audit` 里报告，例如 `exact 14/14 matched this run`。出现失配时，本局此后的 `exact` 降为 `conditional`，并写明失配的那一手和当时的 Joker。对账不增加任何实机调用。

## 7. 数据与计算路径

**快照。** 扩展现有的 `play/mod/score_snapshot.lua`，由新的只读 RPC `sf.analysis_snapshot` 返回。相对现状增加：非出牌阶段可用（商店里手牌为空）、商店和已开包的报价、本 Ante 各盲注的目标与 Boss、本局已出现的 Boss、背面牌的占位（不含身份）。它不参与普通观察，不进入 revision 指纹，观察的成本和语义不变。

**信息边界。** 分两层：

- 进沙盒的内部输入：正面朝上的牌可以整包复制 `ability`（原版计分代码需要它），`G.GAME` 只取现有的白名单键。种子、RNG 流、抽牌顺序、背面牌身份、商店的未来内容不出游戏进程。
- 给模型的输出：只有派生数字和公开名称。用不变性测试保证：同一公开局面，换种子、换抽牌顺序、换背面牌身份，简报逐字节相同。

**沙盒扩展。** `runtime.lua` 需要：

| 能力 | 用途 | 阶段 |
| --- | --- | --- |
| 结构化批量枚举（牌型、分数、计分牌、是否触发随机） | hand 简报；不再解析 top15 文本 | 0 |
| 换手牌不重载局面 | §5.2 的逐样本评分 | 0 |
| 局面编辑（Joker 增删、牌型等级、牌组改写、回合参数） | §5.3 的变体 | 0–2 |
| 背面牌持有但不计分 | §5.1 | 1 |
| 提交出牌 / 弃牌后的状态 | §5.5、回合内成长 | 3 |

沙盒进程可以开多个并行评分。任何实例超时、崩溃或被取消即销毁重建，不重放；参数错误和引擎明确拒绝（`unsupported`）不销毁实例。

**一致性与并发。** 快照读取和结束前的复核各在现有串行队列里执行一次；计算在队列外进行，可取消。复核时 revision 或快照内容有变化，丢弃结果并返回 `stale_state`。计算期间到达的 `game_action` 正常执行，进行中的分析随之中止。分析不颁发 revision，不改变观察的 delta 基线，不解除 `uncertain` 锁（因此不走会释放锁的 `backend.observe()`）；游戏不在决策点时，普通简报返回 `unavailable`，弃牌查询返回 `illegal_action` 错误。

**预算。** 下表保留原目标；约 7600 次评分 / 秒来自旧的固定局面基准。

| 分析 | 评分量级 | 目标 |
| --- | --- | --- |
| hand | 约 220 | 0.3 秒 |
| build 首次（两条基线 + 约 15 个变体） | 约 2 万 | 3 秒 |
| build 同一构筑再次调用（基线命中缓存） | 约 6 千 | 1 秒 |
| `boss`、`engine` | 约 5 万 | 10 秒 |

达不到时减少样本数或增加进程，并在 `notes` 里写明；不静默降低精度。预算用尽时返回已完成的行和未完成项的清单，`status` 为 `partial`。基线样本按公开构筑缓存，每连接有上限，不落盘。

**弃牌查询实测（2026-10-15，离线）。** 预热的 worker、8 张手牌、四个方案：以命中为主的目标约 0.21 秒，以未命中为主的目标约 0.27–0.30 秒；每次新建 worker 的 `analysis:bench-discards` 为 0.23–0.87 秒。数据与复现见 [validation.md](validation.md#one-worker-request-and-one-load-per-discard-strategy--2026-10-15)。早期“逐样本完整评分”的补牌基准与 C 移植估算针对已删除的实现，只保留在 validation.md 的历史记录中。

**文件。** 计算在 `env/analysis/`，工具入口 `tools/index.ts`，接入现有 bridge、client 和串行队列，不新增顶层目录。

## 8. 模型怎么用

写入 `tools/guide.ts` 和 `skills/core.md`：

- 每个需要判断的决策点调用一次：每次出牌或弃牌前、进入商店时、每次改变构筑的购买之后、选盲注时、开包后。收款之类的过场不用。
- 先读 `notes` 和 `audit`，再读数字。
- 构筑落后于节奏时，把钱花在过关估计提升最大的可负担变化上；领先时留钱吃利息。低于下一个 $5 档位花钱，要有超过利息损失的收益。
- 用 `horizon` 提前一个 Ante 补强，不等到 Boss 前最后一个商店。
- 比较弃牌时用 `discards` 给出 1–4 个方案，用 `next` 指定目标牌型，按返回的命中率作决策。
- 执行一步后重新观察；重排后的下标全部作废。

## 9. 实施与验收

| 阶段 | 交付 | 通过条件 |
| --- | --- | --- |
| 0 地基（不发布工具） | 快照扩展、沙盒结构化枚举与编辑、多进程、吞吐实测；对现有 `data/traces` 做失败归因 | 实机差分：若干局里每一手的预测分与实得分一致；不变性测试通过；预算表更新为实测值 |
| 1 hand 简报与经济 | §5.1、§5.4、`use`、`order`、对账 | 协议测试（revision、锁、基线、取消）；对账在实机局中零失配或失配可解释 |
| 2 build 简报 | §5.2、§5.3、`tarots`、`horizon`、构筑路线 | 录制局面上的探针：有简报后决策朝预期方向移动，对照不退步 |
| 3 弃牌评估 | 按需 `discards + next`（§5.5），每个方案固定 64 次采样 | 命中定义与完整合法选择一致；配对抽牌、重复牌权重、固定采样数、缓存、取消和失败不返回部分概率 |
| 4 boss 与 engine | §5.6 | 录制局面上，脆弱性最低的 Boss 与实际失利的 Boss 对得上 |

每个阶段单独发布，未实现的 `focus` 和动作变体不进 schema。实施和实机验证记入 `docs/validation.md`。

**强度评估。** 冻结版本，在同一组未用于开发的种子上配对比较“无工具”“阶段 1”“阶段 2”三组；同一模型、同一推理配置、同一技能文本；种子由评估脚本设置，不进入模型上下文。报告 Ante 8 通关数、通过的 Ante 数（配对差值及区间）、失利盲注、调用次数、token 和耗时，以及每一局失败或中止的记录。4–8 个种子只算探索，20 个以上才谈结论。整局之前先跑探针：把录制的决策点连同简报交给模型，一次只花几次调用。



## 10. 实现状态（更新于 2026-10-15）

**随机评分更新。** hand、消耗品、排列和 build 统一使用
`random: 'expectation'`，每个选择只执行一次计分，直接将随机效果替换成均值：
Misprint 默认 +11.5，概率 p 的 Xk 折算为 X(1+p×(k−1))，随机金钱、升级和成长按平均量推进。
不再枚举随机分支或做 256 点积分，期望分保留最后取整前的小数。
按用户确认的策略，Space Joker、Lucky Cat、Bootstraps 档位、Plasma 等非线性或相关联动
允许继续按均值推进，但在受影响的行和 notes 中明确标记 `interaction approximation`。
这类最终分数不声称是完整结果分布的精确期望。未知随机效果返回缺少规则的原因，交由用户说明，
不回退到采样。随机行标 `expected`；暗牌、Hook 或对账降级时另加 `conditional`。
这些分数不是单次保证分，不写 `clears`，不进入精确出牌对账，不使用或返回种子与 RNG 流。
build 的 `clear` 仍从最佳单手均值的洗牌分布重采样，是节奏代理而非真实过关概率。

已实现，离线测试覆盖，未在实机上运行：

| 部分 | 状态 |
| --- | --- |
| `sf.analysis_snapshot`、能力协商、不解除动作锁的只读读取 | 已实现 |
| hand 简报：全部合法选择的精确评分、每个牌型的最佳、保留蓝蜡封 / Gold 和不重置 Joker 的方案、事实 | 已实现 |
| `use`（Planet、指定目标的 Tarot）、`order`（Joker 全排列或两两交换、前两手的出牌顺序） | 已实现 |
| 背面牌按持有不计分处理、The Hook 按不弃牌处理，均标 `conditional` | 已实现 |
| 对账：同一 revision 的出牌与预测比较，失配后本局停发 `exact` | 已实现 |
| 经济：`economy`、`rewards`、`skip` | 已实现 |
| build 简报：`pace`、`jokers`、`offers`、`horizon`（§5.2、§5.3） | 已实现，范围见下 |
| `focus: "boss"`：下一 Ante 可能出现的 Boss（§5.6 前半） | 已实现 |
| build 简报的 `tarots` | 未实现 |
| `focus: "engine"` | 未实现，不在 schema 中；C 路线仍仅为估计 |

与正文的差异：

- **弃牌查询。** 接口与 §5.5 一致，独立于 hand 简报计分。公开工具、TypeScript API 和 Lua worker 均只保留弃牌目标判型；多步骤路线、状态导出、动作提交与 hand/reach/best 补牌查询已删除。
- **Tarot 的 `use`。** 覆盖改强化（Magician、Empress、Hierophant、Lovers、Chariot、Justice、Devil、Tower）、改花色（Star、Moon、Sun、World）、Strength 和 Death。转换在沙盒里调用原版 `Card:use_consumeable` 里的那几行（`set_ability`、`change_suit`、`set_base`），不播放动画；Death 在局面副本上复制最右边的目标。Hanged Man 会改变手牌下标，未纳入。自动搜索枚举全部允许张数的目标组合（上限 100 组，少目标优先）；搜索时同牌型、同计分牌的选择只评一次，持牌效果（Steel、Baron、Mime 等）或张数相关的 Joker 在场时逐一评分；选中的目标再用完整枚举给出带事实的精确行。
- **Joker 成长事实来自引擎。** 沙盒在评分后比较每张 Joker 的 `mult`、`x_mult`、`extra.chips`，所以“会清零 Ride the Bus”这类事实不需要逐张手写规则。所有选择都会发生的变化（如 Green Joker 每手 +1）不显示。只覆盖计分过程中的变化，after-hand 结算不在内。
- **“可顺带打出的牌”。** 同分的超集存在时，行内注明最多还能带几张牌，用于判断能否借出牌换牌。
- **节奏的牌池。** 每个样本的牌池是 `手牌上限 + min(5, 2 × 弃牌次数)` 张；构筑里有持牌效果时不加补牌。普通构筑只比较 5 张出牌，并按“牌型 + 计分牌（含 Stone）”分组、每组评一次：这在没有持牌和张数效果时与逐一评分等价，13 张牌池每样本约 30 次评分而不是 1,287 次。Half Joker、Square Joker 在场时按张数分组；持牌效果在场时不分组。
- **盲注。** 每个仍要打的盲注都在原版 `Blind` 上重算 debuff（新增 `applyBlind`），Chicot 在场时 Boss 视为禁用。The Needle、The Water、The Manacle 改出牌次数、弃牌次数和手牌上限。The Eye、The Mouth、The Hook、The Arm 的后续效果、抽牌类 Boss、Cerulean Bell、Crimson Heart、Amber Acorn 只写说明，不改分布；不改计分的 Boss 与普通盲注共用样本。目标分用 `round_resets.ante`，与原版 `Blind:set_blind` 一致。
- **报价与份额。** 报价都对“本 Ante 最后一个仍要打的盲注”定价，写每手均值的变化和过关估计的前后值；份额用每手均值（不是中位数）的下降比例。默认只重评每个样本已记下的各牌型前 4 名选择；Four Fingers、Shortcut、Smeared、Splash、Pareidolia 的增删，以及手牌上限、弃牌次数或分组方式变化的变体完整重算。Joker 槽位满时按份额最低的非 Eternal Joker 替换并写明卖价；Negative 不占槽。凭证只定价 Grabber / Nacho Tong（+1 出牌）、Wasteful / Recyclomancy（+1 弃牌）、Paint Brush / Palette（+1 手牌上限）。牌组里的 Tarot 目标、Spectral、加入牌组的扑克牌和其他凭证列在 `notes` 的 `not priced` 里，不给数字。
- **horizon。** 用普通盲注样本，Boss 一律按 2 倍底注（最终 Boss 的 Violet Vessel 等不单列），给出下一 Ante 三个盲注的过关估计、每手所需增长倍数，以及典型 Boss 过关估计保持在 0.50 以上到哪个 Ante。
- **boss。** Boss 池由 mod 按 `get_new_boss` 的资格和“最少出现”规则从公开的出现记录推出，不含抽中哪一个；Steamodded 开启按权重抽取时不导出，并在 `notes` 说明。行按过关估计升序，前 6 行完整，其余合成一行；花色 Boss 附“最佳出牌里该花色牌的占比”。
- **样本缓存。** 样本是公开构筑、编辑和盲注的纯函数，按三者的哈希缓存在每个连接里（最多 256 组，不落盘），同一构筑再次调用约 3 毫秒。
- **并发。** 快照读取与结束复核进入游戏串行队列，计算在队列外；同连接分析串行使用 worker，动作到达会中止正在进行的分析，丢弃其结果与预测。调用方取消也中止 worker，损坏 worker 不复用或重放。普通简报预算用尽可返回已完成结果；弃牌查询必须完成每个方案的 64 次采样。build 首次调用的旧实测约 2.6–5.3 秒，不作为弃牌命中率查询的端到端耗时依据。
- **一致性复核。** 快照不进 revision 指纹；工具在计算后再读一次快照，revision 或快照文本不同即返回 `stale_state`。
- **随机效果。** 当前采用上述期望评分，不使用游戏种子或 RNG 流。弃牌命中率不计算分数，仅采样公开补牌。
- **沙盒实例。** 目前单进程，未做多进程并行。

早期离线基准：8 张手牌、5 张 Joker 的局面加载约 0.9 毫秒，218 种选择的完整评分约 31 毫秒；52 张牌组的局面加载约 2 毫秒。该数字不作为完整快照下逐样本补牌的耗时依据，后续基准见 §7。
