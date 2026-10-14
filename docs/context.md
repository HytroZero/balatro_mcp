# 游戏规则与技能上下文

初始化 `instructions` 是不超过 800 字符的入口，只保留授权/隐藏信息边界、
关键停止约束和资源读取顺序。详细规则各有一个归属位置，工具描述只说明用途和输入输出。

普通打牌首次读取 `balatro://protocol`、`balatro://guide` 和相关技能；
使用 `game_analyze` 前读取 `balatro://analysis`。已在上下文中的资源无需重复读取。
具体机制优先查 `balatro://objects/<name>` 及返回的章节链接。

| 内容 | 完整定义的位置 |
| --- | --- |
| 执行、恢复、合法性、分析调用时机、动作前解释 | `skills/core.md` → `balatro://protocol` |
| 状态字段、增量合并、索引和排列语义 | `tools/guide.ts` → `balatro://guide` |
| 分析输出、评分标签、lines、审计和抽样局限 | `tools/analysis-guide.ts` → `balatro://analysis` |
| 金注策略和取舍 | Coach 技能及按需决策参考 |
| 具体游戏规则和对象机制 | 对象/章节；广泛查阅才读取 `balatro://rules` |

`balatro://context` 保留为显式全量参考入口，内容仍是：

1. `model/prompt.ts` 中的角色与用户意图边界。
2. `model/context/balatro.md` 全文。
3. `skills/core.md` 全文。
4. `<available_skills>` 索引。
5. 通过 MCP 读取技能的绑定说明。

它不在常规 bootstrap 加载路径中；选择全量入口后不要重复读取其包含的规则和协议。
它不包含 guide、analysis 或技能正文，这些仍按需要读取。
工具 schema 通过 `tools/list` 提供，不在技能中重复列举。

## 技能发现与索引

`src/context.ts` 使用项目内的 `src/skills.ts`，只扫描本项目 `skills/` 的直接子目录：
`skills/<name>/SKILL.md` 即一个技能。frontmatter 由 `yaml` 解析，`description` 必填，
`name` 可省略，填写时必须与目录名相同，因此不会重名。名称不合法、缺描述、YAML 损坏或
真实路径离开 `skills/` 的条目被跳过并记入诊断，不会阻止服务启动。不递归、不读忽略文件；
`skills/core.md` 等其他文件不是技能。

服务端生成 XML 技能索引，`<location>` 为 `skill://<name>/SKILL.md`，
说明使用 MCP `resources/read` 读取。正文不提前塞入常驻上下文。
`disable-model-invocation:true` 的技能保留在发现结果中，但不进入自动技能索引；
可由用户显式调用。资源列表也遵循这一自动可见性规则。

当前移植了两个技能及其全部引用文件：

- `balatro-wiki-rules`
- `balatro-gold-stake-coach`

`skills/README.md` 说明技能目录在本服务器中的发现与读取方式。
Wiki 技能中的来源、署名和许可说明均已保留。

## MCP 读取方式

| 入口 | 内容 |
| --- | --- |
| 初始化 `instructions` | 简短操作约定及资源入口 |
| `balatro://context` | 完整规则、协议、技能索引与绑定说明 |
| `balatro://rules` | `model/context/balatro.md` 全文 |
| `balatro://protocol` | `skills/core.md` 全文 |
| `balatro://guide` | 字段、增量合并、索引和排列语义 |
| `balatro://analysis` | 分析输出和计算局限，首次分析前读取 |
| `balatro://skills` | 每个技能的 URI、可否由模型调用、全部文件（标题与字节数）、发现诊断 |
| `skill://<name>/<path>` | 技能正文或引用文件全文 |
| `balatro://objects/<name>` | 单个对象的规则表行、目录元数据、章节 URI 与 Wiki 链接 |
| `skill:<name>` MCP prompt | 显式技能展开，可带 `instructions` 参数 |

技能文件 URI 与安装位置无关，不暴露本机路径。例如
`skill://balatro-gold-stake-coach/SKILL.md` 中的 `references/decision-tables.md`
按网页链接规则解析为 `skill://balatro-gold-stake-coach/references/decision-tables.md`，
模型无需拼接目录或转换 Windows 路径。服务端把 URI 映射到该技能目录，`..` 只能在
技能目录内归一化，编码斜杠、盘符、查询串和片段均被拒绝。支持补全的客户端可补全
技能名和文件路径。

`balatro://objects/<name>` 是 `balatro-wiki-rules/scripts/lookup.py` 离线检索的
TS 移植：在 `objects.json` 中先精确匹配名称，再按子串匹配，最多返回 20 条；可用
`?kind=` 限定类别。每条结果附带 `balatro://rules` 中该对象所在表格行（以表头标注
各列），章节以 `skill://` URI 给出。打牌时查一张 Joker 不必读入 134KB 的目录文件。
Small Blind、Big Blind 和三种贴纸在规则表中没有独立行，`rules` 为 `null`。

显式 prompt 示例为 `skill:balatro-gold-stake-coach`，参数
`{"instructions":"检查当前局面的风险，先不要操作游戏。"}`。
它只返回展开后的上下文，不会自己启动游戏、调用工具或提交模型请求。

资源只允许读取已发现技能目录中的普通文件，并检查真实路径；目录、隐藏文件、
目录外文件和指向目录外的链接会被拒绝，也不会出现在文件清单中。旧的 `file://`
URI 不再提供。资源完整返回文件内容，保留按需读取时的
frontmatter；显式 prompt 去除 frontmatter，附上引用基准和可选用户指令。

服务器没有文件或 Shell 工具，也不依赖 Pi agent/session。
等待、暂停、上下文压缩与恢复由 MCP 宿主控制。技能内容不能授予工具权限，
也不能单独授权开始或继续游戏。

## 客户端与刷新

服务端发送简短 `instructions`，具体如何纳入模型上下文由 MCP 客户端决定。
需要客户端支持初始化说明和资源读取；不自动采用说明的客户端也应按上面的
小资源顺序读取。全量 context 供显式广泛查阅或兼容用途，不是默认补救入口。

发现结果与索引在服务启动时建立。修改技能后重启服务刷新。
正文、文件清单和引用在请求时读取。

## 验证

测试覆盖 YAML 多行描述和 BOM/CRLF、忽略文件作用域、链接循环、无效元数据，
以及简短初始化、完整参考资源、超过旧长度上限
的内容、索引不含本机路径、忽略文件、重名诊断、仅手动调用技能、环境技能隔离、文件清单、
相对链接解析、路径补全、正文及引用按需读取、显式展开、带空格路径、资源边界及对象检索。真实 stdio 测试确认初始化不再重复完整上下文，
工具为 7 个（包含只读 `game_analyze`），文件工具和 memory 工具不可调用。

构建和类型检查由项目测试命令验证。Lua 决策状态回归可在项目根目录执行
`luajit tests/decision.test.lua`（亦兼容 Lua 5.1）；覆盖动态 Boss、历史完整性、
跳盲奖励、解锁信息、readiness 原因及只读边界。
原移植文件的来源与当时的哈希记录在 `docs/PROVENANCE.json`；接口适配代码已在本次重写中更新。
