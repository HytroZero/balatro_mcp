# 裁剪评分引擎

Balatro 1.0.1o-FULL 的 score-only 版本，保留正常 JIT。目录内包含九个游戏模块、
独立 runtime、worker 和 JSON 编解码器；运行时不读取 `env/sandbox/vendor`、
`env/sandbox/runtime.lua`、`play/mod` 或 `build`。整个目录可复制到其他位置运行，只需 LuaJIT 2.1。

macOS arm64 会在初始化前设置 `sizemcode=2048`，避免已测得的机器码区域分配失败
及反复清空 trace。其他平台沿用 LuaJIT 默认设置。

## 项目 API

```ts
const sandbox = new ScoringSandbox({ sourceDir: 'env/pruned' });
try {
  await sandbox.load({ hand: ['S_K', 'H_K', 'D_A'], jokers: ['j_joker'], random: 'expectation' });
  console.log(await sandbox.score([0, 1])); // Pair，180
} finally {
  await sandbox.close();
}
```

现有 API 会自动选择本目录的 `worker.lua`，无需 shell 包装器。
`game_analyze`、独立 `ScoringSandbox` 和 CLI 默认使用完整的 `env/sandbox/vendor`。
本目录作为可选剪枝引擎保留；设置 `BALATRO_SANDBOX_SOURCE=/path/to/project/env/pruned`
或传入 `sourceDir` 即可显式选择。选择优先级为 `sourceDir`、环境变量、完整 sandbox。
输入格式沿用 `env/sandbox/index.ts` 的公共评分接口。

## 独立运行

```sh
luajit /path/to/pruned/worker.lua <<'JSON'
{"id":1,"method":"load","state":{"hand":["S_K","H_K","D_A"],"jokers":["j_joker"],"random":"expectation"}}
{"id":2,"method":"score","play":[0,1]}
JSON
```

worker 从自身所在目录加载全部依赖，工作目录可以任意选择。协议与项目 worker 一致，
支持 `load`、`score`、`batch`、`scores`、`best`、`plays`、`stats`，以及供按需补牌分析使用的
`discard_hits`。

Lua 调用可使用 `dofile('/path/to/pruned/runtime.lua').new('/path/to/pruned', json)`，
其中 `json` 来自本目录的 `json.lua`。

## 边界与来源

只接受 `random: 'expectation'` 或 `'minimal'`；`plays` 内部自动使用 minimal。
未指定随机策略、seeded、fixed 和 trace 均返回 unsupported，不回退其他引擎。
未知随机效果、暗牌、造牌和状态恢复等边界沿用本版 runtime 的显式结果。
单手评分试算后恢复，不推进真实游戏。`discards + next` 使用 `discard_hits` 只判断牌型，
不依赖通用生命周期模拟；每个方案固定 64 次采样，成功仅返回 `rates`。
弃牌接口只返回给定补牌样本是否命中目标牌型，不提供多步动作或分数分布模拟。

expectation 使用效果均值及明确标注的联动近似。原版派生模块保留 Joker、牌型、
盲注和牌背评分规则；删除表现层、计分不可达生命周期分支，并拆分 Joker 分派。
`manifest.json` 记录裁剪规模、JIT 设置和可执行文件哈希。

本目录的游戏派生代码不适用仓库 MIT 许可证；运行文件从公开发布导出中排除，
本说明和自主维护工具按白名单导出。

## 维护

维护脚本集中在本目录：`generate.ts`、`check.ts`、`bench.ts`、`test-analysis.ts`，
及差分检查辅助文件 `list-jokers.lua`。解析器依赖由根项目管理，不需要保留 build：

- `npm run sandbox:prune`：从原始 vendor 重新生成本目录，保留正常 JIT 修复。
- `npm run sandbox:check-pruned`：与原版逐项比较 181 个局面、40001 次评分。
- `npm run sandbox:test-pruned`：独立运行和 API 回归测试。
- `npm run sandbox:test-pruned-analysis`：用本引擎跑 hand/build/HTTP 分析和弃牌命中率测试。
- `npm run sandbox:bench-pruned`：原版与本版的完整结构化吞吐对照。

生成、差分和完整分析 fixture 需要原始源码作为输入或参考答案；单独运行本目录不需要。
解析器由根项目 `npm ci` 安装。性能与修复说明保存在
[`docs/pruned-engine.md`](../../docs/pruned-engine.md)。
