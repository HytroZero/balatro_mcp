# 游戏规则与策略资源

初始化 `instructions` 不超过 800 字符，只说明授权边界、关键停止约束和直接资源入口。
普通打牌首次读取 `balatro://protocol`、`balatro://guide` 和 `balatro://coach`；
使用 `game_analyze` 前读取 `balatro://analysis`。已在上下文中的内容无需重复读取。

| 入口 | 内容和源码 |
| --- | --- |
| `balatro://rules` | 简短主题目录：`resources/rules.md` |
| `balatro://rules/<topic>` | 单个主题规则：`resources/rules/<topic>.md` |
| `balatro://protocol` | 执行、恢复、合法性、分析时机、动作前解释：`resources/protocol.md` |
| `balatro://guide` | 字段、增量合并、索引和排列：`resources/guide.md` |
| `balatro://analysis` | 分析结果和计算局限：`resources/analysis.md` |
| `balatro://coach` | 金注策略正文：`resources/coach.md` |
| `balatro://coach/decisions` | 困难取舍的决策参考 |
| `balatro://coach/sources` | 策略来源和版本说明 |
| `balatro://coach/state-input` | 按用户要求复盘时使用的状态模板 |
| `balatro://rules/sources` | Wiki 来源、修订记录、署名和许可 |
| `balatro://objects/<name>` | 单个对象的规则、目录元数据、主题 URI 与 Wiki 链接 |

规则主题包括 `lifecycle`、`hands`、`scoring`、`modifiers`、`decks-stakes`、
`blinds`、`economy`、`consumables`、`packs`、`tags`、`vouchers`、`jokers`、
`challenges`、`randomness`。例如 `balatro://rules/jokers` 直接返回全部 150 张
Joker 的能力及关键交互，不需要先加载任何包装文档。资源全部出现在 MCP `resources/list`。

## 读取与维护

`src/resources.ts` 显式定义每个静态 URI、标题、用途和文件位置；`src/context.ts`
注册这些资源。服务启动时不扫描目录、不解析元数据、不读入规则或策略全文。
每次 `resources/read` 只读取对应文件；guide 和 analysis 也直接读取 Markdown，不通过 TypeScript 生成正文。修改正文无需重启，修改注册清单需要重启。
URI 不映射为任意文件路径；只有注册的 Markdown 可读，真实路径越出 `resources/`
的链接会被拒绝。目录中的对象 JSON 和来源清单不通过通配文件接口开放。

具体机制优先查 `balatro://objects/Blueprint`，或用 `?kind=seal` 等参数限定类别。
查询在 `resources/objects.json` 中先精确匹配英文名，再做子串匹配，最多返回 20 条。
`src/objects.ts` 只读取匹配对象涉及的规则主题，返回表格规则和直接可读的
`balatro://rules/<topic>` 链接。没有独立规则表行的对象，其 `rules` 为 `null`。
支持补全的客户端可以补全对象名称。

Wiki 原有的实现方法、训练、验证章节及重复目录已经移除。保留的玩法规则和对象元数据
源于 2026-10-02 的 1.0.1o-FULL Wiki 快照；来源和 CC BY-NC-SA 3.0 许可保留在
`resources/rules/sources.md`，机器记录在 `resources/sources/`。

服务器没有文件或 Shell 工具。工具 schema 通过 `tools/list` 提供；等待、暂停和
上下文压缩由宿主控制。资源内容不能授予工具权限或单独授权开始、继续游戏。

## 验证

资源测试覆盖无需文件即可初始化和列出入口、按需读取、长正文完整返回、修改即时生效、
所有资源和内部链接可读、guide 相位表与投影一致、366 个对象的主题完整性、名称补全、对象规则关联、
未注册 URI 和路径越界拒绝。真实 stdio 测试覆盖从其他工作目录启动后的资源读取。
