# 游戏规则与 Pi 技能上下文

MCP 初始化的 `instructions` 只包含简短操作约定：用户意图边界、先观察、revision、
增量状态、隐藏信息边界、取消与未知结果恢复、终局停止，以及按需资源入口。
测试限制其长度低于 2,000 个字符，避免宿主将长说明附到每个工具时重复整套规则。

`balatro://context` 按需提供原 agent 的完整参考上下文：

1. `model/prompt.ts` 中的角色与用户意图边界。
2. `model/context/balatro.md` 全文。
3. `skills/core.md` 全文。
4. 沿用 Pi 格式的 `<available_skills>` 索引，位置为 `skill://` URI。
5. 通过 MCP 读取技能的说明，以及宿主会话控制的说明。

前三项使用项目文件全文，没有压缩或截断。它们不再放入初始化说明。
`skills/core.md` 和 `balatro-gold-stake-coach` 的执行部分已按本服务器的工具与
观测 v3 改写，不再是 Strategy Forge 原文；因此上下文中不再需要新旧字段名对照。
工具描述及参数 schema 通过
`tools/list` 提供，与原 agent 的工具声明分开传递方式对应。

## 技能发现与索引

`src/context.ts` 调用固定版本 `@earendil-works/pi-coding-agent@1.0.4` 的：

- `loadSkills`：只扫描本项目 `skills/`，`includeDefaults:false`，使用与
  Strategy Forge 相同的技能路径和真实路径过滤。不发现用户目录或工作区中的
  ambient Pi 编码技能、扩展或上下文文件。
- `stripFrontmatter`：显式调用时去除 frontmatter，正文、引用基准标记、空白及附加
  指令格式沿用 Pi `AgentSession._expandSkillCommand`，位置换成 `skill://` URI。

Pi 负责 frontmatter 解析、忽略文件、目录发现、名字冲突及诊断。

技能索引不再使用 Pi 的 `formatSkillsForPrompt`。它给出本机绝对路径，并要求模型
“在工具命令中使用绝对路径”，而本服务器没有文件或 Shell 工具。索引保留 Pi 的 XML
结构和转义，`<location>` 改为 `skill://<name>/SKILL.md`，说明改为用 MCP
`resources/read` 读取。正文不提前塞入常驻上下文。
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
| `balatro://skills` | 每个技能的 URI、可否由模型调用、全部文件（标题与字节数）、发现诊断 |
| `skill://<name>/<path>` | 技能正文或引用文件全文 |
| `balatro://objects/<name>` | 单个对象的规则表行、目录元数据、章节 URI 与 Wiki 链接 |
| `skill:<name>` MCP prompt | Pi 风格的显式技能展开，可带 `instructions` 参数 |

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
frontmatter；显式 prompt 才按 Pi 的规则去除 frontmatter。

服务器没有文件或 Shell 工具。Pi coding-agent 依赖只用于复用技能加载函数，
不创建 Pi agent/session，也不注册它的文件、Shell 或其他工具。
等待、暂停、上下文压缩与恢复由 MCP 宿主控制。技能内容不能授予工具权限，
也不能单独授权开始或继续游戏。

## 客户端与刷新

服务端发送简短 `instructions`，具体如何纳入模型上下文由 MCP 客户端决定。
需要客户端支持初始化说明和资源读取；不自动采用说明的客户端可以读取
`balatro://context` 后纳入对话。

发现结果与索引在服务启动时建立。修改技能后重启服务刷新，和原 Pi agent 在新建
会话或重启终端时重新发现技能的方式一致。正文、文件清单和引用在请求时读取。

## 验证

测试将发现结果与 Pi 原函数逐项比较，并覆盖简短初始化、完整参考资源、超过旧长度上限
的内容、索引不含本机路径、忽略文件、重名诊断、仅手动调用技能、环境技能隔离、文件清单、
相对链接解析、路径补全、正文及引用按需读取、显式展开、带空格路径、资源边界及对象检索。真实 stdio 测试确认初始化不再重复完整上下文，
工具仍为 8 个，文件工具不可调用。

构建和类型检查由项目测试命令验证。Lua 决策状态回归可在项目根目录执行
`luajit tests/decision.test.lua`（亦兼容 Lua 5.1）；覆盖动态 Boss、历史完整性、
跳盲奖励、解锁信息、readiness 原因及只读边界。
原移植文件的来源与当时的哈希记录在 `docs/PROVENANCE.json`；接口适配代码已在本次重写中更新。
