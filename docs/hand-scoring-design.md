# 出牌计分预估设计

状态：已接入独立沙盒，尚未进行 Steamodded 实机对照。日期：2026-10-13。

## 数据流

`score_snapshot.lua` 只读取当前局面，随 bridge 观察传给服务端。
`play/client.ts` 验证内部快照，`play/plays.ts` 在独立 LuaJIT worker 中调用
`env/sandbox` 的批量计分接口，最后把推荐写入模型可见的 `state.plays`。
原来的游戏内影子计分已经移除。

快照包含卡牌当前 base/ability/edition、Joker 成长值、牌型等级和出牌历史、
钱、概率、Boss 记忆、牌背配置，以及手牌、抽牌堆和弃牌堆的完整成员。
成员缺失、未知原型或无法序列化的数据显式返回 `unavailable`。
抽牌堆按内容排序，不传抽牌顺序；种子和实机 RNG 流不导出。
手牌、Joker 或消耗品存在背面牌时，在读取其身份前停止构造快照。

实机快照标记 `passiveEffectsApplied: true`，worker 使用已生效的概率、槽位、
debuff 和卡牌数值，不重复执行 Joker 的 `add_to_deck` 或每帧更新。
普通离线调用继续按沙盒 README 的输入基值约定运行。

## 枚举与输出

枚举当前手牌 1–5 张的组合，受选择上限和强制选牌约束。计分顺序沿用手牌排列；
不枚举排列。默认 8 张手牌有 218 个组合。生成器按选牌数量从大到小惰性枚举，
每批 32 个，评分预算 1 秒；启动、加载和计分还受整体 2.5 秒及调用方 deadline 限制。

每种牌型保留最高分组合，同分时优先使用更少的牌。最终按分数降序返回最多 5 条，
行首为可传给 `play.cards` 的零基索引：

```json
"plays": [
  "0 2 3 5 6: Flush 1240",
  "0 1 2 3 4: Straight 480 random",
  "1 4 7: Three of a Kind 420",
  "2 3: Pair 0 not allowed",
  "truncated: scored 128 of 218 selections"
]
```

- `random`：使用固定随机结果，不代表期望值或得分下界。
- `not allowed`：Boss 禁止该出牌，得分为 0。
- `truncated`：未完成全部候选，列出实际评分数和总数。
- `unavailable`：缺少运行环境、隐藏信息、状态变化或不支持的效果。

DNA 等造牌效果不会被忽略：触发时整组推荐返回 `unavailable`。
The Hook 的出牌前随机弃牌同样不支持。The Tooth 与 The Ox 的金钱变化由沙盒处理。
当前使用原版 1.0.1o 计分，不模拟 Steamodded 或其他 mod 自定义规则。

## revision 与动作语义

内部快照参与 bridge 指纹，因此评分依赖变化会使旧 revision 失效。
服务端按 revision 缓存推荐，并在新计算完成后重新读取实机 revision。
变化时丢弃评分，提示重新观察。内部快照不会进入模型观察、工具追踪结果或操作检查输出。

动作前置观察和 `game_operation` 不启动 worker。评分失败仅影响建议字段，
不把已确认完成的动作变成不确定，也不自动重放动作。每个新局面在搜索期间复用
一个 worker，并在结束、失败或取消时关闭。

## 验证

Lua 测试验证只读导出、隐藏信息、抽牌顺序剥离和评分依赖的 revision。
原版无头测试将已经应用被动效果的局面导出，再交给独立 worker，比较两边计分结果。
TypeScript 测试覆盖组合枚举、强制选牌、预算截断、缓存、过期结果丢弃、动作恢复和快照过滤。
实机验证仍需更新 Mod、重启游戏/MCP 后进行；离线测试不构成实机计分一致性证明。
