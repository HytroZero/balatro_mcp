# 离线记分沙箱

给定一个出牌前的局面，调用 Balatro **1.0.1o-FULL** 原版的
`G.FUNCS.evaluate_play`，返回牌型、筹码、倍率、取整后的分数和实际计分牌索引。
不启动 LÖVE、不连接 MCP bridge、不读取玩家存档。`ScoringSandbox` 在整个搜索期间
复用一个常驻 LuaJIT 进程；源码和原型只加载一次，局面每次 `load` 构建一次。
每次试算后恢复基准状态，输入对象不会被修改。

## 运行

需要 Node.js（与项目相同）和 LuaJIT 2.1。`LUAJIT` 可指定可执行文件；未设置时从
PATH 查找 `luajit`。游戏源码是本地依赖，默认从已有的 `env/balatro` 准备：

```sh
npm run sandbox:prepare
# 也可以从其他目录复制所需的 9 个原版 Lua 文件：
npm run sandbox:prepare -- /path/to/balatro-source

npm run sandbox:score -- env/sandbox/example.json
npm run sandbox:test
npm run sandbox:bench -- 1000000
```

CLI 也支持标准输入：

```sh
echo '{"hand":["S_K","H_K","D_A"],"play":[0,1],"jokers":["j_joker"]}' | npm run sandbox:score -- -
```

这个例子的结果为 `Pair`、`chips: 30`、`mult: 6`、`score: 180`。
CLI 在 `unsupported`、`unavailable`、`error` 时返回非零退出码。

## TypeScript 接口

```ts
import { ScoringSandbox } from './env/sandbox/index.ts';

const sandbox = new ScoringSandbox();
try {
  const loaded = await sandbox.load({
    hand: ['S_K', 'H_K', { key: 'D_K', enhancement: 'm_steel', seal: 'Red' }],
    jokers: ['j_joker', 'j_baron'],
    game: { dollars: 20, current_round: { hands_left: 1 } },
    seed: 'SCORE1',
  });
  if (loaded.status !== 'ready') throw new Error(loaded.message);

  const result = await sandbox.score([0, 1]); // 完整记分结果
  const results = await sandbox.scoreBatch([[0, 1], [0], [2]]);
  const scores = await sandbox.scores([[0, 1], [0], [2]]); // 仅分数，适合搜索
  const plays = await sandbox.plays({ hand: ['S_K', 'H_K', 'D_A'] }, 5,
    { timeoutMs: 10_000 }); // 原子加载、枚举、排序；默认 minimal
  // 换局面继续调用 plays；回到 score/scores 前必须重新 load。
} finally {
  await sandbox.close();
}
```

构造参数可设置 `lua`、`sourceDir`、`timeoutMs`（每个请求默认 5000）和 `signal`。
`BALATRO_SANDBOX_SOURCE` 也可指定源码目录。默认使用 `env/sandbox/vendor`，
缺少源码时需先运行 `npm run sandbox:prepare`。模块支持项目源码和构建后的 `dist` 入口，从任意工作目录调用。

`plays(state, selectionLimit, { timeoutMs, signal })` 在一个请求中完成加载、完整枚举和
前 15 名排序，返回模型可读的行数组。每次重新加载局面，但复用同一个 LuaJIT VM。
它的 deadline 包括排队等待；排队时取消不打断前一个请求，执行中取消会终止 VM。
请求完成即移除其取消监听，已结束请求的 signal 不会杀死后续搜索。
构造参数的 `signal` 则控制整个 worker 生命周期。调用 `plays` 后，普通 `score` /
`scoreBatch` / `scores` 要先重新 `load`，不复用搜索内部的评分模式。

`scores` 和 `scoreBatch` 每批接受 1–2048 组选择，全部在 Lua 内循环试算，只进行一次
进程通信。`scores` 成功项为数字，失败项保留 `{status, message}`，并省略计分过程和
完整观察的构造。不存在结果缓存，每次都执行原版记分逻辑。
同一个实例的调用按顺序执行；超时、取消或进程退出会使实例失效，不会自动重放请求。
换进程时创建新实例并重新 `load`；使用完调用 `close`。

`scoreHandOnce({hand, play, ...}, options)` 是单次脚本/CLI 的便捷函数，会创建并关闭
一个实例。百万次搜索应复用 `ScoringSandbox`。`stats()` 可检查源码加载次数、局面加载次数、
试算次数和 Lua 堆内存，`processId` 可用于确认进程复用。

Lua 内的搜索可直接用 `runtime.lua` 的 `new(source, json)`、`load(state)`、
`score(play, true)`，省去 TypeScript 和 JSON 通信。这个 API 和 worker 使用同一实现。

本机实测：8 张手牌，普通 Joker / Green Joker / Baron / Acrobat，遍历 218 种选择，
每批 2048 次，预热后 **100 万次约 131 秒（约 7600 次/秒）**，包含 Node/Lua 通信和
每次状态恢复；期间源码和局面均只加载一次。性能取决于 Joker、重触发次数和机器。
旧版逐次启动进程的固定 Pair 场景，100 次约 1.23 秒。可用上述基准命令在本机复测。

## 输入约定

局面结构和校验见 `index.ts` 中的 `ScoreStateSchema`。`play` 单独传给试算接口；
单次 CLI 输入使用包含 `play` 的 `ScoreInputSchema`。

| 字段 | 含义 |
| --- | --- |
| `hand` | 出牌前全部手牌，顺序就是计分顺序；牌键如 `S_A`、`H_T`、`D_K` |
| `play` | 选中牌的零基索引，1–5 张，不可重复；必须包含强制选中的牌，计分顺序沿用 `hand` |
| `jokers` | 从左到右排列的 Joker 原型键，如 `j_joker`、`j_blueprint` |
| `consumables` | 消耗品原型键；例如天文台使用的 `c_mercury` |
| `deck` / `discard` | 剩余抽牌堆 / 弃牌堆；两者都计入整副牌的统计，Blue Joker 只计算抽牌堆 |
| `back` | 牌背键，默认 `b_red`；调用原版最终记分效果（包括 Plasma） |
| `blind` | Boss/盲注键，默认 `bl_small`；也可传 `{key, disabled, only_hand, hands}` |
| `hands` | 按牌型名覆盖 `level`、`chips`、`mult` 和历史次数；仅传等级时调用原版升级逻辑 |
| `game` | 覆盖原版 `G.GAME` 普通数据，例如钱、回合计数、弃牌次数、概率、已用 Voucher、随机流 |
| `jokerSlots` / `handSize` | 安装 Joker 前的槽位/手牌上限，默认取基础值及牌背修正 |
| `seed` | 默认 `SANDBOX`；若 `game.pseudorandom.seed` 已有值则沿用，可同时传入随机流状态 |
| `random` | `seeded`（默认）使用原版伪随机；`fixed` 使用固定结果；`minimal` 排除随机奖励并启用 score-only |
| `trace` | 返回 `update_hand_text` 在记分过程中的筹码/倍率快照 |

牌也可写成对象：`{key, enhancement, edition, seal, debuff, facing, ability, sell_cost}`。
`ability` 用原版字段表示已成长数值，例如 Green Joker 的 `{mult: 10}`；不要改写
`name`、`set` 等身份字段。版本（`edition`）可为 `foil`、`holo`、`polychrome`、`negative`。

`game.current_round.hands_left` 是出牌**前**的值，沙箱会先减一。
被动 Joker 的原版 `add_to_deck` 钩子会被执行，因此 `probabilities`、槽位、手牌上限等
输入应是这些被动效果叠加**前**的基值。随后执行原版 `Card:update`，更新钢牌数量、
石牌数量、驾驶执照、Swashbuckler、Joker Stencil 等依赖整副牌或 Joker 布局的数值。

不传 `deck` 时，默认使用标准 52 张牌减去 `hand` 和 `discard` 中的牌。修改过的牌组、
特殊牌背的牌组和重复牌请显式传入抽牌堆及弃牌堆；默认不会替用户生成这些牌组。

## 输出与边界

- `ok`：包含 `score`（`floor(chips * mult)`）、原版牌型、`scoringCards`、
  `notAllowed`、`random`、随机策略和种子。Boss 禁止的牌返回 `ok`，分数为 0，
  `notAllowed: true`。
- `unsupported`：激活的 The Hook 出牌前随机弃牌，或记分中直接造牌（例如 DNA）。
- `unavailable`：手牌或 Joker 背面朝上。
- `error`：原型键错误、无剩余出牌次数、原版运行错误等。输入结构错误、进程启动失败、
  超时和取消由 TypeScript 接口抛出异常。

`load` 成功返回 `{status: 'ready'}`，失败后会清除旧局面。试算失败会恢复基准状态，
仍可继续尝试同一局面的其他合法选牌。恢复包括成长数值、强化/原型引用、Boss 记忆、
出牌计数、钱、伪随机流和造牌编号，避免试算之间相互影响。

The Tooth 出牌前扣款和 The Ox 的即时清零会影响 Bull/Bootstraps，已在沙箱中处理。
随机策略 `fixed` 对概率判定返回接近 1 的数，对 Misprint 返回下限，对随机选择返回固定项；
它不是期望值，也不保证整体得分下界。`random: true` 表示记分过程中调用过随机函数，
包括记分后的玻璃碎裂判定。

`minimal` 是明确的“随机奖励不发生”策略：Lucky、Space Joker、Bloodstone 及随机金钱
奖励不触发，即使概率加成超过 100%；Misprint 取配置下限。它不是期望值，也不是所有
可能对局结果的数学最小值。原版石牌的随机负数 rank 只用于避免组成对子，改用每张牌
唯一的负数标识；未知的计分随机调用显式返回 `unsupported`，不偷偷用 seeded 结果。
`minimal` 在最终牌背修正后停止，不执行销毁和 after-hand 结算；DNA 与消耗牌创建
在原版效果派发边界被屏蔽，不伪造卡牌。成长、重触发、持牌效果和本手相关的钱仍参与计分。
普通 `seeded` / `fixed` 接口的行为不变，包括直接造牌时的 `unsupported`。

这是当前一手的记分查询。动画、存档/解锁、延迟事件、计分后的造牌/销毁和下一手状态
不作为输出；它不能用于推进整局游戏。Steamodded 和其他 mod 的规则尚未接入。
`runtime.lua` 仅供独立 worker 使用，不应加载进实机 mod。

## MCP `plays` 接入

`plays` 已通过 `play/client.ts` 接入此沙盒。实机 Mod 的 `score_snapshot.lua`
只读取局面，包含当前卡牌能力、Joker 成长值、牌型等级、Boss 记忆和概率；不运行试算。
内部快照参与 revision 指纹，但不会出现在模型观察、工具追踪结果或操作检查结果中。
抽牌堆按内容排序，仅导出成员，不导出抽牌顺序；实机种子和 RNG 流不导出。
`current_round` 仅导出评分所需的出牌/弃牌计数、牌型历史和 Joker 目标；商店与 UI
附加状态不进入快照，因此 Steamodded 的混合表 `current_round.voucher` 不会阻断评分。
`round_resets` 仅导出 `ante`、`hands`、`discards`，不复制盲注原型或 Steamodded 的
`blind_tag` UI 对象；Tag 与 Sprite 的循环引用不会阻断评分，实机对象不会被修改。

快照使用 `passiveEffectsApplied: true`：概率、槽位和牌面数值已经是被动效果生效后的值，
worker 不再执行 `add_to_deck`、Boss 卡牌 debuff 或每帧 `Card:update`。
`base` / `editionValues` 保留当前卡牌值，`backConfig` 保留当前牌背配置。
普通离线调用省略该标记，继续按前文的输入基值约定初始化。

后端仅在需要 `plays` 时创建常驻 worker，跨观察复用，后端关闭或进程故障时释放。
只调用 `sandbox.plays`；组合枚举、评分、排序和行格式都留在沙盒里。按当前手牌顺序
完整枚举 1–5 张的组合，受选择上限和强制选牌约束，只受调用方整体 deadline 限制。
完整评分后返回全局前 15 个组合，同一牌型可以有多个候选；不足 15 个时返回全部。
同分优先更少的牌，再按索引字典序排列。超时、取消或失败不返回部分候选。
`plays` 强制使用 `minimal`；实际触发随机奖励排除或 Misprint 下限计算的候选在行尾
追加 `minimal`，没有触发的确定性候选不加后缀。标记逐候选重置，不显示 `random`；
构造阶段随机、石牌 rank 标识和被屏蔽的出牌后效果不触发标记。
它不推演出牌后的牌局。
同一 revision 也重新枚举；计算后再次读取实机 revision，变化时丢弃评分。
动作前置检查与 `game_operation` 不启动评分；评分失败也不会把已确认完成的动作变为不确定。

使用前需要准备本地原版源码、安装 LuaJIT，并更新 Mod 和重启游戏/MCP 服务。
缺少环境或不支持的局面返回 `unavailable`，不回退到实机影子计分。
此路径尚未经过实机 Steamodded 对照验证；不支持自定义 mod 的计分规则。

## 源码来源

`prepare.ts` 只复制必要的 9 个原版模块到本地 `vendor/`，保持文件逐字节不变。
记分、牌型识别、卡牌和 Joker 效果、Boss 和牌背效果都来自这些原版文件；
环境初始化、无图形对象构造及表现层适配集中在 `runtime.lua`。
`vendor/` 与 `env/balatro/` 均由 Git 忽略，并明确排除在发布导出之外；游戏源码不适用
本仓库的 MIT 许可证。
