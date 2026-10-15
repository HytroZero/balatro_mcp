# 裁剪评分引擎：实现、性能与复现

日期：2026-10-14；引擎选择更新于 2026-10-15。可选剪枝引擎位于 `env/pruned`，与 `env/sandbox` 并列。
它自带九个引擎模块、runtime、worker 和 JSON；运行不依赖 `build` 或 vendor。
自 2026-10-15 起，`game_analyze` 与独立 `ScoringSandbox` API 默认使用完整的
`env/sandbox/vendor`。裁剪引擎保留为可选入口：通过 `sourceDir` 指向 `env/pruned`，
或设置 `BALATRO_SANDBOX_SOURCE=/path/to/project/env/pruned` 后重启 MCP 服务。
选择优先级为 `sourceDir`、环境变量、完整 sandbox；不会自动回退到剪枝版。
裁剪版只支持 expectation / minimal，不支持 seeded、fixed、trace。

## 保留的维护入口

| 用途 | 源文件 | 命令 |
| --- | --- | --- |
| 从原版源码重新裁剪 | `env/pruned/generate.ts` | `npm run sandbox:prune` |
| 181 局面、150 Joker、40001 次差分 | `env/pruned/check.ts` | `npm run sandbox:check-pruned` |
| 独立目录运行与接口回归 | `tests/pruned-sandbox.test.ts` | `npm run sandbox:test-pruned` |
| hand/build/HTTP 分析与弃牌命中率测试 | `env/pruned/test-analysis.ts` | `npm run sandbox:test-pruned-analysis` |
| 原版与最终版结构化吞吐对照 | `env/pruned/bench.ts` | `npm run sandbox:bench-pruned` |

解析器 `luaparse@0.3.1` 已移入根项目 devDependencies，由 `npm ci` 安装。
生成器和差分/性能测试需要原始 vendor 作为生成输入或参考答案，已生成引擎的运行不需要它。
所有维护入口不读取 build；结果写到标准输出，不向 build 写脚本或数据。
生成器支持从任意工作目录调用，并使用 `LUAJIT` 环境变量或 PATH 中的 LuaJIT。

完整吞吐对照默认每构筑 64 个完整 52 张牌局面，每局 218 个选择，三轮重复，
计时包含 load、scoreBatch、通信、校验和结果哈希；不含启动和四局预热。
可用 `npm run sandbox:bench-pruned -- --samples 2 --repetitions 1` 做快速执行检查。
基准需要原版 fixture 构造器，但评分分别使用原版和最终裁剪版各自的 worker。

## 裁剪范围

九个原版模块由 816400 B 降至 217456 B，减少 73.4%。保留 51 个顶层入口，
按名称拆分 Joker 分派。删除表现层、事件闭包、评分不可达生命周期分支及 after-hand
流程，并把成功评分结束的异常跳出改为正常返回。保留评分、Boss、牌背、重触发、
本手成长与恢复逻辑。该比例不包含 TypeScript、worker 和 runtime 适配层。

expectation 每个候选只执行一次评分。Space 的平均升级、Lucky Cat 与 Lucky 的相关性、
Bootstraps 金钱阈值和 Plasma 平衡继续按效果均值推进，并返回明确的联动近似说明；
没有采样兜底。当前单手评分保持试算后恢复。公开的 `discards + next` 查询使用独立的
`discard_hits`：只做弃牌、补牌与牌型判定，每个方案固定 64 次采样，成功只返回命中率。
无关计分与生命周期不会阻止判型，直接加载补牌样本并检测目标牌型，不执行真实游戏。
查询规则与边界见 `game-analyze-design.md` §5.5。

## JIT 退化与修复

一次独立诊断中，裁剪正常 JIT 有 338033 次 trace start、88067 次 abort，
以及 2112 次机器码分配失败和相应的全量缓存清空；采样约 87% 落在 JIT Compiler。
另两次 flush 来自 profiler 启停。只记录编译事件、不启动 profiler 的复测仍有
1076 次分配失败及 1076 次 flush，因此持续清空不是 profiler 启停造成的。

仅把总容量 maxmcode 调至 8192 仍有 1020 次分配失败；仅移除 Joker 分派尾调用
也没有解决退化。把单块区域 sizemcode 从 64 KB 调至 2048 KB，保留全部 JIT，
则分配失败消失。最终 runtime 在 macOS arm64 初始化前自动应用这个设置。
其他平台沿用默认设置。尚未追踪本机 mmap/内核返回值，不能认定具体系统缺陷。

最终生成版的独立 worker API 三轮中位数如下；修复前/后使用相同评分模块和逻辑，
仅改变 JIT 区域设置，不挂诊断回调：

| 场景 | 修复前裁剪正常 JIT | 最终版 |
| --- | ---: | ---: |
| Bloodstone / Lucky Cat / Space 随机期望 | 21.185 s | 0.804 s |
| 普通 Joker | 本批未重测修复前 | 0.745 s |
| Baron / Mime 重触发 | 本批未重测修复前 | 0.775 s |

随机构筑约快 26.4 倍。12 次完整运行的结构化结果哈希均匹配原版参考结果，
包含期望说明和成长字段。不能把旧批次的 34.43 s 与本批次 0.804 s 拼成速度比。
不同构筑、进程地址布局和编译历史影响绝对耗时，尤其是未修复版本。
这些是离线一手吞吐，不是完整 game_analyze 或实机延迟。
